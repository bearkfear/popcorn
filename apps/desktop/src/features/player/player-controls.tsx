// Floating playback controls shared by the native video and macOS canvas surfaces.
import type { Playback } from "@popcorn/sdk";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import {
  playerButtonStyles,
  playerControlsStyles,
  playerRangeStyles,
} from "./player-controls.styles";
import { PlayerLanguageMenu } from "./player-language-menu";
import { type PlayerAction, playerShortcut } from "./player-shortcuts";
import { useInlinePlayer } from "./player-tab";
import type { TimelineRange } from "./timeline-ranges";

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
  downloadedRanges: readonly TimelineRange[];
  bufferedRanges: readonly TimelineRange[];
  volume: () => number;
  play: () => void;
  present: (mode: "fullscreen" | "picture-in-picture") => void;
  pictureInPictureAvailable: () => boolean;
  imageReady: () => boolean;
  audioTracks: Playback["audioTracks"];
  audioIndex: number | undefined;
  onAudioChange: (index: number) => void;
}) {
  const television = useInlinePlayer();
  const mobile =
    /iPhone|iPad|iPod|Android.*Mobile/i.test(navigator.userAgent) ||
    (/Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1);
  const [visible, setVisible] = createSignal(true);
  const [dragging, setDragging] = createSignal<number>();
  const [pendingSeek, setPendingSeek] = createSignal<number>();
  let panel: HTMLFieldSetElement | undefined;
  let timer: number | undefined;
  const shown = () => visible() || (!television && props.paused()) || dragging() !== undefined;
  const position = () => dragging() ?? pendingSeek() ?? props.position();
  const progress = () => Math.min(100, (100 * position()) / (props.duration() || 1));
  function hideWhenIdle() {
    const active = document.activeElement;
    const keyboardFocus =
      !television && panel?.contains(active) && active?.matches(":focus-visible");
    if (keyboardFocus || panel?.querySelector('[aria-expanded="true"]')) {
      timer = window.setTimeout(hideWhenIdle, 2500);
      return;
    }
    setVisible(false);
  }
  function reveal() {
    setVisible(true);
    window.clearTimeout(timer);
    timer = window.setTimeout(hideWhenIdle, 2500);
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
        if (props.imageReady()) props.present("fullscreen");
        break;
      case "pip":
        if (props.imageReady() && props.pictureInPictureAvailable())
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
      reveal();
      if (event.defaultPrevented) return;
      // Native WebKit fullscreen and PiP have their own controls and key handling.
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
    let pointer: { x: number; y: number } | undefined;
    const pointermove = (event: PointerEvent) => {
      if (pointer?.x === event.clientX && pointer?.y === event.clientY) return;
      pointer = { x: event.clientX, y: event.clientY };
      reveal();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("pointermove", pointermove);
    window.addEventListener("pointerdown", reveal);
    reveal();
    onCleanup(() => {
      for (const event of settledEvents) video?.removeEventListener(event, settled);
      video?.removeEventListener("error", failed);
      window.clearTimeout(timer);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("pointermove", pointermove);
      window.removeEventListener("pointerdown", reveal);
    });
  });
  const styles = playerControlsStyles();
  return (
    <fieldset
      ref={panel}
      class={styles.panel({ visible: shown() })}
      aria-label="Controles de reprodução"
      onFocusIn={reveal}
      onFocusOut={reveal}
    >
      <div class={styles.timeline()}>
        <span>{clock(position())}</span>
        <div
          class={styles.timelineTrack()}
          style={{
            "--range-progress": `${progress()}%`,
          }}
          title="Cinza: partes baixadas (posição aproximada). Cinza claro: trechos carregados. Branco: reprodução."
        >
          <div class={styles.timelineLayers()} aria-hidden="true">
            <For each={props.downloadedRanges}>
              {(range) => (
                <div
                  class={styles.downloadSegment()}
                  style={{ left: `${range.start}%`, width: `${range.end - range.start}%` }}
                />
              )}
            </For>
            <For each={props.bufferedRanges}>
              {(range) => (
                <div
                  class={styles.bufferSegment()}
                  style={{ left: `${range.start}%`, width: `${range.end - range.start}%` }}
                />
              )}
            </For>
            <div class={styles.playedSegment()} style={{ width: `${progress()}%` }} />
          </div>
          <input
            class={playerRangeStyles()}
            type="range"
            aria-label="Posição do vídeo"
            aria-busy={pendingSeek() !== undefined}
            aria-valuetext={`${clock(position())} de ${clock(props.duration())}`}
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
            <div class={styles.seekIndicators()}>
              <span class={styles.seekLoading()} role="status" aria-label="Carregando trecho…">
                <Icon name="loading" class={styles.loadingIcon()} />
              </span>
            </div>
          </Show>
        </div>
        <span>{clock(props.duration())}</span>
      </div>
      <div class={styles.top()}>
        <div class={styles.volumeGroup()}>
          <Show when={!mobile}>
            <button
              class={playerButtonStyles()}
              type="button"
              aria-label={props.volume() === 0 ? "Ativar som" : "Silenciar"}
              title="Ativar/desativar som (M)"
              aria-keyshortcuts="m"
              onClick={() => act("mute")}
            >
              <Icon
                name={props.volume() === 0 ? "speaker-slash" : "speaker-high"}
                class={styles.icon()}
              />
            </button>
            <input
              class={playerRangeStyles({ kind: "volume" })}
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
          </Show>
        </div>
        <div class={styles.transportGroup()}>
          <button
            class={playerButtonStyles()}
            type="button"
            aria-label="Voltar 10 segundos"
            title="Voltar 10 segundos (← / J)"
            aria-keyshortcuts="ArrowLeft j"
            onClick={() => act("back")}
          >
            <Icon name="replay" class={styles.transportIcon()} />
            <span class={styles.skipLabel()} aria-hidden="true">
              10
            </span>
          </button>
          <button
            class={playerButtonStyles({ size: "play" })}
            type="button"
            aria-label={props.paused() ? "Reproduzir" : "Pausar"}
            title="Reproduzir/pausar (Espaço / K)"
            aria-keyshortcuts="Space k"
            onClick={() => act("play")}
          >
            <Icon name={props.paused() ? "play" : "pause"} class={styles.playIcon()} />
          </button>
          <button
            class={playerButtonStyles()}
            type="button"
            aria-label="Avançar 10 segundos"
            title="Avançar 10 segundos (→ / L)"
            aria-keyshortcuts="ArrowRight l"
            onClick={() => act("forward")}
          >
            <Icon name="forward" class={styles.transportIcon()} />
            <span class={styles.skipLabel()} aria-hidden="true">
              10
            </span>
          </button>
        </div>
        <div class={styles.presentationGroup()}>
          <Show when={props.audioTracks.length > 0}>
            <PlayerLanguageMenu
              tracks={props.audioTracks}
              selected={props.audioIndex}
              onChange={props.onAudioChange}
            />
          </Show>
          <Show when={props.imageReady() && props.pictureInPictureAvailable()}>
            <button
              class={playerButtonStyles()}
              type="button"
              aria-label="Janela flutuante"
              title="Janela flutuante (P)"
              aria-keyshortcuts="p"
              onClick={() => act("pip")}
            >
              <Icon name="picture-in-picture" class={styles.icon()} />
            </button>
          </Show>
          <Show when={props.imageReady()}>
            <button
              class={playerButtonStyles()}
              type="button"
              aria-label="Tela cheia"
              title="Tela cheia (F)"
              aria-keyshortcuts="f"
              onClick={() => act("fullscreen")}
            >
              <Icon name="corners-out" class={styles.icon()} />
            </button>
          </Show>
        </div>
      </div>
    </fieldset>
  );
}
