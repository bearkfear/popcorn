import { selectFieldStyles } from "../../shared/ui/select-field.styles";
import { buttonStyles } from "../../shared/ui/styles";
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

  const genreStyles = selectFieldStyles({ variant: "genre" });

  return (
    <section
      class="catalog-controls grid grid-cols-[auto_minmax(240px,_1fr)_auto] gap-4 items-end mt-6 p-4 border border-line rounded-panel bg-slate-2 max-[1120px]:grid-cols-[1fr_1fr] max-[560px]:grid-cols-[1fr]"
      aria-label="Explorar o TMDB"
    >
      <ToggleGroup.Root
        class="cluster flex flex-wrap items-center justify-between gap-3 media-tabs justify-start max-[560px]:flex-nowrap max-[560px]:overflow-x-auto"
        aria-label="Tipo de mídia"
        value={[String(vm.mediaType())]}
        onValueChange={({ value }) => value[0] && vm.changeMediaType(Number(value[0]) as MediaType)}
      >
        <ToggleGroup.Item
          class={buttonStyles({ variant: "secondary", size: "tab" })}
          value={String(MediaType.MOVIE)}
        >
          Filmes
        </ToggleGroup.Item>
        <ToggleGroup.Item
          class={buttonStyles({ variant: "secondary", size: "tab" })}
          value={String(MediaType.TV)}
        >
          Séries
        </ToggleGroup.Item>
      </ToggleGroup.Root>

      <form
        class="search-form [&_>_label]:block [&_>_label]:mb-[6px] [&_>_label]:text-muted [&_>_label]:text-[12px] [&_>_label]:font-bold min-w-0 max-[1120px]:col-span-full max-[1120px]:[grid-row:1] max-[560px]:[grid-column:1]"
        onSubmit={handleSearch}
      >
        <label for="catalog-search">
          Buscar {vm.mediaType() === MediaType.MOVIE ? "filmes" : "séries"}
        </label>
        <div class="search-fields [&_input]:w-full [&_input]:min-h-[44px] [&_input]:p-[9px_12px] [&_input]:border [&_input]:border-line [&_input]:rounded-[5px_0_0_5px] [&_input]:bg-slate-2 [&_input]:text-ink [&_input]:min-w-0 flex [&_.button]:rounded-[0_5px_5px_0]">
          <input
            id="catalog-search"
            type="search"
            value={vm.searchInput()}
            onInput={(e) => vm.setSearchInput(e.currentTarget.value)}
            placeholder={vm.mediaType() === MediaType.MOVIE ? "Nome do filme" : "Nome da série"}
          />
          <button class={buttonStyles()} type="submit">
            Buscar
          </button>
        </div>
      </form>

      <ToggleGroup.Root
        class="cluster flex flex-wrap items-center justify-between gap-3 category-tabs justify-start max-[560px]:flex-nowrap max-[560px]:overflow-x-auto"
        aria-label="Categoria do catálogo"
        value={vm.query() ? [] : [String(vm.category())]}
        onValueChange={({ value }) =>
          value[0] && vm.changeCategory(Number(value[0]) as CatalogCategory)
        }
      >
        <ToggleGroup.Item
          class={buttonStyles({ variant: "secondary", size: "tab" })}
          value={String(CatalogCategory.POPULAR)}
        >
          Populares
        </ToggleGroup.Item>
        <ToggleGroup.Item
          class={buttonStyles({ variant: "secondary", size: "tab" })}
          value={String(CatalogCategory.UPCOMING)}
        >
          {vm.mediaType() === MediaType.MOVIE ? "Próximos lançamentos" : "Em exibição"}
        </ToggleGroup.Item>
        <ToggleGroup.Item
          class={buttonStyles({ variant: "secondary", size: "tab" })}
          value={String(CatalogCategory.TOP_RATED)}
        >
          Mais bem avaliados
        </ToggleGroup.Item>
      </ToggleGroup.Root>

      <div class="genre-filter [&_>_label]:block [&_>_label]:mb-[6px] [&_>_label]:text-muted [&_>_label]:text-[12px] [&_>_label]:font-bold col-span-full grid grid-cols-[auto_minmax(180px,_280px)_1fr] items-center gap-3 pt-3 border-t border-line max-[1120px]:grid-cols-[auto_minmax(180px,_1fr)] max-[1120px]:[&_.cache-label]:col-span-full max-[1120px]:[&_.error-text]:col-span-full max-[1120px]:[&_.button]:col-span-full max-[560px]:[grid-column:1] max-[560px]:grid-cols-[1fr]">
        <Select.Root
          class={genreStyles.root()}
          collection={collection()}
          value={[String(vm.genreId())]}
          disabled={vm.genresBusy()}
          positioning={{ placement: "bottom-start" }}
          onValueChange={({ value }) =>
            vm.changeCategory(CatalogCategory.POPULAR, Number(value[0] ?? 0))
          }
        >
          <Select.Label class={genreStyles.label()}>
            Gênero <span class="muted text-muted">· em Populares</span>
          </Select.Label>
          <Select.Trigger class={genreStyles.trigger()}>
            <Select.ValueText class={genreStyles.valueText()} placeholder="Todos os gêneros" />
            <Select.Indicator class={genreStyles.indicator()} aria-hidden="true">
              <Icon name="caret-down" class={genreStyles.caretIcon()} />
            </Select.Indicator>
          </Select.Trigger>
          <Portal>
            <Select.Positioner>
              <Select.Content class={genreStyles.content()}>
                <For each={collection().items}>
                  {(item) => (
                    <Select.Item class={genreStyles.item()} item={item}>
                      <Select.ItemText class={genreStyles.itemText()}>{item.name}</Select.ItemText>
                      <Select.ItemIndicator class={genreStyles.itemIndicator()} aria-hidden="true">
                        <Icon name="check" class={genreStyles.checkIcon()} />
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
          <span class="cache-label text-amber-11 text-[12px] font-[650]">
            Gêneros: cache / offline
          </span>
        </Show>
        <Show when={vm.genresError()}>
          <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
            {vm.genresError()}
          </p>
          <button
            type="button"
            class={buttonStyles({ variant: "secondary" })}
            onClick={() => void vm.loadGenres()}
          >
            Tentar gêneros novamente
          </button>
        </Show>
      </div>
    </section>
  );
}
