// Presents decoded frames independently of WebKit's native inline video layer on macOS.

import type { Playback } from "@popcorn/sdk";
import { isTauri } from "@tauri-apps/api/core";
import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import { diagnostic, errorDetails } from "./media-diagnostics";
import { PlayerControls } from "./player-controls";

type NativeVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitPresentationMode?: string;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
};

export function VideoSurface(props: {
  readonly video: () => HTMLVideoElement | undefined;
  readonly playbackId: () => string;
  readonly onError: (message: string) => void;
  readonly children: JSX.Element;
  readonly audioTracks: Playback["audioTracks"];
  readonly audioIndex: number | undefined;
  readonly onAudioChange: (index: number) => void;
}) {
  const useCanvas = isTauri() && /Mac/.test(navigator.platform);
  const [paused, setPaused] = createSignal(true);
  const [position, setPosition] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [volume, setVolume] = createSignal(1);
  const [ready, setReady] = createSignal(false);
  const [pictureInPicture, setPictureInPicture] = createSignal(false);
  let canvas: HTMLCanvasElement | undefined;

  onMount(() => {
    const video = props.video();
    if (!useCanvas || !video || !canvas) return;
    const surface = canvas;
    const context = surface.getContext("2d", { alpha: false });
    const playbackId = props.playbackId();
    const identity = () => ({ playbackId });
    if (!context) {
      props.onError("Não foi possível iniciar a superfície de vídeo.");
      return;
    }
    const nativeControls = video.controls;
    video.controls = false;
    let disposed = false;
    let failed = false;
    let frame = 0;
    let animation = 0;
    let count = 0;
    const draw = () => {
      if (
        disposed ||
        failed ||
        pictureInPicture() ||
        video.readyState < 2 ||
        !video.videoWidth ||
        !video.videoHeight
      )
        return;
      try {
        if (surface.width !== video.videoWidth || surface.height !== video.videoHeight) {
          surface.width = video.videoWidth;
          surface.height = video.videoHeight;
        }
        context.drawImage(video, 0, 0, surface.width, surface.height);
        if (count++ === 0) {
          setReady(true);
          diagnostic("media.surface_first_frame", identity(), {
            renderer: "canvas2d",
            width: surface.width,
            height: surface.height,
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
      setPaused(video.paused);
      setPosition(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
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
    if (typeof video.requestVideoFrameCallback === "function") {
      frame = video.requestVideoFrameCallback(nextFrame);
    } else animation = requestAnimationFrame(fallback);
    const presentation = () => {
      const mode = (video as NativeVideo).webkitPresentationMode;
      setPictureInPicture(mode === "picture-in-picture");
      const external = mode === "fullscreen" || mode === "picture-in-picture";
      video.style.opacity = external ? "1" : "";
      video.controls = external;
      if (mode === "picture-in-picture") {
        context.clearRect(0, 0, surface.width, surface.height);
      } else draw();
    };
    video.addEventListener("webkitpresentationmodechanged", presentation);
    const events = [
      "play",
      "pause",
      "timeupdate",
      "loadeddata",
      "seeked",
      "resize",
      "volumechange",
      "durationchange",
    ];
    for (const event of events) video.addEventListener(event, sync);
    const timer = window.setInterval(() => {
      diagnostic("media.surface_progress", identity(), {
        renderer: "canvas2d",
        drawn_frames: count,
        media_time: video.currentTime,
        width: surface.width,
        height: surface.height,
        failed,
      });
    }, 5_000);
    sync();
    onCleanup(() => {
      disposed = true;
      video.cancelVideoFrameCallback?.(frame);
      cancelAnimationFrame(animation);
      window.clearInterval(timer);
      for (const event of events) video.removeEventListener(event, sync);
      video.removeEventListener("webkitpresentationmodechanged", presentation);
      video.style.opacity = "";
      video.controls = nativeControls;
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
    const video = props.video() as NativeVideo | undefined;
    if (!video) return;
    try {
      video.style.opacity = mode === "inline" ? "" : "1";
      video.controls = mode !== "inline";
      if (mode === "fullscreen") video.webkitEnterFullscreen?.();
      else video.webkitSetPresentationMode?.(mode);
    } catch (error) {
      video.style.opacity = "";
      video.controls = false;
      diagnostic(
        "media.surface_presentation_failed",
        { playbackId: props.playbackId() },
        errorDetails(error),
      );
    }
  }
  return (
    <div class={`video-surface${useCanvas ? " canvas-video-surface" : ""}`}>
      {props.children}
      <Show when={useCanvas}>
        <canvas ref={canvas} class="video-canvas" aria-label="Imagem do vídeo" />
        <Show when={pictureInPicture()}>
          <div class="video-pip-message" role="status">
            <p>O vídeo está em picture-in-picture</p>
            <button class="button secondary" type="button" onClick={() => present("inline")}>
              Trazer vídeo de volta
            </button>
          </div>
        </Show>
        <Show when={!ready() && !pictureInPicture()}>
          <span class="video-loading" role="status">
            Carregando imagem…
          </span>
        </Show>
        <Show when={!pictureInPicture()}>
          <PlayerControls
            video={props.video}
            paused={paused}
            position={position}
            duration={duration}
            volume={volume}
            play={() => void play()}
            present={present}
            audioTracks={props.audioTracks}
            audioIndex={props.audioIndex}
            onAudioChange={props.onAudioChange}
          />
        </Show>
      </Show>
    </div>
  );
}
