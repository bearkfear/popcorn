import { Button } from "@kobalte/core/button";
import { ToggleButton } from "@kobalte/core/toggle-button";
import type { ContentRef, Title, TmdbStatus } from "@popcorn/sdk";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import tmdbLogo from "./assets/tmdb.svg";
import { createBootstrapViewModel } from "./features/bootstrap/bootstrap.viewmodel";
import { createCatalogViewModel } from "./features/catalog/catalog.viewmodel";
import { CatalogControls } from "./features/catalog/catalog-controls";
import { PosterGrid } from "./features/catalog/poster-grid";
import { createDetailsViewModel } from "./features/details/details.viewmodel";
import { DetailsPanel } from "./features/details/details-panel";
import { contentKey, resumePosition, type WatchEntry } from "./features/history/history.model";
import { createHistoryViewModel } from "./features/history/history.viewmodel";
import { HistoryShelf } from "./features/history/history-shelf";
import { createPlayerViewModel } from "./features/player/player.viewmodel";
import { PlayerPage } from "./features/player/player-page";
import { CachePanel } from "./features/settings/cache-panel";
import { createSettingsViewModel } from "./features/settings/settings.viewmodel";
import { SetupPanel } from "./features/settings/setup-panel";
import { createSourcesViewModel } from "./features/sources/sources.viewmodel";
import { Icon } from "./shared/ui/icon";

type WatchContext = Omit<WatchEntry, "key" | "status" | "position" | "duration" | "updatedAt">;
type Page = "search" | "details";

export function App() {
  const bootstrap = createBootstrapViewModel();
  const catalogClient = () => bootstrap.getClients().catalog;
  const settings = createSettingsViewModel(catalogClient, () => bootstrap.getClients().storage);
  const details = createDetailsViewModel(catalogClient);
  const sources = createSourcesViewModel(() => bootstrap.getClients().source);
  const player = createPlayerViewModel(() => bootstrap.getClients().playback);
  const history = createHistoryViewModel();
  const [page, setPage] = createSignal<Page>("search");
  const [session, setSession] = createSignal<WatchContext>();
  const [serviceOpen, setServiceOpen] = createSignal(false);
  let openingWindow = false;
  const [videoWindowOpen, setVideoWindowOpen] = createSignal(false);

  async function openVideo(context: WatchContext, position: number) {
    if (openingWindow) return;
    openingWindow = true;
    try {
      await invoke("open_player_window", { session: { context, position } });
      setVideoWindowOpen(true);
      player.close(false);
    } catch (error) {
      player.setMediaError(error instanceof Error ? error.message : String(error));
    } finally {
      openingWindow = false;
    }
  }

  function resetSelection() {
    player.close();
    details.resetDetail();
    sources.reset();
    setPage("search");
  }
  const catalog = createCatalogViewModel(
    catalogClient,
    resetSelection,
    settings.handleCatalogError,
  );
  const setupVisible = () => settings.settingsOpen() || settings.status()?.configured === false;

  function loadCatalog(current: TmdbStatus | undefined = settings.status()) {
    if (current?.configured) {
      void catalog.loadCatalog();
      void catalog.loadGenres();
    }
  }
  async function connect() {
    if (settings.configurationBusy()) return;
    resetSelection();
    await bootstrap.connect(() => {
      void settings.refreshStatus().then(loadCatalog);
    });
  }
  function configured() {
    settings.setSettingsOpen(false);
    loadCatalog();
  }
  function navigate(next: Page | "player") {
    window.history.pushState({ page: next }, "", `#${next}`);
    if (next !== "player") setPage(next);
    window.scrollTo({ top: 0 });
  }
  function openTitle(title: Title, content = title.content) {
    player.close();
    setSession(undefined);
    settings.setSettingsOpen(false);
    navigate("details");
    details.openTitle(title, true, () => {
      if (content) sources.selectContent(content);
    });
  }
  function backToSearch() {
    player.close();
    navigate("search");
  }
  function backFromPlayer() {
    player.close();
    navigate("details");
  }
  function selectContent(content: ContentRef) {
    player.close();
    setSession(undefined);
    sources.selectContent(content);
  }
  async function prepareFile(sourceId: string, fileIndex: number) {
    if (isTauri() && (await invoke<boolean>("player_window_active"))) return;
    const title = details.detail() ?? details.selected();
    const content = sources.content();
    if (!title || !content) return;
    player.close();
    setSession({ title, content, sourceId, fileIndex, quality: player.quality() });
    await player.prepareFile(sourceId, fileIndex);
  }
  async function launch(position: number) {
    const context = session();
    if (!context) return;
    const audioStreamIndex = player.audioStreamIndex();
    const selected = {
      ...context,
      quality: player.quality(),
      ...(audioStreamIndex !== undefined ? { audioStreamIndex } : {}),
    };
    setSession(selected);
    if (isTauri()) {
      await openVideo(selected, position);
      return;
    }
    navigate("player");
    await player.launch(position);
  }
  async function resume(entry: WatchEntry) {
    if (entry.sourceId === undefined || entry.fileIndex === undefined) {
      openTitle(entry.title, entry.content);
      return;
    }
    if (isTauri()) {
      await openVideo(entry, resumePosition(entry));
      return;
    }
    openTitle(entry.title, entry.content);
    player.setQuality(entry.quality);
    player.setAudioStreamIndex(entry.audioStreamIndex);
    setSession({
      title: entry.title,
      content: entry.content,
      sourceId: entry.sourceId,
      fileIndex: entry.fileIndex,
      quality: entry.quality,
      ...(entry.audioStreamIndex !== undefined ? { audioStreamIndex: entry.audioStreamIndex } : {}),
    });
    navigate("player");
    await player.playFile(entry.sourceId, entry.fileIndex, true, resumePosition(entry));
  }
  const selectedEntry = () => history.find(sources.content() ?? details.selected()?.content);
  const resumeSeconds = () => {
    const context = session();
    const entry = context ? history.find(context.content) : undefined;
    return resumePosition(entry);
  };

  // Changing episodes invalidates a prepared file from the preceding episode.
  createEffect(() => {
    const content = sources.content();
    const context = session();
    if (content && context && contentKey(content) !== contentKey(context.content)) {
      player.close();
      setSession(undefined);
    }
  });
  createEffect(() => {
    document.title = player.viewing()
      ? `${session()?.title.title || "Reprodução"} · Popcorn`
      : page() === "details"
        ? `${details.selected()?.title || "Detalhes"} · Popcorn`
        : "Explorar · Popcorn";
  });
  onMount(() => {
    if (isTauri()) {
      let disposed = false;
      const closed = listen("player-window-closed", () => {
        setVideoWindowOpen(false);
        history.refresh();
        const context = session();
        if (
          page() === "details" &&
          context?.sourceId !== undefined &&
          context.fileIndex !== undefined
        ) {
          void prepareFile(context.sourceId, context.fileIndex);
        }
      });
      void invoke<boolean>("player_window_active").then((active) => {
        if (!disposed) setVideoWindowOpen(active);
      });
      onCleanup(() => {
        disposed = true;
        void closed.then((unlisten) => unlisten());
      });
    }
    const syncHistory = () => history.refresh();
    window.addEventListener("storage", syncHistory);
    window.addEventListener("focus", syncHistory);
    onCleanup(() => {
      window.removeEventListener("storage", syncHistory);
      window.removeEventListener("focus", syncHistory);
    });
    window.history.replaceState({ page: "search" }, "", "#search");
    const pop = (event: PopStateEvent) => {
      player.close();
      setPage(event.state?.page === "details" && details.selected() ? "details" : "search");
    };
    window.addEventListener("popstate", pop);
    onCleanup(() => window.removeEventListener("popstate", pop));
    void connect();
  });

  return (
    <Show
      when={!player.viewing()}
      fallback={
        <Show when={session()} keyed>
          {(context) => (
            <PlayerPage
              vm={player}
              title={context.title.title}
              onBack={backFromPlayer}
              onProgress={(position, duration) => history.progress(context, position, duration)}
              onEnded={() => {
                history.mark(context.title, context.content, "watched");
                backFromPlayer();
              }}
            />
          )}
        </Show>
      }
    >
      <div class="app-shell">
        <header class="app-header cluster">
          <Button
            class="brand-lockup brand-button"
            type="button"
            onClick={backToSearch}
            aria-label="Ir para pesquisa"
          >
            <span class="brand-mark" aria-hidden="true">
              P
            </span>
            <span class="wordmark">
              popcorn<span class="wordmark-dot">.</span>
            </span>
          </Button>
          <nav class="cluster" aria-label="Navegação principal">
            <Button class="text-button" type="button" onClick={backToSearch}>
              Explorar
            </Button>
            <Button
              class="text-button"
              type="button"
              aria-expanded={serviceOpen()}
              onClick={() => setServiceOpen(!serviceOpen())}
            >
              Configurações
            </Button>
          </nav>
        </header>
        <main class={`page ${page() === "details" ? "details-page" : "search-page"}`}>
          <Show when={serviceOpen()}>
            <section class="connection-panel cluster" aria-label="Configurações">
              <div>
                <strong>Popcorn</strong>
                <p class="connection-caption muted">
                  {bootstrap.connection() === "ready" ? "Conectado" : "Conectando ao aplicativo…"}
                </p>
              </div>
              <div class="cluster">
                <Button
                  class="button secondary"
                  type="button"
                  onClick={() => settings.setSettingsOpen(!settings.settingsOpen())}
                >
                  Configurar TMDB
                </Button>
                <Button
                  class="button secondary"
                  type="button"
                  disabled={settings.cacheBusy()}
                  onClick={() => {
                    settings.setCacheOpen(!settings.cacheOpen());
                    if (settings.cacheOpen()) void settings.loadCacheSettings();
                  }}
                >
                  Armazenamento
                </Button>
                <Button
                  class="button secondary"
                  type="button"
                  disabled={bootstrap.connection() === "connecting"}
                  onClick={() => void connect()}
                >
                  Reconectar
                </Button>
              </div>
            </section>
          </Show>
          <Show when={settings.cacheOpen()}>
            <CachePanel
              vm={settings}
              playbackActive={Boolean(player.playback()) || videoWindowOpen()}
            />
          </Show>
          <Show when={bootstrap.connectionError()}>
            <p class="service-error" role="alert">
              {bootstrap.connectionError()}
            </p>
          </Show>
          <Show when={bootstrap.connection() === "browser"}>
            <section class="state-message">
              <h2>Abra o Popcorn no desktop</h2>
              <p>O aplicativo conecta o catálogo e prepara a reprodução.</p>
            </section>
          </Show>
          <Show when={bootstrap.connection() === "connecting"}>
            <p class="state-message" role="status">
              Iniciando o Popcorn…
            </p>
          </Show>
          <Show when={setupVisible() && bootstrap.connection() !== "browser"}>
            <SetupPanel
              vm={settings}
              onConfigured={configured}
              onRemoved={() => {
                resetSelection();
                catalog.resetCatalog();
              }}
            />
          </Show>
          <Show when={!setupVisible() && bootstrap.connection() === "ready"}>
            <Show
              when={page() === "search"}
              fallback={
                <>
                  <nav class="detail-navigation cluster" aria-label="Navegação do título">
                    <Button class="button secondary" type="button" onClick={backToSearch}>
                      <Icon name="arrow-left" /> Voltar à pesquisa
                    </Button>
                    <Show when={details.detail()?.content}>
                      {(content) => (
                        <div class="cluster">
                          <ToggleButton
                            class="button secondary"
                            type="button"
                            pressed={selectedEntry()?.status === "want"}
                            onChange={(pressed) => {
                              if (!pressed) return;
                              const title = details.detail();
                              if (title) history.mark(title, content(), "want");
                            }}
                          >
                            <Icon name="plus" /> Quero assistir
                          </ToggleButton>
                          <ToggleButton
                            class="button secondary"
                            type="button"
                            pressed={selectedEntry()?.status === "watched"}
                            onChange={(pressed) => {
                              if (!pressed) return;
                              const title = details.detail();
                              if (title)
                                history.mark(title, sources.content() ?? content(), "watched");
                            }}
                          >
                            <Icon name="check" /> Já assisti
                          </ToggleButton>
                        </div>
                      )}
                    </Show>
                  </nav>
                  <DetailsPanel
                    vm={details}
                    online
                    sources={{ ...sources, selectContent }}
                    player={player}
                    onPrepare={(id, index) => void prepareFile(id, index)}
                    resumeSeconds={resumeSeconds()}
                    onLaunch={(position) => void launch(position)}
                  />
                  <Show when={history.error()}>
                    <p class="error-text" role="alert">
                      {history.error()}
                    </p>
                  </Show>
                </>
              }
            >
              <section class="introduction" aria-labelledby="library-title">
                <p class="eyebrow">SEU CINEMA, SEU TEMPO</p>
                <h1 id="library-title">O que vamos assistir?</h1>
                <p class="muted">Encontre uma nova história ou continue de onde parou.</p>
              </section>
              <CatalogControls vm={catalog} />
              <HistoryShelf
                vm={history}
                disabled={player.busy()}
                onOpen={(entry) => openTitle(entry.title, entry.content)}
                onResume={(entry) => void resume(entry)}
              />
              <PosterGrid
                vm={catalog}
                selectedTitle={details.selected}
                onSelectTitle={(title) => openTitle(title)}
              />
            </Show>
          </Show>
          <footer class="page-footer" role="contentinfo" aria-label="Sobre e créditos">
            <div>
              <span>Popcorn · Filmes e séries</span>
              <p class="muted">Seu progresso fica salvo neste dispositivo.</p>
            </div>
            <div class="attribution">
              <img src={tmdbLogo} width="80" height="11" alt="TMDB" />
              <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
            </div>
          </footer>
        </main>
      </div>
    </Show>
  );
}
