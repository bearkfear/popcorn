import type { ContentRef, Title } from "@popcorn/sdk";
import { PlaybackQuality } from "@popcorn/sdk";
import { createSignal } from "solid-js";
import {
  contentKey,
  readHistory,
  type WatchEntry,
  type WatchStatus,
  watchProgress,
} from "./history.model";

const STORAGE_KEY = "popcorn.watch-history.v1";

export function createHistoryViewModel() {
  const [error, setError] = createSignal("");
  let initial: WatchEntry[] = [];
  try {
    initial = readHistory(localStorage.getItem(STORAGE_KEY));
  } catch {
    setError("Não foi possível ler seu histórico neste dispositivo.");
  }
  const [entries, setEntries] = createSignal(initial);

  function save(entry: WatchEntry) {
    const next = [entry, ...entries().filter((item) => item.key !== entry.key)].slice(0, 500);
    setEntries(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setError("");
    } catch {
      setError("Não foi possível salvar seu progresso neste dispositivo.");
    }
  }

  const find = (content: ContentRef | undefined) =>
    content ? entries().find((item) => item.key === contentKey(content)) : undefined;

  function mark(title: Title, content: ContentRef, status: WatchStatus) {
    const old = find(content);
    save({
      ...old,
      key: contentKey(content),
      title,
      content,
      status,
      position: old?.position ?? 0,
      duration: old?.duration ?? 0,
      updatedAt: Date.now(),
      quality: old?.quality ?? PlaybackQuality.AUTO,
    });
  }

  function progress(
    context: Omit<WatchEntry, "key" | "position" | "duration" | "status" | "updatedAt">,
    position: number,
    duration: number,
    ended = false,
  ) {
    if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
    const old = find(context.content);
    // A failed/new load at zero must not erase a previously saved resume point.
    if (!ended && position < 1 && (old?.position ?? 0) > 5) return;
    save({
      ...context,
      key: contentKey(context.content),
      position,
      duration,
      status: ended || watchProgress(position, duration) >= 0.95 ? "watched" : "watching",
      updatedAt: Date.now(),
    });
  }

  return { entries, error, find, mark, progress };
}
export type HistoryViewModel = ReturnType<typeof createHistoryViewModel>;
