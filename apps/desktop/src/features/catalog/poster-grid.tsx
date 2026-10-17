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
  if (vm.genreId()) {
    const match = vm.genres().find((item) => item.id === vm.genreId());
    if (match) return `Gênero: ${match.name}`;
  }
  if (vm.category() === CatalogCategory.UPCOMING) {
    return vm.mediaType() === MediaType.MOVIE ? "Próximos lançamentos" : "Em exibição";
  }
  if (vm.category() === CatalogCategory.TOP_RATED) return "Mais bem avaliados";
  return "Populares no TMDB";
}

export function PosterGrid(props: PosterGridProps) {
  const { vm, selectedTitle, onSelectTitle } = props;
  const heading = () => getCatalogHeading(vm);
  const eyebrow = () => {
    return vm.mediaType() === MediaType.MOVIE ? "FILMES / TMDB" : "SÉRIES / TMDB";
  };

  return (
    <>
      <div class="collection-header m-[32px_0_16px] [&_h2]:mt-[3px] [&_h2]:text-[25px] [&_>_.muted]:text-[12px] max-[560px]:items-end max-[560px]:[&_>_.muted]:max-w-[42%] max-[560px]:[&_>_.muted]:text-right cluster flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="eyebrow text-accent-strong text-[11px] font-bold tracking-[0.13em]">
            {eyebrow()}
          </p>
          <h2>{heading()}</h2>
        </div>
        <span class="muted text-muted">
          {vm.catalogLoaded() ? `${vm.titles().length} títulos carregados` : "Ainda não consultado"}
        </span>
      </div>

      <Show when={vm.catalogStale()}>
        <p class="cache-label text-amber-11 text-[12px] font-[650]" role="status">
          Cache / offline · exibindo dados salvos, não uma consulta atualizada.
        </p>
      </Show>

      <section
        class="catalog-panel [min-inline-size:0] border border-line rounded-panel bg-slate-2 wrap-anywhere overflow-hidden"
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
              onClick={() => void vm.loadCatalog(vm.catalogLoaded() && vm.hasMore())}
            >
              Tentar novamente
            </button>
          </div>
        </Show>

        <Show when={vm.catalogBusy()}>
          <p class="loading-message p-[12px_16px] text-muted text-[13px]" role="status">
            {vm.catalogLoaded() ? "Carregando mais títulos..." : "Consultando títulos..."}
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
              onClick={() => vm.changeCategory(CatalogCategory.POPULAR)}
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

        <ul class="poster-grid grid grid-cols-[repeat(auto-fill,_minmax(148px,_1fr))] gap-[clamp(14px,_2vw,_22px)] m-0 p-5 list-none [&_li]:min-w-0 max-[820px]:grid-cols-[repeat(auto-fill,_minmax(138px,_1fr))] max-[560px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[560px]:gap-[16px_12px] max-[560px]:p-3">
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
                  <span class="card-copy block p-[10px_2px_2px] [&_strong]:line-clamp-2 [&_strong]:min-h-[42px] [&_strong]:overflow-hidden [&_strong]:text-[14px] [&_strong]:font-[650] [&_strong]:leading-[1.45]">
                    <strong>{title.title || "Título não informado"}</strong>
                    <span class="row-meta block mt-[2px] text-muted text-[12px]">
                      {title.releaseYear || "Ano não informado"}
                      {title.voteAverage > 0 ? (
                        <>
                          · <Icon name="star" /> {title.voteAverage.toFixed(1)}
                        </>
                      ) : (
                        " · Sem avaliação"
                      )}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show when={vm.catalogLoaded() && vm.hasMore()}>
          <div class="pagination p-4 border-t border-line text-center">
            <button
              type="button"
              class={buttonStyles({ variant: "secondary" })}
              disabled={vm.catalogBusy()}
              onClick={() => void vm.loadCatalog(true)}
            >
              Carregar mais títulos
            </button>
          </div>
        </Show>
      </section>
    </>
  );
}
