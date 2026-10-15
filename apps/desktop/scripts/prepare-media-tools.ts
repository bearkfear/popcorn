// Standalone staging/check entry point; the normal Tauri hook calls the same code.
import { isAbsolute } from "node:path";
import { copyMediaTools, hostTarget, MediaToolsError, stageMediaTools, validateMediaTools } from "./media-tools";

const args = Bun.argv.slice(2);
let target = Bun.env["TAURI_ENV_TARGET_TRIPLE"];
let check = false;
let serverDirectory: string | undefined;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--check") {
    check = true;
  } else if (argument === "--target" && args[index + 1]) {
    target = args[index + 1];
    index += 1;
  } else if (argument === "--server-dir" && args[index + 1]) {
    serverDirectory = args[index + 1];
    index += 1;
  } else {
    throw new MediaToolsError("Usage: bun scripts/prepare-media-tools.ts [--target <Rust triple>] [--check | --server-dir <absolute path>]");
  }
}
if (serverDirectory && (check || !isAbsolute(serverDirectory))) {
  throw new MediaToolsError("--server-dir requires an absolute path and cannot be combined with --check.");
}
const resolved = target ?? hostTarget();
if (check) {
  await validateMediaTools(resolved);
  console.info(`Bundled media tools validated for ${resolved}.`);
} else {
  await stageMediaTools(resolved);
  if (serverDirectory) await copyMediaTools(resolved, serverDirectory);
}
