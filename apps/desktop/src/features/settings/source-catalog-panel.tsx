import { Button } from "@egcs/newui/actions";
import { Badge, Card } from "@egcs/newui/content";
import { Callout } from "@egcs/newui/feedback";
import { Checkbox, Field, FileInput, Input, RadioGroup, Textarea } from "@egcs/newui/forms";
import { createSignal, Show } from "solid-js";
import type { SourceCatalogViewModel } from "./source-catalog.viewmodel";

export function SourceCatalogPanel(props: {
  readonly vm: SourceCatalogViewModel;
  readonly playbackActive: boolean;
  readonly onImported: () => void;
}) {
  const vm = props.vm;
  const [fileError, setFileError] = createSignal("");
  async function apply() {
    if (await vm.importCatalog()) props.onImported();
  }
  return (
    <section class="grid gap-4" aria-label="Meu catálogo de fontes" aria-busy={vm.busy()}>
      <div>
        <h2 class="text-xl font-medium">Minhas fontes</h2>
        <p class="mt-1 text-sm text-muted">
          Exporte sua coleção ou traga um catálogo de outro Popcorn.
        </p>
      </div>
      <Card.Root variant="soft">
        <Card.Header>
          <Card.Title as="h3">Leve seu catálogo com você</Card.Title>
          <Card.Description class="app-card-description">
            Fontes e associações a filmes e episódios, em um único arquivo.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="grid gap-4">
            <Field.Root disabled={vm.busy()}>
              <Field.Label>Nome do catálogo</Field.Label>
              <Input
                name="source-catalog-name"
                value={vm.name()}
                maxlength={200}
                onInput={(e) => vm.setName(e.currentTarget.value)}
              />
            </Field.Root>
            <Field.Root disabled={vm.busy()}>
              <Field.Label>
                Descrição <span class="text-muted">(opcional)</span>
              </Field.Label>
              <Textarea
                name="source-catalog-description"
                rows={2}
                maxlength={2000}
                value={vm.description()}
                onInput={(e) => vm.setDescription(e.currentTarget.value)}
              />
            </Field.Root>
            <p class="text-xs leading-relaxed text-muted">
              Histórico, credenciais e arquivos baixados ficam neste dispositivo.
            </p>
            <div>
              <Button
                variant="outline"
                tone="neutral"
                disabled={vm.busy() || !vm.name().trim()}
                onClick={() => void vm.exportCatalog()}
              >
                Exportar catálogo
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card.Root>
      <Card.Root variant="soft">
        <Card.Header>
          <Card.Title as="h3">Importar uma coleção</Card.Title>
          <Card.Description class="app-card-description">
            Escolha um .popcatalog ou .json de até 32 MB. Revise antes de aplicar.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div class="grid gap-4">
            <FileInput.Root
              acceptedFiles={[]}
              disabled={vm.busy()}
              variant="compact"
              accept={{ "application/json": [".popcatalog", ".json"] }}
              onFileAccept={({ files }) => {
                setFileError("");
                if (files[0]) void vm.importFile(files[0]);
              }}
              onFileReject={() => setFileError("Escolha um arquivo .popcatalog ou .json.")}
            >
              <FileInput.Label class="app-control-label">Arquivo do catálogo</FileInput.Label>
              <FileInput.Control>
                <FileInput.Trigger>Escolher arquivo</FileInput.Trigger>
                <FileInput.ValueText placeholder="Nenhum arquivo escolhido" />
              </FileInput.Control>
            </FileInput.Root>
            <Show when={fileError()}>
              <p role="alert" class="text-sm text-negative">
                {fileError()}
              </p>
            </Show>
            <Show when={vm.preview()}>
              {(preview) => (
                <div class="grid gap-4 border-t border-line pt-4">
                  <h4 class="font-medium">{preview().name}</h4>
                  <div class="flex flex-wrap gap-2">
                    <Badge>{preview().movies} filmes</Badge>
                    <Badge>{preview().series} séries</Badge>
                    <Badge>{preview().sources} fontes</Badge>
                  </div>
                  <p class="text-xs leading-relaxed text-muted">
                    {preview().bindings} associações ·{" "}
                    {preview().sources - preview().existingSources - preview().reactivatedSources}{" "}
                    fontes novas · {preview().existingSources} existentes ·{" "}
                    {preview().reactivatedSources} reativadas
                  </p>
                  <RadioGroup.Root
                    name="catalog-mode"
                    disabled={vm.busy()}
                    value={vm.replace() ? "replace" : "merge"}
                    onValueChange={({ value }) => vm.setReplace(value === "replace")}
                  >
                    <RadioGroup.Label>Como importar?</RadioGroup.Label>
                    <RadioGroup.Item value="merge">
                      <RadioGroup.ItemControl />
                      <RadioGroup.ItemText>
                        Mesclar com meu catálogo
                        <span class="mt-1 block text-xs text-muted">
                          Adiciona novas fontes e preserva as atuais.
                        </span>
                      </RadioGroup.ItemText>
                    </RadioGroup.Item>
                    <RadioGroup.Item value="replace">
                      <RadioGroup.ItemControl />
                      <RadioGroup.ItemText>
                        Substituir meu catálogo
                        <span class="mt-1 block text-xs text-muted">
                          Usa somente as fontes e associações deste arquivo.
                        </span>
                      </RadioGroup.ItemText>
                    </RadioGroup.Item>
                  </RadioGroup.Root>
                  <Show when={vm.replace()}>
                    <Callout.Root tone="warning">
                      <Callout.Content>
                        <Callout.Title>
                          Substituir {preview().localSources} fontes por {preview().sources}?
                        </Callout.Title>
                        <Callout.Description>
                          Histórico, credenciais e arquivos baixados serão preservados. Você pode
                          exportar o catálogo atual antes de continuar.
                        </Callout.Description>
                        <Show when={preview().sources === 0}>
                          <p class="my-2 text-sm">
                            O arquivo está vazio. Todas as associações atuais serão removidas.
                          </p>
                        </Show>
                        <div class="mt-3">
                          <Checkbox.Root
                            checked={vm.confirmed()}
                            disabled={vm.busy()}
                            onCheckedChange={({ checked }) => vm.setConfirmed(checked === true)}
                          >
                            <Checkbox.Control />
                            <Checkbox.Label>
                              Confirmo a substituição do meu catálogo.
                            </Checkbox.Label>
                          </Checkbox.Root>
                        </div>
                      </Callout.Content>
                    </Callout.Root>
                    <Show when={vm.replace() && props.playbackActive}>
                      <p role="status" class="text-sm text-muted">
                        Encerre a reprodução para substituir o catálogo.
                      </p>
                    </Show>
                  </Show>
                  <div class="flex flex-wrap gap-2">
                    <Button
                      loading={vm.busy()}
                      disabled={vm.replace() && (!vm.confirmed() || props.playbackActive)}
                      onClick={() => void apply()}
                    >
                      {vm.replace() ? "Substituir catálogo" : "Mesclar catálogo"}
                    </Button>
                    <Button variant="ghost" tone="neutral" disabled={vm.busy()} onClick={vm.cancel}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Card.Content>
      </Card.Root>
      <Show when={vm.busy()}>
        <p role="status" class="text-sm text-muted">
          Processando catálogo…
        </p>
      </Show>
      <Show when={vm.error()}>
        <Callout.Root tone="danger" role="alert">
          <Callout.Content>
            <Callout.Description>{vm.error()}</Callout.Description>
          </Callout.Content>
        </Callout.Root>
      </Show>
      <Show when={vm.message()}>
        <Callout.Root tone="success" role="status">
          <Callout.Content>
            <Callout.Description>{vm.message()}</Callout.Description>
          </Callout.Content>
        </Callout.Root>
      </Show>
    </section>
  );
}
