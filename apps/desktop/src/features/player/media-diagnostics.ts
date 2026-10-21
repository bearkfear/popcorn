import type { Playback } from "@popcorn/sdk";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { isBrowserServer } from "../bootstrap/browser-session";

type Context = {
  readonly playbackId?: string | undefined;
  readonly generation?: number | undefined;
};
let warned = false;

// Native persistence performs a second redaction pass and bounds every record.
export function diagnostic(event: string, context: Context, data: Record<string, unknown>) {
  if (!isTauri() && !isBrowserServer()) return;
  const sample = { event, ...context, clientTimeMs: Date.now(), data };
  const pending = isTauri()
    ? invoke("media_diagnostic", { sample })
    : fetch("/browser/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sample),
        keepalive: true,
      }).then((response) => {
        if (!response.ok) throw new Error("diagnostic unavailable");
      });
  void pending.catch(() => {
    if (!warned) console.warn("Popcorn: não foi possível salvar o diagnóstico local.");
    warned = true;
  });
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error)
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...("code" in error && (typeof error.code === "number" || typeof error.code === "string")
        ? { code: error.code }
        : {}),
    };
  if (error instanceof Event) return { event: error.type };
  return { name: typeof error, message: String(error ?? "unknown") };
}

export function timeRanges(ranges: TimeRanges): number[][] {
  const result: number[][] = [];
  try {
    for (let i = 0; i < Math.min(ranges.length, 16); i++)
      result.push([ranges.start(i), ranges.end(i)]);
  } catch {
    /* A detached SourceBuffer can invalidate ranges during cleanup. */
  }
  return result;
}

export function bufferSnapshot(buffer: SourceBuffer | undefined): Record<string, unknown> | null {
  if (!buffer) return null;
  try {
    return {
      updating: buffer.updating,
      mode: buffer.mode,
      timestamp_offset: buffer.timestampOffset,
      append_window_start: buffer.appendWindowStart,
      append_window_end: Number.isFinite(buffer.appendWindowEnd) ? buffer.appendWindowEnd : null,
      buffered: timeRanges(buffer.buffered),
    };
  } catch (error) {
    return { unavailable: true, error: errorDetails(error) };
  }
}

export function mp4Header(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength < 8) return { header_complete: false };
  const type = String.fromCharCode(...bytes.subarray(4, 8));
  return {
    header_complete: true,
    first_box_type: /^[a-zA-Z0-9 ]{4}$/.test(type) ? type : "non_ascii",
    first_box_size: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0),
  };
}

export function mediaSnapshot(video: HTMLVideoElement): Record<string, unknown> {
  const rect = video.getBoundingClientRect();
  const frames = video.getVideoPlaybackQuality?.();
  const webkit = video as HTMLVideoElement & {
    webkitDecodedFrameCount?: number;
    webkitDroppedFrameCount?: number;
    webkitPresentationMode?: string;
    webkitDisplayingFullscreen?: boolean;
  };
  const style = getComputedStyle(video);
  return {
    ready_state: video.readyState,
    network_state: video.networkState,
    media_error: video.error ? { code: video.error.code, message: video.error.message } : null,
    current_time: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : null,
    paused: video.paused,
    seeking: video.seeking,
    ended: video.ended,
    playback_rate: video.playbackRate,
    video_width: video.videoWidth,
    video_height: video.videoHeight,
    box: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
    connected: video.isConnected,
    visibility: document.visibilityState,
    css: {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      object_fit: style.objectFit,
      position: style.position,
      z_index: style.zIndex,
      transform: style.transform,
    },
    total_frames: frames?.totalVideoFrames,
    dropped_frames: frames?.droppedVideoFrames,
    webkit_decoded_frames: webkit.webkitDecodedFrameCount,
    webkit_dropped_frames: webkit.webkitDroppedFrameCount,
    fullscreen: Boolean(document.fullscreenElement || webkit.webkitDisplayingFullscreen),
    presentation_mode: webkit.webkitPresentationMode,
    buffered: timeRanges(video.buffered),
    seekable: timeRanges(video.seekable),
  };
}

export function observeMedia(video: HTMLVideoElement, getPlayback: () => Playback): () => void {
  let cachedPlayback = getPlayback();
  let disposing = false;
  let frameCallback: number | undefined;
  let presentedFrames = 0;
  let lastPresentedTime = 0;
  let presentedAt = performance.now();
  let advancedAt = performance.now();
  let lastTime = video.currentTime;
  const presented: VideoFrameRequestCallback = (_now, metadata) => {
    presentedFrames = metadata.presentedFrames;
    lastPresentedTime = metadata.mediaTime;
    presentedAt = performance.now();
    frameCallback = video.requestVideoFrameCallback(presented);
  };
  if (typeof video.requestVideoFrameCallback === "function")
    frameCallback = video.requestVideoFrameCallback(presented);
  const report = (event: string, extra: Record<string, unknown> = {}) => {
    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      advancedAt = performance.now();
    }
    if (!disposing) cachedPlayback = getPlayback();
    const playback = cachedPlayback;
    diagnostic(
      `media.${event}`,
      { playbackId: playback.playbackId },
      {
        ...mediaSnapshot(video),
        delivery: playback.delivery,
        conversion: playback.conversion,
        stream_type: playback.streamType,
        timestamp_offset: playback.timestampOffsetSeconds,
        downloaded_bytes: String(playback.downloadedBytes),
        total_bytes: String(playback.totalBytes),
        download_bytes_per_second: String(playback.downloadBytesPerSecond),
        peers: playback.peers,
        presented_frames: presentedFrames,
        last_presented_time: lastPresentedTime,
        no_presented_frame_ms: Math.round(performance.now() - presentedAt),
        no_time_advance_ms: Math.round(performance.now() - advancedAt),
        ...extra,
      },
    );
  };
  const events = [
    "loadstart",
    "loadedmetadata",
    "loadeddata",
    "canplay",
    "playing",
    "waiting",
    "stalled",
    "suspend",
    "pause",
    "seeking",
    "seeked",
    "ended",
    "error",
    "resize",
    "webkitpresentationmodechanged",
  ];
  const listener = (event: Event) => report(event.type);
  const visibility = () => report("visibility_changed");
  const windowError = (event: ErrorEvent) =>
    report("window_error", { exception: errorDetails(event.error), message: event.message });
  const rejection = (event: PromiseRejectionEvent) =>
    report("unhandled_rejection", { exception: errorDetails(event.reason) });
  for (const event of events) video.addEventListener(event, listener);
  document.addEventListener("visibilitychange", visibility);
  document.addEventListener("fullscreenchange", visibility);
  window.addEventListener("error", windowError);
  window.addEventListener("unhandledrejection", rejection);
  diagnostic(
    "media.environment",
    { playbackId: cachedPlayback.playbackId },
    {
      user_agent: navigator.userAgent,
      media_source: typeof MediaSource !== "undefined",
      video_frame_callback: typeof video.requestVideoFrameCallback === "function",
      device_pixel_ratio: devicePixelRatio,
    },
  );
  report("mounted");
  const timer = window.setInterval(() => {
    if (!video.paused || video.readyState < 2 || video.seeking) report("progress");
  }, 5_000);
  return () => {
    // Solid's conditional accessors are invalid once their branch is disposed.
    disposing = true;
    report("unmounted");
    window.clearInterval(timer);
    if (frameCallback !== undefined) video.cancelVideoFrameCallback(frameCallback);
    for (const event of events) video.removeEventListener(event, listener);
    document.removeEventListener("visibilitychange", visibility);
    document.removeEventListener("fullscreenchange", visibility);
    window.removeEventListener("error", windowError);
    window.removeEventListener("unhandledrejection", rejection);
  };
}
