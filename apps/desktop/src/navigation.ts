import { CatalogCategory, type ContentRef, MediaType } from "@popcorn/sdk";

export type AppPage = "search" | "details" | "settings" | "player";
export type CatalogTab = "movies" | "shows" | "library";

export type CatalogNavigationState = {
  readonly tab: CatalogTab;
  readonly category: CatalogCategory;
  readonly genreId: number;
  readonly query: string;
  readonly page: number;
};

export type CatalogQueryState = {
  readonly [key: string]: string | string[] | undefined;
  readonly category?: string | string[] | undefined;
  readonly genre?: string | string[] | undefined;
  readonly q?: string | string[] | undefined;
  readonly page?: string | string[] | undefined;
};

export const defaultCatalogNavigation: CatalogNavigationState = {
  tab: "movies",
  category: CatalogCategory.POPULAR,
  genreId: 0,
  query: "",
  page: 1,
};

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function categoryFromUrl(value: string | null): CatalogCategory {
  if (value === "upcoming") return CatalogCategory.UPCOMING;
  if (value === "top-rated") return CatalogCategory.TOP_RATED;
  return CatalogCategory.POPULAR;
}

function categoryToUrl(value: CatalogCategory): string | undefined {
  if (value === CatalogCategory.UPCOMING) return "upcoming";
  if (value === CatalogCategory.TOP_RATED) return "top-rated";
  return undefined;
}

function queryValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function catalogTabFromPath(pathname: string): CatalogTab {
  if (pathname === "/shows") return "shows";
  if (pathname === "/library") return "library";
  return "movies";
}

export function catalogNavigationFromQuery(
  query: CatalogQueryState,
  tab: CatalogTab = "movies",
): CatalogNavigationState {
  return {
    tab,
    category: categoryFromUrl(queryValue(query.category) ?? null),
    genreId: positiveInteger(queryValue(query.genre) ?? null, 0),
    query: queryValue(query.q)?.trim() ?? "",
    page: positiveInteger(queryValue(query.page) ?? null, 1),
  };
}

export function catalogNavigationFromUrl(
  search: string,
  tab: CatalogTab = "movies",
): CatalogNavigationState {
  const parameters = new URLSearchParams(search);
  return catalogNavigationFromQuery(
    {
      category: parameters.get("category") ?? undefined,
      genre: parameters.get("genre") ?? undefined,
      q: parameters.get("q") ?? undefined,
      page: parameters.get("page") ?? undefined,
    },
    tab,
  );
}

export function catalogQueryFromNavigation(state: CatalogNavigationState) {
  return {
    category: !state.query ? categoryToUrl(state.category) : undefined,
    genre: !state.query && state.genreId > 0 ? String(state.genreId) : undefined,
    q: state.query || undefined,
    page: state.page > 1 ? String(state.page) : undefined,
  };
}

export function catalogUrl(state: CatalogNavigationState): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(catalogQueryFromNavigation(state))) {
    if (value) parameters.set(key, value);
  }
  const search = parameters.toString();
  const pathname = `/${state.tab}`;
  return search ? `${pathname}?${search}` : pathname;
}

export function pageFromPath(pathname: string): AppPage {
  if (pathname === "/settings") return "settings";
  if (pathname === "/player") return "player";
  if (pathname.startsWith("/title/")) return "details";
  return "search";
}

function mediaSlug(mediaType: MediaType): "movie" | "tv" | undefined {
  if (mediaType === MediaType.MOVIE) return "movie";
  if (mediaType === MediaType.TV) return "tv";
  return undefined;
}

export function titleUrl(content: ContentRef): string {
  const media = mediaSlug(content.mediaType);
  if (!media || content.tmdbId <= 0) return "/";
  const parameters = new URLSearchParams();
  if (content.seasonNumber !== undefined) parameters.set("season", String(content.seasonNumber));
  if (content.episodeNumber !== undefined) parameters.set("episode", String(content.episodeNumber));
  const search = parameters.toString();
  return `/title/${media}/${content.tmdbId}${search ? `?${search}` : ""}`;
}

export function contentFromTitleUrl(pathname: string, search: string): ContentRef | undefined {
  const match = /^\/title\/(movie|tv)\/(\d+)$/.exec(pathname);
  if (!match) return undefined;
  const tmdbId = positiveInteger(match[2] ?? null, 0);
  if (!tmdbId) return undefined;
  const parameters = new URLSearchParams(search);
  const seasonNumber = positiveInteger(parameters.get("season"), 0) || undefined;
  const episodeNumber = positiveInteger(parameters.get("episode"), 0) || undefined;
  return {
    $typeName: "popcorn.v1.ContentRef",
    mediaType: match[1] === "tv" ? MediaType.TV : MediaType.MOVIE,
    tmdbId,
    ...(seasonNumber !== undefined ? { seasonNumber } : {}),
    ...(episodeNumber !== undefined ? { episodeNumber } : {}),
  };
}

export function sameContent(left: ContentRef | undefined, right: ContentRef | undefined): boolean {
  return (
    left?.mediaType === right?.mediaType &&
    left?.tmdbId === right?.tmdbId &&
    left?.seasonNumber === right?.seasonNumber &&
    left?.episodeNumber === right?.episodeNumber
  );
}
