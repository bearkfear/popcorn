import { invoke, isTauri } from "@tauri-apps/api/core";
import { createSignal, Show } from "solid-js";
import { bytesLabel } from "../../shared/formatters";
import { Icon } from "../../shared/ui/icon";
import { buttonStyles } from "../../shared/ui/styles";
import type { SettingsViewModel } from "./settings.viewmodel";

export function CachePanel(props: {
  readonly vm: SettingsViewModel;
  readonly playbackActive: boolean;
}) {
  const [confirmClear, setConfirmClear] = createSignal(false);
  const [openingFolder, setOpeningFolder] = createSignal(false);
  const [folderError, setFolderError] = createSignal("");

  async function openFolder() {
    if (openingFolder()) return;
    setOpeningFolder(true);
    setFolderError("");
    try {
      await invoke("open_cache_folder");
    } catch {
      setFolderError("Não foi possível abrir a pasta. Tente novamente ou use o caminho abaixo.");
    } finally {
      setOpeningFolder(false);
    }
  }

  const usedBytes = () => props.vm.cacheSettings()?.usedBytes ?? 0n;
  const limitBytes = () => props.vm.cacheSettings()?.limitBytes ?? 0n;
  const percent = () =>
    limitBytes() > 0n ? Math.min(100, Number((usedBytes() * 100n) / limitBytes())) : 0;
  const available = () => Boolean(props.vm.cacheSettings());

  return (
    <section class="cache-panel min-w-0" aria-labelledby="cache-heading">
      <h2 id="cache-heading" class="text-2xl font-medium tracking-tight">
        Armazenamento
      </h2>
      <p class="mt-2 text-[14px] text-muted">Mais espaço para as histórias que vêm por aí.</p>
      <div
        class="mt-6 rounded-panel border border-line bg-slate-2 p-6 max-[560px]:p-4"
        aria-busy={props.vm.cacheBusy()}
      >
        <div class="flex items-center gap-3">
          <Icon name="storage" class="text-xl text-muted" />
          <h3 class="text-[15px]">Espaço para reprodução</h3>
        </div>
        <div class="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <strong class="text-[32px] font-medium leading-tight tracking-tight">
            {available() ? (usedBytes() === 0n ? "0 B" : bytesLabel(usedBytes())) : "—"}
          </strong>
          <span class="text-[13px] text-muted">
            em uso de {available() ? bytesLabel(limitBytes()) : "—"}
          </span>
        </div>
        <progress
          class="my-4 block h-2 w-full overflow-hidden rounded-full"
          value={percent()}
          max="100"
          aria-label="Uso do espaço reservado"
        />
        <p class="text-[12px] text-muted">
          Os vídeos ficam aqui temporariamente. O Popcorn libera os arquivos antigos conforme
          precisa de espaço.
        </p>
        <div class="mt-5 border-t border-slate-6 pt-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <p class="text-[11px] font-medium text-muted">PASTA DE ARQUIVOS TEMPORÁRIOS</p>
            <Show when={isTauri()}>
              <button
                class={buttonStyles({
                  variant: "secondary",
                  size: "compact",
                  class: "inline-flex items-center gap-2",
                })}
                type="button"
                disabled={!available() || openingFolder()}
                onClick={() => void openFolder()}
              >
                <Icon name="folder" /> {openingFolder() ? "Abrindo…" : "Abrir pasta"}
              </button>
            </Show>
          </div>
          <Show when={folderError()}>
            <p class="mt-2 text-[12px] text-negative" role="alert">
              {folderError()}
            </p>
          </Show>
          <p class="mt-2 break-all font-mono text-[11px] text-muted">
            {props.vm.cacheSettings()?.directory ??
              (props.vm.cacheBusy() ? "Carregando…" : "Indisponível")}
          </p>
        </div>
      </div>
      <form
        class="mt-5 rounded-panel border border-line bg-slate-2 p-6 max-[560px]:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void props.vm.saveCacheLimit();
        }}
      >
        <label for="cache-limit-input" class="block text-[15px] font-medium">
          Limite de armazenamento
        </label>
        <p id="cache-limit-help" class="mb-4 mt-2 text-[13px] text-muted">
          Escolha quanto espaço o Popcorn pode usar. De 1 a 1.000 GB. Ao reduzir o limite, os itens
          temporários mais antigos serão removidos para liberar espaço.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <div class="flex items-center gap-3 rounded-control border border-line bg-canvas-deep pr-3">
            <input
              class="min-h-11 w-24 min-w-0 bg-transparent px-3 text-[15px]"
              id="cache-limit-input"
              aria-describedby="cache-limit-help"
              type="number"
              min="1"
              max="1000"
              step="1"
              required
              value={props.vm.cacheLimitGb()}
              onInput={(event) => props.vm.setCacheLimitGb(event.currentTarget.value)}
              disabled={props.vm.cacheBusy() || !available()}
            />
            <span class="text-[12px] text-muted">GB</span>
          </div>
          <button
            class={buttonStyles()}
            type="submit"
            disabled={props.vm.cacheBusy() || !available()}
          >
            Salvar limite
          </button>
        </div>
      </form>
      <Show when={props.vm.cacheMessage()}>
        <p role="status" class="mt-4 text-[13px] text-positive">
          <Icon name="check" /> {props.vm.cacheMessage()}
        </p>
      </Show>
      <Show when={props.vm.cacheError()}>
        <div class="mt-4 text-[13px] text-negative" role="alert">
          <p>{props.vm.cacheError()}</p>
          <Show when={!available()}>
            <button
              class={buttonStyles({ variant: "secondary", class: "mt-3" })}
              type="button"
              disabled={props.vm.cacheBusy()}
              onClick={() => props.vm.loadCacheSettings()}
            >
              Tentar novamente
            </button>
          </Show>
        </div>
      </Show>
      <div class="mt-8 border-t border-slate-6 pt-5">
        <h3 class="text-[14px]">Liberar espaço agora</h3>
        <p class="mt-1 text-[12px] text-muted">
          Apaga os arquivos temporários de vídeo. Seu histórico e sua lista de títulos continuam
          salvos.
        </p>
        <Show when={props.playbackActive}>
          <p class="mt-3 text-[12px] text-amber-11">
            Feche a reprodução para liberar o espaço com segurança.
          </p>
        </Show>
        <Show
          when={confirmClear()}
          fallback={
            <button
              class={buttonStyles({ variant: "secondary", tone: "danger", class: "mt-4" })}
              type="button"
              disabled={props.vm.cacheBusy() || props.playbackActive || !available()}
              onClick={() => setConfirmClear(true)}
            >
              Limpar cache
            </button>
          }
        >
          <p class="mt-4 text-[13px]">
            Os vídeos precisarão ser baixados novamente. Deseja continuar?
          </p>
          <div class="mt-3 flex flex-wrap gap-3">
            <button
              class={buttonStyles({ variant: "secondary", tone: "danger" })}
              type="button"
              disabled={props.vm.cacheBusy() || props.playbackActive}
              onClick={() => {
                void props.vm.clearCache().then(() => setConfirmClear(false));
              }}
            >
              {props.vm.cacheBusy() ? "Limpando…" : "Confirmar limpeza"}
            </button>
            <button
              class={buttonStyles({ variant: "secondary" })}
              type="button"
              disabled={props.vm.cacheBusy()}
              onClick={() => setConfirmClear(false)}
            >
              Cancelar
            </button>
          </div>
        </Show>
      </div>
    </section>
  );
}
