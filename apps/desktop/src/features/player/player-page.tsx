import { Button } from "@kobalte/core/button";
import { PlaybackState } from "@popcorn/sdk";
import { onCleanup, onMount, Show } from "solid-js";
import { bytesLabel, rateLabel } from "../../shared/formatters";
import { Icon } from "../../shared/ui/icon";
import { MediaPlayer } from "./media-player";
import type { PlayerViewModel } from "./player.viewmodel";

// A standalone page keeps the native video surface out of modal/backdrop layers.
export function PlayerPage(props: {
  readonly vm: PlayerViewModel;
  readonly title: string;
  readonly dedicated?: boolean;
  readonly onBack: () => void;
  readonly onProgress: (position: number, duration: number, audioIndex?: number) => void;
  readonly onEnded: () => void;
}) {
  let page: HTMLElement | undefined;
  onMount(() => {
    page?.focus();
    const keydown = (event: KeyboardEvent) => {
      const video = page?.querySelector("video") as
        | (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean })
        | undefined;
      if (
        event.key === "Escape" &&
        !document.fullscreenElement &&
        !video?.webkitDisplayingFullscreen
      )
        props.onBack();
    };
    window.addEventListener("keydown", keydown);
    onCleanup(() => window.removeEventListener("keydown", keydown));
  });
  return (
    <main
      ref={page}
      class={`player-page${props.dedicated ? " dedicated-player" : ""}`}
      tabindex="-1"
      aria-label="Reprodução"
    >
      <Show when={!props.dedicated}>
        <header class="player-toolbar">
          <Button class="button secondary" type="button" onClick={props.onBack}>
            <Icon name="arrow-left" /> Voltar aos detalhes
          </Button>
          <div class="player-download">
            <strong>{props.title}</strong>
            <Show when={props.vm.playback()}>
              {(playback) => (
                <>
                  <span>
                    {bytesLabel(playback().sizeBytes)} · {props.vm.progress().toFixed(1)}% recebido
                    · {rateLabel(playback().downloadBytesPerSecond)} · {playback().peers} peers
                  </span>
                  <progress
                    max="100"
                    value={props.vm.progress()}
                    aria-label="Progresso do download"
                  />
                </>
              )}
            </Show>
          </div>
          <Button
            class="button secondary"
            type="button"
            disabled={props.vm.busy() || !props.vm.mediaReady()}
            onClick={() => void props.vm.toggleDownload()}
          >
            {props.vm.playback()?.state === PlaybackState.PAUSED
              ? "Retomar download"
              : "Pausar download"}
          </Button>
        </header>
      </Show>
      <Show when={props.vm.displayError() || props.vm.monitorError() || !props.vm.mediaReady()}>
        <div class="player-status-area" aria-live="polite">
          <Show when={!props.vm.mediaReady() && !props.vm.displayError()}>
            <p>Preparando vídeo…</p>
          </Show>
          <Show when={props.vm.displayError()}>
            <p class="error-text" role="alert">
              {props.vm.displayError()}
            </p>
          </Show>
          <Show when={props.vm.monitorError()}>
            <p role="status">{props.vm.monitorError()}</p>
          </Show>
          <Show when={props.vm.displayError()}>
            <Button
              type="button"
              class="button secondary"
              disabled={props.vm.busy()}
              onClick={() => void props.vm.retry()}
            >
              Tentar novamente
            </Button>
          </Show>
        </div>
      </Show>
      <div class="player-stage">
        <Show when={props.vm.mediaReady() ? props.vm.playback() : undefined}>
          {(playback) => (
            <MediaPlayer
              playback={playback()}
              startSeconds={props.vm.initialPosition()}
              onError={props.vm.setMediaError}
              onEnded={props.onEnded}
              onProgress={props.onProgress}
              onAudioChange={(index, position) => void props.vm.changeAudio(index, position)}
            />
          )}
        </Show>
      </div>
    </main>
  );
}
