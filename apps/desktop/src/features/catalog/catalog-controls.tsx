// UI component for catalog filtering, search input, and genre selection.

import { CatalogCategory, MediaType } from "@popcorn/sdk";
import { For, Show } from "solid-js";
import type { CatalogViewModel } from "./catalog.viewmodel";

interface CatalogControlsProps {
  vm: CatalogViewModel;
}

export function CatalogControls(props: CatalogControlsProps) {
  const { vm } = props;

  const handleSearch = (event: Event) => {
    event.preventDefault();
    vm.performSearch(vm.searchInput().trim());
  };

  return (
    <section class="catalog-controls" aria-label="Explorar o TMDB">
      <div class="cluster media-tabs">
        <button
          type="button"
          class="button secondary"
          aria-pressed={vm.mediaType() === MediaType.MOVIE}
          onClick={() => vm.changeMediaType(MediaType.MOVIE)}
        >
          Filmes{vm.mediaType() === MediaType.MOVIE ? " ✓" : ""}
        </button>
        <button
          type="button"
          class="button secondary"
          aria-pressed={vm.mediaType() === MediaType.TV}
          onClick={() => vm.changeMediaType(MediaType.TV)}
        >
          Séries{vm.mediaType() === MediaType.TV ? " ✓" : ""}
        </button>
      </div>

      <form class="search-form" onSubmit={handleSearch}>
        <label for="catalog-search">
          Buscar {vm.mediaType() === MediaType.MOVIE ? "filmes" : "séries"}
        </label>
        <div class="search-fields">
          <input
            id="catalog-search"
            type="search"
            value={vm.searchInput()}
            onInput={(e) => vm.setSearchInput(e.currentTarget.value)}
            placeholder={vm.mediaType() === MediaType.MOVIE ? "Nome do filme" : "Nome da série"}
          />
          <button class="button" type="submit">
            Buscar
          </button>
        </div>
      </form>

      <div class="cluster category-tabs">
        <button
          type="button"
          class="button secondary"
          aria-pressed={!vm.query() && vm.category() === CatalogCategory.POPULAR}
          onClick={() => vm.changeCategory(CatalogCategory.POPULAR)}
        >
          Populares
        </button>
        <button
          type="button"
          class="button secondary"
          aria-pressed={!vm.query() && vm.category() === CatalogCategory.UPCOMING}
          onClick={() => vm.changeCategory(CatalogCategory.UPCOMING)}
        >
          {vm.mediaType() === MediaType.MOVIE ? "Próximos lançamentos" : "Em exibição"}
        </button>
        <button
          type="button"
          class="button secondary"
          aria-pressed={!vm.query() && vm.category() === CatalogCategory.TOP_RATED}
          onClick={() => vm.changeCategory(CatalogCategory.TOP_RATED)}
        >
          Mais bem avaliados
        </button>
      </div>

      <div class="genre-filter">
        <label for="genre">
          Gênero <span class="muted">· em Populares</span>
        </label>
        <select
          id="genre"
          value={vm.genreId()}
          disabled={vm.genresBusy()}
          onChange={(e) =>
            vm.changeCategory(CatalogCategory.POPULAR, Number(e.currentTarget.value))
          }
        >
          <option value="0">
            {vm.genresBusy() ? "Carregando gêneros..." : "Todos os gêneros"}
          </option>
          <For each={vm.genres()}>{(genre) => <option value={genre.id}>{genre.name}</option>}</For>
        </select>
        <Show when={vm.genresStale()}>
          <span class="cache-label">Gêneros: cache / offline</span>
        </Show>
        <Show when={vm.genresError()}>
          <p class="error-text" role="alert">
            {vm.genresError()}
          </p>
          <button type="button" class="button secondary" onClick={() => void vm.loadGenres()}>
            Tentar gêneros novamente
          </button>
        </Show>
      </div>
    </section>
  );
}
