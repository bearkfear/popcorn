// View displaying local disk storage statistics and cache management controls.
import { Show } from "solid-js";
import { bytesLabel } from "../../shared/formatters";
import { buttonStyles } from "../../shared/ui/styles";
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
    <section
      class="cache-panel grid grid-cols-[minmax(240px,_1fr)_auto] gap-[16px_32px] mt-4 p-5 border border-line rounded-panel bg-slate-2 [&_h2]:m-[3px_0_5px] [&_.muted]:max-w-[62ch] [&_.muted]:text-[12px] max-[560px]:grid-cols-[1fr]"
      aria-labelledby="cache-heading"
    >
      <div>
        <h2 id="cache-heading">Armazenamento em disco</h2>
        <p class="muted text-muted">
          Gerencie o espaço em disco reservado para reprodução progressiva e cache de dados.
        </p>
      </div>
      <div class="cache-stats flex items-center gap-6 [&_span]:block [&_span]:text-muted [&_span]:text-[11px] [&_strong]:block [&_strong]:text-[18px] [&_strong]:font-medium max-[560px]:[grid-column:1]">
        <div>
          <span>Em uso</span>
          <strong>{bytesLabel(usedBytes())}</strong>
        </div>
        <div>
          <span>Limite configurado</span>
          <strong>{bytesLabel(limitBytes())}</strong>
        </div>
      </div>
      <p
        class="cache-path col-span-full overflow-hidden text-muted [font:11px_/_1.4_ui-monospace,_monospace] text-ellipsis whitespace-nowrap max-[560px]:[grid-column:1]"
        title={path()}
      >
        Pasta: {path()}
      </p>
      <form
        class="cache-form col-span-full [&_label]:block [&_label]:mb-[6px] [&_label]:text-muted [&_label]:text-[12px] [&_label]:font-bold [&_>_div]:flex [&_>_div]:max-w-[420px] [&_input]:min-w-0 [&_input]:w-full [&_input]:p-[8px_11px] [&_input]:border [&_input]:border-line [&_input]:rounded-[5px_0_0_5px] [&_input]:bg-canvas-deep [&_input]:text-ink [&_.button]:rounded-[0_5px_5px_0] max-[560px]:[grid-column:1]"
        onSubmit={handleLimitSubmit}
      >
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
          <button class={buttonStyles} type="submit" disabled={props.vm.cacheBusy()}>
            Salvar limite
          </button>
        </div>
      </form>
      <div class="cache-actions col-span-full flex flex-wrap gap-3 max-[560px]:[grid-column:1]">
        <button
          class={`${buttonStyles} secondary danger`}
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
      <button
        class={`${buttonStyles} secondary`}
        type="button"
        onClick={() => props.vm.setCacheOpen(false)}
      >
        Fechar
      </button>
      <Show when={props.vm.cacheError()}>
        <p class="error-text text-negative m-[8px_0_12px] text-[13px]" role="alert">
          {props.vm.cacheError()}
        </p>
      </Show>
    </section>
  );
}
