// View presenting first-use TMDB API setup and token configuration form.

import { Checkbox } from "@ark-ui/solid/checkbox";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
import type { SettingsViewModel } from "./settings.viewmodel";

export function SetupPanel(props: {
  readonly vm: SettingsViewModel;
  readonly onConfigured: () => void;
  readonly onRemoved: () => void;
}) {
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
      if (tokenInput) tokenInput.value = "";
      void props.vm.saveToken(token).then((saved) => {
        if (saved) props.onConfigured();
      });
    }
  }

  return (
    <section
      class="setup-panel grid grid-cols-[minmax(0,_1.2fr)_minmax(300px,_0.8fr)] gap-[clamp(28px,_6vw,_72px)] mt-8 p-[clamp(24px,_5vw,_56px)] border border-line rounded-[10px] [background:linear-gradient(135deg,_var(--slate-3),_var(--slate-2))] shadow-[0_24px_70px_var(--black-a4)] max-[820px]:grid-cols-1"
      aria-labelledby="setup-heading"
    >
      <div class="setup-copy [&_h2]:m-[8px_0_12px] [&_h2]:text-[clamp(28px,_4vw,_42px)] [&_h2]:font-normal [&_ol]:m-[24px_0] [&_ol]:pl-[22px] [&_ol]:text-muted [:where(&)_li_+_li]:mt-2">
        <h2 id="setup-heading">Configuração do TMDB</h2>
        <p class="muted text-muted">
          Para navegar pelo catálogo completo com posters e detalhes, informe seu token de leitura
          da API.
        </p>
        <ol>
          <li>Entre na sua conta TMDB e abra as configurações da API.</li>
          <li>
            Copie o <strong>API Read Access Token</strong> (não use a API key).
          </li>
          <li>Cole no campo ao lado. O acesso é validado antes de salvar.</li>
        </ol>
        <Show
          when={isTauri()}
          fallback={
            <a
              class={`${buttonStyles} secondary external-link inline-flex items-center no-underline`}
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir configurações TMDB
            </a>
          }
        >
          <button
            class={`${buttonStyles} secondary`}
            type="button"
            onClick={() => {
              void openTmdbSettings();
            }}
          >
            Abrir configurações TMDB
          </button>
        </Show>
        <p class="settings-address mt-2 text-muted text-[12px] wrap-anywhere">
          https://www.themoviedb.org/settings/api
        </p>
      </div>

      <form
        class="setup-form self-center p-6 border border-line rounded-panel bg-black-a7 [&_>_label:not(.checkbox-label)]:block [&_>_label:not(.checkbox-label)]:mb-[6px] [&_>_label:not(.checkbox-label)]:text-muted [&_>_label:not(.checkbox-label)]:text-[12px] [&_>_label:not(.checkbox-label)]:font-bold [&_input[type=password]]:w-full [&_input[type=password]]:min-h-[44px] [&_input[type=password]]:p-[9px_12px] [&_input[type=password]]:border [&_input[type=password]]:border-line [&_input[type=password]]:rounded-control [&_input[type=password]]:bg-slate-2 [&_input[type=password]]:text-ink [&_>_.muted]:m-[8px_0_16px] [&_>_.muted]:text-[12px] max-[560px]:p-4"
        onSubmit={handleSubmit}
      >
        <label for="tmdb-token-input">API Read Access Token</label>
        <input
          ref={tokenInput}
          id="tmdb-token-input"
          type="password"
          placeholder="Cole seu token aqui"
          required
          disabled={props.vm.configurationBusy()}
          autocomplete="off"
        />
        <p class="muted text-muted">
          O token é mantido em memória e validado diretamente com o TMDB.
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
        <button class={buttonStyles} type="submit" disabled={props.vm.configurationBusy()}>
          {props.vm.configurationBusy() ? "Validando acesso..." : "Salvar e continuar"}
        </button>
        <Show when={props.vm.status()?.configured}>
          <div class="cluster flex flex-wrap items-center justify-between gap-3">
            <button
              class={`${buttonStyles} secondary`}
              type="button"
              disabled={props.vm.configurationBusy()}
              onClick={props.onConfigured}
            >
              Voltar ao catálogo
            </button>
            <button
              class={`${buttonStyles} secondary danger`}
              type="button"
              disabled={props.vm.configurationBusy()}
              onClick={() => {
                void props.vm.clearConfiguration().then((removed) => {
                  if (removed) props.onRemoved();
                });
              }}
            >
              Remover configuração
            </button>
          </div>
        </Show>
      </form>
    </section>
  );
}
