import { type ContentRef, MediaType, PlaybackQuality, type Title } from "@popcorn/sdk";

export type WatchStatus = "watching" | "watched" | "want";
export type WatchEntry = {
  key: string;
  title: Title;
  content: ContentRef;
  status: WatchStatus;
  position: number;
  duration: number;
  updatedAt: number;
  sourceId?: string;
  fileIndex?: number;
  audioStreamIndex?: number;
  quality: PlaybackQuality;
  resumeSeconds?: number;
};

export function contentKey(content: ContentRef): string {
  return `${content.mediaType}:${content.tmdbId}:${content.seasonNumber ?? ""}:${content.episodeNumber ?? ""}`;
}

export function watchProgress(position: number, duration: number) {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, position / duration));
}

export function resumePosition(entry: WatchEntry | undefined): number {
  return entry?.resumeSeconds ?? 0;
}

// Read the legacy WebView format solely for migration to backend storage.
export function readHistory(value: string | null): WatchEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is WatchEntry => {
        if (!entry || typeof entry !== "object") return false;
        const item = entry as Partial<WatchEntry>;
        const content = item.content;
        return Boolean(
          content &&
            [MediaType.MOVIE, MediaType.TV].includes(content.mediaType) &&
            Number.isInteger(content.tmdbId) &&
            content.tmdbId > 0 &&
            item.key === contentKey(content) &&
            item.title &&
            typeof item.title.title === "string" &&
            typeof item.title.posterUrl === "string" &&
            item.title.content &&
            ["watching", "watched", "want"].includes(item.status ?? "") &&
            Number.isFinite(item.position) &&
            (item.position ?? -1) >= 0 &&
            Number.isFinite(item.duration) &&
            (item.duration ?? -1) >= 0 &&
            Number.isFinite(item.updatedAt) &&
            (item.sourceId === undefined || typeof item.sourceId === "string") &&
            (item.fileIndex === undefined ||
              (Number.isInteger(item.fileIndex) && item.fileIndex >= 0)) &&
            (item.audioStreamIndex === undefined ||
              (Number.isInteger(item.audioStreamIndex) && item.audioStreamIndex >= 0)) &&
            item.quality !== undefined &&
            [PlaybackQuality.AUTO, PlaybackQuality.FULL_HD, PlaybackQuality.HD].includes(
              item.quality,
            ),
        );
      })
      .slice(0, 500);
  } catch {
    return [];
  }
}
