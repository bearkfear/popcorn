import { Button } from "@egcs/newui/actions";
import { Card } from "@egcs/newui/content";
import { Callout, Progress } from "@egcs/newui/feedback";
import { Field, InputGroup, NumberInput } from "@egcs/newui/forms";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { createSignal, Show } from "solid-js";
import { bytesLabel } from "../../shared/formatters";
import { Icon } from "../../shared/ui/icon";
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
    <section class="cache-panel grid min-w-0 gap-4" aria-labelledby="cache-heading">
      <div>
        <h2 id="cache-heading" class="text-xl font-medium">
          Armazenamento
        </h2>
        <p class="mt-1 text-sm text-muted">Espaço para assistir, sem acumular o que já passou.</p>
      </div>
      <Card.Root variant="soft" aria-busy={props.vm.cacheBusy()}>
        <Card.Header>
          <Card.Title as="h3">Arquivos temporários</Card.Title>
          <Card.Description class="app-card-description">
            O Popcorn libera os vídeos antigos conforme precisa de espaço.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="mb-4 flex flex-wrap items-baseline gap-2">
            <strong class="text-[28px] font-medium leading-tight tracking-tight">
              {available() ? (usedBytes() === 0n ? "0 B" : bytesLabel(usedBytes())) : "—"}
            </strong>
            <span class="text-sm text-muted">
              de {available() ? bytesLabel(limitBytes()) : "—"} disponíveis para cache
            </span>
          </div>
          <Progress value={percent()} min={0} max={100} label="Uso do espaço reservado" />
          <div class="mt-4 border-t border-line pt-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs text-muted">Pasta de arquivos temporários</span>
              <Show when={isTauri()}>
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  startIcon={<Icon name="folder" />}
                  disabled={!available()}
                  loading={openingFolder()}
                  onClick={() => void openFolder()}
                >
                  Abrir pasta
                </Button>
              </Show>
            </div>
            <p class="mt-1 break-all font-mono text-xs text-muted">
              {props.vm.cacheSettings()?.directory ??
                (props.vm.cacheBusy() ? "Carregando…" : "Indisponível")}
            </p>
            <Show when={folderError()}>
              <p class="mt-2 text-xs text-negative" role="alert">
                {folderError()}
              </p>
            </Show>
          </div>
        </Card.Content>
      </Card.Root>
      <Card.Root variant="soft">
        <Card.Header>
          <Card.Title as="h3">Quanto espaço reservar?</Card.Title>
          <Card.Description class="app-card-description">
            Ao reduzir o limite, os vídeos temporários mais antigos poderão ser removidos.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <form
            class="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void props.vm.saveCacheLimit();
            }}
          >
            <Field.Root
              class="min-w-0 flex-1"
              required
              disabled={props.vm.cacheBusy() || !available()}
            >
              <Field.Label>Limite de armazenamento</Field.Label>
              <div class="flex min-w-0 items-start gap-3">
                <InputGroup.Root class="min-w-0 flex-1">
                  <NumberInput
                    name="cache-limit"
                    locale="pt-BR"
                    useGrouping={false}
                    allowNegative={false}
                    maximumFractionDigits={6}
                    min={String(Number(props.vm.cacheSettings()?.minLimitBytes ?? 0n) / 1024 ** 3)}
                    max={String(Number(props.vm.cacheSettings()?.maxLimitBytes ?? 0n) / 1024 ** 3)}
                    value={props.vm.cacheLimitGb()}
                    onValueChange={({ rawValue }) => props.vm.setCacheLimitGb(rawValue)}
                  />
                  <InputGroup.Addon>GB</InputGroup.Addon>
                </InputGroup.Root>
                <Button type="submit" disabled={props.vm.cacheBusy() || !available()}>
                  Salvar limite
                </Button>
              </div>
              <Field.Description>
                De {Number(props.vm.cacheSettings()?.minLimitBytes ?? 0n) / 1024 ** 3} a{" "}
                {Number(props.vm.cacheSettings()?.maxLimitBytes ?? 0n) / 1024 ** 3} GB.
              </Field.Description>
            </Field.Root>
          </form>
        </Card.Content>
      </Card.Root>
      <Show when={props.vm.cacheMessage()}>
        <Callout.Root tone="success" role="status">
          <Callout.Content>
            <Callout.Description>{props.vm.cacheMessage()}</Callout.Description>
          </Callout.Content>
        </Callout.Root>
      </Show>
      <Show when={props.vm.cacheError()}>
        <Callout.Root tone="danger" role="alert">
          <Callout.Content>
            <Callout.Description>{props.vm.cacheError()}</Callout.Description>
            <Show when={!available()}>
              <Callout.Actions>
                <Button
                  variant="outline"
                  tone="neutral"
                  disabled={props.vm.cacheBusy()}
                  onClick={() => props.vm.loadCacheSettings()}
                >
                  Tentar novamente
                </Button>
              </Callout.Actions>
            </Show>
          </Callout.Content>
        </Callout.Root>
      </Show>
      <Card.Root>
        <Card.Header>
          <Card.Title as="h3">Liberar espaço agora</Card.Title>
          <Card.Description class="app-card-description">
            Remove apenas vídeos temporários. Histórico e catálogo permanecem salvos.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Show when={props.playbackActive}>
            <p role="status" class="mb-3 text-sm text-amber-11">
              Feche a reprodução antes de limpar o cache.
            </p>
          </Show>
          <Show
            when={confirmClear()}
            fallback={
              <Button
                variant="outline"
                tone="danger"
                disabled={props.vm.cacheBusy() || props.playbackActive || !available()}
                onClick={() => setConfirmClear(true)}
              >
                Limpar cache
              </Button>
            }
          >
            <Callout.Root tone="warning">
              <Callout.Content>
                <Callout.Title>Apagar os arquivos temporários?</Callout.Title>
                <Callout.Description>
                  Os vídeos precisarão ser baixados novamente para assistir.
                </Callout.Description>
                <Callout.Actions>
                  <Button
                    tone="danger"
                    loading={props.vm.cacheBusy()}
                    disabled={props.playbackActive}
                    onClick={() => void props.vm.clearCache().then(() => setConfirmClear(false))}
                  >
                    Confirmar limpeza
                  </Button>
                  <Button
                    variant="outline"
                    tone="neutral"
                    disabled={props.vm.cacheBusy()}
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancelar
                  </Button>
                </Callout.Actions>
              </Callout.Content>
            </Callout.Root>
          </Show>
        </Card.Content>
      </Card.Root>
    </section>
  );
}
