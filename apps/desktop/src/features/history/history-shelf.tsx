import { ToggleGroup } from "@ark-ui/solid/toggle-group";
import { createSignal, For, Show } from "solid-js";
import { Artwork } from "../../shared/ui/artwork";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
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
    <section
      class="history-section m-[40px_0_48px] pt-6 border-t border-line"
      aria-label="Minha biblioteca"
    >
      <div class="collection-header m-[32px_0_16px] [&_h2]:mt-[3px] [&_h2]:text-[25px] [&_>_.muted]:text-[12px] max-[560px]:items-end max-[560px]:[&_>_.muted]:max-w-[42%] max-[560px]:[&_>_.muted]:text-right cluster flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="eyebrow text-accent-strong text-[11px] font-bold tracking-[0.13em]">
            SUA BIBLIOTECA
          </p>
          <h2>Seu próximo play está aqui.</h2>
        </div>
        <ToggleGroup.Root
          class="cluster flex flex-wrap items-center justify-between gap-3 history-tabs max-[600px]:gap-[6px] max-[600px]:[&_.button]:p-2 max-[600px]:[&_.button]:text-[11px]"
          aria-label="Filtro da biblioteca"
          value={[filter()]}
          onValueChange={({ value }) => value[0] && setFilter(value[0] as WatchStatus)}
        >
          <For
            each={[
              { value: "watching" as const, label: "Continuar assistindo" },
              { value: "watched" as const, label: "Já assistidos" },
              { value: "want" as const, label: "Quero assistir" },
            ]}
          >
            {(tab) => (
              <ToggleGroup.Item class={buttonStyles({ variant: "secondary" })} value={tab.value}>
                {tab.label}
              </ToggleGroup.Item>
            )}
          </For>
        </ToggleGroup.Root>
      </div>
      <Show when={props.vm.error()}>
        <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
          {props.vm.error()}
        </p>
      </Show>
      <Show
        when={entries().length}
        fallback={
          <p class="history-empty p-[20px_0] text-muted text-[14px]">
            {filter() === "watching"
              ? "Os títulos que você começar aparecem aqui, com o ponto onde parou."
              : filter() === "watched"
                ? "Seus filmes e episódios concluídos aparecem aqui."
                : "Salve títulos na página de detalhes para assistir depois."}
          </p>
        }
      >
        <ul class="history-grid grid grid-cols-[repeat(auto-fit,_minmax(260px,_1fr))] gap-4 list-none p-0">
          <For each={entries()}>
            {(entry) => (
              <li class="history-card flex gap-4 p-3 border border-line rounded-[12px] bg-canvas-deep">
                <button
                  class="history-artwork [flex:0_0_90px] w-[90px] p-0 border-0 rounded-[6px] overflow-hidden bg-surface"
                  type="button"
                  onClick={() => props.onOpen(entry)}
                  disabled={props.disabled}
                >
                  <Artwork url={entry.title.posterUrl} title={entry.title.title} />
                </button>
                <div class="history-copy flex flex-col justify-center items-start gap-2 min-w-0 text-[13px] [&_progress]:w-full [&_progress]:h-[4px] [&_progress]:accent-accent [&_.muted]:text-[12px]">
                  <strong>{entry.title.title}</strong>
                  <Show when={entry.content.episodeNumber !== undefined}>
                    <span class="muted text-muted">
                      T{entry.content.seasonNumber} · E{entry.content.episodeNumber}
                    </span>
                  </Show>
                  <Show when={entry.status === "watching"}>
                    <progress
                      aria-label={`Progresso de ${entry.title.title}`}
                      max="1"
                      value={watchProgress(entry.position, entry.duration)}
                    />
                    <span class="muted text-muted">
                      {Math.floor(entry.position / 60)} de {Math.ceil(entry.duration / 60)} min
                    </span>
                  </Show>
                  <button
                    type="button"
                    class={buttonStyles({ variant: "secondary" })}
                    disabled={props.disabled}
                    onClick={() =>
                      entry.status === "watching" &&
                      entry.sourceId !== undefined &&
                      entry.fileIndex !== undefined
                        ? props.onResume(entry)
                        : props.onOpen(entry)
                    }
                  >
                    {entry.status === "watching" ? (
                      <>
                        <Icon name="play" /> Continuar
                      </>
                    ) : (
                      "Ver detalhes"
                    )}
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
