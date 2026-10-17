import { createEffect, createSignal, For, Show } from "solid-js";
import { Icon, type IconName } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
import type { BootstrapViewModel } from "../bootstrap/bootstrap.viewmodel";
import { CachePanel } from "./cache-panel";
import type { SettingsViewModel } from "./settings.viewmodel";
import { SetupPanel } from "./setup-panel";
import { SourceCatalogPanel } from "./source-catalog-panel";

const sections = [
  { id: "catalog", label: "Catálogo", description: "Conexão com o TMDB", icon: "database" },
  {
    id: "storage",
    label: "Armazenamento",
    description: "Espaço e arquivos temporários",
    icon: "storage",
  },
  {
    id: "sources",
    label: "Meu catálogo",
    description: "Importar e exportar fontes",
    icon: "database",
  },
  { id: "app", label: "Aplicativo", description: "Conexão e informações", icon: "monitor" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  description: string;
  icon: IconName;
}>;

export function SettingsPage(props: {
  readonly vm: SettingsViewModel;
  readonly bootstrap: BootstrapViewModel;
  readonly playbackActive: boolean;
  readonly onBack: () => void;
  readonly onReconnect: () => void;
  readonly onConfigured: () => void;
  readonly onRemoved: () => void;
  readonly onImported: () => void;
}) {
  const [section, setSection] = createSignal<string>("catalog");
  const ready = () => props.bootstrap.connection() === "ready";
  createEffect(() => {
    if (section() === "storage" && ready()) props.vm.loadCacheSettings();
  });
  const connectionLabel = () =>
    ({
      ready: "Conectado",
      connecting: "Conectando…",
      error: "Sem conexão",
      browser: "Modo navegador",
    })[props.bootstrap.connection()];

  return (
    <section class="settings-page mx-auto max-w-[1120px]" aria-labelledby="settings-title">
      <button
        class="mb-7 flex min-h-10 items-center gap-2 text-[13px] text-muted hover:text-ink"
        type="button"
        onClick={props.onBack}
      >
        <Icon name="arrow-left" /> Voltar ao que estava vendo
      </button>
      <div class="mb-9 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="mb-2 text-[11px] font-bold tracking-[0.15em] text-accent-strong">
            DO SEU JEITO
          </p>
          <h1
            id="settings-title"
            class="text-[clamp(32px,4vw,44px)] font-normal leading-tight tracking-[-0.04em]"
          >
            Configurações
          </h1>
          <p class="mt-3 text-[14px] text-muted">
            Um lugar para cuidar de tudo que faz seu cinema funcionar.
          </p>
        </div>
        <span
          class={`flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-[12px] ${ready() ? "text-positive" : "text-muted"}`}
          role="status"
        >
          <span class={`size-1.5 rounded-full ${ready() ? "bg-positive" : "bg-slate-9"}`} />
          {connectionLabel()}
        </span>
      </div>
      <div class="grid grid-cols-[230px_minmax(0,1fr)] items-start gap-10 max-[760px]:grid-cols-1 max-[760px]:gap-7">
        <aside class="sticky top-24 max-[760px]:static">
          <nav
            aria-label="Seções das configurações"
            class="flex flex-col gap-2 max-[760px]:grid max-[760px]:grid-cols-2 max-[760px]:gap-2"
          >
            <For each={sections}>
              {(item) => (
                <button
                  type="button"
                  aria-current={section() === item.id ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                  class="group flex min-w-0 items-center gap-3 rounded-panel border border-transparent px-4 py-3 text-left text-muted transition-colors hover:bg-slate-3 hover:text-ink aria-[current=page]:border-slate-6 aria-[current=page]:bg-slate-4 aria-[current=page]:text-ink max-[760px]:flex-1 max-[760px]:flex-col max-[760px]:gap-2 max-[760px]:px-2 max-[760px]:text-center"
                >
                  <Icon
                    name={item.icon}
                    class="text-[19px] group-aria-[current=page]:text-accent-strong"
                  />
                  <span>
                    <span class="block text-[13px] font-medium">{item.label}</span>
                    <span class="mt-0.5 block text-[11px] text-muted max-[760px]:hidden">
                      {item.description}
                    </span>
                  </span>
                </button>
              )}
            </For>
          </nav>
          <div class="mt-8 border-t border-slate-6 px-4 pt-5 text-[12px] text-muted max-[760px]:hidden">
            <Icon name="shield" class="mb-2 text-[20px]" />
            <p>Seu espaço, seu dispositivo.</p>
            <p class="mt-1 text-[11px]">Seu progresso de filmes e séries fica salvo por aqui.</p>
          </div>
        </aside>
        <div class="min-w-0">
          <Show when={section() !== "app" && !ready()}>
            <div class="rounded-panel border border-line bg-slate-2 p-7">
              <Icon
                name={props.bootstrap.connection() === "browser" ? "monitor" : "refresh"}
                class="mb-4 text-[26px] text-muted"
              />
              <h2 class="text-xl">
                {props.bootstrap.connection() === "browser"
                  ? "Continue no aplicativo"
                  : "Vamos restabelecer a conexão"}
              </h2>
              <p class="mt-3 text-[14px] text-muted">
                {props.bootstrap.connection() === "browser"
                  ? "Abra o Popcorn no desktop para configurar o catálogo e gerenciar o armazenamento."
                  : "As configurações estarão disponíveis quando o Popcorn se conectar ao serviço local."}
              </p>
              <button
                type="button"
                class={buttonStyles({ variant: "secondary", class: "mt-5" })}
                disabled={props.bootstrap.connection() === "connecting"}
                onClick={props.onReconnect}
              >
                <Icon name="refresh" /> Tentar novamente
              </button>
            </div>
          </Show>
          <Show when={section() === "catalog" && ready()}>
            <SetupPanel
              vm={props.vm}
              onConfigured={props.onConfigured}
              onRemoved={props.onRemoved}
            />
          </Show>
          <Show when={section() === "sources" && ready()}>
            <SourceCatalogPanel
              vm={props.vm.sourceCatalog}
              playbackActive={props.playbackActive}
              onImported={props.onImported}
            />
          </Show>
          <Show when={section() === "storage" && ready()}>
            <CachePanel vm={props.vm} playbackActive={props.playbackActive} />
          </Show>
          <Show when={section() === "app"}>
            <div>
              <h2 class="text-2xl font-medium tracking-tight">Aplicativo</h2>
              <p class="mt-2 text-[14px] text-muted">Tudo pronto para a próxima sessão.</p>
              <section
                class="mt-6 overflow-hidden rounded-panel border border-line bg-slate-2"
                aria-label="Conexão do aplicativo"
              >
                <div class="flex items-start gap-4 p-6">
                  <span class="grid size-10 shrink-0 place-items-center rounded-panel bg-slate-4">
                    <Icon name="monitor" class="text-xl" />
                  </span>
                  <div>
                    <h3>Serviço local</h3>
                    <p class="mt-1 text-[13px] text-muted">
                      O Popcorn usa um serviço neste dispositivo para buscar títulos e preparar seus
                      vídeos.
                    </p>
                  </div>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-4 border-t border-slate-6 bg-slate-3 px-6 py-4">
                  <span class="text-[13px] text-muted">{connectionLabel()}</span>
                  <button
                    type="button"
                    class={buttonStyles({ variant: "secondary" })}
                    disabled={
                      props.bootstrap.connection() === "connecting" ||
                      props.vm.configurationBusy() ||
                      props.vm.cacheBusy() ||
                      props.vm.sourceCatalog.busy()
                    }
                    onClick={props.onReconnect}
                  >
                    <Icon name="refresh" />{" "}
                    {props.bootstrap.connection() === "connecting" ? "Conectando…" : "Reconectar"}
                  </button>
                </div>
              </section>
              <Show when={props.bootstrap.connectionError()}>
                <p role="alert" class="mt-4 text-[13px] text-negative">
                  {props.bootstrap.connectionError()}
                </p>
              </Show>
              <section
                class="mt-6 rounded-panel border border-line p-6"
                aria-label="Sobre o Popcorn"
              >
                <p class="text-lg font-bold tracking-tight">
                  popcorn<span class="text-accent">.</span>
                </p>
                <p class="mt-2 text-[13px] text-muted">
                  Seu cinema, seu tempo. Filmes, séries e histórias para continuar.
                </p>
                <dl class="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-6 pt-4 text-[12px]">
                  <dt class="text-muted">Catálogo de fontes</dt>
                  <dd class="break-all">{props.bootstrap.catalogVersion() || "Indisponível"}</dd>
                </dl>
              </section>
            </div>
          </Show>
        </div>
      </div>
    </section>
  );
}
