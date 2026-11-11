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

export function catalogNavigationFromUrl(search: string): CatalogNavigationState {
  const parameters = new URLSearchParams(search);
  const tab = parameters.get("tab");
  return {
    tab: tab === "shows" || tab === "library" ? tab : "movies",
    category: categoryFromUrl(parameters.get("category")),
    genreId: positiveInteger(parameters.get("genre"), 0),
    query: parameters.get("q")?.trim() ?? "",
    page: positiveInteger(parameters.get("page"), 1),
  };
}

export function catalogUrl(state: CatalogNavigationState): string {
  const parameters = new URLSearchParams();
  if (state.tab !== "movies") parameters.set("tab", state.tab);
  const category = categoryToUrl(state.category);
  if (!state.query && category) parameters.set("category", category);
  if (!state.query && state.genreId > 0) parameters.set("genre", String(state.genreId));
  if (state.query) parameters.set("q", state.query);
  if (state.page > 1) parameters.set("page", String(state.page));
  const search = parameters.toString();
  return search ? `/?${search}` : "/";
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
