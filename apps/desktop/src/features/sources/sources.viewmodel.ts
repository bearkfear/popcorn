import type { ContentRef } from "@popcorn/sdk";
import { createResource, createSignal } from "solid-js";
import { resourceValue } from "../../shared/resource-value";
import type { SourceClient } from "../../shared/types";

const SOURCE_ERROR = "Não foi possível acessar esta fonte. Verifique o magnet e tente novamente.";
const MAX_TORRENT_BYTES = 10 * 1024 * 1024;

type SourcesRequest = {
  readonly client: SourceClient;
  readonly content: ContentRef;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function createSourcesViewModel(getClient: () => SourceClient | undefined) {
  const [content, setContent] = createSignal<ContentRef>();
  const [request, setRequest] = createSignal<SourcesRequest>();
  const [magnet, setMagnet] = createSignal("");
  const [mutationBusy, setMutationBusy] = createSignal(false);
  const [mutationError, setMutationError] = createSignal("");
  const [sourceResponse, sourceActions] = createResource(request, async (current) => {
    try {
      return await current.client.listSources({ content: current.content }, { timeoutMs: 10_000 });
    } catch {
      throw new Error(SOURCE_ERROR);
    }
  });

  const sourceResponseValue = resourceValue(sourceResponse);
  const sources = () => sourceResponseValue()?.sources ?? [];
  const busy = () => sourceResponse.loading || mutationBusy();
  const error = () => mutationError() || errorMessage(sourceResponse.error);

  function reset() {
    setRequest(undefined);
    sourceActions.mutate(undefined);
    setContent(undefined);
    setMagnet("");
    setMutationBusy(false);
    setMutationError("");
  }

  function selectContent(target: ContentRef) {
    const client = getClient();
    if (!client) return;
    setContent(target);
    setMagnet("");
    setMutationError("");
    sourceActions.mutate(undefined);
    setRequest({ client, content: target });
  }

  async function addSource(
    input: { case: "magnet"; value: string } | { case: "torrentFile"; value: Uint8Array },
  ) {
    const client = getClient();
    const target = content();
    if (!client || !target || busy()) return;
    setMutationBusy(true);
    setMutationError("");
    try {
      const response = await client.addSource({ content: target, input }, { timeoutMs: 60_000 });
      if (!response.source) throw new Error("source missing");
      if (content() !== target) return;
      const added = response.source;
      sourceActions.mutate((current) =>
        current
          ? {
              ...current,
              sources: [
                ...current.sources.filter((item) => item.sourceId !== added.sourceId),
                added,
              ],
            }
          : current,
      );
      setMagnet("");
    } catch {
      if (content() === target) setMutationError(SOURCE_ERROR);
    } finally {
      if (content() === target) setMutationBusy(false);
    }
  }

  async function addMagnet() {
    const value = magnet().trim();
    if (value) await addSource({ case: "magnet", value });
  }

  async function importTorrent(file: File) {
    if (file.size === 0 || file.size > MAX_TORRENT_BYTES) {
      setMutationError("Escolha um arquivo .torrent válido de até 10 MB.");
      return;
    }
    try {
      await addSource({ case: "torrentFile", value: new Uint8Array(await file.arrayBuffer()) });
    } catch {
      setMutationError("Não foi possível ler este arquivo .torrent.");
    }
  }

  async function removeSource(sourceId: string) {
    const client = getClient();
    const target = content();
    if (!client || !target || busy()) return;
    setMutationBusy(true);
    setMutationError("");
    try {
      await client.removeSource({ sourceId }, { timeoutMs: 10_000 });
      if (content() === target) {
        sourceActions.mutate((current) =>
          current
            ? {
                ...current,
                sources: current.sources.filter((item) => item.sourceId !== sourceId),
              }
            : current,
        );
      }
    } catch {
      if (content() === target) {
        setMutationError(
          "Não foi possível remover esta fonte. Pare a reprodução e tente novamente.",
        );
      }
    } finally {
      if (content() === target) setMutationBusy(false);
    }
  }

  return {
    content,
    sources,
    magnet,
    setMagnet,
    busy,
    error,
    reset,
    selectContent,
    addMagnet,
    importTorrent,
    removeSource,
  };
}

export type SourcesViewModel = ReturnType<typeof createSourcesViewModel>;
