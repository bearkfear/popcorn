// ViewModel orchestrating catalog browsing, search filters, genres and pagination.

import { CatalogCategory, MediaType, type Title } from "@popcorn/sdk";
import { createResource, createSignal } from "solid-js";
import { catalogErrorText } from "../../catalog-ui";
import type { CatalogClient, CatalogOrigin } from "../../shared/types";

type CatalogPage = {
  readonly titles: readonly Title[];
  readonly page: number;
  readonly totalPages: number;
  readonly nextLocalPage: string;
  readonly stale: boolean;
};

type CatalogRequest = {
  readonly client: CatalogClient;
  readonly source: CatalogOrigin;
  readonly mediaType: MediaType;
  readonly category: CatalogCategory;
  readonly genreId: number;
  readonly query: string;
  readonly more: boolean;
  readonly current: CatalogPage | undefined;
};

type GenreRequest = {
  readonly client: CatalogClient;
  readonly mediaType: MediaType;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function createCatalogViewModel(
  getClient: () => CatalogClient | undefined,
  onResetDetail: () => void,
  onRequireSetup: (err: unknown) => void,
) {
  const [source, setSource] = createSignal<CatalogOrigin>("online");
  const [mediaType, setMediaType] = createSignal(MediaType.MOVIE);
  const [category, setCategory] = createSignal(CatalogCategory.POPULAR);
  const [genreId, setGenreId] = createSignal(0);
  const [searchInput, setSearchInput] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [catalogRequest, setCatalogRequest] = createSignal<CatalogRequest>();
  const [genreRequest, setGenreRequest] = createSignal<GenreRequest>();
  const [catalog, catalogActions] = createResource(catalogRequest, async (request) => {
    const options = { timeoutMs: 10_000 };

    try {
      if (request.source === "online") {
        const nextPage = request.more ? (request.current?.page ?? 0) + 1 : 1;
        const response = request.query
          ? await request.client.searchTitles(
              { mediaType: request.mediaType, query: request.query, page: nextPage },
              options,
            )
          : await request.client.browseTitles(
              {
                mediaType: request.mediaType,
                category: request.category,
                page: nextPage,
                genreId: request.genreId,
              },
              options,
            );
        return {
          titles: request.more
            ? [...(request.current?.titles ?? []), ...response.titles]
            : response.titles,
          page: response.page || nextPage,
          totalPages: response.totalPages,
          nextLocalPage: "",
          stale: Boolean(request.more && request.current?.stale) || response.stale,
        } satisfies CatalogPage;
      }

      const response = await request.client.listTitles(
        {
          pageSize: 20,
          pageToken: request.more ? (request.current?.nextLocalPage ?? "") : "",
        },
        options,
      );
      return {
        titles: request.more
          ? [...(request.current?.titles ?? []), ...response.titles]
          : response.titles,
        page: 0,
        totalPages: 0,
        nextLocalPage: response.nextPageToken,
        stale: false,
      } satisfies CatalogPage;
    } catch (error) {
      if (request.source === "online") onRequireSetup(error);
      throw new Error(catalogErrorText(error, request.source === "online"));
    }
  });

  const [genreResponse, genreActions] = createResource(genreRequest, async (request) => {
    try {
      return await request.client.listGenres(
        { mediaType: request.mediaType },
        { timeoutMs: 10_000 },
      );
    } catch (error) {
      onRequireSetup(error);
      throw new Error(catalogErrorText(error, true));
    }
  });

  const titles = () => catalog.latest?.titles ?? [];
  const genres = () => genreResponse.latest?.genres ?? [];
  const catalogBusy = () => catalog.loading;
  const genresBusy = () => genreResponse.loading;
  const catalogLoaded = () => catalog.state === "ready" || catalog.state === "refreshing";
  const catalogError = () => errorMessage(catalog.error);
  const genresError = () => errorMessage(genreResponse.error);
  const catalogStale = () => catalog.latest?.stale ?? false;
  const genresStale = () => genreResponse.latest?.stale ?? false;
  const page = () => catalog.latest?.page ?? 0;
  const totalPages = () => catalog.latest?.totalPages ?? 0;
  const nextLocalPage = () => catalog.latest?.nextLocalPage ?? "";
  const hasMore = () =>
    source() === "local" ? Boolean(nextLocalPage()) : page() < Math.min(totalPages(), 500);

  function resetCatalog() {
    setCatalogRequest(undefined);
    catalogActions.mutate(undefined);
    onResetDetail();
  }

  function loadCatalog(more = false) {
    const client = getClient();
    if (!client || (more && (catalogBusy() || !hasMore()))) return;
    if (!more) resetCatalog();
    setCatalogRequest({
      client,
      source: source(),
      mediaType: mediaType(),
      category: category(),
      genreId: genreId(),
      query: query(),
      more,
      current: catalog.latest,
    });
  }

  function loadGenres() {
    const client = getClient();
    if (!client || source() !== "online") return;
    genreActions.mutate(undefined);
    setGenreRequest({ client, mediaType: mediaType() });
  }

  function changeSource(next: CatalogOrigin) {
    resetCatalog();
    genreActions.mutate(undefined);
    setSource(next);
    loadCatalog();
    if (next === "online") loadGenres();
  }

  function changeMediaType(next: MediaType) {
    setMediaType(next);
    setGenreId(0);
    setQuery("");
    setSearchInput("");
    loadCatalog();
    loadGenres();
  }

  function changeCategory(next: CatalogCategory, genre = 0) {
    setCategory(next);
    setGenreId(genre);
    setQuery("");
    setSearchInput("");
    loadCatalog();
  }

  function performSearch(text: string) {
    setQuery(text);
    setSearchInput(text);
    setGenreId(0);
    loadCatalog();
  }

  return {
    source,
    setSource,
    mediaType,
    category,
    genreId,
    searchInput,
    setSearchInput,
    query,
    titles,
    genres,
    page,
    totalPages,
    nextLocalPage,
    catalogBusy,
    catalogLoaded,
    catalogError,
    catalogStale,
    genresBusy,
    genresError,
    genresStale,
    hasMore,
    loadGenres,
    loadCatalog,
    resetCatalog,
    changeSource,
    changeMediaType,
    changeCategory,
    performSearch,
  };
}

export type CatalogViewModel = ReturnType<typeof createCatalogViewModel>;
