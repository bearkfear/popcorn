// UI component for catalog filtering, search input, and genre selection.

import { createListCollection, Select } from "@ark-ui/solid/select";
import { ToggleGroup } from "@ark-ui/solid/toggle-group";
import { CatalogCategory, MediaType } from "@popcorn/sdk";
import { createMemo, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
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
  const collection = createMemo(() =>
    createListCollection({
      items: genreOptions(),
      itemToValue: (genre) => genre.id,
      itemToString: (genre) => genre.name,
    }),
  );

  const handleSearch = (event: Event) => {
    event.preventDefault();
    vm.performSearch(vm.searchInput().trim());
  };

  return (
    <section class="catalog-controls" aria-label="Explorar o TMDB">
      <ToggleGroup.Root
        class="cluster media-tabs"
        aria-label="Tipo de mídia"
        value={[String(vm.mediaType())]}
        onValueChange={({ value }) => value[0] && vm.changeMediaType(Number(value[0]) as MediaType)}
      >
        <ToggleGroup.Item class="button secondary" value={String(MediaType.MOVIE)}>
          Filmes
        </ToggleGroup.Item>
        <ToggleGroup.Item class="button secondary" value={String(MediaType.TV)}>
          Séries
        </ToggleGroup.Item>
      </ToggleGroup.Root>

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

      <ToggleGroup.Root
        class="cluster category-tabs"
        aria-label="Categoria do catálogo"
        value={vm.query() ? [] : [String(vm.category())]}
        onValueChange={({ value }) =>
          value[0] && vm.changeCategory(Number(value[0]) as CatalogCategory)
        }
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
      </ToggleGroup.Root>

      <div class="genre-filter">
        <Select.Root
          class="genre-select"
          collection={collection()}
          value={[String(vm.genreId())]}
          disabled={vm.genresBusy()}
          positioning={{ placement: "bottom-start" }}
          onValueChange={({ value }) =>
            vm.changeCategory(CatalogCategory.POPULAR, Number(value[0] ?? 0))
          }
        >
          <Select.Label class="genre-select-label">
            Gênero <span class="muted">· em Populares</span>
          </Select.Label>
          <Select.Trigger class="genre-select-trigger">
            <Select.ValueText placeholder="Todos os gêneros" />
            <Select.Indicator aria-hidden="true">
              <Icon name="caret-down" />
            </Select.Indicator>
          </Select.Trigger>
          <Portal>
            <Select.Positioner>
              <Select.Content class="genre-select-content genre-select-listbox">
                <For each={collection().items}>
                  {(item) => (
                    <Select.Item class="genre-select-item" item={item}>
                      <Select.ItemText>{item.name}</Select.ItemText>
                      <Select.ItemIndicator aria-hidden="true">
                        <Icon name="check" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  )}
                </For>
              </Select.Content>
            </Select.Positioner>
          </Portal>
          <Select.HiddenSelect />
        </Select.Root>
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
