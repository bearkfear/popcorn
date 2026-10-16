import { createEffect, For, Show, untrack } from "solid-js";
import { bytesLabel } from "../../shared/formatters";
import { Icon } from "../../shared/ui/icon";
import { PlaybackSetup } from "../player/playback-setup";
import type { PlayerViewModel } from "../player/player.viewmodel";
import type { SourcesViewModel } from "./sources.viewmodel";

export function SourcesPanel(props: {
  readonly sources: SourcesViewModel;
  readonly player: PlayerViewModel;
  readonly onPrepare: (sourceId: string, fileIndex: number) => void;
  readonly resumeSeconds: number;
  readonly onLaunch: (position: number) => void;
}) {
  let automaticSource = "";
  createEffect(() => {
    const sources = props.sources.sources();
    if (props.sources.busy() || sources.length !== 1) return;
    const source = sources[0];
    if (!source || source.recommendedFileIndex === undefined) return;
    const fileIndex = source.recommendedFileIndex;
    const key = `${source.sourceId}:${fileIndex}`;
    if (automaticSource === key) return;
    automaticSource = key;
    untrack(() => {
      if (props.player.preparedFile()?.sourceId !== source.sourceId) {
        props.onPrepare(source.sourceId, fileIndex);
      }
    });
  });

  function submitMagnet(event: SubmitEvent) {
    event.preventDefault();
    void props.sources.addMagnet();
  }

  function importTorrent(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void props.sources.importTorrent(file);
  }

  return (
    <section
      class="sources-section"
      aria-label="Fontes de reprodução"
      aria-busy={props.sources.busy()}
    >
      <div class="source-heading">
        <div>
          <p class="eyebrow">FONTE AUTORIZADA</p>
          <h3>Assistir agora</h3>
        </div>
        <Show when={props.sources.content()?.episodeNumber}>
          <span class="episode-badge">
            T{props.sources.content()?.seasonNumber} · E{props.sources.content()?.episodeNumber}
          </span>
        </Show>
      </div>
      <p class="muted source-disclaimer">
        Adicione apenas um magnet que você tem autorização para acessar. O Popcorn não fornece
        conteúdo.
      </p>
      <form class="magnet-form" onSubmit={submitMagnet}>
        <label for="magnet-link">Link magnet</label>
        <div class="magnet-fields">
          <input
            id="magnet-link"
            type="text"
            inputmode="url"
            value={props.sources.magnet()}
            onInput={(event) => props.sources.setMagnet(event.currentTarget.value)}
            placeholder="magnet:?xt=urn:btih:…"
            spellcheck={false}
            disabled={props.sources.busy()}
          />
          <button
            class="button"
            type="submit"
            disabled={props.sources.busy() || !props.sources.magnet().trim()}
          >
            {props.sources.busy() ? "Preparando..." : "Adicionar"}
          </button>
        </div>
      </form>
      <div class="torrent-import">
        <span>ou</span>
        <label class={`button secondary ${props.sources.busy() ? "disabled" : ""}`}>
          Importar .torrent
          <input
            type="file"
            accept=".torrent,application/x-bittorrent"
            disabled={props.sources.busy()}
            onChange={importTorrent}
          />
        </label>
      </div>
      <Show when={props.sources.error()}>
        <p class="error-text" role="alert">
          {props.sources.error()}
        </p>
      </Show>
      <Show
        when={!props.sources.busy() && !props.sources.sources().length && !props.sources.error()}
      >
        <p class="muted empty-source">
          Nenhuma fonte vinculada a este{" "}
          {props.sources.content()?.episodeNumber ? "episódio" : "título"}.
        </p>
      </Show>
      <ul class="source-list">
        <For each={props.sources.sources()}>
          {(source) => (
            <li>
              <div class="source-row">
                <span>Fonte {props.sources.sources().indexOf(source) + 1}</span>
                <button
                  class="text-button"
                  type="button"
                  disabled={props.sources.busy()}
                  onClick={() => void props.sources.removeSource(source.sourceId)}
                >
                  Remover
                </button>
              </div>
              <Show
                when={source.recommendedFileIndex !== undefined}
                fallback={
                  <>
                    <p class="muted">
                      Não foi possível identificar um único vídeo principal. Escolha entre os vídeos
                      disponíveis.
                    </p>
                    <ul class="file-list">
                      <For each={source.files.filter((file) => file.likelyMedia)}>
                        {(file) => (
                          <li>
                            <div>
                              <strong>{file.name}</strong>
                              <span>{bytesLabel(file.sizeBytes)}</span>
                            </div>
                            <button
                              class="button"
                              type="button"
                              disabled={props.player.busy()}
                              onClick={() => props.onPrepare(source.sourceId, file.fileIndex)}
                            >
                              Usar este vídeo
                            </button>
                          </li>
                        )}
                      </For>
                    </ul>
                  </>
                }
              >
                <Show when={props.sources.sources().length > 1 || props.player.error()}>
                  <button
                    class="button"
                    type="button"
                    disabled={props.player.busy()}
                    onClick={() => {
                      const index = source.recommendedFileIndex;
                      if (index !== undefined) props.onPrepare(source.sourceId, index);
                    }}
                  >
                    {props.player.busy() ? (
                      "Preparando..."
                    ) : props.player.preparedFile()?.sourceId === source.sourceId ? (
                      <>
                        <Icon name="check" /> Fonte selecionada
                      </>
                    ) : (
                      "Usar esta fonte"
                    )}
                  </button>
                </Show>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <PlaybackSetup
        vm={props.player}
        resumeSeconds={props.resumeSeconds}
        onLaunch={props.onLaunch}
      />
      <Show when={props.player.error()}>
        <p class="error-text" role="alert">
          {props.player.error()}
        </p>
      </Show>
    </section>
  );
}
