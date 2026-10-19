import type { Title } from "@popcorn/sdk";
import { artworkUrl } from "../../catalog-ui";
import type { WatchEntry } from "../history/history.model";

export function findUnwatchedTitle(titles: readonly Title[], history: readonly WatchEntry[]) {
  const seen = new Set(
    history
      .filter((entry) => entry.status !== "want" || entry.position > 0)
      .map((entry) => `${entry.content.mediaType}:${entry.content.tmdbId}`),
  );
  const candidates = titles.filter(
    (title) => title.content && !seen.has(`${title.content.mediaType}:${title.content.tmdbId}`),
  );
  return candidates.find((title) => artworkUrl(title.backdropUrl)) ?? candidates[0];
}
