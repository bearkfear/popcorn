// ViewModel orchestrating catalog browsing, search filters, genres and pagination.
import { createSignal } from "solid-js";
import { CatalogCategory, MediaType, type Genre, type Title } from "@popcorn/sdk";
import type { CatalogClient, CatalogOrigin } from "../../shared/types";
import { catalogErrorText } from "../../catalog-ui";

function createCatalogFilters() {
  const [source, setSource] = createSignal<CatalogOrigin>("online");
  const [mediaType, setMediaType] = createSignal(MediaType.MOVIE);
  const [category, setCategory] = createSignal(CatalogCategory.POPULAR);
  const [genreId, setGenreId] = createSignal(0);
  const [genres, setGenres] = createSignal<readonly Genre[]>([]);
  const [genresBusy, setGenresBusy] = createSignal(false);
  const [genresError, setGenresError] = createSignal("");
  const [genresStale, setGenresStale] = createSignal(false);
  const [searchInput, setSearchInput] = createSignal("");
  const [query, setQuery] = createSignal("");

  return {
    source, setSource, mediaType, setMediaType,
    category, setCategory, genreId, setGenreId,
    genres, setGenres, genresBusy, setGenresBusy,
    genresError, setGenresError, genresStale, setGenresStale,
    searchInput, setSearchInput, query, setQuery,
  };
}

function createCatalogPagination(source: () => CatalogOrigin) {
  const [titles, setTitles] = createSignal<readonly Title[]>([]);
  const [page, setPage] = createSignal(0);
  const [totalPages, setTotalPages] = createSignal(0);
  const [nextLocalPage, setNextLocalPage] = createSignal("");
  const [catalogBusy, setCatalogBusy] = createSignal(false);
  const [catalogLoaded, setCatalogLoaded] = createSignal(false);
  const [catalogError, setCatalogError] = createSignal("");
  const [catalogStale, setCatalogStale] = createSignal(false);

  const hasMore = () => source() === "local" ? Boolean(nextLocalPage()) : page() < Math.min(totalPages(), 500);

  return {
    titles, setTitles, page, setPage, totalPages, setTotalPages,
    nextLocalPage, setNextLocalPage, catalogBusy, setCatalogBusy,
    catalogLoaded, setCatalogLoaded, catalogError, setCatalogError,
    catalogStale, setCatalogStale, hasMore,
  };
}

type Filters = ReturnType<typeof createCatalogFilters>;
type Pagination = ReturnType<typeof createCatalogPagination>;
interface CatalogDeps {
  getClient: () => CatalogClient | undefined;
  onResetDetail: () => void;
  onRequireSetup: (err: unknown) => void;
}

function createCatalogActions(f: Filters, p: Pagination, deps: CatalogDeps) {
  let catGen = 0; let genreGen = 0;
  let catCtrl: AbortController | undefined; let genreCtrl: AbortController | undefined;

  async function loadGenres() {
    const client = deps.getClient();
    if (!client || f.source() !== "online") return;
    genreCtrl?.abort();
    const ctrl = new AbortController(); genreCtrl = ctrl; const gen = ++genreGen;
    f.setGenresBusy(true); f.setGenres([]); f.setGenresError(""); f.setGenresStale(false);
    try {
      const res = await client.listGenres({ mediaType: f.mediaType() }, { signal: ctrl.signal, timeoutMs: 10_000 });
      if (gen !== genreGen) return;
      f.setGenres(res.genres); f.setGenresStale(res.stale);
    } catch (err) {
      if (gen !== genreGen) return;
      f.setGenresError(catalogErrorText(err, true)); deps.onRequireSetup(err);
    } finally {
      if (gen === genreGen) f.setGenresBusy(false);
    }
  }

  function resetCatalog() {
    deps.onResetDetail();
    p.setTitles([]); p.setPage(0); p.setTotalPages(0); p.setNextLocalPage("");
    p.setCatalogLoaded(false); p.setCatalogStale(false);
  }

  async function loadCatalog(more = false) {
    const client = deps.getClient();
    if (!client || (more && (p.catalogBusy() || !p.hasMore()))) return;
    catCtrl?.abort();
    const ctrl = new AbortController(); catCtrl = ctrl; const gen = ++catGen;
    const online = f.source() === "online"; const reqPage = more ? p.page() + 1 : 1;
    p.setCatalogBusy(true); p.setCatalogError("");
    if (!more) resetCatalog();
    try {
      const opts = { signal: ctrl.signal, timeoutMs: 10_000 };
      if (online) {
        const res = f.query()
          ? await client.searchTitles({ mediaType: f.mediaType(), query: f.query(), page: reqPage }, opts)
          : await client.browseTitles({ mediaType: f.mediaType(), category: f.category(), page: reqPage, genreId: f.genreId() }, opts);
        if (gen !== catGen) return;
        p.setTitles((prev) => more ? [...prev, ...res.titles] : res.titles);
        p.setPage(res.page || reqPage); p.setTotalPages(res.totalPages);
        p.setCatalogStale((prev) => (more && prev) || res.stale);
      } else {
        const res = await client.listTitles({ pageSize: 20, pageToken: more ? p.nextLocalPage() : "" }, opts);
        if (gen !== catGen) return;
        p.setTitles((prev) => more ? [...prev, ...res.titles] : res.titles);
        p.setNextLocalPage(res.nextPageToken);
      }
      p.setCatalogLoaded(true);
    } catch (err) {
      if (gen !== catGen) return;
      p.setCatalogError(catalogErrorText(err, online));
      if (online) deps.onRequireSetup(err);
    } finally {
      if (gen === catGen) p.setCatalogBusy(false);
    }
  }

  return { catCtrl: () => catCtrl, genreCtrl: () => genreCtrl, resetCatalog, loadGenres, loadCatalog };
}

export function createCatalogViewModel(
  getClient: () => CatalogClient | undefined,
  onResetDetail: () => void,
  onRequireSetup: (err: unknown) => void
) {
  const f = createCatalogFilters();
  const p = createCatalogPagination(f.source);
  const a = createCatalogActions(f, p, { getClient, onResetDetail, onRequireSetup });

  function changeSource(next: CatalogOrigin) {
    a.catCtrl()?.abort(); a.genreCtrl()?.abort();
    p.setCatalogBusy(false); f.setGenresBusy(false);
    a.resetCatalog(); f.setSource(next); p.setCatalogError("");
    void a.loadCatalog();
    if (next === "online") void a.loadGenres();
  }

  function changeMediaType(next: MediaType) {
    f.setMediaType(next); f.setGenreId(0); f.setQuery(""); f.setSearchInput("");
    void a.loadCatalog(); void a.loadGenres();
  }

  function changeCategory(next: CatalogCategory, genre = 0) {
    f.setCategory(next); f.setGenreId(genre); f.setQuery(""); f.setSearchInput("");
    void a.loadCatalog();
  }

  function performSearch(text: string) {
    f.setQuery(text); f.setSearchInput(text); f.setGenreId(0);
    void a.loadCatalog();
  }

  return {
    ...f, ...p, loadGenres: a.loadGenres, loadCatalog: a.loadCatalog,
    changeSource, changeMediaType, changeCategory, performSearch,
  };
}

export type CatalogViewModel = ReturnType<typeof createCatalogViewModel>;
