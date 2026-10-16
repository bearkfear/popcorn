import type { Playback } from "@popcorn/sdk";
import { createEffect, createMemo, type JSX, onCleanup, onMount } from "solid-js";
import { createPlayerMachine } from "./player.machine";

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
    const failure = () => {
      clean();
      reject(new MediaPlaybackError("media operation failed"));
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
};

function attachMse(
  video: HTMLVideoElement,
  config: MediaConfig,
  fail: (message: string) => void,
): () => void {
  let disposed = false;
  let failed = false;
  let generation = 0;
  let releaseGeneration = () => {};
  let activeBuffer: SourceBuffer | undefined;
  let requestedTime = 0;
  let restoring = false;
  let waitingForTarget = true;
  let resumeAfterLoad = true;

  function start(time: number, resume: boolean) {
    const current = ++generation;
    releaseGeneration();
    requestedTime = time;
    waitingForTarget = true;
    resumeAfterLoad = resume;
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
    const alive = () => !disposed && current === generation && !controller.signal.aborted;
    const mediaFailed = () => {
      if (!alive()) return;
      failed = true;
      fail("Não foi possível reproduzir este vídeo. Feche ou tente novamente.");
      releaseGeneration();
    };
    video.addEventListener("error", mediaFailed);
    source.addEventListener("sourceclose", mediaFailed);
    releaseGeneration = () => {
      if (released) return;
      released = true;
      controller.abort();
      activeBuffer = undefined;
      video.removeEventListener("error", mediaFailed);
      source.removeEventListener("sourceclose", mediaFailed);
      if (buffer && source.readyState !== "closed") {
        if (buffer.updating && source.readyState === "open") buffer.abort();
        source.removeSourceBuffer(buffer);
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
        buffer = source.addSourceBuffer(config.streamType);
        buffer.mode = "segments";
        buffer.timestampOffset = config.timestampOffsetSeconds;
        activeBuffer = buffer;
        source.duration = config.durationSeconds;
        const url = new URL(config.mediaUrl);
        url.searchParams.set("start", String(time));
        url.searchParams.set("generation", String(requestGeneration));
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || !response.body) throw new MediaPlaybackError("media request failed");
        reader = response.body.getReader();
        while (alive()) {
          if (restored) await waitForRoom(video, buffer, controller.signal);
          if (!alive()) return;
          const trimTo = video.currentTime - 30;
          if (
            restored &&
            trimTo > 0 &&
            buffer.buffered.length &&
            buffer.buffered.start(0) < trimTo
          ) {
            await mediaOperation(buffer, "updateend", ["error", "abort"], controller.signal, () => {
              buffer?.remove(0, trimTo);
            });
          }
          if (!alive()) return;
          const chunk = await reader.read();
          if (!alive()) return;
          if (chunk.done) {
            if (!restored) throw new MediaPlaybackError("requested position not buffered");
            source.endOfStream();
            return;
          }
          await mediaOperation(buffer, "updateend", ["error", "abort"], controller.signal, () => {
            buffer?.appendBuffer(chunk.value);
          });
          if (!alive()) return;
          // Initial playback may begin just after zero (codec priming). Let
          // native playback choose that first sample, but never seek to an
          // unbuffered requested position after a remote seek.
          const targetBuffered = containsTime(buffer.buffered, time);
          if (!restored && (targetBuffered || (time === 0 && buffer.buffered.length > 0))) {
            restoring = true;
            if (targetBuffered) video.currentTime = time;
            restored = true;
            waitingForTarget = false;
            restoring = false;
            if (resume) {
              void video.play().catch(() => {
                if (alive()) fail("Pressione reproduzir nos controles do vídeo para continuar.");
              });
            }
          }
        }
      } catch {
        if (alive()) mediaFailed();
      } finally {
        if (reader) {
          try {
            await reader.cancel();
          } catch {
            if (alive()) mediaFailed();
          }
          reader.releaseLock();
        }
      }
    }
    void stream();
  }

  const seeking = () => {
    if (disposed || failed || restoring) return;
    const time = video.currentTime;
    if (activeBuffer && containsTime(activeBuffer.buffered, time)) return;
    if (waitingForTarget && time === requestedTime) return;
    start(time, waitingForTarget ? resumeAfterLoad : !video.paused);
  };
  video.addEventListener("seeking", seeking);
  start(0, true);
  return () => {
    disposed = true;
    generation++;
    video.removeEventListener("seeking", seeking);
    releaseGeneration();
  };
}

export function MediaPlayer(props: {
  readonly playback: Playback;
  readonly onError: (message: string) => void;
  readonly onEnded: () => void;
}) {
  let video: HTMLVideoElement | undefined;
  const machine = createPlayerMachine();
  // Only transport identity changes recreate media, not one-second statistics.
  const config = createMemo(
    (): MediaConfig => ({
      playbackId: props.playback.playbackId,
      mediaUrl: props.playback.mediaUrl,
      delivery: props.playback.delivery,
      streamType: props.playback.streamType,
      durationSeconds: props.playback.durationSeconds,
      timestampOffsetSeconds: props.playback.timestampOffsetSeconds,
    }),
    undefined,
    {
      equals: (a, b) =>
        a.playbackId === b.playbackId &&
        a.mediaUrl === b.mediaUrl &&
        a.delivery === b.delivery &&
        a.streamType === b.streamType &&
        a.durationSeconds === b.durationSeconds &&
        a.timestampOffsetSeconds === b.timestampOffsetSeconds,
    },
  );

  createEffect(() => {
    const current = config();
    const element = video;
    if (!element) return;
    machine.send("prepare");
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
      machine.send("fail");
      props.onError("Não foi possível carregar ou decodificar este vídeo. Tente novamente.");
    };
    element.addEventListener("error", failed);
    element.src = current.mediaUrl;
    element.load();
    onCleanup(() => {
      element.removeEventListener("error", failed);
      element.pause();
      element.removeAttribute("src");
      element.load();
    });
  });
  return (
    <video
      ref={video}
      class="video-player"
      data-player-state={machine.state()}
      controls
      autoplay
      playsinline
      tabindex="0"
      onEnded={props.onEnded}
      onLoadStart={() => machine.send("prepare")}
      onWaiting={() => machine.send("buffer")}
      onPlaying={() => machine.send("play")}
      onPause={() => machine.send("pause")}
      onSeeking={() => machine.send("seek")}
      onSeeked={(event) => machine.send(event.currentTarget.paused ? "pause" : "play")}
      onError={() => machine.send("fail")}
    />
  );
}

export function PlayerOverlay(props: {
  readonly children: JSX.Element;
  readonly onClose: () => void;
}) {
  let dialog: HTMLDivElement | undefined;
  const previousFocus = document.activeElement;
  onMount(() => {
    dialog?.focus();
  });
  onCleanup(() => {
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  });
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !document.fullscreenElement) {
      event.preventDefault();
      props.onClose();
    }
    if (event.key !== "Tab" || !dialog) return;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not(:disabled), video, [href], select, [tabindex='0']",
      ),
    ).filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last?.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === dialog)
    ) {
      event.preventDefault();
      first?.focus();
    }
  };
  return (
    <div
      ref={dialog}
      class="player-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Reprodutor de vídeo"
      tabindex="-1"
      onKeyDown={keydown}
    >
      {props.children}
    </div>
  );
}
