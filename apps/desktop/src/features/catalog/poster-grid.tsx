import { Pagination } from "@ark-ui/solid/pagination";
import { buttonStyles } from "../../shared/ui/styles";
// UI component for displaying the catalog poster grid, status states, and pagination.

import { CatalogCategory, MediaType, type Title } from "@popcorn/sdk";
import { For, Show } from "solid-js";
import { Artwork } from "../../shared/ui/artwork";
import { Icon } from "../../shared/ui/icon";
import type { CatalogViewModel } from "./catalog.viewmodel";

interface PosterGridProps {
  vm: CatalogViewModel;
  selectedTitle: () => Title | undefined;
  onSelectTitle: (title: Title) => void;
}

function getCatalogHeading(vm: CatalogViewModel): string {
  if (vm.query()) return `Resultados para "${vm.query()}"`;
  const genre = vm.genres().find((item) => item.id === vm.genreId());
  let heading = "Populares agora";
  if (vm.category() === CatalogCategory.UPCOMING) {
    heading = vm.mediaType() === MediaType.MOVIE ? "Próximos lançamentos" : "Em exibição";
  }
  if (vm.category() === CatalogCategory.TOP_RATED) heading = "Mais bem avaliados";
  return genre ? `${heading} · ${genre.name}` : heading;
}

export function PosterGrid(props: PosterGridProps) {
  const { vm, selectedTitle, onSelectTitle } = props;
  const heading = () => getCatalogHeading(vm);
  let headingElement: HTMLHeadingElement | undefined;

  function changePage(page: number) {
    if (vm.catalogBusy() || page === vm.page()) return;
    vm.changePage(page);
    headingElement?.scrollIntoView({ block: "start", behavior: "instant" });
    headingElement?.focus({ preventScroll: true });
  }

  return (
    <>
      <div class="collection-header mt-8 mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <h2
          ref={headingElement}
          tabindex="-1"
          class="min-w-0 scroll-mt-24 text-[22px] font-medium tracking-[-0.025em] wrap-anywhere focus:outline-none"
        >
          {heading()}
        </h2>
        <Show when={vm.totalPages() > 0}>
          <span
            class="flex shrink-0 items-center gap-2 text-xs text-muted"
            role="status"
            aria-live="polite"
          >
            <Show
              when={vm.catalogBusy()}
              fallback={
                <>
                  Página {vm.page()} de {vm.totalPages()}
                </>
              }
            >
              <Icon name="loading" class="animate-spin" /> Carregando página {vm.requestedPage()}…
            </Show>
          </span>
        </Show>
      </div>

      <Show when={vm.catalogStale()}>
        <p class="cache-label text-amber-11 text-[12px] font-[650]" role="status">
          Cache / offline · exibindo dados salvos, não uma consulta atualizada.
        </p>
      </Show>

      <section
        class="catalog-panel min-w-0 wrap-anywhere"
        aria-label="Títulos do catálogo"
        aria-busy={vm.catalogBusy()}
      >
        <Show when={vm.catalogError()}>
          <div
            class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.button]:mt-5 error-message bg-negative-bg [&_h3]:text-negative"
            role="alert"
          >
            <h3>Consulta indisponível</h3>
            <p>{vm.catalogError()}</p>
            <button
              type="button"
              class={buttonStyles({ variant: "secondary" })}
              disabled={vm.catalogBusy()}
              onClick={vm.retryCatalog}
            >
              Tentar novamente
            </button>
          </div>
        </Show>

        <Show when={vm.catalogBusy() && !vm.catalogLoaded()}>
          <p class="loading-message p-[12px_16px] text-muted text-[13px]" role="status">
            Consultando títulos...
          </p>
        </Show>

        <Show when={vm.catalogLoaded() && vm.titles().length === 0 && !vm.catalogError()}>
          <div class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.button]:mt-5">
            <h3>
              {vm.query() ? "Nenhum resultado para esta busca" : "Nenhum título nesta coleção"}
            </h3>
            <p>A consulta terminou sem títulos. Experimente outra busca, gênero ou coleção.</p>
            <button
              type="button"
              class={buttonStyles({ variant: "secondary" })}
              onClick={() => vm.changeCategory(CatalogCategory.POPULAR, 0)}
            >
              Voltar aos populares
            </button>
          </div>
        </Show>

        <Show when={!vm.catalogLoaded() && !vm.catalogBusy() && !vm.catalogError()}>
          <div class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.button]:mt-5">
            <h3>Catálogo ainda não consultado</h3>
            <p>Conecte o serviço local para carregar os títulos.</p>
          </div>
        </Show>

        <ul class="poster-grid m-0 grid list-none grid-cols-[repeat(auto-fill,_minmax(180px,_1fr))] gap-x-5 gap-y-7 p-0 [&_li]:min-w-0 max-[820px]:grid-cols-[repeat(auto-fill,_minmax(138px,_1fr))] max-[560px]:grid-cols-2 max-[560px]:gap-x-3 max-[560px]:gap-y-5">
          <For each={vm.titles()}>
            {(title) => (
              <li>
                <button
                  type="button"
                  class="poster-card w-full p-0 border-0 rounded-control bg-transparent text-ink text-left [&_.artwork]:[transition:transform_150ms_ease,_box-shadow_150ms_ease,_filter_150ms_ease] [&:where([aria-pressed=true],_:hover:not(:disabled))_.artwork]:[transform:translateY(-3px)] [&:where([aria-pressed=true],_:hover:not(:disabled))_.artwork]:shadow-[0_12px_24px_var(--black-a6)] [&:where([aria-pressed=true],_:hover:not(:disabled))_.artwork]:brightness-[1.08] [&[aria-pressed=true]_.artwork]:[outline:3px_solid_var(--accent)] [&[aria-pressed=true]_.artwork]:outline-offset-[2px]"
                  disabled={!title.content}
                  aria-label={`Abrir ${title.title || "título sem nome"}`}
                  aria-pressed={selectedTitle() === title}
                  onClick={() => onSelectTitle(title)}
                >
                  <Artwork url={title.posterUrl} title={`Pôster de ${title.title}`} />
                  <span class="card-copy block pt-3 [&_strong]:line-clamp-2 [&_strong]:min-h-10 [&_strong]:text-[14px] [&_strong]:font-medium [&_strong]:leading-5">
                    <strong>{title.title || "Título não informado"}</strong>
                    <span class="row-meta mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                      <span>{title.releaseYear || "Ano não informado"}</span>
                      <Show when={title.voteAverage > 0}>
                        <span class="flex items-center gap-1 text-amber-11">
                          <Icon name="star" /> {title.voteAverage.toFixed(1)}
                        </span>
                      </Show>
                    </span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show when={vm.totalPages() > 1}>
          {/* The API returns a page count, so each item represents one API page. */}
          <Pagination.Root
            class="pagination mt-10 flex items-center justify-center gap-1 border-t border-slate-6 pt-6"
            count={vm.totalPages()}
            pageSize={1}
            page={vm.page() || 1}
            siblingCount={0}
            onPageChange={({ page }) => changePage(page)}
            translations={{
              rootLabel: "Paginação do catálogo",
              prevTriggerLabel: "Página anterior",
              nextTriggerLabel: "Próxima página",
              itemLabel: ({ page, totalPages }) => `Página ${page} de ${totalPages}`,
            }}
          >
            <Pagination.PrevTrigger
              class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] text-muted transition-colors hover:bg-slate-4 hover:text-ink max-[560px]:size-9 max-[560px]:min-h-9 max-[560px]:p-0"
              disabled={vm.catalogBusy() || vm.page() <= 1}
            >
              <Icon name="caret-down" class="size-4 rotate-90" />
              <span class="max-[560px]:hidden">Anterior</span>
            </Pagination.PrevTrigger>
            <Pagination.Context>
              {(pagination) => (
                <For each={pagination().pages}>
                  {(page, index) => (
                    <Show
                      when={page.type === "page" && page}
                      keyed
                      fallback={
                        <Pagination.Ellipsis
                          index={index()}
                          class="grid size-9 place-items-center text-xs text-muted"
                        >
                          …
                        </Pagination.Ellipsis>
                      }
                    >
                      {(item) => (
                        <Pagination.Item
                          {...item}
                          disabled={vm.catalogBusy()}
                          class="grid size-10 place-items-center rounded-lg border border-transparent text-[13px] text-muted tabular-nums transition-colors hover:bg-slate-4 hover:text-ink data-[selected]:border-slate-7 data-[selected]:bg-slate-4 data-[selected]:font-semibold data-[selected]:text-ink max-[560px]:size-9"
                        >
                          {item.value}
                        </Pagination.Item>
                      )}
                    </Show>
                  )}
                </For>
              )}
            </Pagination.Context>
            <Pagination.NextTrigger
              class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] text-muted transition-colors hover:bg-slate-4 hover:text-ink max-[560px]:size-9 max-[560px]:min-h-9 max-[560px]:p-0"
              disabled={vm.catalogBusy() || vm.page() >= vm.totalPages()}
            >
              <span class="max-[560px]:hidden">Próxima</span>
              <Icon name="caret-down" class="size-4 -rotate-90" />
            </Pagination.NextTrigger>
          </Pagination.Root>
        </Show>
      </section>
    </>
  );
}
