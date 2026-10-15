// ViewModel managing title details, seasons, and episode selections.
import { createSignal } from "solid-js";
import { MediaType, type ContentRef, type Episode, type Season, type Title } from "@popcorn/sdk";
import type { CatalogClient } from "../../shared/types";
import { catalogErrorText } from "../../catalog-ui";

function createSeriesDetail(getClient: () => CatalogClient | undefined, getSelected: () => Title | undefined) {
  const [seasons, setSeasons] = createSignal<readonly Season[]>([]);
  const [seasonsBusy, setSeasonsBusy] = createSignal(false);
  const [seasonsError, setSeasonsError] = createSignal("");
  const [seasonsStale, setSeasonsStale] = createSignal(false);
  const [seasonNumber, setSeasonNumber] = createSignal<number>();
  const [episodes, setEpisodes] = createSignal<readonly Episode[]>([]);
  const [episodesBusy, setEpisodesBusy] = createSignal(false);
  const [episodesError, setEpisodesError] = createSignal("");
  const [episodesStale, setEpisodesStale] = createSignal(false);
  let epCtrl: AbortController | undefined;
  let epGen = 0;

  function resetSeries() {
    epCtrl?.abort();
    setSeasons([]); setSeasonsBusy(false); setSeasonsError(""); setSeasonsStale(false);
    setSeasonNumber(undefined); setEpisodes([]); setEpisodesBusy(false); setEpisodesError("");
  }

  async function loadEpisodes(num: number) {
    const client = getClient();
    const seriesId = getSelected()?.content?.tmdbId;
    if (!client || !seriesId) return;
    epCtrl?.abort();
    const ctrl = new AbortController(); epCtrl = ctrl; const gen = ++epGen;
    setSeasonNumber(num); setEpisodes([]); setEpisodesBusy(true); setEpisodesError("");
    try {
      const res = await client.listEpisodes({ seriesId, seasonNumber: num }, { signal: ctrl.signal, timeoutMs: 10_000 });
      if (gen !== epGen) return;
      setEpisodes(res.episodes); setEpisodesStale(res.stale);
    } catch (err) {
      if (gen !== epGen) return;
      setEpisodesError(catalogErrorText(err, true));
    } finally {
      if (gen === epGen) setEpisodesBusy(false);
    }
  }

  async function loadSeasons(seriesId: number, ctrl: AbortController, gen: number, getDetailGen: () => number) {
    const client = getClient();
    if (!client) return;
    setSeasonsBusy(true); setSeasonsError("");
    try {
      const res = await client.listSeasons({ seriesId }, { signal: ctrl.signal, timeoutMs: 10_000 });
      if (gen !== getDetailGen()) return;
      setSeasons(res.seasons); setSeasonsStale(res.stale);
      const first = res.seasons[0];
      if (first) void loadEpisodes(first.seasonNumber);
    } catch (err) {
      if (gen !== getDetailGen()) return;
      setSeasonsError(catalogErrorText(err, true));
    } finally {
      if (gen === getDetailGen()) setSeasonsBusy(false);
    }
  }

  return {
    seasons, seasonsBusy, seasonsError, seasonsStale,
    seasonNumber, episodes, episodesBusy, episodesError, episodesStale,
    resetSeries, loadEpisodes, loadSeasons,
  };
}

export function createDetailsViewModel(getClient: () => CatalogClient | undefined) {
  const [selected, setSelected] = createSignal<Title>();
  const [detail, setDetail] = createSignal<Title>();
  const [detailBusy, setDetailBusy] = createSignal(false);
  const [detailError, setDetailError] = createSignal("");
  const [detailStale, setDetailStale] = createSignal(false);
  let detailCtrl: AbortController | undefined;
  let detailGen = 0;
  const series = createSeriesDetail(getClient, selected);

  function resetDetail() {
    detailGen++; detailCtrl?.abort();
    setSelected(undefined); setDetail(undefined); setDetailBusy(false);
    setDetailError(""); setDetailStale(false);
    series.resetSeries();
  }

  async function openTitle(title: Title, online: boolean, onContentSelect?: (c: ContentRef) => void) {
    const client = getClient();
    if (!client || !title.content) return;
    resetDetail();
    const ctrl = new AbortController(); detailCtrl = ctrl; const gen = ++detailGen;
    setSelected(title); setDetailBusy(true);
    if (onContentSelect && title.content) onContentSelect(title.content);
    try {
      const res = await client.getTitle({ content: title.content, useTmdb: online }, { signal: ctrl.signal, timeoutMs: 10_000 });
      if (gen !== detailGen) return;
      if (res.title) {
        setDetail(res.title); setDetailStale(res.stale);
        if (online && title.content.mediaType === MediaType.TV) {
          void series.loadSeasons(title.content.tmdbId, ctrl, gen, () => detailGen);
        }
      } else {
        setDetailError("O serviço não retornou os detalhes deste título.");
      }
    } catch (err) {
      if (gen !== detailGen) return;
      setDetailError(catalogErrorText(err, online));
    } finally {
      if (gen === detailGen) setDetailBusy(false);
    }
  }

  return {
    selected, detail, detailBusy, detailError, detailStale,
    ...series, resetDetail, openTitle,
  };
}

export type DetailsViewModel = ReturnType<typeof createDetailsViewModel>;
