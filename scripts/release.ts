// Calculates and applies CI-only release versions while keeping manifests synchronized.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertNewer, nextVersionFromTags, parseVersion, replaceVersion } from "./release-version";

const root = resolve(import.meta.dir, "..");
const files = [
  ["Cargo.toml", 1],
  ["apps/desktop/package.json", 1],
  ["packages/sdk/package.json", 1],
  ["apps/desktop/src-tauri/tauri.conf.json", 1],
  ["Cargo.lock", 4],
  ["bun.lock", 2],
] as const;

async function sources() {
  const values = await Promise.all(files.map(async ([path, count]) => ({
    path,
    count,
    source: await readFile(resolve(root, path), "utf8"),
  })));
  const config = values.find((file) => file.path.endsWith("tauri.conf.json"));
  const current = (JSON.parse(config?.source ?? "{}") as { version: string }).version;
  parseVersion(current);
  for (const file of values) {
    try {
      replaceVersion(file.source, current, current, file.count);
    } catch (error) {
      throw new Error(`${file.path}: ${String(error)}`);
    }
  }
  return { current, values };
}

function tags(): string[] {
  const result = Bun.spawnSync(["git", "tag", "--list", "v*"], { cwd: root });
  if (result.exitCode !== 0) throw new Error("Não foi possível consultar as tags Git.");
  return result.stdout.toString().split(/\r?\n/).filter(Boolean);
}

async function applyVersion(next: string): Promise<void> {
  if (process.env["GITHUB_ACTIONS"] !== "true") {
    throw new Error("Versões só podem ser aplicadas pelo workflow do GitHub Actions.");
  }
  parseVersion(next);
  const { current, values } = await sources();
  assertNewer(next, current);
  const updates = values.map((file) => ({
    ...file,
    updated: replaceVersion(file.source, current, next, file.count),
  }));
  const written: typeof updates = [];
  try {
    for (const file of updates) {
      written.push(file);
      await writeFile(resolve(root, file.path), file.updated);
    }
  } catch (error) {
    for (const file of written) await writeFile(resolve(root, file.path), file.source);
    throw error;
  }
  console.log(`Versão aplicada no runner: ${current} → ${next}`);
}

async function main(): Promise<void> {
  const [command, value, ...extra] = process.argv.slice(2);
  if (command === "--help" || command === undefined) {
    console.log([
      "bun run release --next",
      "bun run release --check [AAAA.MM.DDNN]",
      "bun run release --apply AAAA.MM.DDNN  # GitHub Actions only",
    ].join("\n"));
    return;
  }
  if (extra.length > 0) throw new Error("Uso inválido. Execute bun run release --help.");
  if (command === "--next" && value === undefined) {
    const { current } = await sources();
    console.log(nextVersionFromTags(current, tags()));
    return;
  }
  if (command === "--check") {
    const { current } = await sources();
    if (value !== undefined && value !== current) {
      throw new Error(`Versão ${current} não coincide com ${value}.`);
    }
    console.log(`Versões e lockfiles sincronizados: ${current}`);
    return;
  }
  if (command === "--apply" && value !== undefined) {
    await applyVersion(value);
    return;
  }
  throw new Error("Uso inválido. Execute bun run release --help.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
