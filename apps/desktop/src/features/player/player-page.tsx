import { PlaybackState } from "@popcorn/sdk";
import { onCleanup, onMount, Show } from "solid-js";
import { bytesLabel, rateLabel } from "../../shared/formatters";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
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
      class={`player-page flex flex-col h-dvh overflow-hidden bg-black-a12 outline-none ${props.dedicated ? " dedicated-player [&_.player-stage]:flex [&_.video-player]:static [&_.video-player]:[flex:1] [&_.video-player]:min-h-0" : ""}`}
      tabindex="-1"
      aria-label="Reprodução"
    >
      <Show when={!props.dedicated}>
        <header class="player-toolbar flex flex-none flex-wrap min-h-[64px] items-center justify-between gap-4 p-[10px_clamp(16px,_4vw,_48px)] border-b border-slate-6 bg-canvas-deep [&_strong]:block [&_strong]:text-[15px] [&_span]:block [&_span]:text-muted [&_span]:text-[11px] [&_progress]:block [&_progress]:w-[min(320px,_55vw)] [&_progress]:h-[4px] [&_progress]:mt-[6px] [&_progress]:border-0 [&_progress]:accent-accent max-[560px]:items-start max-[600px]:gap-2 max-[600px]:p-[10px] max-[600px]:[&_strong]:overflow-hidden max-[600px]:[&_strong]:text-ellipsis max-[600px]:[&_strong]:whitespace-nowrap">
          <button class={`${buttonStyles} secondary`} type="button" onClick={props.onBack}>
            <Icon name="arrow-left" /> Voltar aos detalhes
          </button>
          <div class="player-download min-w-0 max-[600px]:[order:-1] max-[600px]:w-full">
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
          <button
            class={`${buttonStyles} secondary`}
            type="button"
            disabled={props.vm.busy() || !props.vm.mediaReady()}
            onClick={() => void props.vm.toggleDownload()}
          >
            {props.vm.playback()?.state === PlaybackState.PAUSED
              ? "Retomar download"
              : "Pausar download"}
          </button>
        </header>
      </Show>
      <Show when={props.vm.displayError() || props.vm.monitorError() || !props.vm.mediaReady()}>
        <div
          class="player-status-area flex-none min-w-0 max-h-[40vh] overflow-y-auto p-[12px_16px] bg-surface text-[13px] wrap-anywhere [&_.error-text]:p-3 [&_.error-text]:rounded-control [&_.error-text]:bg-negative-bg"
          aria-live="polite"
        >
          <Show when={!props.vm.mediaReady() && !props.vm.displayError()}>
            <p>Preparando vídeo…</p>
          </Show>
          <Show when={props.vm.displayError()}>
            <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
              {props.vm.displayError()}
            </p>
          </Show>
          <Show when={props.vm.monitorError()}>
            <p role="status">{props.vm.monitorError()}</p>
          </Show>
          <Show when={props.vm.displayError()}>
            <button
              type="button"
              class={`${buttonStyles} secondary`}
              disabled={props.vm.busy()}
              onClick={() => void props.vm.retry()}
            >
              Tentar novamente
            </button>
          </Show>
        </div>
      </Show>
      <div class="player-stage flex-1 relative min-w-0 min-h-0 bg-black-a12">
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
