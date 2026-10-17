import { describe, expect, test } from "bun:test";
import { type ContentRef, MediaType, PlaybackQuality, type Title } from "@popcorn/sdk";
import { loadHistory } from "../src/features/history/history.migration";
import {
  contentKey,
  readHistory,
  resumePosition,
  type WatchEntry,
  watchProgress,
} from "../src/features/history/history.model";
import { createHistoryViewModel } from "../src/features/history/history.viewmodel";
import type { HistoryClient } from "../src/shared/types";

const content: ContentRef = {
  $typeName: "popcorn.v1.ContentRef",
  mediaType: MediaType.MOVIE,
  tmdbId: 42,
};
const title: Title = {
  $typeName: "popcorn.v1.Title",
  content,
  title: "Um filme",
  overview: "",
  posterUrl: "",
  backdropUrl: "",
  releaseYear: 2026,
  voteAverage: 8,
  genres: [],
  cast: [],
  seasons: [],
  runtimeMinutes: 90,
  trailerKey: "",
};
const entry: WatchEntry = {
  key: contentKey(content),
  title,
  content,
  status: "watching",
  position: 120,
  duration: 5400,
  updatedAt: 1,
  resumeSeconds: 120,
  quality: PlaybackQuality.AUTO,
  sourceId: "source-42",
  fileIndex: 0,
};

describe("watch history", () => {
  test("movies and each episode have independent resume points", () => {
    const episode = { ...content, mediaType: MediaType.TV, seasonNumber: 1, episodeNumber: 1 };
    expect(contentKey(episode)).not.toBe(contentKey(content));
    expect(contentKey(episode)).not.toBe(contentKey({ ...episode, episodeNumber: 2 }));
    expect(contentKey(episode)).not.toBe(contentKey({ ...episode, seasonNumber: 2 }));
  });
  test("resume uses the backend decision and progress formatting is bounded", () => {
    expect(resumePosition(entry)).toBe(120);
    expect(resumePosition({ ...entry, resumeSeconds: 0 })).toBe(0);
    expect(resumePosition(undefined)).toBe(0);
    expect(watchProgress(Number.NaN, 100)).toBe(0);
    expect(watchProgress(20, 0)).toBe(0);
    expect(watchProgress(200, 100)).toBe(1);
  });
  test("corrupt storage does not prevent startup and valid entries survive", () => {
    expect(readHistory("invalid json")).toEqual([]);
    expect(readHistory("null")).toEqual([]);
    expect(
      readHistory(JSON.stringify([entry, { ...entry, position: -1 }, { ...entry, key: "wrong" }])),
    ).toEqual([entry]);
  });
  test("mutations send observations and intents in order and await the final save", async () => {
    const calls: string[] = [];
    const client = {
      updateHistory: async (request: { markStatus?: string; entry: { position?: number } }) => {
        await Promise.resolve();
        calls.push(request.markStatus ?? String(request.entry.position));
        return { entries: [] };
      },
    } as unknown as HistoryClient;
    const history = createHistoryViewModel(() => client);
    void history.progress(entry, 120, 5400);
    void history.progress(entry, 0, 5400);
    void history.mark(title, content, "watched");
    expect(await history.flush()).toBe(true);
    expect(calls).toEqual(["120", "0", "watched"]);
  });

  test("failed writes are visible and the queue can recover", async () => {
    let fail = true;
    const client = {
      updateHistory: async () => {
        if (fail) throw new Error("offline");
        return { entries: [] };
      },
    } as unknown as HistoryClient;
    const history = createHistoryViewModel(() => client);
    await history.progress(entry, 120, 5400);
    expect(await history.flush()).toBe(false);
    expect(history.error()).not.toBe("");
    fail = false;
    await history.progress(entry, 125, 5400);
    expect(await history.flush()).toBe(true);
  });

  test("legacy history is removed only after a successful import", async () => {
    const data = new Map([["popcorn.watch-history.v1", JSON.stringify([entry])]]);
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        removeItem: (key: string) => data.delete(key),
      },
    });
    let fail = true;
    let imported = 0;
    const client = {
      importHistory: async (request: { entries: unknown[] }) => {
        if (fail) throw new Error("offline");
        imported += request.entries.length;
        return { entries: [] };
      },
      listHistory: async () => ({ entries: [] }),
    } as unknown as HistoryClient;
    await expect(loadHistory(client)).rejects.toThrow("offline");
    expect(data.size).toBe(1);
    fail = false;
    await loadHistory(client);
    expect(imported).toBe(1);
    expect(data.size).toBe(0);
    await loadHistory(client);
    expect(imported).toBe(1);
  });
});
