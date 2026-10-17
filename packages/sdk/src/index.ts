import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  CatalogService,
  HistoryService,
  PlaybackService,
  SourceService,
  SourceCatalogService,
  StorageService,
} from "./gen/popcorn/v1/catalog_pb";

export * from "./gen/popcorn/v1/catalog_pb";
export { Code, ConnectError } from "@connectrpc/connect";

/** Creates the official Connect ES client for the authenticated local backend. */
export function createCatalogClient(
  baseUrl: string,
  token: string,
): Client<typeof CatalogService> {
  return createClient(CatalogService, authenticatedTransport(baseUrl, token));
}

/** Creates the authenticated client used to manage user-provided sources. */
export function createSourceClient(
  baseUrl: string,
  token: string,
): Client<typeof SourceService> {
  return createClient(SourceService, authenticatedTransport(baseUrl, token));
}

/** Creates the authenticated control client for progressive playback. */
export function createPlaybackClient(
  baseUrl: string,
  token: string,
): Client<typeof PlaybackService> {
  return createClient(PlaybackService, authenticatedTransport(baseUrl, token));
}

/** Creates the authenticated client for cache settings and cleanup. */
export function createStorageClient(
  baseUrl: string,
  token: string,
): Client<typeof StorageService> {
  return createClient(StorageService, authenticatedTransport(baseUrl, token));
}

function authenticatedTransport(baseUrl: string, token: string) {
  return createConnectTransport({
      baseUrl,
      useBinaryFormat: true,
      defaultTimeoutMs: 10_000,
      interceptors: [
        (next) => (request) => {
          request.header.set("Authorization", `Bearer ${token}`);
          return next(request);
        },
      ],
    });
}

/** Creates the authenticated user library client. */
export function createHistoryClient(baseUrl: string, token: string): Client<typeof HistoryService> {
  return createClient(HistoryService, authenticatedTransport(baseUrl, token));
}

/** Creates the authenticated client for portable source catalogs. */
export function createSourceCatalogClient(baseUrl: string, token: string): Client<typeof SourceCatalogService> {
  return createClient(SourceCatalogService, authenticatedTransport(baseUrl, token));
}
