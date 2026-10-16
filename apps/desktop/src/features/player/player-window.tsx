import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createBootstrapViewModel } from "../bootstrap/bootstrap.viewmodel";
import type { WatchEntry } from "../history/history.model";
import { createHistoryViewModel } from "../history/history.viewmodel";
import { diagnostic, errorDetails } from "./media-diagnostics";
import { createPlayerViewModel } from "./player.viewmodel";
import { PlayerPage } from "./player-page";

export type WindowSession = {
  context: Omit<WatchEntry, "key" | "status" | "position" | "duration" | "updatedAt">;
  position: number;
};

export function PlayerWindow() {
  const bootstrap = createBootstrapViewModel();
  const player = createPlayerViewModel(() => bootstrap.getClients().playback);
  const history = createHistoryViewModel();
  const [session, setSession] = createSignal<WindowSession>();
  const [error, setError] = createSignal("");
  let closing = false;

  async function close() {
    if (closing) return;
    closing = true;
    // Flush the last position before stopping the stream and destroying its webview.
    document.querySelector("video")?.pause();
    window.dispatchEvent(new Event("pagehide"));
    const current = player.playback();
    player.close(false);
    try {
      if (current)
        await bootstrap
          .getClients()
          .playback?.stopPlayback({ playbackId: current.playbackId }, { timeoutMs: 5_000 });
    } catch (cause) {
      diagnostic(
        "playback.window_stop_failed",
        { playbackId: current?.playbackId },
        errorDetails(cause),
      );
    } finally {
      await getCurrentWindow().destroy();
    }
  }

  onMount(() => {
    let disposed = false;
    const listener = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void close();
    });
    onCleanup(() => {
      disposed = true;
      void listener.then((unlisten) => unlisten());
    });
    void (async () => {
      try {
        const current = await invoke<WindowSession>("take_player_session");
        if (disposed) return;
        setSession(current);
        document.title = `${current.context.title.title} · Popcorn`;
        await bootstrap.connect();
        if (disposed || closing) return;
        const { sourceId, fileIndex, quality, audioStreamIndex } = current.context;
        if (!sourceId || fileIndex === undefined) throw new Error("Fonte de vídeo indisponível.");
        player.setQuality(quality);
        player.setAudioStreamIndex(audioStreamIndex);
        await player.playFile(sourceId, fileIndex, true, current.position);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Não foi possível abrir o vídeo.");
      }
    })();
  });

  return (
    <Show when={session()} fallback={<p class="state-message">Preparando reprodução…</p>}>
      {(current) => (
        <>
          <Show when={error() || bootstrap.connectionError()}>
            <p class="error-text" role="alert">
              {error() || bootstrap.connectionError()}
            </p>
          </Show>
          <PlayerPage
            vm={player}
            title={current().context.title.title}
            dedicated
            onBack={() => void close()}
            onProgress={(position, duration, audioIndex) =>
              history.progress(
                {
                  ...current().context,
                  ...(audioIndex !== undefined ? { audioStreamIndex: audioIndex } : {}),
                },
                position,
                duration,
              )
            }
            onEnded={() => {
              history.mark(current().context.title, current().context.content, "watched");
              void close();
            }}
          />
        </>
      )}
    </Show>
  );
}
