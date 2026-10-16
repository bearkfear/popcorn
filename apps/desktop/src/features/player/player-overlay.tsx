import { PlaybackState } from "@popcorn/sdk";
import { Show } from "solid-js";
import { bytesLabel, rateLabel } from "../../shared/formatters";
import { PlayerOverlay as Dialog, MediaPlayer } from "./media-player";
import type { PlayerViewModel } from "./player.viewmodel";

export function PlayerOverlay(props: { readonly vm: PlayerViewModel; readonly title: string }) {
  return (
    <Show when={props.vm.playback()}>
      {(playback) => (
        <Dialog onClose={() => props.vm.close()}>
          <div class="player-toolbar">
            <div class="player-download">
              <strong>{props.title || "Reprodução"}</strong>
              <span>
                {bytesLabel(playback().sizeBytes)} · {props.vm.progress().toFixed(1)}% recebido ·{" "}
                {rateLabel(playback().downloadBytesPerSecond)} · {playback().peers} peer(s)
              </span>
              <progress max="100" value={props.vm.progress()} aria-label="Progresso do download">
                {props.vm.progress()}%
              </progress>
            </div>
            <div class="player-actions">
              <button
                class="button secondary"
                type="button"
                disabled={props.vm.busy() || !props.vm.mediaReady()}
                onClick={() => void props.vm.toggleDownload()}
              >
                {playback().state === PlaybackState.PAUSED ? "Retomar download" : "Pausar download"}
              </button>
              <button
                class="player-close"
                type="button"
                aria-label="Fechar reprodutor"
                onClick={() => props.vm.close()}
              >
                ×
              </button>
            </div>
          </div>
          <div class="player-status-area">
            <p class="player-conversion" role="status">
              {props.vm.conversionLabel()}
            </p>
            <Show when={!props.vm.mediaReady() && !props.vm.preparationError()}>
              <p role="status">
                {playback().state === PlaybackState.STOPPED
                  ? "Reprodução encerrada. Feche ou tente novamente."
                  : "Preparando vídeo para reprodução..."}
              </p>
            </Show>
            <Show when={props.vm.monitorError()}>
              <p class="error-text" role="alert">
                {props.vm.monitorError()}
              </p>
            </Show>
            <Show when={props.vm.displayError()}>
              <p class="error-text" role="alert">
                {props.vm.displayError()}
              </p>
            </Show>
            <Show when={props.vm.displayError() || playback().state === PlaybackState.STOPPED}>
              <button
                class="button secondary"
                type="button"
                disabled={props.vm.busy()}
                onClick={() => void props.vm.retry()}
              >
                Tentar reprodução novamente
              </button>
            </Show>
          </div>
          <div class="player-stage">
            <Show when={props.vm.mediaReady()}>
              <MediaPlayer
                playback={playback()}
                onError={props.vm.setMediaError}
                onEnded={() => props.vm.close()}
              />
            </Show>
          </div>
        </Dialog>
      )}
    </Show>
  );
}
