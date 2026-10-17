import type { Playback } from "@popcorn/sdk";
import { createEffect, createMemo, onCleanup, onMount } from "solid-js";
import { createActor } from "xstate";
import { bufferedPosition } from "./buffer-position";
import { mediaChunks } from "./media-chunks";
import {
  bufferSnapshot,
  diagnostic,
  errorDetails,
  mediaSnapshot,
  mp4Header,
  observeMedia,
} from "./media-diagnostics";
import { type MseStreamEvent, mseSessionMachine } from "./mse-session.machine";
import { createPlayerMachine } from "./player.machine";
import { VideoSurface } from "./video-surface";

class MediaPlaybackError extends Error {}

// Monotonic across component remounts and transport changes for any playback.
let streamGeneration = 0;

// Register every completion/failure signal before triggering a media operation.
function mediaOperation(
  target: EventTarget,
  completed: string,
  failures: readonly string[],
  signal: AbortSignal,
  operation: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = () => {
      target.removeEventListener(completed, success);
      for (const event of failures) target.removeEventListener(event, failure);
      signal.removeEventListener("abort", cancelled);
    };
    const success = () => {
      clean();
      resolve();
    };
    const failure = (event: Event) => {
      clean();
      reject(
        new MediaPlaybackError(
          `${target.constructor.name} emitted ${event.type} while waiting for ${completed}`,
        ),
      );
    };
    const cancelled = () => {
      clean();
      reject(signal.reason);
    };
    target.addEventListener(completed, success, { once: true });
    for (const event of failures) target.addEventListener(event, failure, { once: true });
    signal.addEventListener("abort", cancelled, { once: true });
    if (signal.aborted) {
      cancelled();
      return;
    }
    try {
      operation();
    } catch (error) {
      clean();
      reject(error);
    }
  });
}

function containsTime(ranges: TimeRanges, time: number): boolean {
  for (let index = 0; index < ranges.length; index++) {
    if (ranges.start(index) <= time && time < ranges.end(index)) return true;
  }
  return false;
}

function bufferedAhead(ranges: TimeRanges, time: number): number {
  for (let index = 0; index < ranges.length; index++) {
    if (ranges.start(index) <= time + 0.1 && ranges.end(index) > time) {
      return ranges.end(index) - time;
    }
  }
  return 0;
}

function waitForRoom(
  video: HTMLVideoElement,
  buffer: SourceBuffer,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const events = ["timeupdate", "seeking", "play", "abort"] as const;
    const clean = () => {
      for (const event of events) video.removeEventListener(event, check);
      signal.removeEventListener("abort", cancelled);
    };
    const cancelled = () => {
      clean();
      reject(signal.reason);
    };
    const check = () => {
      if (bufferedAhead(buffer.buffered, video.currentTime) < 30) {
        clean();
        resolve();
      }
    };
    for (const event of events) video.addEventListener(event, check);
    signal.addEventListener("abort", cancelled, { once: true });
    if (signal.aborted) cancelled();
    else check();
  });
}

type MediaConfig = {
  readonly playbackId: string;
  readonly mediaUrl: string;
  readonly delivery: string;
  readonly streamType: string;
  readonly durationSeconds: number;
  readonly timestampOffsetSeconds: number;
  readonly startSeconds: number;
};

function attachMse(
  video: HTMLVideoElement,
  config: MediaConfig,
  fail: (message: string) => void,
): () => void {
  let activeBuffer: SourceBuffer | undefined;

  function start(time: number, resume: boolean, notify: (event: MseStreamEvent) => void) {
    activeBuffer = undefined;
    // Do not autoplay keyframe preroll before the requested position exists.
    video.autoplay = false;
    const controller = new AbortController();
    const requestGeneration = ++streamGeneration;
    const source = new MediaSource();
    const objectUrl = URL.createObjectURL(source);
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
    let buffer: SourceBuffer | undefined;
    let restored = false;
    let released = false;
    let phase = "abrir o reprodutor";
    const started = performance.now();
    let receivedBytes = 0;
    let appendedBytes = 0;
    let appendCount = 0;
    let lastChunkBytes = 0;
    let lastDataAt = performance.now();
    const context = { playbackId: config.playbackId, generation: requestGeneration };
    const report = (event: string, extra: Record<string, unknown> = {}) =>
      diagnostic(`mse.${event}`, context, {
        ...mediaSnapshot(video),
        phase,
        requested_start: time,
        resume,
        stream_type: config.streamType,
        timestamp_offset: config.timestampOffsetSeconds,
        media_source_state: source.readyState,
        source_duration: Number.isFinite(source.duration) ? source.duration : null,
        source_buffer: bufferSnapshot(buffer),
        elapsed_ms: Math.round(performance.now() - started),
        received_bytes: receivedBytes,
        appended_bytes: appendedBytes,
        append_count: appendCount,
        last_chunk_bytes: lastChunkBytes,
        no_data_ms: Math.round(performance.now() - lastDataAt),
        ...extra,
      });
    const timer = window.setInterval(() => report("progress"), 5_000);
    report("started");
    const alive = () => !controller.signal.aborted;
    let releaseReason = "disposed";
    const mediaFailed = (cause?: unknown) => {
      if (!alive()) return;
      report("failed", { exception: errorDetails(cause) });
      const code = video.error?.code;
      releaseReason = "failure";
      notify({
        type: "FAIL",
        message: `Falha ao ${phase}.${code ? ` Código de mídia: ${code}.` : ""} Tente novamente.`,
      });
    };
    video.addEventListener("error", mediaFailed);
    source.addEventListener("sourceclose", mediaFailed);
    const release = () => {
      if (released) return;
      released = true;
      report("released", { reason: releaseReason });
      window.clearInterval(timer);
      controller.abort();
      activeBuffer = undefined;
      video.removeEventListener("error", mediaFailed);
      source.removeEventListener("sourceclose", mediaFailed);
      video.pause();
      try {
        if (buffer && source.readyState !== "closed") {
          if (buffer.updating && source.readyState === "open") buffer.abort();
          source.removeSourceBuffer(buffer);
        }
      } catch (error) {
        report("cleanup_failed", { exception: errorDetails(error) });
      }
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    async function stream() {
      // no-excuse-ok: catch — browser media boundary
      try {
        await mediaOperation(source, "sourceopen", ["sourceclose"], controller.signal, () => {
          video.src = objectUrl;
          video.load();
        });
        if (!alive()) return;
        report("source_opened");
        phase = "configurar o formato do vídeo";
        buffer = source.addSourceBuffer(config.streamType);
        buffer.mode = "segments";
        buffer.timestampOffset = config.timestampOffsetSeconds;
        activeBuffer = buffer;
        source.duration = config.durationSeconds;
        report("buffer_created");
        const url = new URL(config.mediaUrl);
        url.searchParams.set("start", String(time));
        url.searchParams.set("generation", String(requestGeneration));
        phase = "iniciar a transmissão";
        const response = await fetch(url, { signal: controller.signal });
        report("http_response", {
          status: response.status,
          content_type: response.headers.get("content-type"),
          content_length: response.headers.get("content-length"),
        });
        if (!response.ok) {
          phase = `iniciar a transmissão (HTTP ${response.status})`;
          throw new MediaPlaybackError("media request failed");
        }
        if (!response.body) throw new MediaPlaybackError("media response body missing");
        reader = response.body.getReader();
        const chunks = mediaChunks(reader, controller.signal);
        while (alive()) {
          if (restored) await waitForRoom(video, buffer, controller.signal);
          if (!alive()) return;
          const trimTo = video.currentTime - 30;
          if (
            restored &&
            trimTo > 0 &&
            buffer.buffered.length &&
            buffer.buffered.start(0) + 15 < trimTo
          ) {
            phase = "liberar o trecho já reproduzido";
            await mediaOperation(buffer, "updateend", ["error", "abort"], controller.signal, () => {
              buffer?.remove(0, trimTo);
            });
          }
          if (!alive()) return;
          phase = "receber os dados do vídeo";
          const chunk = await chunks.next();
          if (!alive()) return;
          if (chunk.done) {
            if (!restored) throw new MediaPlaybackError("requested position not buffered");
            source.endOfStream();
            report("stream_ended");
            return;
          }
          phase = "processar os dados do vídeo";
          lastChunkBytes = chunk.value.byteLength;
          receivedBytes += lastChunkBytes;
          lastDataAt = performance.now();
          if (appendCount === 0) report("first_chunk", mp4Header(chunk.value));
          await mediaOperation(buffer, "updateend", ["error", "abort"], controller.signal, () => {
            buffer?.appendBuffer(chunk.value);
          });
          appendedBytes += lastChunkBytes;
          appendCount++;
          if (appendCount === 1) report("first_append");
          if (!alive()) return;
          // Frame rounding and codec priming can put the first sample slightly
          // after the saved timestamp. Seek into that sample instead of waiting forever.
          const position = bufferedPosition(buffer.buffered, time);
          if (!restored && position !== undefined) {
            video.currentTime = position;
            restored = true;
            report("position_restored", {
              actual_start: position,
              adjustment_seconds: position - time,
            });
            notify({ type: "RESTORED" });
            if (resume) {
              void video.play().catch((error: unknown) => {
                report("play_rejected", { exception: errorDetails(error) });
                if (alive()) fail("Pressione reproduzir nos controles do vídeo para continuar.");
              });
            }
          }
        }
      } catch (error) {
        if (alive()) mediaFailed(error);
      } finally {
        if (reader) {
          try {
            await reader.cancel();
          } catch (error) {
            report("reader_cancel_failed", { exception: errorDetails(error) });
            if (alive()) mediaFailed(error);
          }
          reader.releaseLock();
        }
      }
    }
    void stream();
    return release;
  }

  const actor = createActor(mseSessionMachine, {
    input: { startSeconds: config.startSeconds, fail, open: start },
  });

  const seeking = () => {
    if (!actor.getSnapshot().matches({ active: "ready" })) return;
    const time = video.currentTime;
    if (activeBuffer && containsTime(activeBuffer.buffered, time)) return;
    actor.send({ type: "SEEK", time, resume: !video.paused });
  };
  video.addEventListener("seeking", seeking);
  actor.start();
  return () => {
    video.removeEventListener("seeking", seeking);
    actor.stop();
  };
}

export function MediaPlayer(props: {
  readonly playback: Playback;
  readonly onError: (message: string) => void;
  readonly onEnded: () => void;
  readonly startSeconds: number;
  readonly onProgress: (position: number, duration: number, audioIndex?: number) => void;
  readonly onAudioChange: (index: number, position: number) => void;
}) {
  let video: HTMLVideoElement | undefined;
  const machine = createPlayerMachine();
  onMount(() => {
    if (video) onCleanup(observeMedia(video, () => props.playback));
    let savedAt = 0;
    let lastPosition = 0;
    let lastDuration = 0;
    const element = video;
    const audioIndex = props.playback.audioStreamIndex;
    if (!element) return;
    const save = () => {
      if (element.readyState >= 2) {
        lastPosition = element.currentTime;
        lastDuration = element.duration;
      }
      if (lastDuration > 0) props.onProgress(lastPosition, lastDuration, audioIndex);
      savedAt = performance.now();
    };
    const tick = () => {
      if (element.readyState >= 2) {
        lastPosition = element.currentTime;
        lastDuration = element.duration;
      }
      if (performance.now() - savedAt >= 5_000) save();
    };
    element.addEventListener("timeupdate", tick);
    element.addEventListener("pause", save);
    element.addEventListener("seeked", save);
    window.addEventListener("pagehide", save);
    onCleanup(() => {
      save();
      element.removeEventListener("timeupdate", tick);
      element.removeEventListener("pause", save);
      element.removeEventListener("seeked", save);
      window.removeEventListener("pagehide", save);
    });
  });
  // Only transport identity changes recreate media, not one-second statistics.
  const config = createMemo(
    (): MediaConfig => ({
      playbackId: props.playback.playbackId,
      mediaUrl: props.playback.mediaUrl,
      delivery: props.playback.delivery,
      streamType: props.playback.streamType,
      durationSeconds: props.playback.durationSeconds,
      timestampOffsetSeconds: props.playback.timestampOffsetSeconds,
      startSeconds: Math.max(0, Math.min(props.startSeconds, props.playback.durationSeconds - 0.1)),
    }),
    undefined,
    {
      equals: (a, b) =>
        a.playbackId === b.playbackId &&
        a.mediaUrl === b.mediaUrl &&
        a.delivery === b.delivery &&
        a.streamType === b.streamType &&
        a.durationSeconds === b.durationSeconds &&
        a.timestampOffsetSeconds === b.timestampOffsetSeconds &&
        a.startSeconds === b.startSeconds,
    },
  );

  createEffect(() => {
    const current = config();
    const element = video;
    if (!element) return;
    machine.send("prepare");
    diagnostic(
      "media.transport_selected",
      { playbackId: current.playbackId },
      {
        delivery: current.delivery,
        stream_type: current.streamType,
        duration_seconds: current.durationSeconds,
        start_seconds: current.startSeconds,
        timestamp_offset: current.timestampOffsetSeconds,
      },
    );
    if (current.delivery === "mse") {
      if (typeof MediaSource === "undefined" || !MediaSource.isTypeSupported(current.streamType)) {
        machine.send("fail");
        props.onError("Este sistema não oferece suporte ao formato de reprodução convertido.");
        return;
      }
      onCleanup(attachMse(element, current, props.onError));
      return;
    }
    if (current.delivery !== "direct") {
      machine.send("fail");
      props.onError("O serviço não informou um modo de reprodução compatível.");
      return;
    }
    const failed = () => {
      diagnostic("media.direct_failed", { playbackId: current.playbackId }, mediaSnapshot(element));
      machine.send("fail");
      props.onError("Não foi possível carregar ou decodificar este vídeo. Tente novamente.");
    };
    element.addEventListener("error", failed);
    element.autoplay = false;
    const ready = () => {
      if (current.startSeconds > 0) element.currentTime = current.startSeconds;
      void element.play().catch(() => props.onError("Pressione reproduzir para continuar."));
    };
    element.addEventListener("loadedmetadata", ready, { once: true });
    element.src = current.mediaUrl;
    element.load();
    onCleanup(() => {
      element.removeEventListener("error", failed);
      element.removeEventListener("loadedmetadata", ready);
      element.pause();
      element.removeAttribute("src");
      element.load();
    });
  });
  return (
    <VideoSurface
      video={() => video}
      playbackId={() => props.playback.playbackId}
      onError={props.onError}
      audioTracks={props.playback.audioTracks}
      audioIndex={props.playback.audioStreamIndex}
      onAudioChange={(index) =>
        props.onAudioChange(index, video?.currentTime ?? props.startSeconds)
      }
    >
      <video
        ref={video}
        class="video-player"
        data-player-state={machine.state()}
        controls
        autoplay
        playsinline
        tabindex="0"
        onEnded={(event) => {
          props.onProgress(event.currentTarget.currentTime, event.currentTarget.duration);
          props.onEnded();
        }}
        onLoadStart={() => machine.send("prepare")}
        onWaiting={() => machine.send("buffer")}
        onPlaying={() => machine.send("play")}
        onPause={() => machine.send("pause")}
        onSeeking={() => machine.send("seek")}
        onSeeked={(event) => machine.send(event.currentTarget.paused ? "pause" : "play")}
        onError={() => machine.send("fail")}
      />
    </VideoSurface>
  );
}
