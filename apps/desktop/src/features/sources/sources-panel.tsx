import { createEffect, For, Show, untrack } from "solid-js";
import { bytesLabel } from "../../shared/formatters";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
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
      class="sources-section mt-6 p-5 border border-slate-7 rounded-panel bg-slate-2 max-[560px]:p-4"
      aria-label="Fontes de reprodução"
      aria-busy={props.sources.busy()}
    >
      <div class="source-heading flex items-center justify-between gap-3 [&_h3]:mt-[2px] [&_h3]:text-[21px] [&_h3]:font-normal">
        <div>
          <p class="eyebrow text-accent-strong text-[11px] font-bold tracking-[0.13em]">
            FONTE AUTORIZADA
          </p>
          <h3>Assistir agora</h3>
        </div>
        <Show when={props.sources.content()?.episodeNumber}>
          <span class="episode-badge p-[4px_9px] rounded-[20px] bg-accent text-accent-contrast text-[11px] font-bold">
            T{props.sources.content()?.seasonNumber} · E{props.sources.content()?.episodeNumber}
          </span>
        </Show>
      </div>
      <p class="muted text-muted source-disclaimer m-[12px_0_16px] text-[12px]">
        Adicione apenas um magnet que você tem autorização para acessar. O Popcorn não fornece
        conteúdo.
      </p>
      <form
        class="magnet-form [&_label]:block [&_label]:mb-[6px] [&_label]:text-muted [&_label]:text-[12px] [&_label]:font-bold"
        onSubmit={submitMagnet}
      >
        <label for="magnet-link">Link magnet</label>
        <div class="magnet-fields flex [&_input]:min-w-0 [&_input]:w-full [&_input]:min-h-[42px] [&_input]:p-[8px_11px] [&_input]:border [&_input]:border-line [&_input]:rounded-[5px_0_0_5px] [&_input]:bg-canvas-deep [&_input]:text-ink [&_.button]:flex-none [&_.button]:rounded-[0_5px_5px_0] max-[560px]:grid max-[560px]:gap-2 max-[560px]:[&_input]:rounded-control max-[560px]:[&_.button]:rounded-control">
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
            class={buttonStyles()}
            type="submit"
            disabled={props.sources.busy() || !props.sources.magnet().trim()}
          >
            {props.sources.busy() ? "Preparando..." : "Adicionar"}
          </button>
        </div>
      </form>
      <div class="torrent-import flex items-center gap-3 mt-3 text-muted text-[11px] [&_label]:inline-flex [&_label]:min-h-[36px] [&_label]:items-center [&_label]:p-[6px_10px] [&_label.disabled]:cursor-default [&_label.disabled]:opacity-[0.48] [&_input]:absolute [&_input]:w-[1px] [&_input]:h-[1px] [&_input]:overflow-hidden [&_input]:[clip:rect(0_0_0_0)] [&_input]:[clip-path:inset(50%)] [&_input]:whitespace-nowrap">
        <span>ou</span>
        <label
          class={buttonStyles({
            variant: "secondary",
            class: props.sources.busy() ? "disabled" : "",
          })}
        >
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
        <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
          {props.sources.error()}
        </p>
      </Show>
      <Show
        when={!props.sources.busy() && !props.sources.sources().length && !props.sources.error()}
      >
        <p class="muted text-muted empty-source mt-4 text-[12px]">
          Nenhuma fonte vinculada a este{" "}
          {props.sources.content()?.episodeNumber ? "episódio" : "título"}.
        </p>
      </Show>
      <ul class="source-list m-[16px_0_0] p-0 list-none [&_>_li]:pt-3 [&_>_li]:border-t [&_>_li]:border-line">
        <For each={props.sources.sources()}>
          {(source) => (
            <li>
              <div class="source-row flex items-center justify-between gap-3 text-muted text-[11px]">
                <span>Fonte {props.sources.sources().indexOf(source) + 1}</span>
                <button
                  class="text-button p-[3px_0] border-0 bg-transparent text-negative text-[11px]"
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
                    <p class="muted text-muted">
                      Não foi possível identificar um único vídeo principal. Escolha entre os vídeos
                      disponíveis.
                    </p>
                    <ul class="file-list m-[16px_0_0] p-0 list-none [&_>_li]:flex [&_>_li]:items-center [&_>_li]:justify-between [&_>_li]:gap-3 [&_>_li]:p-[12px_0] [&_>_li]:border-t [&_>_li]:border-slate-6 [&_>_li_>_div]:min-w-0 [&_strong]:block [&_strong]:overflow-hidden [&_strong]:text-[12px] [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_span]:block [&_span]:text-muted [&_span]:text-[11px]">
                      <For each={source.files.filter((file) => file.likelyMedia)}>
                        {(file) => (
                          <li>
                            <div>
                              <strong>{file.name}</strong>
                              <span>{bytesLabel(file.sizeBytes)}</span>
                            </div>
                            <button
                              class={buttonStyles()}
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
                    class={buttonStyles()}
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
        <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
          {props.player.error()}
        </p>
      </Show>
    </section>
  );
}
