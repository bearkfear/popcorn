import { resourceValue } from "../../shared/resource-value";
// ViewModel orchestrating catalog browsing, search filters, genres and pagination.

import { CatalogCategory, MediaType, type Title } from "@popcorn/sdk";
import { createResource, createSignal } from "solid-js";
import { catalogErrorText } from "../../catalog-ui";
import type { CatalogNavigationState } from "../../navigation";
import type { CatalogClient } from "../../shared/types";

export type CatalogFilterState = Omit<CatalogNavigationState, "tab"> & {
  readonly mediaType: MediaType;
};

type CatalogPage = {
  readonly titles: readonly Title[];
  readonly page: number;
  readonly totalPages: number;
  readonly stale: boolean;
};

type CatalogRequest = {
  readonly client: CatalogClient;
  readonly mediaType: MediaType;
  readonly category: CatalogCategory;
  readonly genreId: number;
  readonly query: string;
  readonly page: number;
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
  initial: CatalogFilterState = {
    mediaType: MediaType.MOVIE,
    category: CatalogCategory.POPULAR,
    genreId: 0,
    query: "",
    page: 1,
  },
  onNavigationChange?: (state: CatalogFilterState) => void,
) {
  const [mediaType, setMediaType] = createSignal(
    initial.mediaType === MediaType.TV ? MediaType.TV : MediaType.MOVIE,
  );
  const [category, setCategory] = createSignal(initial.category);
  const [genreId, setGenreId] = createSignal(initial.genreId);
  const [searchInput, setSearchInput] = createSignal(initial.query);
  const [query, setQuery] = createSignal(initial.query);
  const [desiredPage, setDesiredPage] = createSignal(initial.page);
  const [catalogRequest, setCatalogRequest] = createSignal<CatalogRequest>();
  const [genreRequest, setGenreRequest] = createSignal<GenreRequest>();
  const [catalog, catalogActions] = createResource(catalogRequest, async (request) => {
    const options = { timeoutMs: 10_000 };

    try {
      const response = request.query
        ? await request.client.searchTitles(
            { mediaType: request.mediaType, query: request.query, page: request.page },
            options,
          )
        : await request.client.browseTitles(
            {
              mediaType: request.mediaType,
              category: request.category,
              page: request.page,
              genreId: request.genreId,
            },
            options,
          );
      return {
        titles: response.titles,
        page: response.page || request.page,
        totalPages: response.totalPages,
        stale: response.stale,
      } satisfies CatalogPage;
    } catch (error) {
      onRequireSetup(error);
      throw new Error(catalogErrorText(error, true));
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

  const catalogValue = resourceValue(catalog);
  const genreResponseValue = resourceValue(genreResponse);
  const titles = () => catalogValue()?.titles ?? [];
  const genres = () => genreResponseValue()?.genres ?? [];
  const catalogBusy = () => catalog.loading;
  const genresBusy = () => genreResponse.loading;
  const catalogLoaded = () => catalog.state === "ready" || catalog.state === "refreshing";
  const catalogError = () => errorMessage(catalog.error);
  const genresError = () => errorMessage(genreResponse.error);
  const catalogStale = () => catalogValue()?.stale ?? false;
  const genresStale = () => genreResponseValue()?.stale ?? false;
  const page = () => catalogValue()?.page ?? 0;
  const totalPages = () => catalogValue()?.totalPages ?? 0;
  const requestedPage = () => catalogRequest()?.page ?? desiredPage();
  const navigationState = (page = desiredPage()): CatalogFilterState => ({
    mediaType: mediaType(),
    category: category(),
    genreId: genreId(),
    query: query(),
    page,
  });

  function notifyNavigation(page = 1) {
    onNavigationChange?.(navigationState(page));
  }

  function resetCatalog(resetDetail = true) {
    setCatalogRequest(undefined);
    catalogActions.mutate(undefined);
    if (resetDetail) onResetDetail();
  }

  function requestPage(nextPage: number) {
    setDesiredPage(nextPage);
    const client = getClient();
    if (!client) return;
    setCatalogRequest({
      client,
      mediaType: mediaType(),
      category: category(),
      genreId: genreId(),
      query: query(),
      page: nextPage,
    });
  }

  function loadCatalog(page = 1, resetDetail = true) {
    resetCatalog(resetDetail);
    requestPage(page);
  }

  function changePage(nextPage: number) {
    if (
      catalogBusy() ||
      !Number.isInteger(nextPage) ||
      nextPage < 1 ||
      nextPage > totalPages() ||
      nextPage === page()
    )
      return;
    onResetDetail();
    requestPage(nextPage);
    notifyNavigation(nextPage);
  }

  function retryCatalog() {
    if (!catalogBusy()) requestPage(requestedPage());
  }

  function loadGenres() {
    const client = getClient();
    if (!client) return;
    genreActions.mutate(undefined);
    setGenreRequest({ client, mediaType: mediaType() });
  }

  function changeMediaType(next: MediaType) {
    setMediaType(next);
    setGenreId(0);
    setQuery("");
    setSearchInput("");
    loadCatalog();
    loadGenres();
    notifyNavigation();
  }

  function changeCategory(next: CatalogCategory, genre = genreId()) {
    setCategory(next);
    setGenreId(genre);
    setQuery("");
    setSearchInput("");
    loadCatalog();
    notifyNavigation();
  }

  function performSearch(text: string) {
    setQuery(text);
    setSearchInput(text);
    setGenreId(0);
    loadCatalog();
    notifyNavigation();
  }

  function applyNavigation(next: CatalogFilterState) {
    const mediaChanged = next.mediaType !== mediaType();
    const changed =
      mediaChanged ||
      next.category !== category() ||
      next.genreId !== genreId() ||
      next.query !== query() ||
      next.page !== desiredPage();
    if (!changed) return;
    setMediaType(next.mediaType);
    setCategory(next.category);
    setGenreId(next.genreId);
    setQuery(next.query);
    setSearchInput(next.query);
    setDesiredPage(next.page);
    loadCatalog(next.page);
    if (mediaChanged) loadGenres();
  }

  return {
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
    catalogBusy,
    catalogLoaded,
    catalogError,
    catalogStale,
    genresBusy,
    genresError,
    genresStale,
    requestedPage,
    navigationState,
    loadGenres,
    loadCatalog,
    changePage,
    retryCatalog,
    resetCatalog,
    changeMediaType,
    changeCategory,
    performSearch,
    applyNavigation,
  };
}

export type CatalogViewModel = ReturnType<typeof createCatalogViewModel>;
