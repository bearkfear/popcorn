// View presenting first-use TMDB API setup and token configuration form.

import { Button } from "@kobalte/core/button";
import { Checkbox } from "@kobalte/core/checkbox";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Show } from "solid-js";
import { Icon } from "../../shared/ui/icon";
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
    <section class="setup-panel" aria-labelledby="setup-heading">
      <div class="setup-copy">
        <h2 id="setup-heading">Configuração do TMDB</h2>
        <p class="muted">
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
              class="button secondary external-link"
              href="https://www.themoviedb.org/settings/api"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir configurações TMDB
            </a>
          }
        >
          <Button
            class="button secondary"
            type="button"
            onClick={() => {
              void openTmdbSettings();
            }}
          >
            Abrir configurações TMDB
          </Button>
        </Show>
        <p class="settings-address">https://www.themoviedb.org/settings/api</p>
      </div>

      <form class="setup-form" onSubmit={handleSubmit}>
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
        <p class="muted">O token é mantido em memória e validado diretamente com o TMDB.</p>
        <Checkbox
          class="checkbox-label"
          checked={props.vm.remember()}
          onChange={props.vm.setRemember}
          disabled={props.vm.configurationBusy()}
        >
          <Checkbox.Input />
          <Checkbox.Control class="checkbox-control">
            <Checkbox.Indicator aria-hidden="true">
              <Icon name="check" />
            </Checkbox.Indicator>
          </Checkbox.Control>
          <Checkbox.Label>Salvar neste dispositivo</Checkbox.Label>
        </Checkbox>
        <Show when={props.vm.configurationError()}>
          <p class="error-text" role="alert">
            {props.vm.configurationError()}
          </p>
        </Show>
        <Button class="button" type="submit" disabled={props.vm.configurationBusy()}>
          {props.vm.configurationBusy() ? "Validando acesso..." : "Salvar e continuar"}
        </Button>
        <Show when={props.vm.status()?.configured}>
          <div class="cluster">
            <Button
              class="button secondary"
              type="button"
              disabled={props.vm.configurationBusy()}
              onClick={props.onConfigured}
            >
              Voltar ao catálogo
            </Button>
            <Button
              class="button secondary danger"
              type="button"
              disabled={props.vm.configurationBusy()}
              onClick={() => {
                void props.vm.clearConfiguration().then((removed) => {
                  if (removed) props.onRemoved();
                });
              }}
            >
              Remover configuração
            </Button>
          </div>
        </Show>
      </form>
    </section>
  );
}
