// UI component for catalog filtering, search input, and genre selection.

import { Button } from "@kobalte/core/button";
import { Select } from "@kobalte/core/select";
import { ToggleGroup } from "@kobalte/core/toggle-group";
import { CatalogCategory, MediaType } from "@popcorn/sdk";
import { Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import type { CatalogViewModel } from "./catalog.viewmodel";

interface GenreOption {
  id: string;
  name: string;
}

interface CatalogControlsProps {
  vm: CatalogViewModel;
}

export function CatalogControls(props: CatalogControlsProps) {
  const { vm } = props;
  const genreOptions = (): GenreOption[] => [
    {
      id: "0",
      name: vm.genresBusy() ? "Carregando gêneros..." : "Todos os gêneros",
    },
    ...vm.genres().map((genre) => ({ id: String(genre.id), name: genre.name })),
  ];
  const selectedGenre = () =>
    genreOptions().find((genre) => genre.id === String(vm.genreId())) ?? {
      id: "0",
      name: vm.genresBusy() ? "Carregando gêneros..." : "Todos os gêneros",
    };

  const handleSearch = (event: Event) => {
    event.preventDefault();
    vm.performSearch(vm.searchInput().trim());
  };

  return (
    <section class="catalog-controls" aria-label="Explorar o TMDB">
      <ToggleGroup
        class="cluster media-tabs"
        aria-label="Tipo de mídia"
        value={String(vm.mediaType())}
        onChange={(value) => value && vm.changeMediaType(Number(value) as MediaType)}
      >
        <ToggleGroup.Item class="button secondary" value={String(MediaType.MOVIE)}>
          Filmes
        </ToggleGroup.Item>
        <ToggleGroup.Item class="button secondary" value={String(MediaType.TV)}>
          Séries
        </ToggleGroup.Item>
      </ToggleGroup>

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
          <Button class="button" type="submit">
            Buscar
          </Button>
        </div>
      </form>

      <ToggleGroup
        class="cluster category-tabs"
        aria-label="Categoria do catálogo"
        value={vm.query() ? null : String(vm.category())}
        onChange={(value) => value && vm.changeCategory(Number(value) as CatalogCategory)}
      >
        <ToggleGroup.Item class="button secondary" value={String(CatalogCategory.POPULAR)}>
          Populares
        </ToggleGroup.Item>
        <ToggleGroup.Item class="button secondary" value={String(CatalogCategory.UPCOMING)}>
          {vm.mediaType() === MediaType.MOVIE ? "Próximos lançamentos" : "Em exibição"}
        </ToggleGroup.Item>
        <ToggleGroup.Item class="button secondary" value={String(CatalogCategory.TOP_RATED)}>
          Mais bem avaliados
        </ToggleGroup.Item>
      </ToggleGroup>

      <div class="genre-filter">
        <Select
          class="genre-select"
          options={genreOptions()}
          optionValue={(genre) => genre.id}
          optionTextValue={(genre) => genre.name}
          value={selectedGenre()}
          disabled={vm.genresBusy()}
          itemComponent={(itemProps) => (
            <Select.Item class="genre-select-item" item={itemProps.item}>
              <Select.ItemLabel>{itemProps.item.rawValue?.name}</Select.ItemLabel>
              <Select.ItemIndicator aria-hidden="true">
                <Icon name="check" />
              </Select.ItemIndicator>
            </Select.Item>
          )}
          onChange={(genre) => vm.changeCategory(CatalogCategory.POPULAR, Number(genre?.id ?? 0))}
        >
          <Select.Label class="genre-select-label">
            Gênero <span class="muted">· em Populares</span>
          </Select.Label>
          <Select.Trigger class="genre-select-trigger">
            <Select.Value<GenreOption>>
              {(state) => state.selectedOption()?.name ?? "Todos os gêneros"}
            </Select.Value>
            <Select.Icon aria-hidden="true">
              <Icon name="caret-down" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content class="genre-select-content">
              <Select.Listbox class="genre-select-listbox" />
            </Select.Content>
          </Select.Portal>
        </Select>
        <Show when={vm.genresStale()}>
          <span class="cache-label">Gêneros: cache / offline</span>
        </Show>
        <Show when={vm.genresError()}>
          <p class="error-text" role="alert">
            {vm.genresError()}
          </p>
          <Button type="button" class="button secondary" onClick={() => void vm.loadGenres()}>
            Tentar gêneros novamente
          </Button>
        </Show>
      </div>
    </section>
  );
}
