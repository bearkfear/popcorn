import { describe, expect, test } from "bun:test";
import { MediaType, PlaybackQuality, type Title } from "@popcorn/sdk";
import { findUnwatchedTitle } from "../src/features/catalog/catalog-spotlight.model";
import { contentKey, type WatchEntry } from "../src/features/history/history.model";

const title = (id: number, mediaType = MediaType.MOVIE): Title => ({
  $typeName: "popcorn.v1.Title",
  title: `Título ${id}`,
  content: { $typeName: "popcorn.v1.ContentRef", mediaType, tmdbId: id },
  backdropUrl: `https://image.tmdb.org/t/p/w780/${id}.jpg`,
  posterUrl: "",
  overview: "",
  releaseYear: 2026,
  voteAverage: 8,
  genres: [],
  cast: [],
  seasons: [],
  runtimeMinutes: 100,
  trailerKey: "",
});

function entry(id: number, status: WatchEntry["status"], mediaType = MediaType.MOVIE): WatchEntry {
  const item = title(id, mediaType);
  const content = { $typeName: "popcorn.v1.ContentRef" as const, mediaType, tmdbId: id };
  return {
    key: contentKey(content),
    title: item,
    content,
    status,
    position: 0,
    duration: 100,
    updatedAt: 1,
    quality: PlaybackQuality.AUTO,
  };
}

describe("catalog spotlight", () => {
  test("skips watched and started titles and allows the watchlist", () => {
    const titles = [title(1), title(2), title(3)];
    expect(
      findUnwatchedTitle(titles, [entry(1, "watched"), entry(2, "watching"), entry(3, "want")]),
    ).toBe(titles[2]);
  });

  test("omits the spotlight when every candidate has been seen", () => {
    expect(findUnwatchedTitle([title(1)], [entry(1, "watched")])).toBeUndefined();
    expect(findUnwatchedTitle([], [])).toBeUndefined();
  });

  test("matches episode history to the whole series without hiding a movie with the same ID", () => {
    const watched = entry(1, "watched", MediaType.TV);
    watched.content.seasonNumber = 1;
    watched.content.episodeNumber = 2;
    const movie = title(1);
    expect(findUnwatchedTitle([title(1, MediaType.TV), movie], [watched])).toBe(movie);
  });

  test("prefers a backdrop among unseen titles and supports missing artwork", () => {
    const noImage = title(1);
    noImage.backdropUrl = "";
    const withImage = title(2);
    expect(findUnwatchedTitle([noImage, withImage], [])).toBe(withImage);
    expect(findUnwatchedTitle([noImage], [])).toBe(noImage);
  });
});
