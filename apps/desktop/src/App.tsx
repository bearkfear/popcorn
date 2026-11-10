import "./app-ui.css";
import { Button } from "@egcs/newui/actions";
import { Container } from "@egcs/newui/layout";
import { Navbar } from "@egcs/newui/navigation";
import type { ContentRef, Title, TmdbStatus } from "@popcorn/sdk";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import tmdbLogo from "./assets/tmdb.svg";
import { createBootstrapViewModel } from "./features/bootstrap/bootstrap.viewmodel";
import { PairingPanel } from "./features/bootstrap/pairing-panel";
import { createCatalogViewModel } from "./features/catalog/catalog.viewmodel";
import { CatalogControls } from "./features/catalog/catalog-controls";
import { CatalogMediaTabs } from "./features/catalog/catalog-media-tabs";
import { CatalogSpotlight } from "./features/catalog/catalog-spotlight";
import { PosterGrid } from "./features/catalog/poster-grid";
import { createDetailsViewModel } from "./features/details/details.viewmodel";
import { DetailsPanel } from "./features/details/details-panel";
import { contentKey, resumePosition, type WatchEntry } from "./features/history/history.model";
import { createHistoryViewModel } from "./features/history/history.viewmodel";
import { HistoryShelf } from "./features/history/history-shelf";
import { createPlayerViewModel } from "./features/player/player.viewmodel";
import { PlayerPage } from "./features/player/player-page";
import { openPlayerTab, useInlinePlayer } from "./features/player/player-tab";
import { createSettingsViewModel } from "./features/settings/settings.viewmodel";
import { SettingsPage } from "./features/settings/settings-page";
import { createSourcesViewModel } from "./features/sources/sources.viewmodel";
import { Icon } from "./shared/ui/icon";

type WatchContext = Omit<WatchEntry, "key" | "status" | "position" | "duration" | "updatedAt">;
type Page = "search" | "details" | "settings";

export function App() {
  const bootstrap = createBootstrapViewModel();
  const catalogClient = () => bootstrap.getClients().catalog;
  const settings = createSettingsViewModel(
    catalogClient,
    () => bootstrap.getClients().storage,
    () => bootstrap.getClients().sourceCatalog,
  );
  const details = createDetailsViewModel(catalogClient);
  const sources = createSourcesViewModel(() => bootstrap.getClients().source);
  const player = createPlayerViewModel(() => bootstrap.getClients().playback);
  const history = createHistoryViewModel(() => bootstrap.getClients().history);
  const [page, setPage] = createSignal<Page>("search");
  const [librarySelected, setLibrarySelected] = createSignal(false);
  const [navigationOpen, setNavigationOpen] = createSignal(false);
  const [session, setSession] = createSignal<WatchContext>();
  let settingsReturnPage: Page = "search";
  let openingWindow = false;
  let videoTab: Window | null = null;
  const [videoWindowOpen, setVideoWindowOpen] = createSignal(false);

  async function openVideo(context: WatchContext, position: number) {
    if (openingWindow) return;
    openingWindow = true;
    try {
      if (isTauri()) {
        await invoke("open_player_window", { session: { context, position } });
      } else {
        if (videoTab && !videoTab.closed) {
          videoTab.focus();
          return;
        }
        videoTab = await openPlayerTab({ context, position });
        if (!videoTab) throw new Error("Permita abrir novas abas para assistir ao vídeo.");
      }
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
    if (page() !== "settings") setPage("search");
  }
  const catalog = createCatalogViewModel(
    catalogClient,
    resetSelection,
    settings.handleCatalogError,
  );
  createEffect(
    on(
      () => settings.settingsOpen() || settings.status()?.configured === false,
      (needsSetup) => {
        if (needsSetup && page() !== "settings") openSettings();
      },
    ),
  );

  function loadCatalog(current: TmdbStatus | undefined = settings.status()) {
    if (current?.configured) {
      void catalog.loadCatalog();
      void catalog.loadGenres();
    }
  }
  async function connect() {
    if (settings.configurationBusy() || settings.sourceCatalog.busy()) return;
    resetSelection();
    await bootstrap.connect(() => {
      void settings.refreshStatus().then(loadCatalog);
    });
  }
  function configured() {
    settings.setSettingsOpen(false);
    loadCatalog();
  }
  function openSettings() {
    if (page() === "settings") return;
    settingsReturnPage = page();
    navigate("settings");
  }
  function closeSettings() {
    settings.setSettingsOpen(false);
    navigate(settingsReturnPage === "details" && details.selected() ? "details" : "search");
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
    if (videoTab && !videoTab.closed) {
      videoTab.focus();
      return;
    }
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
    if (!isTauri() && useInlinePlayer()) {
      navigate("player");
      await player.launch(position);
      return;
    }
    await openVideo(selected, position);
  }
  async function resume(entry: WatchEntry) {
    if (entry.sourceId === undefined || entry.fileIndex === undefined) {
      openTitle(entry.title, entry.content);
      return;
    }
    if (!isTauri() && useInlinePlayer()) {
      openTitle(entry.title, entry.content);
      player.setQuality(entry.quality);
      player.setAudioStreamIndex(entry.audioStreamIndex);
      setSession(entry);
      navigate("player");
      await player.playFile(entry.sourceId, entry.fileIndex, true, resumePosition(entry));
      return;
    }
    await openVideo(entry, resumePosition(entry));
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
      : page() === "settings"
        ? "Configurações · Popcorn"
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
    const syncHistory = () => {
      void history.refresh();
      if (videoTab?.closed) {
        videoTab = null;
        setVideoWindowOpen(false);
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") syncHistory();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", syncHistory);
    window.addEventListener("focus", syncHistory);
    onCleanup(() => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("storage", syncHistory);
      window.removeEventListener("focus", syncHistory);
    });
    window.history.replaceState({ page: "search" }, "", "#search");
    const pop = (event: PopStateEvent) => {
      player.close();
      settings.setSettingsOpen(false);
      setPage(
        event.state?.page === "settings"
          ? "settings"
          : event.state?.page === "details" && details.selected()
            ? "details"
            : "search",
      );
    };
    window.addEventListener("popstate", pop);
    onCleanup(() => window.removeEventListener("popstate", pop));
    void connect();
  });

  return (
    <Show
      when={!bootstrap.pairingRequired()}
      fallback={<PairingPanel onConnected={() => void connect()} />}
    >
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
        <div class="app-shell min-h-screen">
          <Navbar.Root
            class="app-navbar"
            tone="subtle"
            width="lg"
            aria-label="Navegação principal"
            open={navigationOpen()}
            onOpenChange={({ open }) => setNavigationOpen(open)}
          >
            <Navbar.Brand
              href="#search"
              aria-label="Ir para pesquisa"
              onClick={(event) => {
                event.preventDefault();
                setNavigationOpen(false);
                backToSearch();
              }}
            >
              popcorn<span class="text-accent">.</span>
            </Navbar.Brand>
            <Navbar.Toggle aria-label="Abrir navegação" />
            <Navbar.Content class="app-navbar-content">
              <Navbar.List>
                <Navbar.Item value="explore">
                  <Navbar.Link
                    href="#search"
                    aria-current={page() !== "settings" ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      setNavigationOpen(false);
                      backToSearch();
                    }}
                  >
                    Explorar
                  </Navbar.Link>
                </Navbar.Item>
                <Navbar.Item value="settings">
                  <Navbar.Link
                    href="#settings"
                    aria-current={page() === "settings" ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      setNavigationOpen(false);
                      openSettings();
                    }}
                  >
                    <Icon name="settings" /> Configurações
                  </Navbar.Link>
                </Navbar.Item>
              </Navbar.List>
            </Navbar.Content>
          </Navbar.Root>
          <Dynamic
            component={page() === "settings" ? "div" : "main"}
            class={page() === "details" ? "details-page" : "search-page"}
          >
            <Container size="lg" class="py-5">
              <Show when={page() === "settings"}>
                <SettingsPage
                  vm={settings}
                  bootstrap={bootstrap}
                  playbackActive={Boolean(player.playback()) || videoWindowOpen()}
                  onBack={closeSettings}
                  onReconnect={() => void connect()}
                  onImported={() => {
                    const target = sources.content();
                    if (target) sources.selectContent(target);
                  }}
                  onConfigured={configured}
                  onRemoved={() => {
                    player.close();
                    details.resetDetail();
                    sources.reset();
                    catalog.resetCatalog();
                  }}
                />
              </Show>
              <Show when={page() !== "settings"}>
                <Show when={bootstrap.connectionError()}>
                  <p
                    class="service-error mt-3 p-[12px_16px] border border-tomato-7 rounded-control bg-negative-bg text-negative"
                    role="alert"
                  >
                    {bootstrap.connectionError()}
                  </p>
                </Show>
                <Show when={bootstrap.connection() === "browser"}>
                  <section class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.nui-button]:mt-5">
                    <h2>Abra o Popcorn no desktop</h2>
                    <p>O aplicativo conecta o catálogo e prepara a reprodução.</p>
                  </section>
                </Show>
                <Show when={bootstrap.connection() === "connecting"}>
                  <p
                    class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.nui-button]:mt-5"
                    role="status"
                  >
                    Iniciando o Popcorn…
                  </p>
                </Show>
                <Show when={bootstrap.connection() === "ready" && !settings.status()?.configured}>
                  <section class="mx-auto max-w-[620px] rounded-panel border border-line bg-slate-2 p-8">
                    <h1 class="text-2xl">Seu catálogo começa aqui</h1>
                    <p class="mt-3 text-[14px] text-muted">
                      Conecte sua conta TMDB nas configurações para explorar filmes e séries.
                    </p>
                    <Button class="mt-5" type="button" onClick={openSettings}>
                      <Icon name="settings" /> Configurar catálogo
                    </Button>
                  </section>
                </Show>
                <Show when={bootstrap.connection() === "ready" && settings.status()?.configured}>
                  <Show
                    when={page() === "search"}
                    fallback={
                      <>
                        <nav
                          class="detail-navigation mb-6 max-[600px]:items-start max-[600px]:gap-4 cluster flex flex-wrap items-center justify-between gap-3"
                          aria-label="Navegação do título"
                        >
                          <Button
                            variant="outline"
                            tone="neutral"
                            type="button"
                            onClick={backToSearch}
                          >
                            <Icon name="arrow-left" /> Voltar à pesquisa
                          </Button>
                          <Show when={details.detail()?.content}>
                            {(content) => (
                              <div class="cluster flex flex-wrap items-center justify-between gap-3">
                                <Button
                                  variant="outline"
                                  tone="neutral"
                                  type="button"
                                  aria-pressed={selectedEntry()?.status === "want"}
                                  onClick={() => {
                                    const title = details.detail();
                                    if (title) history.mark(title, content(), "want");
                                  }}
                                >
                                  <Icon name="plus" /> Quero assistir
                                </Button>
                                <Button
                                  variant="outline"
                                  tone="neutral"
                                  type="button"
                                  aria-pressed={selectedEntry()?.status === "watched"}
                                  onClick={() => {
                                    const title = details.detail();
                                    if (title)
                                      history.mark(
                                        title,
                                        sources.content() ?? content(),
                                        "watched",
                                      );
                                  }}
                                >
                                  <Icon name="check" /> Já assisti
                                </Button>
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
                          <p
                            class="error-text text-negative m-[8px_0_12px] text-[13px]"
                            role="alert"
                          >
                            {history.error()}
                          </p>
                        </Show>
                      </>
                    }
                  >
                    <h1 class="sr-only">
                      {librarySelected() ? "Minha biblioteca" : "Explorar filmes e séries"}
                    </h1>
                    <CatalogMediaTabs
                      vm={catalog}
                      librarySelected={librarySelected()}
                      onLibraryChange={setLibrarySelected}
                    >
                      <Show when={!librarySelected()}>
                        <CatalogSpotlight
                          vm={catalog}
                          history={history}
                          onSelectTitle={(title) => openTitle(title)}
                        />
                        <CatalogControls vm={catalog} />
                        <PosterGrid
                          vm={catalog}
                          selectedTitle={details.selected}
                          onSelectTitle={(title) => openTitle(title)}
                        />
                      </Show>
                      <Show when={librarySelected()}>
                        <HistoryShelf
                          vm={history}
                          disabled={player.busy()}
                          onOpen={(entry) => openTitle(entry.title, entry.content)}
                          onResume={(entry) => void resume(entry)}
                        />
                      </Show>
                    </CatalogMediaTabs>
                  </Show>
                </Show>
              </Show>
              <footer
                class="page-footer grid grid-cols-[1fr_auto] gap-6 items-end mt-12 p-[24px_0] border-t border-line text-muted text-[11px] [&_>_.cluster]:justify-start max-[820px]:grid-cols-[1fr]"
                role="contentinfo"
                aria-label="Sobre e créditos"
              >
                <div>
                  <span>Popcorn · Filmes e séries</span>
                  <p class="muted text-muted">Seu progresso fica salvo neste dispositivo.</p>
                </div>
                <div class="attribution flex items-center justify-end gap-3 max-w-[440px] text-right [&_img]:w-[80px] [&_img]:h-auto [&_img]:flex-none max-[820px]:justify-start max-[820px]:text-left">
                  <img src={tmdbLogo} width="80" height="11" alt="TMDB" />
                  <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                </div>
              </footer>
            </Container>
          </Dynamic>
        </div>
      </Show>
    </Show>
  );
}
