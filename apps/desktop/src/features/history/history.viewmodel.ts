import type { ContentRef, Title, WatchEntry as WireEntry } from "@popcorn/sdk";
import { PlaybackQuality } from "@popcorn/sdk";
import { createEffect, createSignal, on } from "solid-js";
import type { HistoryClient } from "../../shared/types";
import { loadHistory } from "./history.migration";
import { contentKey, type WatchEntry, type WatchStatus } from "./history.model";

type WatchContext = Omit<WatchEntry, "key" | "position" | "duration" | "status" | "updatedAt">;

function fromWire(entry: WireEntry): WatchEntry[] {
  if (!entry.content || !entry.title) return [];
  return [
    {
      position: entry.position,
      duration: entry.duration,
      updatedAt: entry.updatedAt,
      quality: entry.quality,
      resumeSeconds: entry.resumeSeconds,
      content: entry.content,
      title: entry.title,
      key: contentKey(entry.content),
      status: entry.status as WatchStatus,
      ...(entry.sourceId !== undefined ? { sourceId: entry.sourceId } : {}),
      ...(entry.fileIndex !== undefined ? { fileIndex: entry.fileIndex } : {}),
      ...(entry.audioStreamIndex !== undefined ? { audioStreamIndex: entry.audioStreamIndex } : {}),
    },
  ];
}

function notifyHistoryChange() {
  try {
    if (typeof window !== "undefined")
      localStorage.setItem("popcorn-history-updated", crypto.randomUUID());
  } catch {
    /* History remains on the server when browser storage is unavailable. */
  }
}

export function createHistoryViewModel(getClient: () => HistoryClient | undefined) {
  const [entries, setEntries] = createSignal<WatchEntry[]>([]);
  const [error, setError] = createSignal("");
  const [loaded, setLoaded] = createSignal(false);
  let pending = Promise.resolve();
  function enqueue(work: (client: HistoryClient) => Promise<void>) {
    const client = getClient();
    if (!client) return pending;
    pending = pending.then(async () => {
      try {
        await work(client);
        if (getClient() === client) setError("");
      } catch {
        if (getClient() === client)
          setError("Não foi possível acessar ou salvar seu histórico. Tente novamente.");
      }
    });
    return pending;
  }
  function accept(client: HistoryClient, values: WireEntry[]) {
    if (getClient() === client) {
      setEntries(values.flatMap(fromWire));
      setLoaded(true);
    }
  }
  function refresh() {
    return enqueue(async (client) => accept(client, (await client.listHistory({})).entries));
  }
  createEffect(
    on(getClient, (client) => {
      setEntries([]);
      setLoaded(false);
      if (!client) return;
      void enqueue(async (current) => {
        accept(current, (await loadHistory(current)).entries);
      });
    }),
  );
  const find = (content: ContentRef | undefined) =>
    content ? entries().find((item) => item.key === contentKey(content)) : undefined;

  function mark(title: Title, content: ContentRef, status: WatchStatus) {
    return enqueue(async (client) => {
      const response = await client.updateHistory({
        entry: { title, content, status: "want", quality: PlaybackQuality.AUTO },
        markStatus: status,
      });
      accept(client, response.entries);
      notifyHistoryChange();
    });
  }
  function progress(context: WatchContext, position: number, duration: number, ended = false) {
    return enqueue(async (client) => {
      const response = await client.updateHistory({
        entry: { ...context, position, duration, status: "watching" },
        ended,
      });
      accept(client, response.entries);
      notifyHistoryChange();
    });
  }
  async function flush() {
    let current: Promise<void>;
    do {
      current = pending;
      await current;
    } while (current !== pending);
    return !error();
  }
  return { entries, loaded, error, find, mark, progress, refresh, flush };
}
export type HistoryViewModel = ReturnType<typeof createHistoryViewModel>;
