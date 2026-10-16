// UI component for displaying the catalog poster grid, status states, and pagination.

import { CatalogCategory, MediaType, type Title } from "@popcorn/sdk";
import { For, Show } from "solid-js";
import { Artwork } from "../../shared/ui/artwork";
import type { CatalogViewModel } from "./catalog.viewmodel";

interface PosterGridProps {
  vm: CatalogViewModel;
  selectedTitle: () => Title | undefined;
  onSelectTitle: (title: Title) => void;
}

function getCatalogHeading(vm: CatalogViewModel): string {
  if (vm.source() === "local") return "Catálogo local";
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
    if (vm.source() === "local") return "SEM CONSULTAS À INTERNET";
    return vm.mediaType() === MediaType.MOVIE ? "FILMES / TMDB" : "SÉRIES / TMDB";
  };

  return (
    <>
      <div class="collection-header cluster">
        <div>
          <p class="eyebrow">{eyebrow()}</p>
          <h2>{heading()}</h2>
        </div>
        <span class="muted">
          {vm.catalogLoaded() ? `${vm.titles().length} títulos carregados` : "Ainda não consultado"}
        </span>
      </div>

      <Show when={vm.catalogStale()}>
        <p class="cache-label" role="status">
          Cache / offline · exibindo dados salvos, não uma consulta atualizada.
        </p>
      </Show>

      <section class="catalog-panel" aria-label="Títulos do catálogo" aria-busy={vm.catalogBusy()}>
        <Show when={vm.catalogError()}>
          <div class="state-message error-message" role="alert">
            <h3>Consulta indisponível</h3>
            <p>{vm.catalogError()}</p>
            <button
              type="button"
              class="button secondary"
              disabled={vm.catalogBusy()}
              onClick={() => void vm.loadCatalog(vm.catalogLoaded() && vm.hasMore())}
            >
              Tentar novamente
            </button>
          </div>
        </Show>

        <Show when={vm.catalogBusy()}>
          <p class="loading-message" role="status">
            {vm.catalogLoaded() ? "Carregando mais títulos..." : "Consultando títulos..."}
          </p>
        </Show>

        <Show when={vm.catalogLoaded() && vm.titles().length === 0 && !vm.catalogError()}>
          <div class="state-message">
            <h3>
              {vm.query() ? "Nenhum resultado para esta busca" : "Nenhum título nesta coleção"}
            </h3>
            <p>
              {vm.source() === "local"
                ? "O snapshot instalado está vazio. Explore o TMDB para consultar o catálogo online."
                : "A consulta terminou sem títulos. Experimente outra busca, gênero ou coleção."}
            </p>
            <button
              type="button"
              class="button secondary"
              onClick={() =>
                vm.source() === "local"
                  ? vm.changeSource("online")
                  : vm.changeCategory(CatalogCategory.POPULAR)
              }
            >
              {vm.source() === "local" ? "Explorar TMDB" : "Voltar aos populares"}
            </button>
          </div>
        </Show>

        <Show when={!vm.catalogLoaded() && !vm.catalogBusy() && !vm.catalogError()}>
          <div class="state-message">
            <h3>Catálogo ainda não consultado</h3>
            <p>Conecte o serviço local para carregar os títulos.</p>
          </div>
        </Show>

        <ul class={`poster-grid ${vm.source() === "local" ? "local-list" : ""}`}>
          <For each={vm.titles()}>
            {(title) => (
              <li>
                <button
                  type="button"
                  class="poster-card"
                  disabled={!title.content}
                  aria-label={`Abrir ${title.title || "título sem nome"}`}
                  aria-pressed={selectedTitle() === title}
                  onClick={() => onSelectTitle(title)}
                >
                  <Show when={vm.source() === "online"}>
                    <Artwork url={title.posterUrl} title={`Pôster de ${title.title}`} />
                  </Show>
                  <span class="card-copy">
                    <strong>{title.title || "Título não informado"}</strong>
                    <span class="row-meta">
                      {title.releaseYear || "Ano não informado"}
                      {title.voteAverage > 0
                        ? ` · ★ ${title.voteAverage.toFixed(1)}`
                        : " · Sem avaliação"}
                    </span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show when={vm.catalogLoaded() && vm.hasMore()}>
          <div class="pagination">
            <button
              type="button"
              class="button secondary"
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
