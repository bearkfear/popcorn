import { selectFieldStyles } from "../../shared/ui/select-field.styles";
import { buttonStyles } from "../../shared/ui/styles";
// UI component for catalog filtering, search input, and genre selection.

import { createListCollection, Select } from "@ark-ui/solid/select";
import { ToggleGroup } from "@ark-ui/solid/toggle-group";
import { CatalogCategory, MediaType } from "@popcorn/sdk";
import { createMemo, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "../../shared/ui/icon";
import { createSelectScrollDismiss } from "../../shared/ui/select-scroll";
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
  let genreContent: HTMLDivElement | undefined;
  const genreMenu = createSelectScrollDismiss(() => genreContent);

  return (
    <section
      class="catalog-controls flex flex-wrap items-center gap-3"
      aria-label="Buscar e filtrar títulos"
    >
      <form
        class="search-form flex h-10 min-w-0 basis-full items-stretch overflow-hidden rounded-lg border border-tomato-8 bg-slate-3 transition-colors hover:border-accent focus-within:border-accent min-[1120px]:basis-[320px] min-[1120px]:flex-1"
        onSubmit={handleSearch}
      >
        <label class="sr-only" for="catalog-search">
          Buscar {vm.mediaType() === MediaType.MOVIE ? "filmes" : "séries"}
        </label>
        <div class="search-fields flex min-w-0 flex-1 items-center gap-3 px-3">
          <Icon name="search" class="size-[18px] text-muted" />
          <input
            id="catalog-search"
            type="search"
            class="h-full min-w-0 flex-1 bg-transparent text-sm text-ink focus-visible:outline-none"
            value={vm.searchInput()}
            onInput={(e) => vm.setSearchInput(e.currentTarget.value)}
            placeholder={
              vm.mediaType() === MediaType.MOVIE ? "Buscar um filme..." : "Buscar uma série..."
            }
          />
        </div>
        <button
          class="shrink-0 border-l border-transparent bg-accent px-4 text-[13px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:-outline-offset-2"
          type="submit"
        >
          Buscar
        </button>
      </form>

      <ToggleGroup.Root
        class="category-tabs flex min-w-0 items-center gap-2 overflow-x-auto max-[560px]:basis-full"
        aria-label="Categoria do catálogo"
        value={vm.query() ? [] : [String(vm.category())]}
        onValueChange={({ value }) =>
          value[0] && vm.changeCategory(Number(value[0]) as CatalogCategory)
        }
      >
        <ToggleGroup.Item
          class="min-h-10 shrink-0 rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:text-ink data-[state=on]:bg-slate-4 data-[state=on]:text-ink"
          value={String(CatalogCategory.POPULAR)}
        >
          Populares
        </ToggleGroup.Item>
        <ToggleGroup.Item
          class="min-h-10 shrink-0 rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:text-ink data-[state=on]:bg-slate-4 data-[state=on]:text-ink"
          value={String(CatalogCategory.UPCOMING)}
        >
          {vm.mediaType() === MediaType.MOVIE ? "Em breve" : "Em exibição"}
        </ToggleGroup.Item>
        <ToggleGroup.Item
          class="min-h-10 shrink-0 rounded-md px-3 text-[13px] font-medium text-muted transition-colors hover:text-ink data-[state=on]:bg-slate-4 data-[state=on]:text-ink"
          value={String(CatalogCategory.TOP_RATED)}
        >
          Mais bem avaliados
        </ToggleGroup.Item>
      </ToggleGroup.Root>

      <div class="genre-filter ml-auto flex flex-wrap items-center justify-end gap-3 max-[560px]:ml-0 max-[560px]:w-full">
        <Select.Root
          class={genreStyles.root()}
          collection={collection()}
          open={genreMenu.open()}
          onOpenChange={({ open }) => genreMenu.setOpen(open)}
          value={[String(vm.genreId())]}
          disabled={vm.genresBusy()}
          positioning={{ placement: "bottom-start" }}
          onValueChange={({ value }) => vm.changeCategory(vm.category(), Number(value[0] ?? 0))}
        >
          <Select.Label class={genreStyles.label()}>Filtrar por gênero</Select.Label>
          <Select.Trigger class={genreStyles.trigger()}>
            <Select.ValueText class={genreStyles.valueText()} placeholder="Todos os gêneros" />
            <Select.Indicator class={genreStyles.indicator()} aria-hidden="true">
              <Icon name="caret-down" class={genreStyles.caretIcon()} />
            </Select.Indicator>
          </Select.Trigger>
          <Portal>
            <Select.Positioner>
              <Select.Content ref={genreContent} class={genreStyles.content()}>
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
