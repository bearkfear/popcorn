import { PlaybackState } from "@popcorn/sdk";
import { onCleanup, onMount, Show } from "solid-js";
import { rateLabel } from "../../shared/formatters";
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
        <header class="player-toolbar flex flex-none items-center gap-3 px-4 py-3 bg-black text-ink sm:px-6">
          <button
            class="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-transparent text-muted transition-colors hover:bg-white-a2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            type="button"
            aria-label="Voltar aos detalhes"
            title="Voltar aos detalhes"
            onClick={props.onBack}
          >
            <Icon name="arrow-left" class="size-5" />
          </button>
          <div class="player-download min-w-0 flex-1">
            <h1 class="m-0 truncate text-sm font-medium leading-5 text-ink" title={props.title}>
              {props.title}
            </h1>
            <Show when={props.vm.playback() && !props.vm.downloadComplete()}>
              <span class="block text-[11px] leading-4 text-muted tabular-nums">
                {props.vm.progress().toFixed(0)}% ·{" "}
                {rateLabel(props.vm.playback()?.downloadBytesPerSecond ?? 0n)}
              </span>
            </Show>
          </div>
          <Show when={props.vm.playback() && !props.vm.downloadComplete()}>
            <button
              class="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-transparent text-muted hover:bg-white-a2 hover:text-ink disabled:opacity-40"
              type="button"
              aria-label={
                props.vm.playback()?.state === PlaybackState.PAUSED
                  ? "Retomar download"
                  : "Pausar download"
              }
              title={
                props.vm.playback()?.state === PlaybackState.PAUSED
                  ? "Retomar download"
                  : "Pausar download"
              }
              disabled={props.vm.busy() || !props.vm.mediaReady()}
              onClick={() => void props.vm.toggleDownload()}
            >
              <Icon
                name={props.vm.playback()?.state === PlaybackState.PAUSED ? "play" : "pause"}
                class="size-4"
              />
            </button>
          </Show>
        </header>
      </Show>
      <div class="player-stage flex-1 relative min-w-0 min-h-0 bg-black-a12">
        <Show when={!props.vm.mediaReady() && !props.vm.playbackFailure()}>
          <div
            class="absolute inset-0 grid place-items-center"
            role="status"
            aria-label="Carregando vídeo"
          >
            <Icon
              name="loading"
              class="size-6 animate-spin text-muted motion-reduce:animate-none"
            />
          </div>
        </Show>
        <Show when={props.vm.playbackFailure()}>
          <div class="player-status-area absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-6">
            <div class="max-w-sm text-center">
              <p class="m-0 text-sm leading-6 text-ink" role="alert">
                {props.vm.playbackFailure()}
              </p>
              <button
                type="button"
                class={buttonStyles({ variant: "secondary", class: "mt-4" })}
                disabled={props.vm.busy()}
                onClick={() => void props.vm.retry()}
              >
                Recarregar vídeo
              </button>
            </div>
          </div>
        </Show>
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
