import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createBootstrapViewModel } from "../bootstrap/bootstrap.viewmodel";
import { createHistoryViewModel } from "../history/history.viewmodel";
import { diagnostic, errorDetails } from "./media-diagnostics";
import { createPlayerViewModel } from "./player.viewmodel";
import { PlayerPage } from "./player-page";
import { readPlayerSession, savePlayerSession, type WindowSession } from "./player-tab";

export type { WindowSession } from "./player-tab";

export function PlayerWindow() {
  const bootstrap = createBootstrapViewModel();
  const player = createPlayerViewModel(() => bootstrap.getClients().playback);
  const history = createHistoryViewModel(() => bootstrap.getClients().history);
  const [session, setSession] = createSignal<WindowSession>();
  const [error, setError] = createSignal("");
  let closing = false;

  async function close() {
    if (closing) return;
    closing = true;
    // Flush the last position before stopping the stream and closing the player.
    document.querySelector("video")?.pause();
    window.dispatchEvent(new Event("pagehide"));
    if (!(await history.flush())) {
      diagnostic("history.flush_failed", {}, { error: history.error() });
    }
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
      if (isTauri()) await getCurrentWindow().destroy();
      else {
        window.opener?.focus();
        window.close();
      }
    }
  }

  onMount(() => {
    let disposed = false;
    if (isTauri()) {
      const listener = getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        void close();
      });
      onCleanup(() => {
        void listener.then((unlisten) => unlisten());
      });
    } else {
      const unload = () => {
        if (!closing) player.close();
      };
      window.addEventListener("pagehide", unload);
      onCleanup(() => window.removeEventListener("pagehide", unload));
    }
    onCleanup(() => {
      disposed = true;
    });
    void (async () => {
      try {
        const current = isTauri()
          ? await invoke<WindowSession>("take_player_session")
          : readPlayerSession();
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
    <Show
      when={session()}
      fallback={
        <p class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.button]:mt-5">
          {error() || "Preparando reprodução…"}
        </p>
      }
    >
      {(current) => (
        <>
          <Show when={error() || bootstrap.connectionError() || history.error()}>
            <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
              {error() || bootstrap.connectionError() || history.error()}
            </p>
          </Show>
          <PlayerPage
            vm={player}
            title={current().context.title.title}
            dedicated={isTauri()}
            onBack={() => void close()}
            onProgress={(position, duration, audioIndex) => {
              const context = {
                ...current().context,
                ...(audioIndex !== undefined ? { audioStreamIndex: audioIndex } : {}),
              };
              if (!isTauri()) savePlayerSession({ context, position });
              void history.progress(context, position, duration);
            }}
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
