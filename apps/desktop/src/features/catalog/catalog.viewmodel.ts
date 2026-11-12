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
  getNavigation: () => CatalogFilterState,
  onNavigationChange?: (state: CatalogFilterState) => void,
) {
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
  const mediaType = () => getNavigation().mediaType;
  const category = () => getNavigation().category;
  const genreId = () => getNavigation().genreId;
  const query = () => getNavigation().query;
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
  const requestedPage = () => catalogRequest()?.page ?? getNavigation().page;
  const navigationState = () => getNavigation();

  function resetCatalog(resetDetail = true) {
    setCatalogRequest(undefined);
    catalogActions.mutate(undefined);
    if (resetDetail) onResetDetail();
  }

  function requestPage(nextPage: number, navigation = getNavigation()) {
    const client = getClient();
    if (!client) return;
    setCatalogRequest({
      client,
      mediaType: navigation.mediaType,
      category: navigation.category,
      genreId: navigation.genreId,
      query: navigation.query,
      page: nextPage,
    });
  }

  function loadCatalog(navigation = getNavigation(), resetDetail = true) {
    resetCatalog(resetDetail);
    requestPage(navigation.page, navigation);
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
    onNavigationChange?.({ ...getNavigation(), page: nextPage });
  }

  function retryCatalog() {
    if (!catalogBusy()) requestPage(requestedPage());
  }

  function loadGenres(nextMediaType = mediaType()) {
    const client = getClient();
    if (!client) return;
    genreActions.mutate(undefined);
    setGenreRequest({ client, mediaType: nextMediaType });
  }

  function changeMediaType(next: MediaType) {
    onNavigationChange?.({
      mediaType: next,
      category: CatalogCategory.POPULAR,
      genreId: 0,
      query: "",
      page: 1,
    });
  }

  function changeCategory(next: CatalogCategory, genre = genreId()) {
    onNavigationChange?.({
      ...getNavigation(),
      category: next,
      genreId: genre,
      query: "",
      page: 1,
    });
  }

  function performSearch(text: string) {
    onNavigationChange?.({
      ...getNavigation(),
      genreId: 0,
      query: text,
      page: 1,
    });
  }

  function applyNavigation(next: CatalogFilterState) {
    const current = catalogRequest();
    const mediaChanged = next.mediaType !== (genreRequest()?.mediaType ?? current?.mediaType);
    const changed =
      !current ||
      next.mediaType !== current.mediaType ||
      next.category !== current.category ||
      next.genreId !== current.genreId ||
      next.query !== current.query ||
      next.page !== current.page;
    if (!changed) return;
    loadCatalog(next);
    if (mediaChanged) loadGenres(next.mediaType);
  }

  return {
    mediaType,
    category,
    genreId,
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
