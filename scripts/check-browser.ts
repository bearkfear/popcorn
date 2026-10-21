// Exercises the real sidecar's browser sessions, assets, RPC access and shutdown.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dir, "..");
const temporary = await mkdtemp(join(tmpdir(), "popcorn-browser-"));
const secret = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
const token = secret();
const ticket = secret();
const occupiedPort = Bun.argv.includes("--occupied-port");
let reservation: ReturnType<typeof Bun.serve> | undefined;
let preferredWasAvailable = false;
try {
  reservation = Bun.serve({ hostname: "0.0.0.0", port: 8080, fetch: () => new Response("reserved") });
  if (!occupiedPort) {
    reservation.stop(true);
    reservation = undefined;
    preferredWasAvailable = true;
  }
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "EADDRINUSE")) throw error;
}
const backend = Bun.spawn([join(root, "target/debug", process.platform === "win32" ? "popcorn-server.exe" : "popcorn-server"), "sidecar"], {
  cwd: root, stdin: "pipe", stdout: "pipe", stderr: "pipe",
});
let timeout: ReturnType<typeof setTimeout> | undefined;
try {
  backend.stdin.write(`${JSON.stringify({
    event: "initialize", catalog: join(root, "resources/catalog.sqlite"),
    data_dir: temporary, token, origin: "http://localhost:1420",
    web_root: join(root, "apps/desktop/dist"), browser_ticket: ticket,
  })}\n`);
  await backend.stdin.flush();
  timeout = setTimeout(() => backend.kill(), 15_000);
  const reader = backend.stdout.getReader();
  let output = "";
  while (!output.includes("\n")) {
    const part = await reader.read();
    if (part.done) throw new Error(`Backend exited before readiness: ${await new Response(backend.stderr).text()}`);
    output += new TextDecoder().decode(part.value);
  }
  reader.releaseLock();
  clearTimeout(timeout);
  const ready = JSON.parse(output.split("\n")[0] ?? "") as { address: string };
  const base = `http://${ready.address}`;
  const port = new URL(base).port;
  if (occupiedPort) assert.notEqual(port, "8080", "occupied preferred port must fall back");
  else if (preferredWasAvailable) assert.equal(port, "8080", "available preferred port must be reused");
  if (reservation) assert.equal(await (await fetch("http://127.0.0.1:8080")).text(), "reserved");
  const request = (path: string, options?: RequestInit) => fetch(base + path, options);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

  const index = await request("/");
  assert.equal(index.status, 200);
  const html = await index.text();
  assert(html.includes('name="popcorn-server"'));
  assert(index.headers.get("Content-Security-Policy")?.includes("frame-ancestors 'none'"));
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert(asset, "built script must be served");
  assert.equal((await request(asset)).status, 200);
  assert.equal((await request("/health")).status, 401);
  assert.equal((await request("/health", { headers: { Authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await post("/browser/session", { ticket: secret() })).status, 401);
  assert.equal((await post("/browser/session", { ticket }, { Origin: "http://untrusted.invalid" })).status, 403);

  const session = await post("/browser/session", { ticket }, { Origin: base });
  assert.equal(session.status, 204);
  const setCookie = session.headers.get("Set-Cookie") ?? "";
  assert(setCookie.includes("HttpOnly") && setCookie.includes("SameSite=Strict"));
  const cookie = setCookie.split(";")[0] ?? "";
  assert.equal((await post("/browser/session", { ticket })).status, 401, "ticket replay must fail");
  assert.equal((await request("/health", { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await request("/health", { headers: { Cookie: cookie, Origin: "http://untrusted.invalid" } })).status, 403);
  assert.equal((await request("/", { headers: { Host: "untrusted.invalid" } })).status, 403);
  const rpc = await post("/popcorn.v1.HistoryService/ListHistory", {}, {
    Cookie: cookie, Origin: base, "Connect-Protocol-Version": "1",
  });
  assert.equal(rpc.status, 200, "browser cookie must authenticate Connect RPC");
  assert.equal((await post("/browser/diagnostic", {
    event: "media.browser_test", clientTimeMs: Date.now(), data: { phase: "browser" },
  }, { Cookie: cookie, Origin: base })).status, 204);
  assert.equal((await post("/browser/launch", {})).status, 401);
  const launch = await post("/browser/launch", {}, { Authorization: `Bearer ${token}` });
  assert.equal(launch.status, 200);
  const next = await launch.json() as { ticket: string };
  assert.equal((await post("/browser/session", { ticket: next.ticket })).status, 204, "launcher can authorize a new browser");
  assert.equal((await post("/browser/session", { ticket: next.ticket }, { Cookie: cookie })).status, 204, "reopening the app keeps the browser session");
  assert.equal((await request("/browser/network")).status, 401);
  const network = await (await request("/browser/network", {
    headers: { Authorization: `Bearer ${token}` },
  })).json() as { addresses: string[]; pairingCode: string };
  assert.match(network.pairingCode, /^[0-9]{6}$/);
  assert.equal((await post("/browser/pair", { code: "invalid" }, { Origin: base })).status, 401);
  const paired = await post("/browser/pair", { code: network.pairingCode }, { Origin: base });
  assert.equal(paired.status, 204);
  const pairedCookie = paired.headers.get("Set-Cookie")?.split(";")[0] ?? "";
  const playerId = crypto.randomUUID();
  const playerPath = `/browser/player/${playerId}`;
  const playerIntent = { context: { sourceId: "fixture", fileIndex: 0, title: { title: "Fixture" } }, position: 42 };
  assert.equal((await post(playerPath, playerIntent)).status, 401);
  assert.equal((await request(playerPath)).status, 401);
  assert.equal((await request(playerPath, { headers: { Cookie: cookie } })).status, 404);
  assert.equal((await post(playerPath, { position: -1 }, { Cookie: cookie })).status, 400);
  assert.equal((await post(playerPath, playerIntent, { Cookie: cookie, Origin: base })).status, 204);
  const intentResponse = await request(playerPath, { headers: { Cookie: cookie } });
  assert.equal(intentResponse.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await intentResponse.json(), playerIntent, "new tabs obtain their playback intent from the server");
  assert.equal((await post(playerPath, { ...playerIntent, context: { padding: "x".repeat(66_000) } }, { Cookie: cookie })).status, 413);
  for (const address of network.addresses) {
    assert.equal((await fetch(address)).status, 200, "LAN serves the interface");
    assert.deepEqual(await (await fetch(address + playerPath, { headers: { Cookie: pairedCookie } })).json(), playerIntent);
    assert.equal((await fetch(`${address}/health`)).status, 401, "LAN requires pairing");
    assert.equal((await fetch(`${address}/browser/pair`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: address },
      body: JSON.stringify({ code: network.pairingCode }),
    })).status, 204, "LAN pairing accepts its own origin");
    assert.equal((await fetch(`${address}/health`, { headers: { Cookie: pairedCookie } })).status, 200);
    assert.equal((await fetch(`${address}/health`, { headers: { Cookie: pairedCookie, Origin: base } })).status, 403, "loopback origin cannot impersonate LAN origin");
    const id = "00000000-0000-4000-8000-000000000042";
    assert.equal((await fetch(`${address}/media/${id}?token=invalid`, { headers: { Origin: "http://untrusted.invalid" } })).status, 403);
    assert.equal((await fetch(`${address}/media/${id}/stream?token=invalid&generation=1`, { headers: { Origin: "http://untrusted.invalid" } })).status, 403);
  }
  backend.stdin.write('{"event":"shutdown"}\n');
  await backend.stdin.flush();
  timeout = setTimeout(() => backend.kill(), 12_000);
  assert.equal(await backend.exited, 0);
  console.log("Browser smoke passed: preferred/fallback port, server-backed player tabs, LAN access, pairing, media origins, assets, private launch, cookie, RPC, origins, host, diagnostics, reopening and shutdown.");
} finally {
  clearTimeout(timeout);
  reservation?.stop(true);
  backend.kill();
  await backend.exited;
  await rm(temporary, { recursive: true, force: true });
}
