// Floating playback controls and shortcuts for the canvas video surface.
import type { Playback } from "@popcorn/sdk";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import { SelectField } from "../../shared/ui/select-field";
import { playerButtonStyles, playerRangeStyles } from "./player-controls.styles";
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
      class={`video-controls absolute bottom-[clamp(18px,_5vh,_44px)] left-[50%] w-[min(600px,_calc(100%_-_32px))] m-0 min-w-0 p-[18px_22px_16px] border border-white-a2 rounded-[22px] bg-slate-3 shadow-[0_8px_32px_var(--black-a6),_inset_0_1px_0_var(--white-a1)] backdrop-blur-[24px] text-ink [transform:translateX(-50%)] opacity-0 pointer-events-none [transition:opacity_180ms_ease] [&.is-visible]:opacity-[1] [&.is-visible]:pointer-events-auto [&:focus-within]:opacity-[1] [&:focus-within]:pointer-events-auto max-[540px]:p-[14px_12px] max-[540px]:rounded-[16px] motion-reduce:[transition:none] ${shown() ? " is-visible " : ""}`}
      aria-label="Controles de reprodução"
      onFocusIn={reveal}
      onFocusOut={reveal}
    >
      <div class="video-controls-top grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-[18px] max-[540px]:grid-cols-[1fr_auto] max-[540px]:gap-[6px]">
        <div class="video-volume-group flex items-center gap-3 min-w-0 max-[540px]:gap-1">
          <button
            class={`${playerButtonStyles} size-8`}
            type="button"
            aria-label={props.volume() === 0 ? "Ativar som" : "Silenciar"}
            title="Ativar/desativar som (M)"
            aria-keyshortcuts="m"
            onClick={() => act("mute")}
          >
            <Icon
              name={props.volume() === 0 ? "speaker-slash" : "speaker-high"}
              class="size-6 text-2xl text-center"
            />
          </button>
          <input
            class={`${playerRangeStyles} video-volume h-[5px] w-[72px] min-w-[30px] max-[540px]:w-10`}
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
        <div class="video-transport-group flex items-center gap-3 min-w-0 justify-center max-[540px]:gap-1">
          <button
            class={`${playerButtonStyles} size-8`}
            type="button"
            aria-label="Voltar 10 segundos"
            title="Voltar 10 segundos (← / J)"
            aria-keyshortcuts="ArrowLeft j"
            onClick={() => act("back")}
          >
            <Icon name="rewind" class="size-6 text-2xl text-center fill-current stroke-[1.5]" />
          </button>
          <button
            class={`${playerButtonStyles} size-10 video-play-toggle [&[aria-label=Reproduzir]_.app-icon]:translate-x-px`}
            type="button"
            aria-label={props.paused() ? "Reproduzir" : "Pausar"}
            title="Reproduzir/pausar (Espaço / K)"
            aria-keyshortcuts="Space k"
            onClick={() => act("play")}
          >
            <Icon
              name={props.paused() ? "play" : "pause"}
              class="size-7 text-2xl text-center fill-current stroke-[1.5]"
            />
          </button>
          <button
            class={`${playerButtonStyles} size-8`}
            type="button"
            aria-label="Avançar 10 segundos"
            title="Avançar 10 segundos (→ / L)"
            aria-keyshortcuts="ArrowRight l"
            onClick={() => act("forward")}
          >
            <Icon
              name="fast-forward"
              class="size-6 text-2xl text-center fill-current stroke-[1.5]"
            />
          </button>
        </div>
        <div class="video-presentation-group flex items-center gap-2 min-w-0 justify-end max-[540px]:col-span-full max-[540px]:gap-1">
          <Show when={props.audioTracks.length > 1}>
            <SelectField
              class="video-audio-field [flex:0_1_112px] min-w-0"
              variant="player"
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
            class={`${playerButtonStyles} size-8`}
            type="button"
            aria-label="Picture-in-picture"
            title="Picture-in-picture (P)"
            aria-keyshortcuts="p"
            onClick={() => act("pip")}
          >
            <Icon name="picture-in-picture" class="size-6 text-2xl text-center" />
          </button>
          <button
            class={`${playerButtonStyles} size-8`}
            type="button"
            aria-label="Tela cheia"
            title="Tela cheia (F)"
            aria-keyshortcuts="f"
            onClick={() => act("fullscreen")}
          >
            <Icon name="corners-out" class="size-6 text-2xl text-center" />
          </button>
        </div>
      </div>
      <div class="video-timeline flex items-center gap-[10px] text-[13px] font-semibold tabular-nums [&_span]:shrink-0">
        <span>{clock(position())}</span>
        <div
          class="video-timeline-track [--timeline-scale:1] [--timeline-height:5px] [--timeline-transition:150ms] relative flex items-center [flex:1] min-w-[20px] h-[32px] [&:hover]:[--timeline-scale:1.5] [&:hover]:[--timeline-height:8px] [&:focus-within]:[--timeline-scale:1.5] [&:focus-within]:[--timeline-height:8px] [&:has([aria-busy=true])]:[--timeline-scale:1.5] [&:has([aria-busy=true])]:[--timeline-height:8px] [&_input]:w-full [&_input]:min-w-0 [&_input]:m-0 [&_input]:h-[var(--timeline-height)] [&_input]:[transition:height_var(--timeline-transition)_ease] [&_input::-webkit-slider-thumb]:[transform:scale(var(--timeline-scale))] [&_input::-webkit-slider-thumb]:[transition:transform_var(--timeline-transition)_ease] [&_input::-moz-range-thumb]:[transform:scale(var(--timeline-scale))] [&_input::-moz-range-thumb]:[transition:transform_var(--timeline-transition)_ease] motion-reduce:[--timeline-transition:0ms]"
          style={{ "--range-progress": `${progress()}%` }}
        >
          <input
            class={playerRangeStyles}
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
            <div class="video-seek-indicators absolute inset-[0_8px] pointer-events-none">
              <span
                class="video-seek-loading absolute top-[50%] left-[var(--range-progress,_0%)] grid place-items-center w-[16px] h-[16px] rounded-full bg-ink text-slate-3 [transform:translate(-50%,_-50%)_scale(var(--timeline-scale))] [transition:transform_var(--timeline-transition)_ease]"
                role="status"
                aria-label="Carregando trecho…"
              >
                <Icon
                  name="loading"
                  class="size-3 text-2xl text-center stroke-[2.5] animate-[spin_800ms_linear_infinite] motion-reduce:animate-none"
                />
              </span>
            </div>
          </Show>
        </div>
        <span>{clock(props.duration())}</span>
      </div>
    </fieldset>
  );
}
