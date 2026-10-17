// Floating playback controls and shortcuts for the canvas video surface.
import type { Playback } from "@popcorn/sdk";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import { SelectField } from "../../shared/ui/select-field";
import { type PlayerAction, playerShortcut } from "./player-shortcuts";

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
  const [pendingSeek, setPendingSeek] = createSignal<number>();
  let panel: HTMLFieldSetElement | undefined;
  let timer: number | undefined;
  const shown = () =>
    visible() || props.paused() || dragging() !== undefined || pendingSeek() !== undefined;
  const position = () => dragging() ?? pendingSeek() ?? props.position();
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
    if (video && props.duration() > 0) {
      const target = Math.max(0, Math.min(position, Math.max(0, props.duration() - 0.1)));
      // Keep the chosen position through MSE teardown and stale timeupdate events.
      setPendingSeek(target);
      video.currentTime = target;
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
        seek((pendingSeek() ?? props.position()) - 10);
        break;
      case "forward":
        seek((pendingSeek() ?? props.position()) + 10);
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
    const video = props.video();
    const settled = () => {
      const target = pendingSeek();
      if (
        video &&
        target !== undefined &&
        video.readyState >= 2 &&
        !video.seeking &&
        Math.abs(props.position() - target) <= 0.25 &&
        Math.abs(video.currentTime - target) <= 0.25
      ) {
        setPendingSeek(undefined);
      }
    };
    const failed = () => setPendingSeek(undefined);
    const settledEvents = ["seeked", "timeupdate", "loadeddata", "playing"];
    for (const event of settledEvents) video?.addEventListener(event, settled);
    video?.addEventListener("error", failed);
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
      for (const event of settledEvents) video?.removeEventListener(event, settled);
      video?.removeEventListener("error", failed);
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
            <Icon name={props.volume() === 0 ? "speaker-slash" : "speaker-high"} />
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
            <Icon name="rewind" />
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
            <Icon name="fast-forward" />
          </button>
        </div>
        <div class="video-presentation-group">
          <Show when={props.audioTracks.length > 1}>
            <SelectField
              class="video-audio-field"
              triggerClass="video-audio-select"
              contentClass="video-audio-menu"
              placement="top-end"
              ariaLabel="Faixa de áudio"
              value={String(props.audioIndex ?? props.audioTracks[0]?.streamIndex ?? "")}
              options={props.audioTracks.map((track) => {
                const languages: Record<string, string> = {
                  por: "Português",
                  pt: "Português",
                  eng: "Inglês",
                  en: "Inglês",
                  spa: "Espanhol",
                  es: "Espanhol",
                };
                const language =
                  languages[track.language.toLowerCase()] ||
                  track.language ||
                  `Faixa ${track.streamIndex}`;
                const title = track.title.trim();
                return {
                  value: String(track.streamIndex),
                  label: `${language}${title && title.toLowerCase() !== language.toLowerCase() ? ` · ${title}` : ""}`,
                };
              })}
              onChange={(value) => props.onAudioChange(Number(value))}
            />
          </Show>
          <button
            type="button"
            aria-label="Picture-in-picture"
            title="Picture-in-picture (P)"
            aria-keyshortcuts="p"
            onClick={() => act("pip")}
          >
            <Icon name="picture-in-picture" />
          </button>
          <button
            type="button"
            aria-label="Tela cheia"
            title="Tela cheia (F)"
            aria-keyshortcuts="f"
            onClick={() => act("fullscreen")}
          >
            <Icon name="corners-out" />
          </button>
        </div>
      </div>
      <div class="video-timeline">
        <span>{clock(position())}</span>
        <div class="video-timeline-track" style={{ "--range-progress": `${progress()}%` }}>
          <input
            type="range"
            aria-label="Posição do vídeo"
            aria-busy={pendingSeek() !== undefined}
            min="0"
            max={props.duration() || 1}
            step="0.1"
            value={position()}
            onInput={(event) => setDragging(Number(event.currentTarget.value))}
            onChange={(event) => {
              seek(Number(event.currentTarget.value));
              setDragging(undefined);
              reveal();
            }}
            onPointerCancel={() => setDragging(undefined)}
          />
          <Show when={pendingSeek() !== undefined && dragging() === undefined}>
            <div class="video-seek-indicators">
              <span class="video-seek-loading" role="status" aria-label="Carregando trecho…">
                <Icon name="loading" />
              </span>
            </div>
          </Show>
        </div>
        <span>{clock(props.duration())}</span>
      </div>
    </fieldset>
  );
}
