import assert from "node:assert/strict";
import { createClient, Code, ConnectError } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import {
  CatalogService,
  MediaType,
  createCatalogClient,
  createPlaybackClient,
  createSourceClient,
  createStorageClient,
} from "../src/index";

const baseUrl = process.env["CATALOG_URL"];
const token = process.env["CATALOG_TOKEN"];
const origin = process.env["CATALOG_ORIGIN"];
assert.ok(baseUrl && token && origin, "The Rust integration harness supplies server credentials");
const seeded = process.env["CATALOG_SEEDED"] === "1";
const content = { mediaType: MediaType.MOVIE, tmdbId: 1 };
const missing = { mediaType: MediaType.MOVIE, tmdbId: 999 };
const rpcError = (code: Code) => (error: unknown): boolean =>
  error instanceof ConnectError && error.code === code;

// Given: the actual SDK export, using the official binary transport.
const sdk = createCatalogClient(baseUrl, token);
const storage = createStorageClient(baseUrl, token);
const sources = createSourceClient(baseUrl, token);
const playback = createPlaybackClient(baseUrl, token);
// When / Then: its generated methods read the server snapshot.
const initial = await sdk.listTitles({});
assert.equal(initial.titles.length, seeded ? 20 : 0);
if (seeded) {
  const detail = await sdk.getTitle({ content });
  assert.equal(detail.title?.title, "Synthetic catalog fixture");
}

const initialCache = await storage.getCacheSettings({});
assert.ok(initialCache.settings);
assert.equal(initialCache.settings.usedBytes, 0n);
assert.match(initialCache.settings.directory, /downloads$/);
const updatedCache = await storage.setCacheLimit({ limitBytes: 1024n ** 3n });
assert.equal(updatedCache.settings?.limitBytes, 1024n ** 3n);
await assert.rejects(
  storage.setCacheLimit({ limitBytes: 1n }),
  rpcError(Code.InvalidArgument),
);
const clearedCache = await storage.clearCache({});
assert.equal(clearedCache.settings?.usedBytes, 0n);
assert.deepEqual((await sources.listSources({ content })).sources, []);
await assert.rejects(
  sources.addSource({ content, input: { case: "magnet", value: "https://example.test/not-a-magnet" } }),
  rpcError(Code.InvalidArgument),
);
await assert.rejects(
  sources.removeSource({ sourceId: "missing" }),
  rpcError(Code.NotFound),
);
await assert.rejects(
  playback.getPlayback({ playbackId: "not-a-uuid" }),
  rpcError(Code.InvalidArgument),
);

for (const useBinaryFormat of [true, false]) {
  // Given: official Connect ES transports for both protobuf wire formats.
  const client = createClient(
    CatalogService,
    createConnectTransport({
      baseUrl,
      useBinaryFormat,
      defaultTimeoutMs: 5_000,
      interceptors: [
        (next) => (request) => {
          request.header.set("Authorization", `Bearer ${token}`);
          request.header.set("Origin", origin);
          return next(request);
        },
      ],
    }),
  );

  // When / Then: reads, page boundaries and canonical references agree.
  const first = await client.listTitles({ pageSize: 100 });
  assert.equal(first.titles.length, seeded ? 100 : 0);
  assert.equal(first.nextPageToken !== "", seeded);
  if (seeded) {
    assert.deepEqual(
      first.titles.map((title) => title.content?.tmdbId),
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    const second = await client.listTitles({
      pageSize: 100,
      pageToken: first.nextPageToken,
    });
    assert.deepEqual(
      second.titles.map((title) => [title.content?.mediaType, title.content?.tmdbId]),
      [[MediaType.MOVIE, 101], [MediaType.MOVIE, 102], [MediaType.TV, 1], [MediaType.TV, 2]],
    );
    assert.equal(second.nextPageToken, "");
    const detail = await client.getTitle({ content });
    assert.equal(detail.title?.title, "Synthetic catalog fixture");
    assert.equal(detail.title?.overview, "Integration test only");
    assert.equal(detail.title?.releaseYear, 2026);
    assert.equal(detail.title?.content?.mediaType, MediaType.MOVIE);
    assert.equal(detail.title?.content?.tmdbId, 1);
    assert.equal(detail.title?.content?.seasonNumber, undefined);
    assert.equal(detail.title?.content?.episodeNumber, undefined);
    const single = await client.listTitles({ pageSize: 1 });
    assert.equal(single.titles.length, 1);
    const next = await client.listTitles({ pageSize: 1, pageToken: single.nextPageToken });
    assert.equal(next.titles[0]?.content?.tmdbId, 2);
  }

  // When / Then: real protocol errors are decoded by the official client.
  await assert.rejects(client.getTitle({ content: missing }), rpcError(Code.NotFound));
  await assert.rejects(client.getTitle({}), rpcError(Code.InvalidArgument));
  await assert.rejects(
    client.getTitle({ content: { ...content, seasonNumber: 1, episodeNumber: 1 } }),
    rpcError(Code.InvalidArgument),
  );
  await assert.rejects(
    client.getTitle({ content: { ...content, mediaType: MediaType.UNSPECIFIED } }),
    rpcError(Code.InvalidArgument),
  );
  await assert.rejects(client.listTitles({ pageSize: 101 }), rpcError(Code.InvalidArgument));
  for (const pageToken of ["bad", "v1:0:1", "v1:1:0", "v1:1:4294967296", "v1:1:1:extra"]) {
    await assert.rejects(client.listTitles({ pageToken }), rpcError(Code.InvalidArgument));
  }
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(client.listTitles({}, { signal: aborted.signal }), rpcError(Code.Canceled));
}

// Given: an exact desktop origin and the real HTTP listener.
const path = `${baseUrl}/popcorn.v1.CatalogService/ListTitles`;
const preflight = await fetch(path, {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers":
      "authorization,content-type,connect-protocol-version,connect-timeout-ms,x-user-agent",
  },
});
// Then: only validated preflight bypasses the token.
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
assert.match(preflight.headers.get("vary") ?? "", /Origin/i);
for (const invalidOrigin of ["https://foreign.example", "null", `${origin}, https://foreign.example`]) {
  const denied = await fetch(path, {
    method: "OPTIONS",
    headers: { Origin: invalidOrigin, "Access-Control-Request-Method": "POST" },
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const deniedRequest = await fetch(path, {
    method: "POST",
    headers: {
      Origin: invalidOrigin,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(deniedRequest.status, 403);
  assert.equal(deniedRequest.headers.get("access-control-allow-origin"), null);
}
for (const headers of [
  { Origin: origin, "Access-Control-Request-Method": "GET" },
  { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-arbitrary" },
  { "Access-Control-Request-Method": "POST" },
]) {
  assert.equal((await fetch(path, { method: "OPTIONS", headers })).status, 403);
}
for (const authorization of ["", "Bearer wrong"]) {
  const denied = await fetch(path, {
    method: "POST",
    headers: { Origin: origin, Authorization: authorization, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(denied.status, 401);
  assert.equal(denied.headers.get("access-control-allow-origin"), origin);
}
await assert.rejects(
  createCatalogClient(baseUrl, "wrong").listTitles({}),
  rpcError(Code.Unauthenticated),
);
const malformed = await fetch(path, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
  },
  body: "{",
});
assert.equal(malformed.status, 400);
assert.equal((await malformed.json()).code, "invalid_argument");
console.log(`Catalog official SDK binary+JSON, ${seeded ? "104 synthetic rows" : "empty snapshot"}, errors and CORS passed`);
