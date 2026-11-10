import { Button } from "@egcs/newui/actions";
import { Field, FileInput, Input } from "@egcs/newui/forms";
import { createSignal, For, Show } from "solid-js";
import { bytesLabel } from "../../shared/formatters";
import { Icon } from "../../shared/ui/icon";
import { PlaybackSetup } from "../player/playback-setup";
import type { PlayerViewModel } from "../player/player.viewmodel";
import type { SourcesViewModel } from "./sources.viewmodel";

export type SourcesPanelProps = {
  readonly sources: SourcesViewModel;
  readonly player: PlayerViewModel;
  readonly onPrepare: (sourceId: string, fileIndex: number) => void;
  readonly resumeSeconds: number;
  readonly onLaunch: (position: number) => void;
};

export function SourcesPanel(props: SourcesPanelProps) {
  function submitMagnet(event: SubmitEvent) {
    event.preventDefault();
    void props.sources.addMagnet();
  }

  const [fileError, setFileError] = createSignal("");

  return (
    <section
      class="sources-section min-w-0"
      aria-label="Fontes de reprodução"
      aria-busy={props.sources.busy()}
    >
      <div class="rounded-xl border border-line bg-slate-2 p-4">
        <h3 class="m-0 text-sm font-semibold">Adicionar fonte</h3>
        <p class="mt-1 mb-4 text-xs text-muted">
          Adicione um link magnet ou importe um arquivo .torrent para este título.
        </p>
        <form class="magnet-form" onSubmit={submitMagnet}>
          <Field.Root disabled={props.sources.busy()}>
            <Field.Label>Link magnet</Field.Label>
            <div class="flex min-w-0 gap-2 max-[560px]:flex-col">
              <Input
                class="min-w-0 flex-1"
                name="magnet-link"
                inputmode="url"
                value={props.sources.magnet()}
                onInput={(event) => props.sources.setMagnet(event.currentTarget.value)}
                placeholder="magnet:?xt=urn:btih:…"
                spellcheck={false}
              />
              <Button
                type="submit"
                disabled={props.sources.busy() || !props.sources.magnet().trim()}
              >
                {props.sources.busy() ? "Consultando…" : "Adicionar"}
              </Button>
            </div>
          </Field.Root>
        </form>
        <div class="mt-3">
          <FileInput.Root
            variant="button"
            acceptedFiles={[]}
            disabled={props.sources.busy()}
            accept={{ "application/x-bittorrent": [".torrent"] }}
            onFileAccept={({ files }) => {
              setFileError("");
              if (files[0]) void props.sources.importTorrent(files[0]);
            }}
            onFileReject={() => setFileError("Escolha um arquivo .torrent.")}
          >
            <FileInput.Control>
              <FileInput.Trigger>Importar .torrent</FileInput.Trigger>
            </FileInput.Control>
          </FileInput.Root>
          <Show when={fileError()}>
            <p class="mt-2 text-sm text-negative" role="alert">
              {fileError()}
            </p>
          </Show>
        </div>
      </div>
      <Show when={props.sources.error()}>
        <p class="error-text my-3 text-sm text-negative" role="alert">
          {props.sources.error()}
        </p>
      </Show>
      <Show when={props.sources.busy()}>
        <p class="mt-4 text-sm text-muted" role="status">
          Consultando arquivos das fontes…
        </p>
      </Show>
      <Show
        when={!props.sources.busy() && !props.sources.sources().length && !props.sources.error()}
      >
        <p class="mt-6 text-sm text-muted">
          Nenhuma fonte adicionada. Adicione uma fonte para escolher o vídeo.
        </p>
      </Show>
      <ul class="source-list my-5 list-none space-y-4 p-0">
        <For each={props.sources.sources()}>
          {(source, sourceIndex) => {
            const videos = () =>
              source.files.filter((file) => file.likelyMedia && file.sizeBytes > 0n);
            return (
              <li class="min-w-0 rounded-xl border border-line p-4">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="m-0 text-sm font-semibold">Fonte {sourceIndex() + 1}</h3>
                  <Button
                    variant="ghost"
                    tone="danger"
                    size="sm"
                    type="button"
                    disabled={
                      props.sources.busy() ||
                      props.player.preparedFile()?.sourceId === source.sourceId
                    }
                    onClick={() => void props.sources.removeSource(source.sourceId)}
                  >
                    Remover
                  </Button>
                </div>
                <p class="my-2 text-xs text-muted">
                  {videos().length > 1
                    ? "Escolha um vídeo. Apenas o arquivo selecionado será baixado."
                    : videos().length === 1
                      ? "Um vídeo disponível para baixar e assistir."
                      : "Esta fonte não contém vídeos compatíveis."}
                </p>
                <ul class="file-list m-0 list-none divide-y divide-slate-6 p-0">
                  <For each={videos()}>
                    {(file) => {
                      const selected = () =>
                        props.player.preparedFile()?.sourceId === source.sourceId &&
                        props.player.preparedFile()?.fileIndex === file.fileIndex;
                      return (
                        <li class="flex min-w-0 items-center justify-between gap-3 py-3 max-[560px]:flex-col max-[560px]:items-stretch">
                          <div class="min-w-0">
                            <strong class="block break-words text-sm font-medium" title={file.name}>
                              {file.name}
                            </strong>
                            <span class="mt-1 block text-xs text-muted">
                              {bytesLabel(file.sizeBytes)}
                            </span>
                          </div>
                          <Button
                            variant={selected() ? "outline" : "solid"}
                            tone={selected() ? "neutral" : "primary"}
                            class="inline-flex shrink-0 items-center justify-center gap-2"
                            type="button"
                            aria-pressed={selected()}
                            disabled={props.player.busy() || selected() || props.sources.busy()}
                            onClick={() => props.onPrepare(source.sourceId, file.fileIndex)}
                          >
                            <Show when={selected()}>
                              <Icon name="check" class="size-4" />
                            </Show>
                            {selected() ? "Selecionado" : "Baixar este vídeo"}
                          </Button>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </li>
            );
          }}
        </For>
      </ul>
      <Show when={props.player.preparedFile()}>
        <PlaybackSetup
          vm={props.player}
          resumeSeconds={props.resumeSeconds}
          onLaunch={props.onLaunch}
        />
      </Show>
      <Show when={props.player.error()}>
        <p class="error-text my-3 text-sm text-negative" role="alert">
          {props.player.error()}
        </p>
      </Show>
    </section>
  );
}
