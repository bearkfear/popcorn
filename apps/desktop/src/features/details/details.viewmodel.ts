// ViewModel managing title details, seasons, and episode selections.

import { type ContentRef, type Episode, MediaType, type Season, type Title } from "@popcorn/sdk";
import { createEffect, createResource, createSignal } from "solid-js";
import { catalogErrorText } from "../../catalog-ui";
import type { CatalogClient } from "../../shared/types";

type DetailResult = {
  readonly title: Title;
  readonly stale: boolean;
  readonly online: boolean;
};

type DetailRequest = {
  readonly client: CatalogClient;
  readonly title: Title;
  readonly online: boolean;
};

type SeriesRequest = {
  readonly client: CatalogClient;
  readonly seriesId: number;
};

type ResourceResult<T> = {
  readonly items: readonly T[];
  readonly stale: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function createDetailsViewModel(getClient: () => CatalogClient | undefined) {
  const [selected, setSelected] = createSignal<Title>();
  const [seasonNumber, setSeasonNumber] = createSignal<number>();
  const [detailRequest, setDetailRequest] = createSignal<DetailRequest>();
  const [seasonRequest, setSeasonRequest] = createSignal<SeriesRequest>();
  const [episodeRequest, setEpisodeRequest] = createSignal<SeriesRequest & { season: number }>();
  const [detailResponse, detailActions] = createResource(detailRequest, async (request) => {
    try {
      const response = await request.client.getTitle(
        { content: request.title.content, useTmdb: request.online },
        { timeoutMs: 10_000 },
      );
      if (!response.title) throw new Error("O serviço não retornou os detalhes deste título.");
      return {
        title: response.title,
        stale: response.stale,
        online: request.online,
      } satisfies DetailResult;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("O serviço não retornou")) throw error;
      throw new Error(catalogErrorText(error, request.online));
    }
  });

  const [seasonResponse, seasonActions] = createResource(seasonRequest, async (request) => {
    try {
      const response = await request.client.listSeasons(
        { seriesId: request.seriesId },
        { timeoutMs: 10_000 },
      );
      return { items: response.seasons, stale: response.stale } satisfies ResourceResult<Season>;
    } catch (error) {
      throw new Error(catalogErrorText(error, true));
    }
  });

  const [episodeResponse, episodeActions] = createResource(episodeRequest, async (request) => {
    try {
      const response = await request.client.listEpisodes(
        { seriesId: request.seriesId, seasonNumber: request.season },
        { timeoutMs: 10_000 },
      );
      return { items: response.episodes, stale: response.stale } satisfies ResourceResult<Episode>;
    } catch (error) {
      throw new Error(catalogErrorText(error, true));
    }
  });

  const detail = () => detailResponse.latest?.title;
  const detailBusy = () => detailResponse.loading;
  const detailError = () => errorMessage(detailResponse.error);
  const detailStale = () => detailResponse.latest?.stale ?? false;
  const seasons = () => seasonResponse.latest?.items ?? [];
  const seasonsBusy = () => seasonResponse.loading;
  const seasonsError = () => errorMessage(seasonResponse.error);
  const seasonsStale = () => seasonResponse.latest?.stale ?? false;
  const episodes = () => episodeResponse.latest?.items ?? [];
  const episodesBusy = () => episodeResponse.loading;
  const episodesError = () => errorMessage(episodeResponse.error);
  const episodesStale = () => episodeResponse.latest?.stale ?? false;

  function resetSeries() {
    setSeasonRequest(undefined);
    setEpisodeRequest(undefined);
    setSeasonNumber(undefined);
    seasonActions.mutate(undefined);
    episodeActions.mutate(undefined);
  }

  function resetDetail() {
    setDetailRequest(undefined);
    detailActions.mutate(undefined);
    setSelected(undefined);
    resetSeries();
  }

  function loadEpisodes(number: number) {
    const client = getClient();
    const seriesId = selected()?.content?.tmdbId;
    if (!client || !seriesId) return;
    episodeActions.mutate(undefined);
    setSeasonNumber(number);
    setEpisodeRequest({ client, seriesId, season: number });
  }

  function openTitle(
    title: Title,
    online: boolean,
    onContentSelect?: (content: ContentRef) => void,
  ) {
    const client = getClient();
    if (!client || !title.content) return;
    resetDetail();
    setSelected(title);
    onContentSelect?.(title.content);
    setDetailRequest({ client, title, online });
  }

  createEffect(() => {
    const result = detailResponse.latest;
    const client = getClient();
    const seriesId = result?.title.content?.tmdbId;
    if (client && result?.online && result.title.content?.mediaType === MediaType.TV && seriesId) {
      setSeasonRequest({ client, seriesId });
    }
  });

  createEffect(() => {
    const first = seasonResponse.latest?.items[0];
    if (first) loadEpisodes(first.seasonNumber);
  });

  return {
    selected,
    detail,
    detailBusy,
    detailError,
    detailStale,
    seasons,
    seasonsBusy,
    seasonsError,
    seasonsStale,
    seasonNumber,
    episodes,
    episodesBusy,
    episodesError,
    episodesStale,
    resetDetail,
    openTitle,
    loadEpisodes,
  };
}

export type DetailsViewModel = ReturnType<typeof createDetailsViewModel>;
