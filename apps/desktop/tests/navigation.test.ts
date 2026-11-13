import { describe, expect, test } from "bun:test";
import { CatalogCategory, MediaType } from "@popcorn/sdk";
import {
  catalogNavigationFromUrl,
  catalogUrl,
  contentFromTitleUrl,
  pageFromPath,
  titleUrl,
} from "../src/navigation";

describe("application navigation", () => {
  test("keeps the default catalog URL compact", () => {
    expect(
      catalogUrl({
        tab: "movies",
        category: CatalogCategory.POPULAR,
        genreId: 0,
        query: "",
        page: 1,
      }),
    ).toBe("/");
  });

  test("round-trips shareable catalog state", () => {
    const url = catalogUrl({
      tab: "shows",
      category: CatalogCategory.TOP_RATED,
      genreId: 18,
      query: "",
      page: 3,
    });
    expect(url).toBe("/?tab=shows&category=top-rated&genre=18&page=3");
    expect(catalogNavigationFromUrl(url.slice(1))).toEqual({
      tab: "shows",
      category: CatalogCategory.TOP_RATED,
      genreId: 18,
      query: "",
      page: 3,
    });
  });

  test("search URLs omit inactive browse filters", () => {
    expect(
      catalogUrl({
        tab: "movies",
        category: CatalogCategory.UPCOMING,
        genreId: 12,
        query: "Alien",
        page: 2,
      }),
    ).toBe("/?q=Alien&page=2");
  });

  test("encodes stable title and episode identity", () => {
    const content = {
      $typeName: "popcorn.v1.ContentRef" as const,
      mediaType: MediaType.TV,
      tmdbId: 1399,
      seasonNumber: 2,
      episodeNumber: 4,
    };
    expect(titleUrl(content)).toBe("/title/tv/1399?season=2&episode=4");
    expect(contentFromTitleUrl("/title/tv/1399", "?season=2&episode=4")).toEqual(content);
  });

  test("maps routes to application pages", () => {
    expect(pageFromPath("/")).toBe("search");
    expect(pageFromPath("/settings")).toBe("settings");
    expect(pageFromPath("/title/movie/550")).toBe("details");
    expect(pageFromPath("/player")).toBe("player");
  });
});
