// View presenting first-use TMDB API setup and token configuration form.
import { Show } from "solid-js";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SettingsViewModel } from "./settings.viewmodel";

export function SetupPanel(props: { readonly vm: SettingsViewModel }) {
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
      void props.vm.saveToken(token);
    }
  }

  return (
    <section class="setup-panel" aria-labelledby="setup-heading">
      <div class="setup-copy">
        <h2 id="setup-heading">Configuração do TMDB</h2>
        <p class="muted">Para navegar pelo catálogo completo com posters e detalhes, informe seu token de leitura da API.</p>
        <ol>
          <li>Entre na sua conta TMDB e abra as configurações da API.</li>
          <li>Copie o <strong>API Read Access Token</strong> (não use a API key).</li>
          <li>Cole no campo ao lado. O acesso é validado antes de salvar.</li>
        </ol>
        <Show when={isTauri()} fallback={<a class="button secondary external-link" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Abrir configurações TMDB</a>}>
          <button class="button secondary" type="button" onClick={() => { void openTmdbSettings(); }}>Abrir configurações TMDB</button>
        </Show>
        <p class="settings-address">https://www.themoviedb.org/settings/api</p>
      </div>

      <form class="setup-form" onSubmit={handleSubmit}>
        <label for="tmdb-token-input">API Read Access Token</label>
        <input ref={tokenInput} id="tmdb-token-input" type="password" placeholder="Cole seu token aqui" required disabled={props.vm.configurationBusy()} autocomplete="off" />
        <p class="muted">O token é mantido em memória e validado diretamente com o TMDB.</p>
        <label class="checkbox-label">
          <input type="checkbox" checked={props.vm.remember()} onChange={(e) => props.vm.setRemember(e.currentTarget.checked)} disabled={props.vm.configurationBusy()} />
          Salvar neste dispositivo
        </label>
        <Show when={props.vm.configurationError()}>
          <p class="error-text" role="alert">{props.vm.configurationError()}</p>
        </Show>
        <button class="button" type="submit" disabled={props.vm.configurationBusy()}>
          {props.vm.configurationBusy() ? "Validando acesso..." : "Salvar e continuar"}
        </button>
      </form>
    </section>
  );
}
