// Common frontend domain types, view contracts and quality options.
import {
  type createCatalogClient,
  type createPlaybackClient,
  type createSourceClient,
  type createStorageClient,
  PlaybackQuality,
} from "@popcorn/sdk";

export type Bootstrap = {
  readonly address: string;
  readonly token: string;
  readonly protocolVersion: string;
  readonly instanceId: string;
  readonly catalogVersion: string;
};

export type CatalogClient = ReturnType<typeof createCatalogClient>;
export type PlaybackClient = ReturnType<typeof createPlaybackClient>;
export type SourceClient = ReturnType<typeof createSourceClient>;
export type StorageClient = ReturnType<typeof createStorageClient>;

export type Connection = "connecting" | "ready" | "error" | "browser";

export const playbackQualities = [
  { value: PlaybackQuality.AUTO, label: "Auto (até 1080p)" },
  { value: PlaybackQuality.FULL_HD, label: "1080p" },
  { value: PlaybackQuality.HD, label: "720p" },
] as const;
