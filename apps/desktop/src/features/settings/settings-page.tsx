import { Button } from "@egcs/newui/actions";
import { Badge, Card } from "@egcs/newui/content";
import { Callout } from "@egcs/newui/feedback";
import { Sidebar, VerticalMenu } from "@egcs/newui/navigation";
import { createEffect, createSignal, For, Show } from "solid-js";
import { Icon, type IconName } from "../../shared/ui/icon";
import type { BootstrapViewModel } from "../bootstrap/bootstrap.viewmodel";
import { CachePanel } from "./cache-panel";
import type { SettingsViewModel } from "./settings.viewmodel";
import { SetupPanel } from "./setup-panel";
import { SourceCatalogPanel } from "./source-catalog-panel";

const sections = [
  { id: "catalog", label: "Catálogo", icon: "database" },
  { id: "storage", label: "Armazenamento", icon: "storage" },
  { id: "sources", label: "Minhas fontes", icon: "folder" },
  { id: "app", label: "Aplicativo", icon: "monitor" },
] as const satisfies ReadonlyArray<{ id: string; label: string; icon: IconName }>;

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
  const [menuOpen, setMenuOpen] = createSignal(false);
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
    <section class="settings-page" aria-labelledby="settings-title">
      <header class="settings-header">
        <div>
          <Button
            variant="ghost"
            tone="neutral"
            size="sm"
            class="mb-2"
            startIcon={<Icon name="arrow-left" />}
            onClick={props.onBack}
          >
            Voltar à biblioteca
          </Button>
          <h1 id="settings-title" class="text-[28px] font-medium leading-tight tracking-tight">
            Configurações
          </h1>
          <p class="mt-1 text-sm text-muted">Seu catálogo, seus arquivos, seu jeito.</p>
        </div>
        <Badge tone={ready() ? "success" : "neutral"} rounded role="status">
          {connectionLabel()}
        </Badge>
      </header>
      <Sidebar.Root
        class="settings-layout"
        defaultWidth={216}
        minWidth={216}
        mobileOpen={menuOpen()}
        onMobileOpenChange={setMenuOpen}
      >
        <Sidebar.Panel aria-label="Navegação das configurações">
          <Sidebar.Header>
            <Sidebar.Label>Configurações</Sidebar.Label>
          </Sidebar.Header>
          <Sidebar.Body>
            <VerticalMenu.Root
              class="settings-navigation"
              density="comfortable"
              aria-label="Seções das configurações"
            >
              <VerticalMenu.List>
                <For each={sections}>
                  {(item) => (
                    <VerticalMenu.Item>
                      <VerticalMenu.Link
                        href="#settings"
                        current={section() === item.id}
                        onClick={(event) => {
                          event.preventDefault();
                          setSection(item.id);
                          setMenuOpen(false);
                        }}
                      >
                        <VerticalMenu.Icon>
                          <Icon name={item.icon} />
                        </VerticalMenu.Icon>
                        {item.label}
                      </VerticalMenu.Link>
                    </VerticalMenu.Item>
                  )}
                </For>
              </VerticalMenu.List>
            </VerticalMenu.Root>
          </Sidebar.Body>
        </Sidebar.Panel>
        <Sidebar.Main class="md:pl-6" aria-label="Conteúdo das configurações">
          <div class="mb-4 md:hidden">
            <Sidebar.Toggle aria-label="Abrir seções das configurações" />
          </div>
          <Show when={section() !== "app" && !ready()}>
            <Card.Root variant="soft">
              <Card.Header>
                <Card.Title as="h2">
                  {props.bootstrap.connection() === "browser"
                    ? "Continue no aplicativo"
                    : "Vamos restabelecer a conexão"}
                </Card.Title>
                <Card.Description class="app-card-description">
                  {props.bootstrap.connection() === "browser"
                    ? "Abra o Popcorn no desktop para configurar seu catálogo e armazenamento."
                    : "As configurações ficam disponíveis quando o serviço local estiver conectado."}
                </Card.Description>
              </Card.Header>
              <Card.Footer>
                <Button
                  variant="outline"
                  tone="neutral"
                  disabled={props.bootstrap.connection() === "connecting"}
                  onClick={props.onReconnect}
                  startIcon={<Icon name="refresh" />}
                >
                  Tentar novamente
                </Button>
              </Card.Footer>
            </Card.Root>
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
            <div class="grid gap-4">
              <div>
                <h2 class="text-xl font-medium">Aplicativo</h2>
                <p class="mt-1 text-sm text-muted">Tudo pronto para a próxima sessão.</p>
              </div>
              <Card.Root variant="soft">
                <Card.Header>
                  <Card.Title as="h3">Conexão com o Popcorn</Card.Title>
                  <Card.Description class="app-card-description">
                    O serviço local busca os títulos e prepara seus vídeos.
                  </Card.Description>
                  <Card.Actions>
                    <Badge tone={ready() ? "success" : "neutral"}>{connectionLabel()}</Badge>
                  </Card.Actions>
                </Card.Header>
                <Card.Footer>
                  <Button
                    variant="outline"
                    tone="neutral"
                    startIcon={<Icon name="refresh" />}
                    disabled={
                      props.bootstrap.connection() === "connecting" ||
                      props.vm.configurationBusy() ||
                      props.vm.cacheBusy() ||
                      props.vm.sourceCatalog.busy()
                    }
                    onClick={props.onReconnect}
                  >
                    Reconectar
                  </Button>
                </Card.Footer>
              </Card.Root>
              <Show when={props.bootstrap.connectionError()}>
                <Callout.Root tone="danger" role="alert">
                  <Callout.Content>
                    <Callout.Description>{props.bootstrap.connectionError()}</Callout.Description>
                  </Callout.Content>
                </Callout.Root>
              </Show>
              <Card.Root>
                <Card.Header>
                  <Card.Title as="h3">
                    popcorn<span class="text-accent">.</span>
                  </Card.Title>
                  <Card.Description class="app-card-description">
                    Seu cinema, seu tempo.
                  </Card.Description>
                </Card.Header>
                <Card.Content>
                  <dl class="flex flex-wrap justify-between gap-2 text-xs">
                    <dt class="text-muted">Catálogo de fontes</dt>
                    <dd class="break-all">{props.bootstrap.catalogVersion() || "Indisponível"}</dd>
                  </dl>
                </Card.Content>
              </Card.Root>
            </div>
          </Show>
        </Sidebar.Main>
      </Sidebar.Root>
    </section>
  );
}
