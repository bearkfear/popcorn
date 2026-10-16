import { describe, expect, test } from "bun:test";
import { type ContentRef, MediaType, PlaybackQuality, type Title } from "@popcorn/sdk";
import {
  contentKey,
  readHistory,
  resumePosition,
  type WatchEntry,
  watchProgress,
} from "../src/features/history/history.model";
import { createHistoryViewModel } from "../src/features/history/history.viewmodel";

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
  test("only an unfinished session resumes; invalid times cannot create progress", () => {
    expect(resumePosition(entry)).toBe(120);
    expect(resumePosition({ ...entry, status: "watched" })).toBe(0);
    expect(resumePosition({ ...entry, status: "want" })).toBe(0);
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
  test("progress survives reopening and a failed load at zero cannot erase it", () => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
      },
    });
    const history = createHistoryViewModel();
    history.progress(entry, 120, 5400);
    history.progress(entry, 0, 5400);
    expect(createHistoryViewModel().find(content)?.position).toBe(120);
    history.progress(entry, 5350, 5400);
    expect(createHistoryViewModel().find(content)?.status).toBe("watched");
    expect(data.values().next().value).not.toContain("mediaUrl");
  });

  test("two windows merge different titles and refresh the saved resume point", () => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value),
      },
    });
    const main = createHistoryViewModel();
    const player = createHistoryViewModel();
    player.progress(entry, 240, 5400);
    const other = { ...content, tmdbId: 99 };
    main.mark({ ...title, content: other }, other, "want");
    player.progress(entry, 245, 5400);
    main.refresh();
    expect(main.find(content)?.position).toBe(245);
    expect(main.find(other)?.status).toBe("want");
  });
});
