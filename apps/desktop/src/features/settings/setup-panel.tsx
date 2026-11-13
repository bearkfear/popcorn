// TMDB connection, credential updates and disconnect flow.
import { Button } from "@egcs/newui/actions";
import { Badge, Card } from "@egcs/newui/content";
import { Callout } from "@egcs/newui/feedback";
import { Checkbox, Field, Input } from "@egcs/newui/forms";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createFormControl } from "solid-forms";
import { createSignal, Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import type { SettingsViewModel } from "./settings.viewmodel";
import "./setup-panel.css";

export function SetupPanel(props: {
  readonly vm: SettingsViewModel;
  readonly onConfigured: () => void;
  readonly onRemoved: () => void;
}) {
  const token = createFormControl("", {
    required: true,
    validators: (value) => (value.trim() ? null : { required: true }),
  });
  const [editing, setEditing] = createSignal(false);
  const [confirmRemoval, setConfirmRemoval] = createSignal(false);
  const [feedback, setFeedback] = createSignal<"saved" | "removed">();
  const configured = () => Boolean(props.vm.status()?.configured);
  const showForm = () => !configured() || editing();
  const invalid = () => token.isSubmitted && !token.isValid;
  let tokenInput: HTMLInputElement | undefined;
  let connectedHeading: HTMLHeadingElement | undefined;
  let updateButton: HTMLButtonElement | undefined;

  function resetToken() {
    token.setValue("");
    token.markTouched(false);
    token.markSubmitted(false);
  }

  async function openTmdbSettings() {
    try {
      await invoke("open_tmdb_settings");
    } catch {
      window.open("https://www.themoviedb.org/settings/api", "_blank", "noopener,noreferrer");
    }
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (props.vm.configurationBusy()) return;
    token.markTouched(true);
    token.markSubmitted(true);
    if (!token.isValid) {
      tokenInput?.focus();
      return;
    }
    setFeedback(undefined);
    const saved = await props.vm.saveToken(token.value.trim());
    if (saved) {
      resetToken();
      setEditing(false);
      setFeedback("saved");
      props.onConfigured();
      queueMicrotask(() => connectedHeading?.focus());
    }
  }

  async function disconnect() {
    if (props.vm.configurationBusy()) return;
    setFeedback(undefined);
    const removed = await props.vm.clearConfiguration();
    if (!removed) return;
    setConfirmRemoval(false);
    if (!configured()) {
      resetToken();
      setEditing(false);
      setFeedback("removed");
      props.onRemoved();
      queueMicrotask(() => tokenInput?.focus());
    }
  }

  function editToken() {
    setConfirmRemoval(false);
    setFeedback(undefined);
    setEditing(true);
    queueMicrotask(() => tokenInput?.focus());
  }

  return (
    <section class="setup-panel tmdb-panel min-w-0" aria-labelledby="setup-heading">
      <header class="mb-5">
        <p class="mb-1 text-[11px] font-semibold tracking-[0.16em] text-accent-strong">
          SEU CATÁLOGO
        </p>
        <h2 id="setup-heading" class="text-[30px] font-medium leading-tight tracking-[-0.04em]">
          Cada história, em detalhes.
        </h2>
        <p class="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted">
          Pôsteres, sinopses e descobertas para a sua próxima sessão.
        </p>
      </header>

      <Card.Root class="tmdb-card overflow-hidden" variant="soft">
        <Card.Header class="tmdb-provider">
          <div class="flex min-w-0 items-center gap-3.5">
            <span class="tmdb-provider-mark" aria-hidden="true">
              <Icon name="database" />
            </span>
            <div class="min-w-0">
              <Card.Title as="h3">The Movie Database</Card.Title>
              <Card.Description>Seu catálogo, conectado ao TMDB.</Card.Description>
            </div>
          </div>
          <Card.Actions>
            <Badge tone={configured() ? "success" : "neutral"} rounded role="status">
              <span
                class={`size-1.5 rounded-full ${configured() ? "bg-positive" : "bg-slate-9"}`}
              />
              {configured() ? "Conectado" : "Não conectado"}
            </Badge>
          </Card.Actions>
        </Card.Header>

        <Card.Content class="tmdb-content">
          <Show when={props.vm.configurationError()}>
            <Callout.Root tone="danger" class="mb-5" role="alert">
              <Callout.Content>
                <Callout.Title>Não foi possível concluir</Callout.Title>
                <Callout.Description>{props.vm.configurationError()}</Callout.Description>
              </Callout.Content>
            </Callout.Root>
          </Show>
          <Show when={feedback() === "removed"}>
            <Callout.Root tone="neutral" class="mb-5" role="status">
              <Callout.Content>
                <Callout.Title>TMDB desconectado</Callout.Title>
                <Callout.Description>
                  Você pode conectar novamente quando quiser.
                </Callout.Description>
              </Callout.Content>
            </Callout.Root>
          </Show>

          <Show
            when={showForm()}
            fallback={
              <div>
                <div class="tmdb-connected-summary">
                  <span class="tmdb-connected-icon" aria-hidden="true">
                    <Icon name="check" />
                  </span>
                  <div>
                    <h3 ref={connectedHeading} tabindex="-1" class="outline-none">
                      Tudo pronto para explorar.
                    </h3>
                    <p class="mt-1 text-sm leading-relaxed text-muted">
                      O Popcorn já pode buscar os detalhes dos seus filmes e séries.
                    </p>
                  </div>
                </div>
                <dl class="tmdb-connection-details">
                  <div>
                    <dt>Integração</dt>
                    <dd>TMDB</dd>
                  </div>
                  <div>
                    <dt>Acesso</dt>
                    <dd>
                      {props.vm.status()?.remembered
                        ? "Salvo neste dispositivo"
                        : "Somente nesta sessão"}
                    </dd>
                  </div>
                </dl>
                <Show when={feedback() === "saved"}>
                  <p class="mt-5 flex items-center gap-2 text-sm text-positive" role="status">
                    <Icon name="check" /> Conexão validada com sucesso.
                  </p>
                </Show>
                <div class="mt-6 border-t border-line pt-6">
                  <Show
                    when={confirmRemoval()}
                    fallback={
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <Button
                          ref={updateButton}
                          variant="outline"
                          tone="neutral"
                          onClick={editToken}
                        >
                          Atualizar token
                        </Button>
                        <Button
                          variant="ghost"
                          tone="danger"
                          onClick={() => setConfirmRemoval(true)}
                        >
                          Desconectar
                        </Button>
                      </div>
                    }
                  >
                    <Callout.Root tone="warning">
                      <Callout.Content>
                        <Callout.Title>Desconectar o TMDB?</Callout.Title>
                        <Callout.Description>
                          O acesso salvo será removido. Para consultar o catálogo, você precisará
                          conectar novamente.
                        </Callout.Description>
                        <Callout.Actions>
                          <Button
                            tone="danger"
                            loading={props.vm.configurationBusy()}
                            onClick={() => void disconnect()}
                          >
                            {props.vm.configurationBusy() ? "Desconectando…" : "Sim, desconectar"}
                          </Button>
                          <Button
                            variant="outline"
                            tone="neutral"
                            disabled={props.vm.configurationBusy()}
                            onClick={() => {
                              setConfirmRemoval(false);
                              queueMicrotask(() => updateButton?.focus());
                            }}
                          >
                            Manter conexão
                          </Button>
                        </Callout.Actions>
                      </Callout.Content>
                    </Callout.Root>
                  </Show>
                </div>
              </div>
            }
          >
            <div class="tmdb-connect-layout">
              <form
                class="setup-form min-w-0"
                noValidate
                onSubmit={(event) => void handleSubmit(event)}
              >
                <div class="mb-4">
                  <h3>{configured() ? "Atualizar seu acesso" : "Conecte sua conta"}</h3>
                  <p class="mt-1 text-sm leading-relaxed text-muted">
                    {configured()
                      ? "Cole um novo token para substituir o acesso atual."
                      : "Cole o token de leitura da sua conta para começar."}
                  </p>
                </div>
                <Field.Root
                  required
                  invalid={invalid()}
                  disabled={props.vm.configurationBusy()}
                  size="md"
                >
                  <Field.Label>Token de leitura</Field.Label>
                  <Input
                    ref={tokenInput}
                    name="tmdb-token"
                    type="password"
                    value={token.value}
                    placeholder="Cole seu token do TMDB"
                    autocomplete="off"
                    spellcheck={false}
                    onInput={(event) => {
                      token.setValue(event.currentTarget.value);
                      setFeedback(undefined);
                    }}
                    onBlur={() => token.markTouched(true)}
                  />
                  <Show
                    when={invalid()}
                    fallback={
                      <Field.Description>
                        Use o API Read Access Token, disponível na sua conta TMDB.
                      </Field.Description>
                    }
                  >
                    <Field.ErrorText>Cole seu token de leitura para continuar.</Field.ErrorText>
                  </Show>
                </Field.Root>
                <div class="my-4">
                  <Checkbox.Root
                    tone="primary"
                    checked={props.vm.remember()}
                    onCheckedChange={({ checked }) => props.vm.setRemember(checked === true)}
                    disabled={props.vm.configurationBusy()}
                    aria-describedby="tmdb-remember-description"
                  >
                    <Checkbox.Control />
                    <Checkbox.Label>Lembrar neste dispositivo</Checkbox.Label>
                  </Checkbox.Root>
                  <p
                    id="tmdb-remember-description"
                    class="mt-1 pl-[26px] text-xs leading-relaxed text-muted"
                  >
                    Se desmarcado, o acesso vale somente para esta sessão.
                  </p>
                </div>
                <div class="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    loading={props.vm.configurationBusy()}
                    startIcon={<Icon name="external" />}
                  >
                    {props.vm.configurationBusy()
                      ? "Verificando token…"
                      : configured()
                        ? "Salvar novo token"
                        : "Conectar ao TMDB"}
                  </Button>
                  <Show when={configured()}>
                    <Button
                      variant="ghost"
                      tone="neutral"
                      disabled={props.vm.configurationBusy()}
                      onClick={() => {
                        resetToken();
                        setEditing(false);
                        queueMicrotask(() => updateButton?.focus());
                      }}
                    >
                      Cancelar
                    </Button>
                  </Show>
                </div>
                <p class="mt-2 text-xs leading-relaxed text-muted">
                  O acesso é verificado antes de ser salvo.
                </p>
              </form>
              <aside class="tmdb-guide" aria-labelledby="tmdb-guide-title">
                <h4 id="tmdb-guide-title" class="text-sm font-medium text-ink">
                  Ainda não tem o token?
                </h4>
                <ol class="tmdb-guide-steps">
                  <li>
                    <span>1</span>
                    <p>Entre na sua conta TMDB e abra as configurações da API.</p>
                  </li>
                  <li>
                    <span>2</span>
                    <p>
                      Copie o <strong>API Read Access Token</strong>.
                    </p>
                  </li>
                  <li>
                    <span>3</span>
                    <p>Cole aqui e conecte. É só fazer isso uma vez se escolher lembrar.</p>
                  </li>
                </ol>
                <Show
                  when={isTauri()}
                  fallback={
                    <a
                      class="tmdb-external-link"
                      href="https://www.themoviedb.org/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir o TMDB <Icon name="external" />
                    </a>
                  }
                >
                  <Button variant="link" size="sm" onClick={() => void openTmdbSettings()}>
                    Abrir o TMDB <Icon name="external" />
                  </Button>
                </Show>
              </aside>
            </div>
          </Show>
        </Card.Content>
      </Card.Root>
      <p class="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Icon name="shield" class="mt-0.5 shrink-0 text-sm" />
        Seu token conecta o catálogo. Seus arquivos e seu histórico continuam no Popcorn.
      </p>
    </section>
  );
}
