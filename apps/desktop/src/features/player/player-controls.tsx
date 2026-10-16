// Floating playback controls and shortcuts for the canvas video surface.
import type { Playback } from "@popcorn/sdk";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { type PlayerAction, playerShortcut } from "./player-shortcuts";

type IconName = "play" | "pause" | "back" | "forward" | "volume" | "mute" | "pip" | "fullscreen";
function Icon(props: { name: IconName }) {
  const paths: Record<IconName, string> = {
    play: "M8 5v14l12-7z",
    pause: "M7 5h3v14H7zM14 5h3v14h-3z",
    back: "M11 6 2 12l9 6zM21 6l-9 6 9 6z",
    forward: "m3 6 9 6-9 6zm10 0 9 6-9 6z",
    volume: "M3 9v6h4l5 4V5L7 9zM15 8q5 4 0 8M18 5q8 7 0 14",
    mute: "M3 9v6h4l5 4V5L7 9zM16 9l6 6m0-6-6 6",
    pip: "M3 5h18v14H3zM12 12h7v5h-7z",
    fullscreen: "M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6",
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={paths[props.name]}
        fill={
          props.name === "volume" ||
          props.name === "mute" ||
          props.name === "pip" ||
          props.name === "fullscreen"
            ? "none"
            : "currentColor"
        }
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function clock(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = String(value % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function PlayerControls(props: {
  video: () => HTMLVideoElement | undefined;
  paused: () => boolean;
  position: () => number;
  duration: () => number;
  volume: () => number;
  play: () => void;
  present: (mode: "fullscreen" | "picture-in-picture") => void;
  audioTracks: Playback["audioTracks"];
  audioIndex: number | undefined;
  onAudioChange: (index: number) => void;
}) {
  const [visible, setVisible] = createSignal(true);
  const [dragging, setDragging] = createSignal<number>();
  let panel: HTMLFieldSetElement | undefined;
  let timer: number | undefined;
  const shown = () => visible() || props.paused() || dragging() !== undefined;
  const position = () => dragging() ?? props.position();
  const progress = () => Math.min(100, (100 * position()) / (props.duration() || 1));
  function reveal() {
    setVisible(true);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!panel?.matches(":hover") && !panel?.contains(document.activeElement)) setVisible(false);
    }, 2500);
  }
  function seek(position: number) {
    const video = props.video();
    if (video && Number.isFinite(video.duration)) {
      video.currentTime = Math.max(0, Math.min(position, Math.max(0, video.duration - 0.1)));
    }
  }
  function act(action: PlayerAction) {
    const video = props.video();
    if (!video) return;
    reveal();
    switch (action) {
      case "play":
        props.play();
        break;
      case "back":
        seek(video.currentTime - 10);
        break;
      case "forward":
        seek(video.currentTime + 10);
        break;
      case "volume-up":
        video.muted = false;
        video.volume = Math.min(1, video.volume + 0.05);
        break;
      case "volume-down":
        video.muted = false;
        video.volume = Math.max(0, video.volume - 0.05);
        break;
      case "mute":
        video.muted = !video.muted;
        break;
      case "fullscreen":
        props.present("fullscreen");
        break;
      case "pip":
        props.present("picture-in-picture");
        break;
    }
  }
  onMount(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Fullscreen and PiP have their own native controls and key handling.
      const mode = (props.video() as HTMLVideoElement & { webkitPresentationMode?: string })
        ?.webkitPresentationMode;
      if (mode && mode !== "inline") return;
      const target = event.target instanceof HTMLElement ? event.target : undefined;
      const editing = Boolean(
        target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
        ),
      );
      // Space on a focused button already activates that button.
      if (event.key === " " && target?.closest("button")) return;
      const action = playerShortcut(event, editing);
      if (!action) return;
      event.preventDefault();
      if (!event.repeat || !["play", "mute", "fullscreen", "pip"].includes(action)) act(action);
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointermove", reveal);
    reveal();
    onCleanup(() => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointermove", reveal);
    });
  });
  return (
    <fieldset
      ref={panel}
      class={`video-controls${shown() ? " is-visible" : ""}`}
      aria-label="Controles de reprodução"
      onFocusIn={reveal}
      onFocusOut={reveal}
    >
      <div class="video-controls-top">
        <div class="video-volume-group">
          <button
            type="button"
            aria-label={props.volume() === 0 ? "Ativar som" : "Silenciar"}
            title="Ativar/desativar som (M)"
            aria-keyshortcuts="m"
            onClick={() => act("mute")}
          >
            <Icon name={props.volume() === 0 ? "mute" : "volume"} />
          </button>
          <input
            class="video-volume"
            type="range"
            aria-label="Volume"
            min="0"
            max="1"
            step="0.05"
            value={props.volume()}
            style={{ "--range-progress": `${props.volume() * 100}%` }}
            onInput={(event) => {
              const video = props.video();
              if (video) {
                video.muted = false;
                video.volume = Number(event.currentTarget.value);
              }
            }}
          />
        </div>
        <div class="video-transport-group">
          <button
            type="button"
            aria-label="Voltar 10 segundos"
            title="Voltar 10 segundos (← / J)"
            aria-keyshortcuts="ArrowLeft j"
            onClick={() => act("back")}
          >
            <Icon name="back" />
          </button>
          <button
            class="video-play-toggle"
            type="button"
            aria-label={props.paused() ? "Reproduzir" : "Pausar"}
            title="Reproduzir/pausar (Espaço / K)"
            aria-keyshortcuts="Space k"
            onClick={() => act("play")}
          >
            <Icon name={props.paused() ? "play" : "pause"} />
          </button>
          <button
            type="button"
            aria-label="Avançar 10 segundos"
            title="Avançar 10 segundos (→ / L)"
            aria-keyshortcuts="ArrowRight l"
            onClick={() => act("forward")}
          >
            <Icon name="forward" />
          </button>
        </div>
        <div class="video-presentation-group">
          <Show when={props.audioTracks.length > 1}>
            <select
              class="video-audio-select"
              aria-label="Faixa de áudio"
              title="Selecionar áudio"
              value={props.audioIndex ?? ""}
              onChange={(event) => props.onAudioChange(Number(event.currentTarget.value))}
            >
              <For each={props.audioTracks}>
                {(track) => {
                  const languages: Record<string, string> = {
                    por: "Português",
                    pt: "Português",
                    eng: "Inglês",
                    en: "Inglês",
                    spa: "Espanhol",
                    es: "Espanhol",
                  };
                  return (
                    <option value={track.streamIndex}>
                      {languages[track.language.toLowerCase()] ||
                        track.language ||
                        `Faixa ${track.streamIndex}`}
                      {track.title ? ` · ${track.title}` : ""}
                    </option>
                  );
                }}
              </For>
            </select>
          </Show>
          <button
            type="button"
            aria-label="Picture-in-picture"
            title="Picture-in-picture (P)"
            aria-keyshortcuts="p"
            onClick={() => act("pip")}
          >
            <Icon name="pip" />
          </button>
          <button
            type="button"
            aria-label="Tela cheia"
            title="Tela cheia (F)"
            aria-keyshortcuts="f"
            onClick={() => act("fullscreen")}
          >
            <Icon name="fullscreen" />
          </button>
        </div>
      </div>
      <div class="video-timeline">
        <span>{clock(position())}</span>
        <input
          type="range"
          aria-label="Posição do vídeo"
          min="0"
          max={props.duration() || 1}
          step="0.1"
          value={position()}
          style={{ "--range-progress": `${progress()}%` }}
          onInput={(event) => setDragging(Number(event.currentTarget.value))}
          onChange={(event) => {
            seek(Number(event.currentTarget.value));
            setDragging(undefined);
            reveal();
          }}
          onPointerCancel={() => setDragging(undefined)}
        />
        <span>{clock(props.duration())}</span>
      </div>
    </fieldset>
  );
}
