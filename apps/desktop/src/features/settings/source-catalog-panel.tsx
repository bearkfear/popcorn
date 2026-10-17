// Personal source catalog export and preview with explicit merge or replacement.
import { Show } from "solid-js";
import { buttonStyles } from "../../shared/ui/styles";
import type { SourceCatalogViewModel } from "./source-catalog.viewmodel";

export function SourceCatalogPanel(props: {
  readonly vm: SourceCatalogViewModel;
  readonly playbackActive: boolean;
  readonly onImported: () => void;
}) {
  const vm = props.vm;
  function pickFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void vm.importFile(file);
  }
  async function apply() {
    if (await vm.importCatalog()) props.onImported();
  }
  const inputClass =
    "mt-2 w-full rounded-control border border-line bg-canvas-deep px-3 py-2 text-sm";
  return (
    <section aria-label="Meu catálogo de fontes" aria-busy={vm.busy()}>
      <h2 class="text-2xl font-medium tracking-tight">Meu catálogo</h2>
      <p class="mt-2 text-sm text-muted">
        Leve suas fontes e associações a filmes e episódios para outro Popcorn ou compartilhe com
        alguém.
      </p>
      <div class="mt-6 space-y-5 rounded-panel border border-line bg-slate-2 p-6">
        <h3>Exportar catálogo</h3>
        <label class="block text-sm" for="source-catalog-name">
          Nome do catálogo
          <input
            id="source-catalog-name"
            class={inputClass}
            value={vm.name()}
            maxlength={200}
            disabled={vm.busy()}
            onInput={(event) => vm.setName(event.currentTarget.value)}
          />
        </label>
        <label class="block text-sm" for="source-catalog-description">
          Descrição (opcional)
          <textarea
            id="source-catalog-description"
            class={inputClass}
            value={vm.description()}
            maxlength={2000}
            disabled={vm.busy()}
            onInput={(event) => vm.setDescription(event.currentTarget.value)}
          />
        </label>
        <p class="text-xs text-muted">
          Inclui todas as fontes ativas. Histórico, credenciais e arquivos baixados ficam neste
          dispositivo.
        </p>
        <button
          type="button"
          class={buttonStyles({ variant: "secondary" })}
          disabled={vm.busy() || !vm.name().trim()}
          onClick={() => void vm.exportCatalog()}
        >
          Exportar catálogo atual
        </button>
      </div>
      <div class="mt-6 space-y-5 rounded-panel border border-line bg-slate-2 p-6">
        <h3>Importar catálogo</h3>
        <p class="text-sm text-muted">
          Escolha um arquivo .popcatalog de até 32 MB. Você revisará as mudanças antes de importar.
        </p>
        <label class="block text-sm" for="source-catalog-file">
          Arquivo do catálogo
          <input
            id="source-catalog-file"
            class={inputClass}
            type="file"
            accept=".popcatalog,.json,application/json"
            disabled={vm.busy()}
            onChange={pickFile}
          />
        </label>
        <Show when={vm.preview()}>
          {(preview) => (
            <div class="space-y-4 border-t border-line pt-5">
              <h4 class="font-medium">{preview().name}</h4>
              <p class="text-sm">
                {preview().movies} filmes · {preview().series} séries · {preview().sources} fontes ·{" "}
                {preview().bindings} associações
              </p>
              <p class="text-sm text-muted">
                {preview().sources - preview().existingSources - preview().reactivatedSources}{" "}
                fontes novas; {preview().existingSources} já existem; {preview().reactivatedSources}{" "}
                fontes removidas serão reativadas.
              </p>
              <fieldset disabled={vm.busy()} class="space-y-3">
                <legend class="mb-3 text-sm font-medium">Como importar?</legend>
                <label class="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="catalog-mode"
                    checked={!vm.replace()}
                    onChange={() => vm.setReplace(false)}
                  />
                  <span>
                    Mesclar com meu catálogo
                    <span class="mt-1 block text-xs text-muted">
                      Adiciona fontes e associações, preservando as atuais.
                    </span>
                  </span>
                </label>
                <label class="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="catalog-mode"
                    checked={vm.replace()}
                    onChange={() => vm.setReplace(true)}
                  />
                  <span>
                    Substituir meu catálogo
                    <span class="mt-1 block text-xs text-muted">
                      Usa somente as fontes e associações deste arquivo.
                    </span>
                  </span>
                </label>
              </fieldset>
              <Show when={vm.replace()}>
                <div class="space-y-3 rounded-control border border-line p-4 text-sm">
                  <p>
                    Substituir suas {preview().localSources} fontes pelas {preview().sources} fontes
                    deste catálogo?
                  </p>
                  <p class="text-xs text-muted">
                    Histórico, credenciais e arquivos baixados serão preservados. Você pode exportar
                    o catálogo atual antes de continuar.
                  </p>
                  <Show when={preview().sources === 0}>
                    <p>Este catálogo está vazio. Todas as associações atuais serão removidas.</p>
                  </Show>
                  <label class="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={vm.confirmed()}
                      disabled={vm.busy()}
                      onChange={(event) => vm.setConfirmed(event.currentTarget.checked)}
                    />
                    Confirmo a substituição do meu catálogo de fontes.
                  </label>
                </div>
                <Show when={props.playbackActive}>
                  <p role="status" class="text-sm text-muted">
                    Encerre a reprodução para substituir o catálogo.
                  </p>
                </Show>
              </Show>
              <div class="flex flex-wrap gap-3">
                <button
                  type="button"
                  class={buttonStyles()}
                  disabled={
                    vm.busy() || (vm.replace() && (!vm.confirmed() || props.playbackActive))
                  }
                  onClick={() => void apply()}
                >
                  {vm.replace() ? "Substituir catálogo" : "Mesclar catálogo"}
                </button>
                <button
                  type="button"
                  class={buttonStyles({ variant: "secondary" })}
                  disabled={vm.busy()}
                  onClick={vm.cancel}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
      <Show when={vm.busy()}>
        <p role="status" class="mt-4 text-sm text-muted">
          Processando catálogo…
        </p>
      </Show>
      <Show when={vm.error()}>
        <p role="alert" class="mt-4 text-sm text-negative">
          {vm.error()}
        </p>
      </Show>
      <Show when={vm.message()}>
        <p role="status" class="mt-4 text-sm text-positive">
          {vm.message()}
        </p>
      </Show>
    </section>
  );
}
