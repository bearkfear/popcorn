// View presenting first-use TMDB API setup and token configuration form.

import { Checkbox } from "@ark-ui/solid/checkbox";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createSignal, Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
import type { SettingsViewModel } from "./settings.viewmodel";

export function SetupPanel(props: {
  readonly vm: SettingsViewModel;
  readonly onConfigured: () => void;
  readonly onRemoved: () => void;
}) {
  const [saved, setSaved] = createSignal(false);
  const [confirmRemoval, setConfirmRemoval] = createSignal(false);
  let tokenInput: HTMLInputElement | undefined;

  async function openTmdbSettings() {
    try {
      await invoke("open_tmdb_settings");
    } catch {
      window.open("https://www.themoviedb.org/settings/api", "_blank");
    }
  }

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const token = tokenInput?.value.trim() ?? "";
    if (token) {
      void props.vm.saveToken(token).then((saved) => {
        if (saved) {
          if (tokenInput) tokenInput.value = "";
          setSaved(true);
          props.onConfigured();
        }
      });
    }
  }

  return (
    <section class="setup-panel min-w-0" aria-labelledby="setup-heading">
      <div>
        <h2 id="setup-heading" class="text-2xl font-medium tracking-tight">
          Catálogo
        </h2>
        <p class="mt-2 text-[14px] text-muted">Conecte suas próximas histórias ao Popcorn.</p>
      </div>
      <div class="mt-6 flex flex-wrap items-center gap-4 rounded-panel border border-line bg-slate-2 p-5">
        <span class="grid size-11 shrink-0 place-items-center rounded-panel bg-slate-4 text-xl text-muted">
          <Icon name="database" />
        </span>
        <div class="min-w-[140px] flex-1">
          <h3>The Movie Database</h3>
          <p class="mt-1 text-[12px] text-muted">
            Pôsteres, sinopses e detalhes de filmes e séries.
          </p>
        </div>
        <span
          class={`text-[12px] ${props.vm.status()?.configured ? "text-positive" : "text-muted"}`}
        >
          {props.vm.status()?.configured ? "Conectado" : "Não configurado"}
        </span>
      </div>

      <form
        class="setup-form mt-5 rounded-panel border border-line bg-slate-2 p-6 max-[560px]:p-4"
        onSubmit={handleSubmit}
      >
        <h3>{props.vm.status()?.configured ? "Atualizar acesso" : "Conectar ao TMDB"}</h3>
        <p class="mb-5 mt-2 text-[13px] text-muted">
          Use o token de leitura da sua conta TMDB. O acesso é validado antes de salvar.
        </p>
        <label class="mb-2 block text-[12px] font-medium" for="tmdb-token-input">
          API Read Access Token
        </label>
        <input
          ref={tokenInput}
          id="tmdb-token-input"
          class="min-h-12 w-full min-w-0 rounded-control border border-line bg-canvas-deep px-3 text-[14px]"
          type="password"
          placeholder="Cole seu token aqui"
          required
          disabled={props.vm.configurationBusy()}
          onInput={() => setSaved(false)}
          autocomplete="off"
        />
        <p class="mb-5 mt-2 text-[12px] text-muted">
          {props.vm.remember()
            ? "O acesso será lembrado neste dispositivo."
            : "O acesso ficará disponível somente nesta sessão."}
        </p>
        <Checkbox.Root
          class="checkbox-label flex items-center gap-2 text-[14px] [&_input]:absolute [&_input]:w-[1px] [&_input]:h-[1px] [&_input]:overflow-hidden [&_input]:[clip:rect(0_0_0_0)] [&_input]:[clip-path:inset(50%)] [&_input]:whitespace-nowrap [&:has(input:focus-visible)_.checkbox-control]:[outline:2px_solid_var(--focus)] [&:has(input:focus-visible)_.checkbox-control]:outline-offset-[3px] [&[data-disabled]]:cursor-default [&[data-disabled]]:opacity-[0.55]"
          checked={props.vm.remember()}
          onCheckedChange={(details) => props.vm.setRemember(details.checked === true)}
          disabled={props.vm.configurationBusy()}
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control class="checkbox-control grid w-[18px] h-[18px] flex-none place-items-center border border-line rounded-[4px] bg-slate-2 text-ink text-[12px] [&[data-state=checked]]:text-accent-contrast [&[data-state=checked]]:border-accent [&[data-state=checked]]:bg-accent">
            <Checkbox.Indicator aria-hidden="true">
              <Icon name="check" />
            </Checkbox.Indicator>
          </Checkbox.Control>
          <Checkbox.Label>Salvar neste dispositivo</Checkbox.Label>
        </Checkbox.Root>
        <Show when={props.vm.configurationError()}>
          <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
            {props.vm.configurationError()}
          </p>
        </Show>
        <Show when={saved()}>
          <p role="status" class="mt-4 text-[13px] text-positive">
            <Icon name="check" /> Acesso validado e salvo.
          </p>
        </Show>
        <button
          class={buttonStyles({ class: "mt-5" })}
          type="submit"
          disabled={props.vm.configurationBusy()}
        >
          {props.vm.configurationBusy() ? "Validando acesso..." : "Validar e salvar"}
        </button>
      </form>
      <details class="mt-5 rounded-panel border border-line p-5 text-[13px] text-muted">
        <summary class="cursor-pointer font-medium text-ink">Onde encontro meu token?</summary>
        <ol class="my-4 list-decimal space-y-2 pl-5">
          <li>Entre na sua conta TMDB e abra as configurações da API.</li>
          <li>
            Copie o <strong class="text-ink">API Read Access Token</strong>, diferente da API key.
          </li>
          <li>Cole no campo acima e clique em Validar e salvar.</li>
        </ol>
        <Show
          when={isTauri()}
          fallback={
            <a
              class="inline-flex min-h-9 items-center gap-2 text-accent-strong"
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir configurações TMDB <Icon name="external" />
            </a>
          }
        >
          <button
            class="flex min-h-9 items-center gap-2 text-accent-strong"
            type="button"
            onClick={() => void openTmdbSettings()}
          >
            Abrir configurações TMDB <Icon name="external" />
          </button>
        </Show>
      </details>
      <Show when={props.vm.status()?.configured}>
        <div class="mt-8 border-t border-slate-6 pt-5">
          <h3 class="text-[14px]">Desconectar catálogo</h3>
          <p class="mt-1 text-[12px] text-muted">
            Remove o acesso salvo ao TMDB. Você precisará de um token para explorar o catálogo
            novamente.
          </p>
          <Show
            when={confirmRemoval()}
            fallback={
              <button
                class="mt-3 min-h-10 text-[13px] text-negative"
                type="button"
                onClick={() => setConfirmRemoval(true)}
              >
                Remover configuração
              </button>
            }
          >
            <div class="mt-4 flex flex-wrap gap-3">
              <button
                class={buttonStyles({ variant: "secondary", tone: "danger" })}
                type="button"
                disabled={props.vm.configurationBusy()}
                onClick={() => {
                  setSaved(false);
                  void props.vm.clearConfiguration().then((removed) => {
                    if (removed) {
                      setConfirmRemoval(false);
                      props.onRemoved();
                    }
                  });
                }}
              >
                {props.vm.configurationBusy() ? "Removendo…" : "Confirmar remoção"}
              </button>
              <button
                class={buttonStyles({ variant: "secondary" })}
                type="button"
                disabled={props.vm.configurationBusy()}
                onClick={() => setConfirmRemoval(false)}
              >
                Cancelar
              </button>
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
}
