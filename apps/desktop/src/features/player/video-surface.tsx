import type { Playback } from "@popcorn/sdk";
import { isTauri } from "@tauri-apps/api/core";
import { createMemo, createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import { buttonStyles } from "../../shared/ui/styles";
import { diagnostic, errorDetails } from "./media-diagnostics";
import { PlayerControls } from "./player-controls";
import { useInlinePlayer } from "./player-tab";
import { bufferSegments, downloadSegments, type TimelineRange } from "./timeline-ranges";
import {
  supportsPictureInPicture,
  toggleVideoFullscreen,
  usesCanvasVideo,
  videoPresentation,
} from "./video-presentation";

type NativeVideo = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
};

type PresentationDocument = Document & {
  exitPictureInPicture?: () => Promise<void>;
  pictureInPictureElement?: Element | null;
};

export function VideoSurface(props: {
  readonly video: () => HTMLVideoElement | undefined;
  readonly playbackId: () => string;
  readonly downloadedRanges: Playback["downloadedRanges"];
  readonly fileSize: bigint;
  readonly onError: (message: string) => void;
  readonly children: JSX.Element;
  readonly audioTracks: Playback["audioTracks"];
  readonly audioIndex: number | undefined;
  readonly onAudioChange: (index: number) => void;
}) {
  // WebKit can decode frames without displaying its inline native video layer.
  const useCanvas = usesCanvasVideo(isTauri(), navigator.platform, navigator.userAgent);
  const hideNativeVideo = useCanvas && isTauri();
  const [presentationError, setPresentationError] = createSignal("");
  const [paused, setPaused] = createSignal(true);
  const [position, setPosition] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [buffered, setBuffered] = createSignal<TimelineRange[]>([]);
  const downloaded = createMemo(() => downloadSegments(props.downloadedRanges, props.fileSize));
  const [volume, setVolume] = createSignal(1);
  const [ready, setReady] = createSignal(false);
  const [pictureInPicture, setPictureInPicture] = createSignal(false);
  const [fullscreen, setFullscreen] = createSignal(false);
  const [pictureInPictureAvailable, setPictureInPictureAvailable] = createSignal(false);
  let canvas: HTMLCanvasElement | undefined;
  let surface: HTMLDivElement | undefined;

  function setPresentation(mode: string | undefined) {
    const video = props.video();
    if (!video) return;
    const nativePresentation =
      useCanvas && (mode === "fullscreen" || mode === "picture-in-picture");
    video.style.opacity = nativePresentation ? "1" : "";
    video.style.pointerEvents = nativePresentation ? "auto" : "";
    video.controls = nativePresentation;
    setFullscreen(mode === "fullscreen");
    setPictureInPicture(mode === "picture-in-picture");
  }

  onMount(() => {
    const video = props.video();
    if (!video) return;
    const canvasSurface = canvas;
    const context = useCanvas ? canvasSurface?.getContext("2d", { alpha: false }) : undefined;
    if (useCanvas && (!canvasSurface || !context)) {
      props.onError("Não foi possível iniciar a superfície de vídeo.");
      return;
    }

    const playbackId = props.playbackId();
    const identity = () => ({ playbackId });
    const nativeControls = video.controls;
    video.controls = false;
    let disposed = false;
    let failed = false;
    let frame = 0;
    let animation = 0;
    let count = 0;

    const draw = () => {
      if (
        !useCanvas ||
        !canvasSurface ||
        !context ||
        disposed ||
        failed ||
        fullscreen() ||
        pictureInPicture() ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      )
        return;
      try {
        if (
          canvasSurface.width !== video.videoWidth ||
          canvasSurface.height !== video.videoHeight
        ) {
          canvasSurface.width = video.videoWidth;
          canvasSurface.height = video.videoHeight;
        }
        context.drawImage(video, 0, 0, canvasSurface.width, canvasSurface.height);
        setReady(true);
        if (count++ === 0) {
          diagnostic("media.surface_first_frame", identity(), {
            renderer: "canvas2d",
            width: canvasSurface.width,
            height: canvasSurface.height,
            media_time: video.currentTime,
          });
        }
      } catch (error) {
        failed = true;
        diagnostic("media.surface_failed", identity(), errorDetails(error));
        props.onError(
          "Não foi possível desenhar a imagem do vídeo. Tente tela cheia ou picture-in-picture.",
        );
      }
    };
    const sync = () => {
      if (video.readyState < 2) setReady(false);
      else if (!useCanvas) setReady(video.videoWidth > 0 && video.videoHeight > 0);
      setPictureInPictureAvailable(
        supportsPictureInPicture(video as NativeVideo, document, useInlinePlayer()),
      );
      setPaused(video.paused);
      setPosition(video.currentTime);
      // MSE briefly loses metadata when an unbuffered seek replaces the source.
      if (Number.isFinite(video.duration) && video.duration > 0) setDuration(video.duration);
      setBuffered(bufferSegments(video.buffered, duration()));
      setVolume(video.muted ? 0 : video.volume);
      draw();
    };
    const nextFrame = () => {
      if (disposed || failed) return;
      draw();
      frame = video.requestVideoFrameCallback(nextFrame);
    };
    const fallback = () => {
      if (disposed || failed) return;
      if (!video.paused) draw();
      animation = requestAnimationFrame(fallback);
    };
    if (useCanvas) {
      if (typeof video.requestVideoFrameCallback === "function") {
        frame = video.requestVideoFrameCallback(nextFrame);
      } else animation = requestAnimationFrame(fallback);
    }

    const presentation = () => {
      const mode = videoPresentation(video as NativeVideo, document as PresentationDocument);
      setPresentation(mode);
      if (mode === "picture-in-picture" && canvasSurface && context) {
        context.clearRect(0, 0, canvasSurface.width, canvasSurface.height);
      } else draw();
    };
    const beginFullscreen = () => setPresentation("fullscreen");
    const endFullscreen = () => {
      setPresentation("inline");
      draw();
    };
    video.addEventListener("webkitpresentationmodechanged", presentation);
    video.addEventListener("webkitbeginfullscreen", beginFullscreen);
    video.addEventListener("webkitendfullscreen", endFullscreen);
    video.addEventListener("enterpictureinpicture", presentation);
    video.addEventListener("leavepictureinpicture", presentation);
    document.addEventListener("fullscreenchange", presentation);
    const events = [
      "play",
      "pause",
      "timeupdate",
      "loadeddata",
      "seeked",
      "resize",
      "volumechange",
      "durationchange",
      "progress",
      "emptied",
    ];
    for (const event of events) video.addEventListener(event, sync);
    const timer = useCanvas
      ? window.setInterval(() => {
          diagnostic("media.surface_progress", identity(), {
            renderer: "canvas2d",
            drawn_frames: count,
            media_time: video.currentTime,
            width: canvasSurface?.width ?? 0,
            height: canvasSurface?.height ?? 0,
            failed,
          });
        }, 5_000)
      : undefined;
    sync();
    onCleanup(() => {
      disposed = true;
      video.cancelVideoFrameCallback?.(frame);
      cancelAnimationFrame(animation);
      if (timer !== undefined) window.clearInterval(timer);
      for (const event of events) video.removeEventListener(event, sync);
      video.removeEventListener("webkitpresentationmodechanged", presentation);
      video.removeEventListener("webkitbeginfullscreen", beginFullscreen);
      video.removeEventListener("webkitendfullscreen", endFullscreen);
      video.removeEventListener("enterpictureinpicture", presentation);
      video.removeEventListener("leavepictureinpicture", presentation);
      document.removeEventListener("fullscreenchange", presentation);
      video.style.opacity = "";
      video.style.pointerEvents = "";
      video.controls = nativeControls;
      if (canvasSurface) {
        canvasSurface.width = 0;
        canvasSurface.height = 0;
      }
    });
  });

  async function play() {
    const video = props.video();
    if (!video) return;
    try {
      if (video.paused) await video.play();
      else video.pause();
    } catch (error) {
      diagnostic(
        "media.surface_play_failed",
        { playbackId: props.playbackId() },
        errorDetails(error),
      );
      props.onError("Não foi possível iniciar a reprodução.");
    }
  }

  function present(mode: "fullscreen" | "picture-in-picture" | "inline") {
    void (async () => {
      const video = props.video() as NativeVideo | undefined;
      if (!video || (mode === "picture-in-picture" && !pictureInPictureAvailable())) return;
      try {
        setPresentationError("");
        if (mode === "fullscreen") {
          if (useCanvas) setPresentation("fullscreen");
          await toggleVideoFullscreen(video, surface, document, useCanvas);
          // Native WebKit transitions announce their final state asynchronously.
          if (!video.webkitEnterFullscreen || (!useCanvas && document.fullscreenEnabled)) {
            setPresentation(videoPresentation(video, document));
          }
          return;
        }
        if (useCanvas) {
          setPresentation(mode);
          video.webkitSetPresentationMode?.(mode);
          return;
        }
        const presentationDocument = document as PresentationDocument;
        if (mode === "picture-in-picture") {
          if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
            await video.requestPictureInPicture();
          } else video.webkitSetPresentationMode?.("picture-in-picture");
        } else if (presentationDocument.pictureInPictureElement === video) {
          await presentationDocument.exitPictureInPicture?.();
        } else if (video.webkitPresentationMode === "picture-in-picture") {
          video.webkitSetPresentationMode?.("inline");
        } else if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        setPresentation(videoPresentation(video, presentationDocument));
      } catch (error) {
        setPresentation(videoPresentation(video, document as PresentationDocument));
        diagnostic(
          "media.surface_presentation_failed",
          { playbackId: props.playbackId() },
          errorDetails(error),
        );
        setPresentationError(
          mode === "picture-in-picture"
            ? "Picture-in-picture não está disponível neste sistema."
            : "Não foi possível alterar o modo de exibição do vídeo.",
        );
      }
    })();
  }

  return (
    <div
      ref={surface}
      class={`video-surface absolute inset-0 bg-black-a12 ${useCanvas ? "canvas-video-surface" : ""} ${hideNativeVideo ? " [&_.video-player]:opacity-[0.001] [&_.video-player]:pointer-events-none [&_.video-player:fullscreen]:opacity-[1] [&_.video-player:fullscreen]:pointer-events-auto [&_.video-player:-webkit-full-screen]:opacity-[1] [&_.video-player:-webkit-full-screen]:pointer-events-auto" : ""}`}
    >
      {props.children}
      <Show when={presentationError()}>
        <button
          type="button"
          class="absolute top-3 inset-x-3 z-10 rounded-control bg-surface p-3 text-ink text-sm"
          aria-live="polite"
          onClick={() => setPresentationError("")}
        >
          {presentationError()} Toque para fechar.
        </button>
      </Show>
      <Show when={useCanvas}>
        <canvas
          ref={canvas}
          class="video-canvas absolute inset-0 w-full h-full object-contain pointer-events-none"
          hidden={!ready() || fullscreen()}
          aria-label="Imagem do vídeo"
        />
        <Show when={!ready() && !pictureInPicture() && !fullscreen()}>
          <span class="video-loading absolute inset-[45%_0_auto] text-center" role="status">
            Carregando imagem…
          </span>
        </Show>
      </Show>
      <Show when={pictureInPicture()}>
        <div
          class="video-pip-message absolute inset-0 flex flex-col items-center justify-center gap-[18px] bg-canvas-deep text-ink text-center p-6"
          role="status"
        >
          <p>O vídeo está em picture-in-picture</p>
          <button
            class={buttonStyles({ variant: "secondary" })}
            type="button"
            onClick={() => present("inline")}
          >
            Trazer vídeo de volta
          </button>
        </div>
      </Show>
      <Show when={!pictureInPicture() && (!fullscreen() || !useCanvas)}>
        <PlayerControls
          video={props.video}
          paused={paused}
          position={position}
          duration={duration}
          downloadedRanges={downloaded()}
          bufferedRanges={buffered()}
          volume={volume}
          play={() => void play()}
          present={present}
          pictureInPictureAvailable={pictureInPictureAvailable}
          imageReady={ready}
          audioTracks={props.audioTracks}
          audioIndex={props.audioIndex}
          onAudioChange={props.onAudioChange}
        />
      </Show>
    </div>
  );
}
