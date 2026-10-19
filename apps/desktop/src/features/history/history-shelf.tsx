import { ToggleGroup } from "@ark-ui/solid/toggle-group";
import { MediaType } from "@popcorn/sdk";
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
  const filterIcon = () =>
    filter() === "watching" ? "play" : filter() === "watched" ? "check" : "plus";

  return (
    <section class="history-section" aria-label="Minha biblioteca" aria-busy={!props.vm.loaded()}>
      <ToggleGroup.Root
        class="history-tabs mb-7 flex items-center gap-2 max-[560px]:grid max-[560px]:grid-cols-3"
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
            <ToggleGroup.Item
              class="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 text-[13px] font-medium text-muted transition-colors hover:bg-slate-3 hover:text-ink data-[state=on]:border-slate-7 data-[state=on]:bg-slate-4 data-[state=on]:text-ink max-[560px]:flex-col max-[560px]:justify-center max-[560px]:gap-1 max-[560px]:px-1 max-[560px]:py-2 max-[560px]:text-[11px]"
              value={tab.value}
            >
              <span class="max-[560px]:hidden">{tab.label}</span>
              <span class="hidden max-[560px]:inline">
                {tab.value === "watching" ? "Em andamento" : tab.label}
              </span>
              <span class="ml-1 text-xs text-muted tabular-nums max-[560px]:ml-0">
                {props.vm.entries().filter((entry) => entry.status === tab.value).length}
              </span>
            </ToggleGroup.Item>
          )}
        </For>
      </ToggleGroup.Root>
      <Show when={props.vm.error()}>
        <p class="error-text mb-5 rounded-lg bg-negative-bg p-4 text-sm text-negative" role="alert">
          {props.vm.error()}
        </p>
      </Show>
      <Show
        when={props.vm.loaded()}
        fallback={
          <Show when={!props.vm.error()}>
            <p
              class="flex min-h-48 items-center justify-center gap-3 text-sm text-muted"
              role="status"
            >
              <Icon name="loading" class="animate-spin" /> Carregando sua biblioteca…
            </p>
          </Show>
        }
      >
        <Show
          when={entries().length}
          fallback={
            <div class="history-empty flex min-h-[300px] flex-col items-center justify-center px-5 py-12 text-center">
              <span class="mb-5 grid size-14 place-items-center rounded-2xl border border-slate-6 bg-slate-3 text-muted">
                <Icon name={filterIcon()} class="size-6" />
              </span>
              <h2 class="text-xl font-medium tracking-[-0.025em]">
                {filter() === "watching"
                  ? "Nenhum título em andamento"
                  : filter() === "watched"
                    ? "Nenhum título assistido"
                    : "Sua lista está vazia"}
              </h2>
              <p class="mt-2 max-w-[38ch] text-sm leading-relaxed text-muted">
                {filter() === "watching"
                  ? "Os títulos que você começar aparecem aqui, com o ponto onde parou."
                  : filter() === "watched"
                    ? "Seus filmes e episódios concluídos aparecem aqui."
                    : "Salve títulos na página de detalhes para assistir depois."}
              </p>
            </div>
          }
        >
          <ul
            class={`history-grid m-0 grid list-none p-0 ${
              filter() === "watching"
                ? "grid-cols-[repeat(auto-fill,_minmax(min(100%,_340px),_1fr))] gap-5"
                : "grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] gap-x-5 gap-y-7 max-[820px]:grid-cols-[repeat(auto-fill,_minmax(138px,_1fr))] max-[560px]:grid-cols-2 max-[560px]:gap-x-3"
            }`}
          >
            <For each={entries()}>
              {(entry) => (
                <li
                  class={`history-card min-w-0 ${entry.status === "watching" ? "flex items-stretch gap-4 rounded-xl border border-slate-6 bg-slate-2 p-4 transition-colors hover:border-slate-8 max-[560px]:gap-3 max-[560px]:p-3" : ""}`}
                >
                  <button
                    class={`history-artwork block overflow-hidden rounded-lg bg-surface ${entry.status === "watching" ? "w-[104px] shrink-0 self-start max-[560px]:w-[88px]" : "w-full transition-transform duration-150 hover:-translate-y-1"}`}
                    type="button"
                    aria-label={`Ver detalhes de ${entry.title.title}`}
                    onClick={() => props.onOpen(entry)}
                    disabled={props.disabled}
                  >
                    <Artwork url={entry.title.posterUrl} title={entry.title.title} />
                  </button>
                  <div
                    class={`history-copy min-w-0 text-[13px] ${entry.status === "watching" ? "flex min-h-[156px] flex-1 flex-col items-start gap-2 max-[560px]:min-h-[132px]" : "pt-3"}`}
                  >
                    <strong
                      class={`line-clamp-2 text-sm font-medium leading-5 ${entry.status === "watching" ? "" : "min-h-10"}`}
                    >
                      {entry.title.title}
                    </strong>
                    <span class="block text-xs text-muted">
                      {entry.title.releaseYear || "Ano não informado"} ·{" "}
                      {entry.content.mediaType === MediaType.TV ? "Série" : "Filme"}
                    </span>
                    <Show when={entry.content.episodeNumber !== undefined}>
                      <span class="muted mt-1 block text-xs text-muted">
                        T{entry.content.seasonNumber} · E{entry.content.episodeNumber}
                      </span>
                    </Show>
                    <Show when={entry.status === "watching"}>
                      <progress
                        class="mt-auto h-1 w-full overflow-hidden rounded-full"
                        aria-label={`Progresso de ${entry.title.title}`}
                        max="1"
                        value={watchProgress(entry.position, entry.duration)}
                      />
                      <span class="muted text-xs text-muted tabular-nums">
                        {entry.duration > 0
                          ? `${Math.floor(entry.position / 60)} de ${Math.ceil(entry.duration / 60)} min`
                          : "Reprodução iniciada"}
                      </span>
                    </Show>
                    <button
                      type="button"
                      class={
                        entry.status === "watching"
                          ? buttonStyles({
                              variant: "secondary",
                              size: "compact",
                              class: "mt-1 inline-flex w-full items-center justify-center gap-2",
                            })
                          : "mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs text-muted hover:text-ink"
                      }
                      disabled={props.disabled}
                      onClick={() =>
                        entry.status === "watching" &&
                        entry.sourceId !== undefined &&
                        entry.fileIndex !== undefined
                          ? props.onResume(entry)
                          : props.onOpen(entry)
                      }
                    >
                      <Show
                        when={entry.status === "watching"}
                        fallback={
                          <>
                            Ver detalhes <Icon name="external" />
                          </>
                        }
                      >
                        <Icon name="play" /> Continuar
                      </Show>
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
