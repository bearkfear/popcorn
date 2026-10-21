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
  backend.stdin.write('{"event":"shutdown"}\n');
  await backend.stdin.flush();
  timeout = setTimeout(() => backend.kill(), 12_000);
  assert.equal(await backend.exited, 0);
  console.log("Browser smoke passed: assets, private launch, cookie, RPC, origins, host, diagnostics, reopening and shutdown.");
} finally {
  clearTimeout(timeout);
  backend.kill();
  await backend.exited;
  await rm(temporary, { recursive: true, force: true });
}
