import type { TmdbStatus } from "@popcorn/sdk";
import { onMount, Show } from "solid-js";
import tmdbLogo from "./assets/tmdb.svg";
import { createBootstrapViewModel } from "./features/bootstrap/bootstrap.viewmodel";
import { createCatalogViewModel } from "./features/catalog/catalog.viewmodel";
import { CatalogControls } from "./features/catalog/catalog-controls";
import { PosterGrid } from "./features/catalog/poster-grid";
import { createDetailsViewModel } from "./features/details/details.viewmodel";
import { DetailsPanel } from "./features/details/details-panel";
import { createPlayerViewModel } from "./features/player/player.viewmodel";
import { PlayerOverlay } from "./features/player/player-overlay";
import { CachePanel } from "./features/settings/cache-panel";
import { createSettingsViewModel } from "./features/settings/settings.viewmodel";
import { SetupPanel } from "./features/settings/setup-panel";
import { createSourcesViewModel } from "./features/sources/sources.viewmodel";

export function App() {
  const bootstrap = createBootstrapViewModel();
  const catalogClient = () => bootstrap.getClients().catalog;
  const settings = createSettingsViewModel(catalogClient, () => bootstrap.getClients().storage);
  const details = createDetailsViewModel(catalogClient);
  const sources = createSourcesViewModel(() => bootstrap.getClients().source);
  const player = createPlayerViewModel(() => bootstrap.getClients().playback);

  function resetSelection() {
    details.resetDetail();
    sources.reset();
    player.close();
  }

  const catalog = createCatalogViewModel(
    catalogClient,
    resetSelection,
    settings.handleCatalogError,
  );
  const setupVisible = () =>
    catalog.source() === "online" &&
    (settings.settingsOpen() || settings.status()?.configured === false);

  function loadCatalog(currentStatus: TmdbStatus | undefined = settings.status()) {
    if (catalog.source() === "local" || currentStatus?.configured) {
      void catalog.loadCatalog();
    }
    if (catalog.source() === "online" && currentStatus?.configured) {
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

  function changeSource(source: "online" | "local") {
    if (source === "online" && !settings.status()?.configured) {
      catalog.setSource(source);
      settings.setSettingsOpen(true);
      resetSelection();
      return;
    }
    catalog.changeSource(source);
  }

  function configured() {
    settings.setSettingsOpen(false);
    if (catalog.source() !== "online") catalog.setSource("online");
    loadCatalog();
  }

  function openSettings() {
    resetSelection();
    catalog.setSource("online");
    settings.setSettingsOpen(true);
  }

  function toggleCache() {
    if (settings.cacheOpen()) settings.setCacheOpen(false);
    else {
      settings.setCacheOpen(true);
      void settings.loadCacheSettings();
    }
  }

  onMount(() => {
    void bootstrap.listenForShutdown();
    void connect();
  });

  return (
    <div class="app-shell">
      <header class="app-header cluster">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true">
            P
          </span>
          <span class="wordmark">
            popcorn<span class="wordmark-dot">.</span>
          </span>
        </div>
        <span class="header-tagline">FILMES E SÉRIES</span>
      </header>

      <main class="page">
        <section class="introduction" aria-labelledby="library-title">
          <p class="eyebrow">CATÁLOGO</p>
          <h1 id="library-title">O que você quer assistir?</h1>
          <p class="muted">
            Descubra filmes e séries em uma biblioteca feita para navegar sem esforço.
          </p>
        </section>

        <section class="connection-panel cluster" aria-label="Conexão com o serviço local">
          <div>
            <div class="cluster">
              <strong>Serviço local</strong>
              <span class={`status status-${bootstrap.connection()}`} role="status">
                {
                  {
                    connecting: "Conectando",
                    ready: "Conectado",
                    error: "Serviço indisponível",
                    browser: "Modo navegador",
                  }[bootstrap.connection()]
                }
              </span>
            </div>
            <p class="connection-caption muted">
              {bootstrap.connection() === "browser"
                ? "Abra o Popcorn no desktop para conectar seu catálogo."
                : catalog.source() === "local"
                  ? `Snapshot instalado: ${bootstrap.catalogVersion() || "versão não informada"}`
                  : settings.status()?.configured
                    ? `TMDB configurado · ${settings.status()?.remembered ? "salvo neste dispositivo" : "sessão ou ambiente"}`
                    : "Seu acesso ao TMDB é configurado neste dispositivo."}
            </p>
          </div>
          <Show when={bootstrap.connection() !== "browser"}>
            <div class="cluster">
              <Show when={catalogClient() && settings.status()?.configured}>
                <button
                  class="button secondary"
                  type="button"
                  disabled={settings.configurationBusy()}
                  onClick={openSettings}
                >
                  Configurar TMDB
                </button>
              </Show>
              <Show when={bootstrap.getClients().storage}>
                <button
                  class="button secondary"
                  type="button"
                  disabled={settings.cacheBusy()}
                  onClick={toggleCache}
                >
                  Armazenamento
                </button>
              </Show>
              <button
                class="button secondary"
                type="button"
                disabled={bootstrap.connection() === "connecting" || settings.configurationBusy()}
                onClick={() => void connect()}
              >
                {bootstrap.connection() === "connecting" ? "Conectando..." : "Reconectar serviço"}
              </button>
            </div>
          </Show>
        </section>

        <Show when={settings.cacheOpen()}>
          <CachePanel vm={settings} playbackActive={Boolean(player.playback())} />
        </Show>
        <Show when={bootstrap.connectionError()}>
          <p class="service-error" role="alert">
            {bootstrap.connectionError()}
          </p>
        </Show>

        <nav class="source-tabs cluster" aria-label="Origem do catálogo">
          <button
            class="button secondary"
            type="button"
            aria-pressed={catalog.source() === "online"}
            disabled={settings.configurationBusy()}
            onClick={() => changeSource("online")}
          >
            Explorar TMDB{catalog.source() === "online" ? " ✓" : ""}
          </button>
          <button
            class="button secondary"
            type="button"
            aria-pressed={catalog.source() === "local"}
            disabled={settings.configurationBusy()}
            onClick={() => changeSource("local")}
          >
            Offline / local{catalog.source() === "local" ? " ✓" : ""}
          </button>
        </nav>

        <Show when={bootstrap.connection() === "browser"}>
          <section class="state-message catalog-panel">
            <h2>Seu catálogo está no desktop</h2>
            <p>
              Esta página não inicia o serviço local. Abra o aplicativo Popcorn para configurar o
              TMDB ou consultar o catálogo instalado.
            </p>
          </section>
        </Show>
        <Show when={bootstrap.connection() === "connecting"}>
          <p class="state-message" role="status">
            Iniciando o serviço e verificando a configuração...
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

        <Show
          when={
            !setupVisible() &&
            bootstrap.connection() !== "browser" &&
            bootstrap.connection() !== "connecting"
          }
        >
          <Show when={catalog.source() === "online" && settings.status()?.configured}>
            <CatalogControls vm={catalog} />
          </Show>
          <div class="library-grid">
            <div>
              <PosterGrid
                vm={catalog}
                selectedTitle={details.selected}
                onSelectTitle={(title) =>
                  void details.openTitle(
                    title,
                    catalog.source() === "online",
                    sources.selectContent,
                  )
                }
              />
            </div>
            <DetailsPanel
              vm={details}
              online={catalog.source() === "online"}
              sources={sources}
              player={player}
            />
          </div>
        </Show>

        <footer class="page-footer" role="contentinfo" aria-label="Sobre e créditos">
          <div class="cluster">
            <span>Popcorn · Descoberta de filmes e séries</span>
            <span>Reprodução progressiva por fontes do usuário.</span>
          </div>
          <div class="attribution">
            <img src={tmdbLogo} width="80" height="11" alt="TMDB" />
            <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          </div>
        </footer>
      </main>

      <PlayerOverlay
        vm={player}
        title={details.detail()?.title || details.selected()?.title || ""}
      />
    </div>
  );
}
