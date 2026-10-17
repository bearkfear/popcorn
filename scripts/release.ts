// Prepare a release locally, keeping manifests and lockfiles synchronized without network access.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertNewer, nextVersion, parseVersion, replaceVersion } from "./release-version";

const root = resolve(import.meta.dir, "..");
const files = [
  ["Cargo.toml", 1],
  ["apps/desktop/package.json", 1],
  ["packages/sdk/package.json", 1],
  ["apps/desktop/src-tauri/tauri.conf.json", 1],
  ["Cargo.lock", 4],
  ["bun.lock", 2],
] as const;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("bun run release [AAAA.MM.DDNN] [--dry-run]\nbun run release --check [--tag vAAAA.MM.DDNN]");
    return;
  }
  const check = args.includes("--check");
  const dryRun = args.includes("--dry-run");
  const tagIndex = args.indexOf("--tag");
  const tag = tagIndex >= 0 ? args[tagIndex + 1] : undefined;
  const positional = args.filter((arg, index) => !arg.startsWith("--") && !(tagIndex >= 0 && index === tagIndex + 1));
  for (const arg of args.filter((arg) => arg.startsWith("--"))) {
    if (!["--check", "--dry-run", "--tag"].includes(arg)) throw new Error(`Opção desconhecida: ${arg}`);
  }
  if (positional.length > 1 || (check && (dryRun || positional.length)) || (tagIndex >= 0 && (!check || !tag))) {
    throw new Error("Uso inválido. Execute bun run release --help.");
  }
  const sources = await Promise.all(files.map(async ([path, count]) => ({
    path, count, source: await readFile(resolve(root, path), "utf8"),
  })));
  const config = sources.find((file) => file.path.endsWith("tauri.conf.json"));
  const current = (JSON.parse(config?.source ?? "{}") as { version: string }).version;
  parseVersion(current);
  // Validate every input before writing any file, including lockfile version counts.
  for (const file of sources) {
    try { replaceVersion(file.source, current, current, file.count); }
    catch (error) { throw new Error(`${file.path}: ${String(error)}`); }
  }
  if (check) {
    if (tag !== undefined && tag !== `v${current}`) throw new Error(`Tag ${tag} não coincide com v${current}.`);
    console.log(`Versões e lockfiles sincronizados: ${current}`);
    return;
  }
  const next = positional[0] ?? nextVersion(current);
  assertNewer(next, current);
  const existingTag = Bun.spawnSync(["git", "tag", "--list", `v${next}`], { cwd: root });
  if (existingTag.exitCode !== 0) throw new Error("Não foi possível consultar as tags locais.");
  if (existingTag.stdout.toString().trim()) throw new Error(`A tag v${next} já existe localmente.`);
  const updates = sources.map((file) => ({ ...file, updated: replaceVersion(file.source, current, next, file.count) }));
  if (!dryRun) {
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
  }
  console.log(`${dryRun ? "Simulação" : "Versão preparada"}: ${current} → ${next}`);
  console.log(updates.map((file) => `  ${file.path}`).join("\n"));
  if (!dryRun) console.log(`\nPara publicar:\ngit add ${files.map(([path]) => path).join(" ")}\ngit commit -m "chore: release ${next}"\ngit push\ngit tag v${next}\ngit push origin v${next}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
