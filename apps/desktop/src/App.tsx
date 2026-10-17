import { Toggle } from "@ark-ui/solid/toggle";
import type { ContentRef, Title, TmdbStatus } from "@popcorn/sdk";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js";
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
import { createSettingsViewModel } from "./features/settings/settings.viewmodel";
import { SettingsPage } from "./features/settings/settings-page";
import { createSourcesViewModel } from "./features/sources/sources.viewmodel";
import { Icon } from "./shared/ui/icon";
import { buttonStyles } from "./shared/ui/styles";

type WatchContext = Omit<WatchEntry, "key" | "status" | "position" | "duration" | "updatedAt">;
type Page = "search" | "details" | "settings";

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
  let settingsReturnPage: Page = "search";
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
        <header class="app-header sticky z-[20] top-0 min-h-[64px] p-[0_clamp(18px,_4vw,_54px)] border-b border-slate-6 bg-slate-2 shadow-[0_2px_12px_var(--black-a4)] backdrop-blur-[14px] max-[560px]:min-h-[56px] cluster flex flex-wrap items-center justify-between gap-3">
          <button
            class="brand-lockup flex min-h-10 items-center brand-button border-0 p-0 text-inherit bg-transparent"
            type="button"
            onClick={backToSearch}
            aria-label="Ir para pesquisa"
          >
            <span class="wordmark text-[22px] font-bold tracking-[-0.04em] lowercase max-[560px]:text-[20px]">
              popcorn<span class="wordmark-dot text-accent">.</span>
            </span>
          </button>
          <nav
            class="cluster flex flex-wrap items-center justify-between gap-3"
            aria-label="Navegação principal"
          >
            <button
              class="text-button flex min-h-10 items-center gap-2 rounded-control border-0 bg-transparent px-3 text-[13px] text-muted hover:bg-slate-4 hover:text-ink aria-[current=page]:bg-slate-4 aria-[current=page]:text-ink"
              type="button"
              onClick={backToSearch}
              aria-current={page() !== "settings" ? "page" : undefined}
            >
              Explorar
            </button>
            <button
              class="text-button flex min-h-10 items-center gap-2 rounded-control border-0 bg-transparent px-3 text-[13px] text-muted hover:bg-slate-4 hover:text-ink aria-[current=page]:bg-slate-4 aria-[current=page]:text-ink"
              type="button"
              aria-current={page() === "settings" ? "page" : undefined}
              onClick={openSettings}
            >
              <Icon name="settings" /> Configurações
            </button>
          </nav>
        </header>
        <main
          class={`page w-[min(1480px,_100%)] m-[0_auto] p-[32px_clamp(18px,_4vw,_54px)_24px] max-[820px]:pt-6 max-[560px]:px-[14px] ${page() === "details" ? "details-page max-w-[1120px]" : "search-page max-w-[1500px]"}`}
        >
          <Show when={page() === "settings"}>
            <SettingsPage
              vm={settings}
              bootstrap={bootstrap}
              playbackActive={Boolean(player.playback()) || videoWindowOpen()}
              onBack={closeSettings}
              onReconnect={() => void connect()}
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
              <section class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.button]:mt-5">
                <h2>Abra o Popcorn no desktop</h2>
                <p>O aplicativo conecta o catálogo e prepara a reprodução.</p>
              </section>
            </Show>
            <Show when={bootstrap.connection() === "connecting"}>
              <p
                class="state-message p-[40px_32px] [&_h2]:mb-2 [&_h3]:mb-2 [&_p]:max-w-[54ch] [&_p]:text-muted [&_.button]:mt-5"
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
                <button
                  class={buttonStyles({ class: "mt-5" })}
                  type="button"
                  onClick={openSettings}
                >
                  <Icon name="settings" /> Configurar catálogo
                </button>
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
                      <button
                        class={buttonStyles({ variant: "secondary" })}
                        type="button"
                        onClick={backToSearch}
                      >
                        <Icon name="arrow-left" /> Voltar à pesquisa
                      </button>
                      <Show when={details.detail()?.content}>
                        {(content) => (
                          <div class="cluster flex flex-wrap items-center justify-between gap-3">
                            <Toggle.Root
                              class={buttonStyles({ variant: "secondary" })}
                              type="button"
                              pressed={selectedEntry()?.status === "want"}
                              onPressedChange={(pressed) => {
                                if (!pressed) return;
                                const title = details.detail();
                                if (title) history.mark(title, content(), "want");
                              }}
                            >
                              <Icon name="plus" /> Quero assistir
                            </Toggle.Root>
                            <Toggle.Root
                              class={buttonStyles({ variant: "secondary" })}
                              type="button"
                              pressed={selectedEntry()?.status === "watched"}
                              onPressedChange={(pressed) => {
                                if (!pressed) return;
                                const title = details.detail();
                                if (title)
                                  history.mark(title, sources.content() ?? content(), "watched");
                              }}
                            >
                              <Icon name="check" /> Já assisti
                            </Toggle.Root>
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
                      <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
                        {history.error()}
                      </p>
                    </Show>
                  </>
                }
              >
                <section
                  class="introduction mb-6 [&_h1]:m-[4px_0_8px] [&_h1]:text-[clamp(30px,_4vw,_46px)] [&_h1]:font-normal [&_h1]:leading-[1.12] [&_h1]:tracking-[-0.035em] [&_>_.muted]:max-w-[620px] max-[560px]:[&_h1]:text-[31px]"
                  aria-labelledby="library-title"
                >
                  <p class="eyebrow text-accent-strong text-[11px] font-bold tracking-[0.13em]">
                    SEU CINEMA, SEU TEMPO
                  </p>
                  <h1 id="library-title">O que vamos assistir?</h1>
                  <p class="muted text-muted">
                    Encontre uma nova história ou continue de onde parou.
                  </p>
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
        </main>
      </div>
    </Show>
  );
}
