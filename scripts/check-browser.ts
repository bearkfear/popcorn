// Boots the real sidecar and delegates its HTTP smoke scenarios to Hurl.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dir, "..");
const temporary = await mkdtemp(join(tmpdir(), "popcorn-browser-"));
const secret = () => crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
const token = secret();
const ticket = secret();
const playerId = crypto.randomUUID();
const occupiedPort = Bun.argv.includes("--occupied-port");
let reservation: ReturnType<typeof Bun.serve> | undefined;
let preferredWasAvailable = false;

async function runHurl(file: string, variables: Record<string, string>): Promise<void> {
  const environment = { ...process.env };
  for (const [name, value] of Object.entries(variables)) environment[`HURL_VARIABLE_${name}`] = value;
  const child = Bun.spawn(["hurl", "--test", "--max-time", "10s", join(root, "tests/http", file)], {
    cwd: root,
    env: environment,
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await child.exited, 0, `${file} failed`);
}

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

  await runHurl("browser-local.hurl", {
    base,
    token,
    ticket,
    invalid_ticket: secret(),
    player_id: playerId,
    browser_time: Date.now().toString(),
    oversized_padding: "x".repeat(66_000),
  });
  await runHurl("browser-launch.hurl", { base, token });

  const network = await (await fetch(`${base}/browser/network`, {
    headers: { Authorization: `Bearer ${token}` },
  })).json() as { addresses: string[]; pairingCode: string };
  assert.match(network.pairingCode, /^[0-9]{6}$/);
  assert(network.addresses.length > 0, "backend must announce at least one LAN address");
  for (const address of network.addresses) {
    await runHurl("browser-lan.hurl", {
      address,
      loopback_base: base,
      pairing_code: network.pairingCode,
      player_id: playerId,
    });
  }
  backend.stdin.write('{"event":"shutdown"}\n');
  await backend.stdin.flush();
  timeout = setTimeout(() => backend.kill(), 12_000);
  assert.equal(await backend.exited, 0);
  console.log("Browser smoke passed with Hurl: bootstrap, local session, LAN pairing and shutdown.");
} finally {
  clearTimeout(timeout);
  reservation?.stop(true);
  backend.kill();
  await backend.exited;
  await rm(temporary, { recursive: true, force: true });
}
