import { createSignal, For, Show } from "solid-js";
import { Artwork } from "../../shared/ui/artwork";
import { type WatchEntry, type WatchStatus, watchProgress } from "./history.model";
import type { HistoryViewModel } from "./history.viewmodel";

export function HistoryShelf(props: {
  readonly vm: HistoryViewModel;
  readonly onOpen: (entry: WatchEntry) => void;
  readonly onResume: (entry: WatchEntry) => void;
  readonly disabled: boolean;
}) {
  const [filter, setFilter] = createSignal<WatchStatus>("watching");
  const entries = () => props.vm.entries().filter((entry) => entry.status === filter());
  return (
    <section class="history-section" aria-label="Minha biblioteca">
      <div class="collection-header cluster">
        <div>
          <p class="eyebrow">SUA BIBLIOTECA</p>
          <h2>Seu próximo play está aqui.</h2>
        </div>
        <div class="cluster history-tabs">
          <For
            each={[
              { value: "watching" as const, label: "Continuar assistindo" },
              { value: "watched" as const, label: "Já assistidos" },
              { value: "want" as const, label: "Quero assistir" },
            ]}
          >
            {(tab) => (
              <button
                type="button"
                class="button secondary"
                aria-pressed={filter() === tab.value}
                onClick={() => setFilter(tab.value)}
              >
                {tab.label}
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={props.vm.error()}>
        <p class="error-text" role="alert">
          {props.vm.error()}
        </p>
      </Show>
      <Show
        when={entries().length}
        fallback={
          <p class="history-empty">
            {filter() === "watching"
              ? "Os títulos que você começar aparecem aqui, com o ponto onde parou."
              : filter() === "watched"
                ? "Seus filmes e episódios concluídos aparecem aqui."
                : "Salve títulos na página de detalhes para assistir depois."}
          </p>
        }
      >
        <ul class="history-grid">
          <For each={entries()}>
            {(entry) => (
              <li class="history-card">
                <button
                  class="history-artwork"
                  type="button"
                  onClick={() => props.onOpen(entry)}
                  disabled={props.disabled}
                >
                  <Artwork url={entry.title.posterUrl} title={entry.title.title} />
                </button>
                <div class="history-copy">
                  <strong>{entry.title.title}</strong>
                  <Show when={entry.content.episodeNumber !== undefined}>
                    <span class="muted">
                      T{entry.content.seasonNumber} · E{entry.content.episodeNumber}
                    </span>
                  </Show>
                  <Show when={entry.status === "watching"}>
                    <progress
                      aria-label={`Progresso de ${entry.title.title}`}
                      max="1"
                      value={watchProgress(entry.position, entry.duration)}
                    />
                    <span class="muted">
                      {Math.floor(entry.position / 60)} de {Math.ceil(entry.duration / 60)} min
                    </span>
                  </Show>
                  <button
                    type="button"
                    class="button secondary"
                    disabled={props.disabled}
                    onClick={() =>
                      entry.status === "watching" &&
                      entry.sourceId !== undefined &&
                      entry.fileIndex !== undefined
                        ? props.onResume(entry)
                        : props.onOpen(entry)
                    }
                  >
                    {entry.status === "watching" ? "▶ Continuar" : "Ver detalhes"}
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}
