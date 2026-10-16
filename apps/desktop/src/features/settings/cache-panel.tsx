// View displaying local disk storage statistics and cache management controls.
import { Show } from "solid-js";
import { bytesLabel } from "../../shared/formatters";
import type { SettingsViewModel } from "./settings.viewmodel";

export function CachePanel(props: {
  readonly vm: SettingsViewModel;
  readonly playbackActive: boolean;
}) {
  const usedBytes = () => props.vm.cacheSettings()?.usedBytes ?? 0n;
  const limitBytes = () => props.vm.cacheSettings()?.limitBytes ?? 0n;
  const path = () => props.vm.cacheSettings()?.directory ?? "Calculando...";

  function handleLimitSubmit(e: SubmitEvent) {
    e.preventDefault();
    void props.vm.saveCacheLimit();
  }

  return (
    <section class="cache-panel" aria-labelledby="cache-heading">
      <div>
        <h2 id="cache-heading">Armazenamento em disco</h2>
        <p class="muted">
          Gerencie o espaço em disco reservado para reprodução progressiva e cache de dados.
        </p>
      </div>
      <div class="cache-stats">
        <div>
          <span>Em uso</span>
          <strong>{bytesLabel(usedBytes())}</strong>
        </div>
        <div>
          <span>Limite configurado</span>
          <strong>{bytesLabel(limitBytes())}</strong>
        </div>
      </div>
      <p class="cache-path" title={path()}>
        Pasta: {path()}
      </p>
      <form class="cache-form" onSubmit={handleLimitSubmit}>
        <label for="cache-limit-input">Limite máximo em gigabytes (GB)</label>
        <div>
          <input
            id="cache-limit-input"
            type="number"
            min="1"
            max="1000"
            value={props.vm.cacheLimitGb()}
            onInput={(e) => props.vm.setCacheLimitGb(e.currentTarget.value)}
            disabled={props.vm.cacheBusy()}
          />
          <button class="button" type="submit" disabled={props.vm.cacheBusy()}>
            Salvar limite
          </button>
        </div>
      </form>
      <div class="cache-actions">
        <button
          class="button secondary danger"
          type="button"
          disabled={props.vm.cacheBusy() || props.playbackActive}
          title={
            props.playbackActive ? "Feche a reprodução antes de limpar" : "Remover mídia temporária"
          }
          onClick={() => {
            void props.vm.clearCache();
          }}
        >
          Limpar cache agora
        </button>
      </div>
      <button class="button secondary" type="button" onClick={() => props.vm.setCacheOpen(false)}>
        Fechar
      </button>
      <Show when={props.vm.cacheError()}>
        <p class="error-text" role="alert">
          {props.vm.cacheError()}
        </p>
      </Show>
    </section>
  );
}
