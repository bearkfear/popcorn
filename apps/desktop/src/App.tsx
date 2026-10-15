import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CatalogCategory,
  createCatalogClient,
  createPlaybackClient,
  createSourceClient,
  createStorageClient,
  MediaType,
  PlaybackQuality,
  PlaybackState,
  type ContentRef,
  type CacheSettings,
  type Episode,
  type Genre,
  type Playback,
  type Season,
  type Source as MediaSource,
  type Title,
  type TmdbStatus,
} from "@popcorn/sdk";
import { artworkUrl, catalogErrorText, needsConfiguration } from "./catalog-ui";
import { MediaPlayer, PlayerOverlay } from "./media-player";
import tmdbLogo from "./assets/tmdb.svg";

type Bootstrap = {
  readonly address: string;
  readonly token: string;
  readonly protocolVersion: string;
  readonly instanceId: string;
  readonly catalogVersion: string;
};
type CatalogClient = ReturnType<typeof createCatalogClient>;
type PlaybackClient = ReturnType<typeof createPlaybackClient>;
type SourceClient = ReturnType<typeof createSourceClient>;
type StorageClient = ReturnType<typeof createStorageClient>;
type Connection = "connecting" | "ready" | "error" | "browser";
type CatalogOrigin = "online" | "local";
const playbackQualities = [
  { value: PlaybackQuality.AUTO, label: "Auto (até 1080p)" },
  { value: PlaybackQuality.FULL_HD, label: "1080p" },
  { value: PlaybackQuality.HD, label: "720p" },
] as const;

function Artwork(props: { readonly url: string; readonly title: string; readonly wide?: boolean }) {
  const [failed, setFailed] = createSignal("");
  const safeUrl = () => artworkUrl(props.url);
  return <div class={`artwork ${props.wide ? "artwork-wide" : ""}`}>
    <Show when={safeUrl() && failed() !== props.url} fallback={<span class="artwork-empty">Sem imagem</span>}>
      <img src={safeUrl()} alt={props.title} loading="lazy" onError={() => setFailed(props.url)} />
    </Show>
  </div>;
}

export function App() {
  const [connection, setConnection] = createSignal<Connection>("connecting");
  const [connectionError, setConnectionError] = createSignal("");
  const [catalogVersion, setCatalogVersion] = createSignal("");
  const [source, setSource] = createSignal<CatalogOrigin>("online");
  const [status, setStatus] = createSignal<TmdbStatus>();
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [configurationBusy, setConfigurationBusy] = createSignal(false);
  const [configurationError, setConfigurationError] = createSignal("");
  const [remember, setRemember] = createSignal(true);
  const [mediaType, setMediaType] = createSignal(MediaType.MOVIE);
  const [category, setCategory] = createSignal(CatalogCategory.POPULAR);
  const [genreId, setGenreId] = createSignal(0);
  const [genres, setGenres] = createSignal<readonly Genre[]>([]);
  const [genresStale, setGenresStale] = createSignal(false);
  const [genresError, setGenresError] = createSignal("");
  const [genresBusy, setGenresBusy] = createSignal(false);
  const [searchInput, setSearchInput] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [titles, setTitles] = createSignal<readonly Title[]>([]);
  const [page, setPage] = createSignal(0);
  const [totalPages, setTotalPages] = createSignal(0);
  const [nextLocalPage, setNextLocalPage] = createSignal("");
  const [catalogBusy, setCatalogBusy] = createSignal(false);
  const [catalogLoaded, setCatalogLoaded] = createSignal(false);
  const [catalogError, setCatalogError] = createSignal("");
  const [catalogStale, setCatalogStale] = createSignal(false);
  const [selected, setSelected] = createSignal<Title>();
  const [detail, setDetail] = createSignal<Title>();
  const [detailBusy, setDetailBusy] = createSignal(false);
  const [detailError, setDetailError] = createSignal("");
  const [detailStale, setDetailStale] = createSignal(false);
  const [seasons, setSeasons] = createSignal<readonly Season[]>([]);
  const [seasonsBusy, setSeasonsBusy] = createSignal(false);
  const [seasonsError, setSeasonsError] = createSignal("");
  const [seasonsStale, setSeasonsStale] = createSignal(false);
  const [seasonNumber, setSeasonNumber] = createSignal<number>();
  const [episodes, setEpisodes] = createSignal<readonly Episode[]>([]);
  const [episodesBusy, setEpisodesBusy] = createSignal(false);
  const [episodesError, setEpisodesError] = createSignal("");
  const [episodesStale, setEpisodesStale] = createSignal(false);
  const [sourceContent, setSourceContent] = createSignal<ContentRef>();
  const [mediaSources, setMediaSources] = createSignal<readonly MediaSource[]>([]);
  const [sourcesBusy, setSourcesBusy] = createSignal(false);
  const [sourcesError, setSourcesError] = createSignal("");
  const [magnet, setMagnet] = createSignal("");
  const [playback, setPlayback] = createSignal<Playback>();
  const [playbackBusy, setPlaybackBusy] = createSignal(false);
  const [playbackError, setPlaybackError] = createSignal("");
  const [mediaError, setMediaError] = createSignal("");
  const [playbackMonitorError, setPlaybackMonitorError] = createSignal("");
  const [playbackQuality, setPlaybackQuality] = createSignal(PlaybackQuality.AUTO);
  const [cacheOpen, setCacheOpen] = createSignal(false);
  const [cacheSettings, setCacheSettings] = createSignal<CacheSettings>();
  const [cacheLimitGb, setCacheLimitGb] = createSignal("20");
  const [cacheBusy, setCacheBusy] = createSignal(false);
  const [cacheError, setCacheError] = createSignal("");
  let tokenInput: HTMLInputElement | undefined;
  let detailHeading: HTMLHeadingElement | undefined;
  let client: CatalogClient | undefined;
  let sourceClient: SourceClient | undefined;
  let playbackClient: PlaybackClient | undefined;
  let storageClient: StorageClient | undefined;
  let unlistenShutdown: UnlistenFn | undefined;
  let disposed = false;
  let bootstrapGeneration = 0;
  let catalogGeneration = 0;
  let genreGeneration = 0;
  let detailGeneration = 0;
  let episodeGeneration = 0;
  let catalogController: AbortController | undefined;
  let genreController: AbortController | undefined;
  let detailController: AbortController | undefined;
  let episodeController: AbortController | undefined;
  let playbackPoll: number | undefined;
  let playbackGeneration = 0;
  let playbackController: AbortController | undefined;
  let lastPlaybackFile: { readonly sourceId: string; readonly fileIndex: number } | undefined;
  const setupVisible = () => source() === "online" && (settingsOpen() || status()?.configured === false);
  const hasMore = () => source() === "local" ? Boolean(nextLocalPage()) : page() < Math.min(totalPages(), 500);
  const connectionLabel = () => ({ connecting: "Conectando", ready: "Conectado", error: "Serviço indisponível", browser: "Modo navegador" })[connection()];
  const catalogHeading = () => source() === "local" ? "Catálogo instalado" : query() ? `Resultados para “${query()}”` : category() === CatalogCategory.POPULAR ? "Populares" : category() === CatalogCategory.TOP_RATED ? "Mais bem avaliados" : mediaType() === MediaType.MOVIE ? "Próximos lançamentos" : "Em exibição";
  const playbackProgress = () => {
    const current = playback();
    if (!current || current.totalBytes <= 0n) return 0;
    return Math.min(100, Number(current.downloadedBytes * 10_000n / current.totalBytes) / 100);
  };
  const mediaReady = () => {
    const current = playback();
    return Boolean(current?.mediaUrl && (current.state === PlaybackState.READY || current.state === PlaybackState.PAUSED));
  };
  const preparationError = () => playback()?.state === PlaybackState.FAILED
    ? playback()?.error || "Não foi possível preparar este vídeo. Tente novamente."
    : "";
  const playerError = () => preparationError() || mediaError() || playbackError();
  const conversionLabel = () => {
    switch (playback()?.conversion) {
      case "direct": return "Reprodução direta";
      case "remux": return "Conversão de contêiner · vídeo e áudio originais";
      case "audio": return "Conversão de áudio · vídeo original";
      case "transcode": return "Conversão de vídeo";
      default: return "Analisando o formato do vídeo";
    }
  };

  function bytesLabel(bytes: bigint) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "Tamanho não informado";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** unit).toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
  }

  function rateLabel(bytesPerSecond: bigint) {
    return `${bytesLabel(bytesPerSecond)}/s`;
  }

  function sourceErrorText() {
    return "Não foi possível acessar esta fonte. Verifique o magnet e tente novamente.";
  }

  function clearSourcePanel() {
    setSourceContent(undefined);
    setMediaSources([]);
    setSourcesBusy(false);
    setSourcesError("");
    setMagnet("");
  }

  function clearPlayback(stop = true) {
    const current = playback();
    playbackGeneration++;
    playbackController?.abort();
    playbackController = undefined;
    if (playbackPoll !== undefined) window.clearInterval(playbackPoll);
    playbackPoll = undefined;
    setPlayback(undefined);
    setPlaybackError("");
    setMediaError("");
    setPlaybackMonitorError("");
    setPlaybackBusy(false);
    if (stop && current && playbackClient) {
      void playbackClient.stopPlayback({ playbackId: current.playbackId }).catch(() => undefined);
    }
  }

  function monitorPlayback(playbackId: string) {
    if (playbackPoll !== undefined) window.clearInterval(playbackPoll);
    playbackPoll = window.setInterval(() => {
      const activeClient = playbackClient;
      if (!activeClient || playback()?.playbackId !== playbackId) return;
      void activeClient.getPlayback({ playbackId }, { timeoutMs: 5_000 })
        .then((response) => {
          if (!disposed && response.playback && playback()?.playbackId === playbackId) {
            setPlayback(response.playback);
            setPlaybackMonitorError("");
          }
        })
        .catch(() => {
          if (!disposed && playback()?.playbackId === playbackId) {
            setPlaybackMonitorError("Não foi possível atualizar o estado da reprodução. Tentando reconectar ao serviço.");
          }
        });
    }, 1_000);
  }

  function resetDetail() {
    detailGeneration++;
    episodeGeneration++;
    detailController?.abort();
    episodeController?.abort();
    setSelected(undefined);
    setDetail(undefined);
    setDetailError("");
    setDetailBusy(false);
    setSeasons([]);
    setSeasonsBusy(false);
    setSeasonsError("");
    setSeasonNumber(undefined);
    setEpisodes([]);
    setEpisodesError("");
    setEpisodesBusy(false);
    clearSourcePanel();
    clearPlayback();
  }

  function cancelCatalog() {
    catalogGeneration++;
    genreGeneration++;
    catalogController?.abort();
    genreController?.abort();
    setCatalogBusy(false);
    setGenresBusy(false);
  }

  function requireSetup(error: unknown) {
    if (needsConfiguration(error)) {
      setSettingsOpen(true);
      setConfigurationError(catalogErrorText(error, true));
    }
  }

  async function listenForShutdownErrors() { // no-excuse-ok: catch
    try {
      const unlisten = await listen<string>("backend-shutdown-error", (event) => {
        if (disposed) return;
        setConnection("error");
        setConnectionError(event.payload || "Não foi possível encerrar o serviço local.");
      });
      if (disposed) unlisten();
      else unlistenShutdown = unlisten;
    } catch {
      if (!disposed) {
        setConnection("error");
        setConnectionError("Não foi possível acompanhar o encerramento do serviço local.");
      }
    }
  }

  async function connect() { // no-excuse-ok: catch
    if (connection() === "connecting" && client || configurationBusy()) return;
    if (!isTauri()) { setConnection("browser"); return; }
    const generation = ++bootstrapGeneration;
    cancelCatalog();
    resetDetail();
    setConnection("connecting");
    setConnectionError("");
    setCatalogError("");
    setCatalogLoaded(false);
    setTitles([]);
    setStatus(undefined);
    client = undefined;
    sourceClient = undefined;
    playbackClient = undefined;
    storageClient = undefined;
    try {
      const bootstrap = await invoke<Bootstrap>("bootstrap");
      if (disposed || generation !== bootstrapGeneration) return;
      const baseUrl = `http://${bootstrap.address}`;
      client = createCatalogClient(baseUrl, bootstrap.token);
      sourceClient = createSourceClient(baseUrl, bootstrap.token);
      playbackClient = createPlaybackClient(baseUrl, bootstrap.token);
      storageClient = createStorageClient(baseUrl, bootstrap.token);
      setCatalogVersion(bootstrap.catalogVersion);
      const response = await client.getTmdbStatus({}, { timeoutMs: 10_000 });
      if (disposed || generation !== bootstrapGeneration) return;
      if (!response.status) {
        setConnectionError("O serviço não retornou o estado da configuração TMDB.");
        setConnection("error");
        return;
      }
      setStatus(response.status);
      setConnection(connectionError() ? "error" : "ready");
      if (source() === "local" || response.status.configured) {
        void loadCatalog();
        if (source() === "online") void loadGenres();
      }
    } catch {
      if (disposed || generation !== bootstrapGeneration) return;
      setConnection("error");
      setConnectionError((current) => current || "Não foi possível iniciar o serviço local. Tente conectar novamente.");
    }
  }

  async function loadGenres() { // no-excuse-ok: catch
    const activeClient = client;
    if (!activeClient || source() !== "online" || setupVisible()) return;
    genreController?.abort();
    const controller = new AbortController();
    genreController = controller;
    const generation = ++genreGeneration;
    setGenresBusy(true);
    setGenres([]);
    setGenresError("");
    setGenresStale(false);
    try {
      const response = await activeClient.listGenres({ mediaType: mediaType() }, { signal: controller.signal, timeoutMs: 10_000 });
      if (disposed || generation !== genreGeneration) return;
      setGenres(response.genres);
      setGenresStale(response.stale);
    } catch (error) {
      if (disposed || generation !== genreGeneration) return;
      setGenresError(catalogErrorText(error, true));
      requireSetup(error);
    } finally {
      if (generation === genreGeneration) setGenresBusy(false);
    }
  }

  async function loadCatalog(more = false) { // no-excuse-ok: catch
    const activeClient = client;
    if (!activeClient || (source() === "online" && (setupVisible() || !status()?.configured))) return;
    if (more && (catalogBusy() || !hasMore())) return;
    catalogController?.abort();
    const controller = new AbortController();
    catalogController = controller;
    const generation = ++catalogGeneration;
    const online = source() === "online";
    const requestedPage = more ? page() + 1 : 1;
    const localPageToken = more ? nextLocalPage() : "";
    setCatalogBusy(true);
    setCatalogError("");
    if (!more) {
      resetDetail();
      setTitles([]);
      setPage(0);
      setTotalPages(0);
      setNextLocalPage("");
      setCatalogLoaded(false);
      setCatalogStale(false);
    }
    try {
      const options = { signal: controller.signal, timeoutMs: 10_000 };
      if (online) {
        const response = query()
          ? await activeClient.searchTitles({ mediaType: mediaType(), query: query(), page: requestedPage }, options)
          : await activeClient.browseTitles({ mediaType: mediaType(), category: category(), page: requestedPage, genreId: genreId() }, options);
        if (disposed || generation !== catalogGeneration) return;
        setTitles((previous) => more ? [...previous, ...response.titles.filter((title) => !previous.some((existing) => existing.content?.tmdbId === title.content?.tmdbId && existing.content?.mediaType === title.content?.mediaType))] : response.titles);
        setPage(response.page || requestedPage);
        setTotalPages(response.totalPages);
        setCatalogStale((previous) => (more && previous) || response.stale);
      } else {
        const response = await activeClient.listTitles({ pageSize: 20, pageToken: localPageToken }, options);
        if (disposed || generation !== catalogGeneration) return;
        setTitles((previous) => more ? [...previous, ...response.titles] : response.titles);
        setNextLocalPage(response.nextPageToken);
      }
      setCatalogLoaded(true);
    } catch (error) {
      if (disposed || generation !== catalogGeneration) return;
      setCatalogError(catalogErrorText(error, online));
      if (online) requireSetup(error);
    } finally {
      if (generation === catalogGeneration) setCatalogBusy(false);
    }
  }

  function changeSource(next: CatalogOrigin) {
    if (configurationBusy()) return;
    cancelCatalog();
    resetDetail();
    setSource(next);
    setCatalogError("");
    setTitles([]);
    setCatalogLoaded(false);
    if (tokenInput) tokenInput.value = "";
    if (next === "local" || (status()?.configured && !settingsOpen())) void loadCatalog();
    if (next === "online") void loadGenres();
  }

  function changeMedia(next: MediaType) {
    setMediaType(next);
    setGenreId(0);
    setQuery("");
    setSearchInput("");
    void loadCatalog();
    void loadGenres();
  }

  function browse(next: CatalogCategory, genre = 0) {
    setCategory(next);
    setGenreId(genre);
    setQuery("");
    setSearchInput("");
    void loadCatalog();
  }

  async function configure(event: SubmitEvent) { // no-excuse-ok: catch
    event.preventDefault();
    const activeClient = client;
    if (!activeClient || configurationBusy() || !tokenInput) return;
    let readAccessToken = tokenInput.value.trim();
    tokenInput.value = "";
    if (!readAccessToken) { setConfigurationError("Cole seu API Read Access Token do TMDB."); return; }
    setConfigurationBusy(true);
    setConfigurationError("");
    cancelCatalog();
    resetDetail();
    try {
      const request = activeClient.configureTmdb({ readAccessToken, remember: remember() }, { timeoutMs: 15_000 });
      readAccessToken = "";
      const response = await request;
      if (disposed) return;
      if (!response.status?.configured) { setConfigurationError("O serviço não confirmou a configuração TMDB. Tente novamente."); return; }
      setStatus(response.status);
      setSettingsOpen(false);
      setSource("online");
      setMediaType(MediaType.MOVIE);
      setCategory(CatalogCategory.POPULAR);
      setGenreId(0);
      setQuery("");
      setSearchInput("");
      void loadCatalog();
      void loadGenres();
    } catch (error) {
      if (!disposed) setConfigurationError(catalogErrorText(error, true));
    } finally {
      readAccessToken = "";
      if (tokenInput) tokenInput.value = "";
      if (!disposed) setConfigurationBusy(false);
    }
  }

  async function clearConfiguration() { // no-excuse-ok: catch
    const activeClient = client;
    if (!activeClient || configurationBusy()) return;
    setConfigurationBusy(true);
    setConfigurationError("");
    cancelCatalog();
    resetDetail();
    if (tokenInput) tokenInput.value = "";
    try {
      const response = await activeClient.clearTmdbConfiguration({}, { timeoutMs: 10_000 });
      if (disposed) return;
      if (!response.status) { setConfigurationError("O serviço não confirmou a remoção da configuração."); return; }
      setStatus(response.status);
      setSettingsOpen(true);
      setSource("online");
      setTitles([]);
      setCatalogLoaded(false);
      if (response.status.configured) setConfigurationError("A credencial do ambiente continua ativa. Para removê-la, altere TMDB_READ_ACCESS_TOKEN fora do aplicativo.");
    } catch (error) {
      if (!disposed) setConfigurationError(catalogErrorText(error, true));
    } finally {
      if (!disposed) setConfigurationBusy(false);
    }
  }

  async function openSettings() { // no-excuse-ok: catch
    try { await invoke("open_tmdb_settings"); }
    catch { setConfigurationError("Não foi possível abrir o navegador. Abra o endereço das configurações TMDB indicado abaixo."); }
  }

  async function loadCacheSettings() { // no-excuse-ok: catch
    const activeClient = storageClient;
    if (!activeClient || cacheBusy()) return;
    setCacheOpen(true);
    setCacheBusy(true);
    setCacheError("");
    try {
      const response = await activeClient.getCacheSettings({}, { timeoutMs: 10_000 });
      if (!response.settings) throw new Error("settings missing");
      if (!disposed) {
        setCacheSettings(response.settings);
        setCacheLimitGb((Number(response.settings.limitBytes) / 1024 ** 3).toFixed(1));
      }
    } catch {
      if (!disposed) setCacheError("Não foi possível consultar o armazenamento local.");
    } finally {
      if (!disposed) setCacheBusy(false);
    }
  }

  async function saveCacheLimit(event: SubmitEvent) { // no-excuse-ok: catch
    event.preventDefault();
    const activeClient = storageClient;
    const gigabytes = Number(cacheLimitGb());
    if (!activeClient || cacheBusy() || !Number.isFinite(gigabytes) || gigabytes < 0.5 || gigabytes > 1024) {
      setCacheError("Use um limite entre 0,5 GB e 1024 GB.");
      return;
    }
    setCacheBusy(true);
    setCacheError("");
    try {
      const response = await activeClient.setCacheLimit(
        { limitBytes: BigInt(Math.round(gigabytes * 1024 ** 3)) },
        { timeoutMs: 10_000 },
      );
      if (!response.settings) throw new Error("settings missing");
      if (!disposed) setCacheSettings(response.settings);
    } catch {
      if (!disposed) setCacheError("Não foi possível salvar o limite do cache.");
    } finally {
      if (!disposed) setCacheBusy(false);
    }
  }

  async function clearCache() { // no-excuse-ok: catch
    const activeClient = storageClient;
    if (!activeClient || cacheBusy() || playback()) return;
    if (!window.confirm("Remover os arquivos de mídia temporários? As fontes vinculadas serão preservadas.")) return;
    setCacheBusy(true);
    setCacheError("");
    try {
      const response = await activeClient.clearCache({}, { timeoutMs: 30_000 });
      if (!response.settings) throw new Error("settings missing");
      if (!disposed) setCacheSettings(response.settings);
    } catch {
      if (!disposed) setCacheError("Não foi possível limpar o cache. Encerre a reprodução e tente novamente.");
    } finally {
      if (!disposed) setCacheBusy(false);
    }
  }

  async function loadSeasons(seriesId: number, generation: number, controller: AbortController) { // no-excuse-ok: catch
    const activeClient = client;
    if (!activeClient) return;
    setSeasonsBusy(true);
    setSeasonsError("");
    try {
      const response = await activeClient.listSeasons({ seriesId }, { signal: controller.signal, timeoutMs: 10_000 });
      if (disposed || generation !== detailGeneration) return;
      setSeasons(response.seasons);
      setSeasonsStale(response.stale);
      const first = response.seasons[0];
      if (first) void loadEpisodes(first.seasonNumber);
    } catch (error) {
      if (disposed || generation !== detailGeneration) return;
      setSeasonsError(catalogErrorText(error, true));
    } finally {
      if (generation === detailGeneration) setSeasonsBusy(false);
    }
  }

  async function loadEpisodes(number: number) { // no-excuse-ok: catch
    const activeClient = client;
    const seriesId = selected()?.content?.tmdbId;
    if (!activeClient || !seriesId) return;
    episodeController?.abort();
    const controller = new AbortController();
    episodeController = controller;
    const generation = ++episodeGeneration;
    setSeasonNumber(number);
    setEpisodes([]);
    setEpisodesBusy(true);
    setEpisodesError("");
    setEpisodesStale(false);
    try {
      const response = await activeClient.listEpisodes({ seriesId, seasonNumber: number }, { signal: controller.signal, timeoutMs: 10_000 });
      if (disposed || generation !== episodeGeneration) return;
      setEpisodes(response.episodes);
      setEpisodesStale(response.stale);
    } catch (error) {
      if (disposed || generation !== episodeGeneration) return;
      setEpisodesError(catalogErrorText(error, true));
    } finally {
      if (generation === episodeGeneration) setEpisodesBusy(false);
    }
  }

  async function chooseSourceContent(content: ContentRef) { // no-excuse-ok: catch
    const activeClient = sourceClient;
    if (!activeClient) return;
    setSourceContent(content);
    setMediaSources([]);
    setSourcesBusy(true);
    setSourcesError("");
    try {
      const response = await activeClient.listSources({ content }, { timeoutMs: 10_000 });
      if (disposed || sourceContent() !== content) return;
      setMediaSources(response.sources);
    } catch {
      if (!disposed && sourceContent() === content) setSourcesError(sourceErrorText());
    } finally {
      if (sourceContent() === content) setSourcesBusy(false);
    }
  }

  async function addMagnet(event: SubmitEvent) { // no-excuse-ok: catch
    event.preventDefault();
    const activeClient = sourceClient;
    const content = sourceContent();
    const value = magnet().trim();
    if (!activeClient || !content || sourcesBusy() || !value) return;
    setSourcesBusy(true);
    setSourcesError("");
    try {
      const response = await activeClient.addSource(
        { content, input: { case: "magnet", value } },
        { timeoutMs: 60_000 },
      );
      if (disposed || sourceContent() !== content) return;
      if (!response.source) throw new Error("source missing");
      setMediaSources((current) => [
        ...current.filter((item) => item.sourceId !== response.source?.sourceId),
        response.source!,
      ]);
      setMagnet("");
    } catch {
      if (!disposed && sourceContent() === content) setSourcesError(sourceErrorText());
    } finally {
      if (sourceContent() === content) setSourcesBusy(false);
    }
  }

  async function importTorrent(event: Event) { // no-excuse-ok: catch
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const activeClient = sourceClient;
    const content = sourceContent();
    if (!file || !activeClient || !content || sourcesBusy()) return;
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setSourcesError("Escolha um arquivo .torrent válido de até 10 MB.");
      return;
    }
    setSourcesBusy(true);
    setSourcesError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const response = await activeClient.addSource(
        { content, input: { case: "torrentFile", value: bytes } },
        { timeoutMs: 60_000 },
      );
      if (disposed || sourceContent() !== content) return;
      if (!response.source) throw new Error("source missing");
      setMediaSources((current) => [
        ...current.filter((item) => item.sourceId !== response.source?.sourceId),
        response.source!,
      ]);
    } catch {
      if (!disposed && sourceContent() === content) setSourcesError("Não foi possível ler este arquivo .torrent.");
    } finally {
      if (sourceContent() === content) setSourcesBusy(false);
    }
  }

  async function removeMediaSource(sourceId: string) { // no-excuse-ok: catch
    const activeClient = sourceClient;
    if (!activeClient || sourcesBusy()) return;
    setSourcesBusy(true);
    setSourcesError("");
    try {
      await activeClient.removeSource({ sourceId }, { timeoutMs: 10_000 });
      if (!disposed) setMediaSources((current) => current.filter((item) => item.sourceId !== sourceId));
    } catch {
      if (!disposed) setSourcesError("Não foi possível remover esta fonte. Pare a reprodução e tente novamente.");
    } finally {
      if (!disposed) setSourcesBusy(false);
    }
  }

  async function playFile(sourceId: string, fileIndex: number) { // no-excuse-ok: catch
    const activeClient = playbackClient;
    if (!activeClient || playbackBusy()) return;
    clearPlayback();
    const generation = playbackGeneration;
    const controller = new AbortController();
    playbackController = controller;
    lastPlaybackFile = { sourceId, fileIndex };
    setPlaybackBusy(true);
    setPlaybackError("");
    try {
      const response = await activeClient.startPlayback(
        { sourceId, fileIndex, quality: playbackQuality(), idempotencyKey: crypto.randomUUID() },
        { signal: controller.signal, timeoutMs: 60_000 },
      );
      if (!response.playback) throw new Error("playback missing");
      if (!disposed && generation === playbackGeneration) {
        setPlayback(response.playback);
        monitorPlayback(response.playback.playbackId);
      }
    } catch {
      if (!disposed && generation === playbackGeneration) setPlaybackError("Não foi possível preparar o vídeo. A fonte pode estar indisponível.");
    } finally {
      if (!disposed && generation === playbackGeneration) setPlaybackBusy(false);
    }
  }

  async function toggleDownload() { // no-excuse-ok: catch
    const activeClient = playbackClient;
    const current = playback();
    if (!activeClient || !current || playbackBusy()) return;
    setPlaybackBusy(true);
    setPlaybackError("");
    try {
      const response = current.state === PlaybackState.PAUSED
        ? await activeClient.resumePlayback({ playbackId: current.playbackId }, { timeoutMs: 10_000 })
        : await activeClient.pausePlayback({ playbackId: current.playbackId }, { timeoutMs: 10_000 });
      if (!response.playback) throw new Error("playback missing");
      if (!disposed && playback()?.playbackId === current.playbackId) setPlayback(response.playback);
    } catch {
      if (!disposed && playback()?.playbackId === current.playbackId) setPlaybackError("Não foi possível alterar o estado do download.");
    } finally {
      if (!disposed && playback()?.playbackId === current.playbackId) setPlaybackBusy(false);
    }
  }

  async function openTitle(title: Title) { // no-excuse-ok: catch
    const activeClient = client;
    if (!activeClient || !title.content) return;
    resetDetail();
    const controller = new AbortController();
    detailController = controller;
    const generation = ++detailGeneration;
    const online = source() === "online";
    setSelected(title);
    void chooseSourceContent(title.content);
    setDetailBusy(true);
    if (window.matchMedia("(max-width: 999px)").matches) {
      detailHeading?.focus({ preventScroll: true });
      detailHeading?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
    try {
      const response = await activeClient.getTitle({ content: title.content, useTmdb: online }, { signal: controller.signal, timeoutMs: 10_000 });
      if (disposed || generation !== detailGeneration) return;
      if (response.title) {
        setDetail(response.title);
        setDetailStale(response.stale);
        if (online && title.content.mediaType === MediaType.TV) void loadSeasons(title.content.tmdbId, generation, controller);
      } else setDetailError("O serviço não retornou os detalhes deste título.");
    } catch (error) {
      if (disposed || generation !== detailGeneration) return;
      setDetailError(catalogErrorText(error, online));
    } finally {
      if (generation === detailGeneration) setDetailBusy(false);
    }
  }

  onMount(() => { if (isTauri()) void listenForShutdownErrors(); void connect(); });
  onCleanup(() => {
    disposed = true;
    bootstrapGeneration++;
    unlistenShutdown?.();
    cancelCatalog();
    resetDetail();
    if (tokenInput) tokenInput.value = "";
  });

  return <div class="app-shell">
    <header class="app-header cluster">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">P</span>
        <span class="wordmark">popcorn<span class="wordmark-dot">.</span></span>
      </div>
      <span class="header-tagline">FILMES E SÉRIES</span>
    </header>
    <main class="page">
      <section class="introduction" aria-labelledby="library-title">
        <p class="eyebrow">CATÁLOGO</p>
        <h1 id="library-title">O que você quer assistir?</h1>
        <p class="muted">Descubra filmes e séries em uma biblioteca feita para navegar sem esforço.</p>
      </section>
      <section class="connection-panel cluster" aria-label="Conexão com o serviço local">
        <div>
          <div class="cluster"><strong>Serviço local</strong><span class={`status status-${connection()}`} role="status">{connectionLabel()}</span></div>
          <p class="connection-caption muted">{connection() === "browser" ? "Abra o Popcorn no desktop para conectar seu catálogo." : source() === "local" ? `Snapshot instalado: ${catalogVersion() || "versão não informada"}` : status()?.configured ? `TMDB configurado · ${status()?.remembered ? "salvo neste dispositivo" : "sessão ou ambiente"}` : "Seu acesso ao TMDB é configurado neste dispositivo."}</p>
        </div>
        <Show when={connection() !== "browser"}>
          <div class="cluster">
            <Show when={client && status()?.configured}><button class="button secondary" disabled={configurationBusy()} onClick={() => { cancelCatalog(); resetDetail(); setSource("online"); setSettingsOpen(true); setConfigurationError(""); }}>Configurar TMDB</button></Show>
            <Show when={storageClient}><button class="button secondary" disabled={cacheBusy()} onClick={() => { cacheOpen() ? setCacheOpen(false) : void loadCacheSettings(); }}>Armazenamento</button></Show>
            <button class="button secondary" disabled={connection() === "connecting" || configurationBusy()} onClick={() => { void connect(); }}>{connection() === "connecting" ? "Conectando..." : "Reconectar serviço"}</button>
          </div>
        </Show>
      </section>
      <Show when={cacheOpen()}><section class="cache-panel" aria-labelledby="cache-heading" aria-busy={cacheBusy()}>
        <div><p class="eyebrow">DOWNLOADS E CACHE</p><h2 id="cache-heading">Armazenamento local</h2><p class="muted">Os arquivos temporários ficam no diretório privado do aplicativo. Limpar o cache preserva as fontes vinculadas.</p></div>
        <div class="cache-stats"><div><span>Em uso</span><strong>{cacheSettings() ? bytesLabel(cacheSettings()!.usedBytes) : "Consultando..."}</strong></div><div><span>Limite</span><strong>{cacheSettings() ? bytesLabel(cacheSettings()!.limitBytes) : "—"}</strong></div></div>
        <Show when={cacheSettings()}>{(settings) => <p class="cache-path" title={settings().directory}>{settings().directory}</p>}</Show>
        <form class="cache-form" onSubmit={(event) => { void saveCacheLimit(event); }}><label for="cache-limit">Limite do cache (GB)</label><div><input id="cache-limit" type="number" min="0.5" max="1024" step="0.5" value={cacheLimitGb()} onInput={(event) => setCacheLimitGb(event.currentTarget.value)} disabled={cacheBusy()} /><button class="button" type="submit" disabled={cacheBusy()}>Salvar limite</button></div></form>
        <Show when={cacheError()}><p class="error-text" role="alert">{cacheError()}</p></Show>
        <div class="cache-actions"><button class="button secondary danger" type="button" disabled={cacheBusy() || Boolean(playback())} title={playback() ? "Feche a reprodução antes de limpar" : "Remover mídia temporária"} onClick={() => { void clearCache(); }}>Limpar temporários</button><button class="button secondary" type="button" onClick={() => setCacheOpen(false)}>Fechar</button></div>
      </section></Show>
      <Show when={connectionError()}><p class="service-error" role="alert">{connectionError()}</p></Show>
      <nav class="source-tabs cluster" aria-label="Origem do catálogo">
        <button class="button secondary" aria-pressed={source() === "online"} disabled={configurationBusy()} onClick={() => changeSource("online")}>Explorar TMDB{source() === "online" ? " ✓" : ""}</button>
        <button class="button secondary" aria-pressed={source() === "local"} disabled={configurationBusy()} onClick={() => changeSource("local")}>Offline / local{source() === "local" ? " ✓" : ""}</button>
      </nav>
      <Show when={connection() === "browser"}><section class="state-message catalog-panel"><h2>Seu catálogo está no desktop</h2><p>Esta página não inicia o serviço local. Abra o aplicativo Popcorn para configurar o TMDB ou consultar o catálogo instalado.</p></section></Show>
      <Show when={connection() === "connecting"}><p class="state-message" role="status">Iniciando o serviço e verificando a configuração...</p></Show>
      <Show when={setupVisible() && connection() !== "browser"}>
        <section class="setup-panel" aria-labelledby="setup-heading" aria-busy={configurationBusy()}>
          <div class="setup-copy">
            <p class="eyebrow">SEU ACESSO AO CATÁLOGO</p><h2 id="setup-heading">Conecte ao TMDB</h2>
            <p>Use sua própria credencial para descobrir filmes e séries com imagens, sinopses e elenco.</p>
            <ol><li>Entre na sua conta TMDB e abra as configurações da API.</li><li>Copie o <strong>API Read Access Token</strong>. Não use a API key.</li><li>Cole ao lado. O acesso será validado antes de salvar.</li></ol>
            <Show when={isTauri()} fallback={<a class="button secondary external-link" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Abrir configurações TMDB</a>}>
              <button class="button secondary" onClick={() => { void openSettings(); }}>Abrir configurações TMDB</button>
            </Show>
            <p class="settings-address">https://www.themoviedb.org/settings/api</p>
          </div>
          <form class="setup-form" onSubmit={(event) => { void configure(event); }}>
            <label for="tmdb-token">API Read Access Token</label>
            <input id="tmdb-token" ref={tokenInput} type="password" autocomplete="off" spellcheck={false} required disabled={configurationBusy()} aria-describedby="token-help" />
            <p id="token-help" class="muted">A credencial não aparece no catálogo. O campo é limpo ao enviar.</p>
            <label class="checkbox-label"><input type="checkbox" checked={remember()} onChange={(event) => setRemember(event.currentTarget.checked)} disabled={configurationBusy()} />Salvar neste dispositivo</label>
            <p class="muted">Desmarque para usar apenas nesta sessão. O catálogo local não precisa de credencial.</p>
            <Show when={configurationError()}><p class="error-text" role="alert">{configurationError()}</p></Show>
            <button class="button" type="submit" disabled={!client || configurationBusy()}>{configurationBusy() ? "Validando acesso..." : "Conectar e explorar"}</button>
            <Show when={status()?.configured}><div class="cluster">
              <button class="button secondary" type="button" disabled={configurationBusy()} onClick={() => { if (tokenInput) tokenInput.value = ""; setSettingsOpen(false); void loadCatalog(); void loadGenres(); }}>Voltar ao catálogo</button>
              <button class="button secondary danger" type="button" disabled={configurationBusy()} onClick={() => { void clearConfiguration(); }}>Remover configuração</button>
            </div></Show>
          </form>
        </section>
      </Show>
      <Show when={!setupVisible() && connection() !== "browser" && connection() !== "connecting"}>
        <Show when={source() === "online" && status()?.configured}>
          <section class="catalog-controls" aria-label="Explorar o TMDB">
            <div class="cluster media-tabs" aria-label="Tipo de conteúdo">
              <button class="button secondary" aria-pressed={mediaType() === MediaType.MOVIE} onClick={() => changeMedia(MediaType.MOVIE)}>Filmes{mediaType() === MediaType.MOVIE ? " ✓" : ""}</button>
              <button class="button secondary" aria-pressed={mediaType() === MediaType.TV} onClick={() => changeMedia(MediaType.TV)}>Séries{mediaType() === MediaType.TV ? " ✓" : ""}</button>
            </div>
            <form class="search-form" onSubmit={(event) => { event.preventDefault(); setQuery(searchInput().trim()); void loadCatalog(); }}>
              <label for="catalog-search">Buscar {mediaType() === MediaType.MOVIE ? "filmes" : "séries"}</label>
              <div class="search-fields"><input id="catalog-search" type="search" value={searchInput()} onInput={(event) => setSearchInput(event.currentTarget.value)} placeholder={mediaType() === MediaType.MOVIE ? "Nome do filme" : "Nome da série"} /><button class="button" type="submit">Buscar</button></div>
            </form>
            <div class="cluster category-tabs" aria-label="Coleções">
              <button class="button secondary" aria-pressed={!query() && category() === CatalogCategory.POPULAR} onClick={() => browse(CatalogCategory.POPULAR)}>Populares</button>
              <button class="button secondary" aria-pressed={!query() && category() === CatalogCategory.UPCOMING} onClick={() => browse(CatalogCategory.UPCOMING)}>{mediaType() === MediaType.MOVIE ? "Próximos lançamentos" : "Em exibição"}</button>
              <button class="button secondary" aria-pressed={!query() && category() === CatalogCategory.TOP_RATED} onClick={() => browse(CatalogCategory.TOP_RATED)}>Mais bem avaliados</button>
            </div>
            <div class="genre-filter"><label for="genre">Gênero <span class="muted">· em Populares</span></label><select id="genre" value={genreId()} disabled={genresBusy()} onChange={(event) => browse(CatalogCategory.POPULAR, Number(event.currentTarget.value))}><option value="0">{genresBusy() ? "Carregando gêneros..." : "Todos os gêneros"}</option><For each={genres()}>{(genre) => <option value={genre.id}>{genre.name}</option>}</For></select>
              <Show when={genresStale()}><span class="cache-label">Gêneros: cache / offline</span></Show>
              <Show when={genresError()}><p class="error-text" role="alert">{genresError()}</p><button class="button secondary" onClick={() => { void loadGenres(); }}>Tentar gêneros novamente</button></Show>
            </div>
          </section>
        </Show>
        <div class="collection-header cluster"><div><p class="eyebrow">{source() === "local" ? "SEM CONSULTAS À INTERNET" : mediaType() === MediaType.MOVIE ? "FILMES / TMDB" : "SÉRIES / TMDB"}</p><h2>{catalogHeading()}</h2></div><span class="muted">{catalogLoaded() ? `${titles().length} títulos carregados` : "Ainda não consultado"}</span></div>
        <Show when={catalogStale()}><p class="cache-label" role="status">Cache / offline · exibindo dados salvos, não uma consulta atualizada.</p></Show>
        <div class="library-grid">
          <section class="catalog-panel" aria-label="Títulos do catálogo" aria-busy={catalogBusy()}>
            <Show when={catalogError()}><div class="state-message error-message" role="alert"><h3>Consulta indisponível</h3><p>{catalogError()}</p><button class="button secondary" disabled={catalogBusy()} onClick={() => { void loadCatalog(catalogLoaded() && hasMore()); }}>Tentar novamente</button></div></Show>
            <Show when={catalogBusy()}><p class="loading-message" role="status">{catalogLoaded() ? "Carregando mais títulos..." : "Consultando títulos..."}</p></Show>
            <Show when={catalogLoaded() && titles().length === 0 && !catalogError()}><div class="state-message"><h3>{query() ? "Nenhum resultado para esta busca" : "Nenhum título nesta coleção"}</h3><p>{source() === "local" ? "O snapshot instalado está vazio. Explore o TMDB para consultar o catálogo online." : "A consulta terminou sem títulos. Experimente outra busca, gênero ou coleção."}</p><button class="button secondary" onClick={() => source() === "local" ? changeSource("online") : browse(CatalogCategory.POPULAR)}>{source() === "local" ? "Explorar TMDB" : "Voltar aos populares"}</button></div></Show>
            <Show when={!catalogLoaded() && !catalogBusy() && !catalogError()}><div class="state-message"><h3>Catálogo ainda não consultado</h3><p>Conecte o serviço local para carregar os títulos.</p></div></Show>
            <ul class={`poster-grid ${source() === "local" ? "local-list" : ""}`}>
              <For each={titles()}>{(title) => <li><button class="poster-card" disabled={!title.content} aria-label={`Abrir ${title.title || "título sem nome"}`} aria-pressed={selected() === title} onClick={() => { void openTitle(title); }}>
                <Show when={source() === "online"}><Artwork url={title.posterUrl} title={`Pôster de ${title.title}`} /></Show>
                <span class="card-copy"><strong>{title.title || "Título não informado"}</strong><span class="row-meta">{title.releaseYear || "Ano não informado"}{title.voteAverage > 0 ? ` · ★ ${title.voteAverage.toFixed(1)}` : " · Sem avaliação"}</span></span>
              </button></li>}</For>
            </ul>
            <Show when={catalogLoaded() && hasMore()}><div class="pagination"><button class="button secondary" disabled={catalogBusy()} onClick={() => { void loadCatalog(true); }}>Carregar mais títulos</button></div></Show>
          </section>
          <section class="detail-panel" aria-labelledby="detail-heading" aria-busy={detailBusy()}>
            <div class="detail-kicker"><p class="eyebrow">DETALHES DO TÍTULO</p><Show when={selected()}><button class="detail-close" type="button" aria-label="Fechar detalhes" onClick={resetDetail}>×</button></Show></div>
            <h2 id="detail-heading" ref={detailHeading} tabindex="-1" class="detail-heading">{selected()?.title || "Uma história de cada vez"}</h2>
            <Show when={!selected()}><p class="muted">Selecione um título para conhecer sua história, o elenco e os dados disponíveis.</p></Show>
            <Show when={detailBusy()}><p role="status">Consultando os detalhes...</p></Show>
            <Show when={detailError()}><p class="error-text" role="alert">{detailError()}</p><button class="button secondary" onClick={() => { const title = selected(); if (title) void openTitle(title); }}>Tentar detalhes novamente</button></Show>
            <Show when={detail()}>{(title) => <>
              <Show when={detailStale()}><p class="cache-label">Detalhes: cache / offline</p></Show>
              <Show when={artworkUrl(title().backdropUrl)}><Artwork url={title().backdropUrl} title={`Cena de ${title().title}`} wide /></Show>
              <p class="detail-meta">{title().content?.mediaType === MediaType.TV ? "Série" : "Filme"} · {title().releaseYear || "Ano não informado"} · {title().runtimeMinutes ? `${title().runtimeMinutes} min` : "Duração não informada"} · {title().voteAverage > 0 ? `Nota ${title().voteAverage.toFixed(1)} / 10` : "Sem avaliação"}</p>
              <Show when={title().genres.length}><ul class="genre-tags"><For each={title().genres}>{(genre) => <li>{genre.name}</li>}</For></ul></Show>
              <h3 class="synopsis-label">Sinopse</h3><p class="overview">{title().overview || "Sinopse não disponível."}</p>
              <h3 class="section-label">Elenco</h3><Show when={title().cast.length} fallback={<p class="muted">Elenco não disponível.</p>}><ul class="cast-list"><For each={title().cast}>{(member) => <li><strong>{member.name}</strong><span class="muted">{member.character || "Personagem não informado"}</span></li>}</For></ul></Show>
              <section class="sources-section" aria-label="Fontes de reprodução" aria-busy={sourcesBusy()}>
                <div class="source-heading"><div><p class="eyebrow">FONTE AUTORIZADA</p><h3>Assistir agora</h3></div><Show when={sourceContent()?.episodeNumber}><span class="episode-badge">T{sourceContent()?.seasonNumber} · E{sourceContent()?.episodeNumber}</span></Show></div>
                <p class="muted source-disclaimer">Adicione apenas um magnet que você tem autorização para acessar. O Popcorn não fornece conteúdo.</p>
                <form class="magnet-form" onSubmit={(event) => { void addMagnet(event); }}>
                  <label for="magnet-link">Link magnet</label>
                  <div class="magnet-fields"><input id="magnet-link" type="text" inputmode="url" value={magnet()} onInput={(event) => setMagnet(event.currentTarget.value)} placeholder="magnet:?xt=urn:btih:…" spellcheck={false} disabled={sourcesBusy()} /><button class="button" type="submit" disabled={sourcesBusy() || !magnet().trim()}>{sourcesBusy() ? "Preparando..." : "Adicionar"}</button></div>
                </form>
                <div class="torrent-import"><span>ou</span><label class={`button secondary ${sourcesBusy() ? "disabled" : ""}`}>Importar .torrent<input type="file" accept=".torrent,application/x-bittorrent" disabled={sourcesBusy()} onChange={(event) => { void importTorrent(event); }} /></label></div>
                <Show when={sourcesError()}><p class="error-text" role="alert">{sourcesError()}</p></Show>
                <Show when={!sourcesBusy() && !mediaSources().length && !sourcesError()}><p class="muted empty-source">Nenhuma fonte vinculada a este {sourceContent()?.episodeNumber ? "episódio" : "título"}.</p></Show>
                <div class="playback-quality"><label for="playback-quality">Qualidade inicial</label><select id="playback-quality" value={playbackQuality()} disabled={playbackBusy()} onChange={(event) => {
                  const choice = playbackQualities.find((quality) => String(quality.value) === event.currentTarget.value);
                  if (choice) setPlaybackQuality(choice.value);
                }}><For each={playbackQualities}>{(quality) => <option value={quality.value}>{quality.label}</option>}</For></select></div>
                <ul class="source-list"><For each={mediaSources()}>{(mediaSource) => <li>
                  <div class="source-row"><span>{mediaSource.files.length} arquivo(s)</span><button class="text-button" type="button" disabled={sourcesBusy()} onClick={() => { void removeMediaSource(mediaSource.sourceId); }}>Remover</button></div>
                  <ul class="file-list"><For each={mediaSource.files}>{(file) => <li><div><strong>{file.name}</strong><span>{bytesLabel(file.sizeBytes)}</span></div><Show when={file.likelyMedia}><button class="button play-button" type="button" disabled={playbackBusy()} onClick={() => { void playFile(mediaSource.sourceId, file.fileIndex); }}>{playbackBusy() ? "Abrindo..." : "▶ Assistir"}</button></Show></li>}</For></ul>
                </li>}</For></ul>
                <Show when={playbackError()}><p class="error-text" role="alert">{playbackError()}</p></Show>
              </section>
              <Show when={source() === "online" && title().content?.mediaType === MediaType.TV}>
                <section class="episodes-section" aria-label="Temporadas e episódios">
                  <h3 class="section-label">Temporadas e episódios</h3>
                  <Show when={seasonsBusy()}><p role="status">Consultando temporadas...</p></Show>
                  <Show when={seasonsStale()}><p class="cache-label">Temporadas: cache / offline</p></Show>
                  <Show when={seasonsError()}><p class="error-text" role="alert">{seasonsError()}</p><button class="button secondary" onClick={() => { const id = selected()?.content?.tmdbId; if (id && detailController) void loadSeasons(id, detailGeneration, detailController); }}>Tentar temporadas novamente</button></Show>
                  <Show when={!seasonsBusy() && !seasonsError() && !seasons().length}><p class="muted">Temporadas não disponíveis.</p></Show>
                  <Show when={seasons().length}><label for="season">Temporada</label><select id="season" value={seasonNumber()} onChange={(event) => { void loadEpisodes(Number(event.currentTarget.value)); }}><For each={seasons()}>{(season) => <option value={season.seasonNumber}>{season.name || `Temporada ${season.seasonNumber}`} · {season.episodeCount} episódios</option>}</For></select>
                    <p class="season-overview">{seasons().find((season) => season.seasonNumber === seasonNumber())?.overview}</p>
                    <Show when={episodesBusy()}><p role="status">Consultando episódios...</p></Show>
                    <Show when={episodesStale()}><p class="cache-label">Episódios: cache / offline</p></Show>
                    <Show when={episodesError()}><p class="error-text" role="alert">{episodesError()}</p><button class="button secondary" onClick={() => { const number = seasonNumber(); if (number !== undefined) void loadEpisodes(number); }}>Tentar episódios novamente</button></Show>
                    <Show when={!episodesBusy() && !episodesError() && !episodes().length}><p class="muted">Episódios não disponíveis nesta temporada.</p></Show>
                    <ol class="episode-list"><For each={episodes()}>{(episode) => <li>
                      <Show when={artworkUrl(episode.stillUrl)}><Artwork url={episode.stillUrl} title={`Cena de ${episode.name}`} wide /></Show>
                      <h4>{episode.content?.episodeNumber ? `${episode.content.episodeNumber}. ` : ""}{episode.name || "Nome não informado"}</h4>
                      <p class="muted">{episode.airDate ? `Exibição: ${episode.airDate.split("-").reverse().join("/")}` : "Data não informada"}{episode.runtimeMinutes ? ` · ${episode.runtimeMinutes} min` : ""}</p>
                      <p>{episode.overview || "Sinopse não disponível."}</p>
                      <Show when={episode.content}><button class="button secondary episode-source-button" type="button" aria-pressed={sourceContent()?.seasonNumber === episode.content?.seasonNumber && sourceContent()?.episodeNumber === episode.content?.episodeNumber} onClick={() => { const content = episode.content; if (content) void chooseSourceContent(content); }}>Usar fontes deste episódio</button></Show>
                    </li>}</For></ol>
                  </Show>
                </section>
              </Show>
            </>}</Show>
          </section>
        </div>
      </Show>
      <footer class="page-footer" aria-label="Sobre e créditos">
        <div class="cluster"><span>Popcorn · Descoberta de filmes e séries</span><span>Reprodução progressiva por fontes do usuário.</span></div>
        <div class="attribution"><img src={tmdbLogo} width="80" height="11" alt="TMDB" /><p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p></div>
      </footer>
    </main>
    <Show when={playback()}>{(active) => <PlayerOverlay onClose={() => clearPlayback()}>
      <div class="player-toolbar"><div class="player-download"><strong>{detail()?.title || selected()?.title || "Reprodução"}</strong><span>{bytesLabel(active().sizeBytes)} · {playbackProgress().toFixed(1)}% recebido · {rateLabel(active().downloadBytesPerSecond)} · {active().peers} peer(s)</span><progress max="100" value={playbackProgress()} aria-label="Progresso do download">{playbackProgress()}%</progress></div><div class="player-actions"><button class="button secondary" type="button" disabled={playbackBusy() || !mediaReady()} onClick={() => { void toggleDownload(); }}>{active().state === PlaybackState.PAUSED ? "Retomar download" : "Pausar download"}</button><button class="player-close" type="button" aria-label="Fechar reprodutor" onClick={() => clearPlayback()}>×</button></div></div>
      <div class="player-status-area">
        <p class="player-conversion" role="status">{conversionLabel()}</p>
        <Show when={!mediaReady() && !preparationError()}><p role="status">{active().state === PlaybackState.STOPPED ? "Reprodução encerrada. Feche ou tente novamente." : "Preparando vídeo para reprodução..."}</p></Show>
        <Show when={playbackMonitorError()}><p class="error-text" role="alert">{playbackMonitorError()}</p></Show>
        <Show when={playerError()}><p class="error-text" role="alert">{playerError()}</p></Show>
        <Show when={playerError() || active().state === PlaybackState.STOPPED}><button class="button secondary" type="button" disabled={playbackBusy()} onClick={() => { if (lastPlaybackFile) void playFile(lastPlaybackFile.sourceId, lastPlaybackFile.fileIndex); }}>Tentar reprodução novamente</button></Show>
      </div>
      <div class="player-stage"><Show when={mediaReady()}><MediaPlayer playback={active()} onError={setMediaError} onEnded={() => clearPlayback()} /></Show></div>
    </PlayerOverlay>}</Show>
  </div>;
}
