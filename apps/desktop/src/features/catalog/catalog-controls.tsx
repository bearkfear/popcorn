import { Button } from "@egcs/newui/actions";
import { Callout } from "@egcs/newui/feedback";
import { Field, Input } from "@egcs/newui/forms";
import { CatalogCategory, MediaType } from "@popcorn/sdk";
import { createFormControl } from "solid-forms";
import { createEffect, For, on, Show } from "solid-js";
import { AppSelect } from "../../shared/ui/app-select";
import { Icon } from "../../shared/ui/icon";
import type { CatalogViewModel } from "./catalog.viewmodel";

export function CatalogControls(props: { vm: CatalogViewModel }) {
  const { vm } = props;
  const search = createFormControl(vm.query());

  createEffect(on(vm.query, (query) => search.setValue(query)));

  return (
    <section class="catalog-controls" aria-label="Buscar e filtrar títulos">
      <div class="catalog-search-row">
        <form
          class="search-form flex min-w-0 flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            search.markSubmitted(true);
            vm.performSearch(search.value.trim());
          }}
        >
          <Field.Root class="min-w-0 flex-1">
            <Field.Label>Encontre sua próxima história</Field.Label>
            <Input
              name="catalog-search"
              type="search"
              value={search.value}
              onInput={(event) => search.setValue(event.currentTarget.value)}
              placeholder={vm.mediaType() === MediaType.MOVIE ? "Buscar filmes" : "Buscar séries"}
            />
          </Field.Root>
          <Button type="submit" startIcon={<Icon name="search" />}>
            Buscar
          </Button>
        </form>
        <AppSelect
          class="catalog-genre"
          label="Gênero"
          value={String(vm.genreId())}
          options={[
            { value: "0", label: vm.genresBusy() ? "Carregando gêneros…" : "Todos os gêneros" },
            ...vm.genres().map((genre) => ({ value: String(genre.id), label: genre.name })),
          ]}
          disabled={vm.genresBusy()}
          onChange={(value) => vm.changeCategory(vm.category(), Number(value))}
        />
      </div>
      <fieldset
        class="mt-3 flex min-w-0 flex-wrap gap-1 border-t border-line pt-3"
        aria-label="Categoria do catálogo"
      >
        <For
          each={[
            { value: CatalogCategory.POPULAR, label: "Populares" },
            {
              value: CatalogCategory.UPCOMING,
              label: vm.mediaType() === MediaType.MOVIE ? "Em breve" : "Em exibição",
            },
            { value: CatalogCategory.TOP_RATED, label: "Mais bem avaliados" },
          ]}
        >
          {(item) => (
            <Button
              size="sm"
              variant={!vm.query() && vm.category() === item.value ? "soft" : "ghost"}
              tone={!vm.query() && vm.category() === item.value ? "primary" : "neutral"}
              aria-pressed={!vm.query() && vm.category() === item.value}
              onClick={() => vm.changeCategory(item.value)}
            >
              {item.label}
            </Button>
          )}
        </For>
      </fieldset>
      <Show when={vm.genresStale()}>
        <p role="status" class="mt-2 text-xs text-amber-11">
          Gêneros salvos · modo offline
        </p>
      </Show>
      <Show when={vm.genresError()}>
        <Callout.Root tone="danger" class="mt-3" role="alert">
          <Callout.Content>
            <Callout.Description>{vm.genresError()}</Callout.Description>
            <Callout.Actions>
              <Button
                variant="outline"
                tone="neutral"
                size="sm"
                onClick={() => void vm.loadGenres()}
              >
                Tentar novamente
              </Button>
            </Callout.Actions>
          </Callout.Content>
        </Callout.Root>
      </Show>
    </section>
  );
}
