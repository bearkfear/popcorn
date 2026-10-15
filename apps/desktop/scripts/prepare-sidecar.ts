import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyMediaTools, stageMediaTools } from "./media-tools";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const release = Bun.argv.includes("--release");
const rustc = Bun.spawn(["rustc", "-vV"], { stdout: "pipe", stderr: "inherit" });
const version = await new Response(rustc.stdout).text();
if ((await rustc.exited) !== 0) process.exit(1);
const target =
  Bun.env["TAURI_ENV_TARGET_TRIPLE"] ??
  version.split("\n").find((line) => line.startsWith("host: "))?.slice(6);
if (!target) {
  console.error("Could not determine the Rust target triple.");
  process.exit(1);
}
// Fail before the Rust build if the required distribution cannot be staged.
await stageMediaTools(target);

const args = [
  "cargo",
  "build",
  "-p",
  "popcorn-server",
  "--message-format=json-render-diagnostics",
  "--target",
  target,
];
if (release) args.push("--release");
const build = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "inherit" });
const output = await new Response(build.stdout).text();
if ((await build.exited) !== 0) process.exit(1);

let executable: string | undefined;
for (const line of output.split("\n").filter(Boolean)) {
  const artifact: unknown = JSON.parse(line);
  if (
    typeof artifact === "object" &&
    artifact !== null &&
    "reason" in artifact &&
    artifact.reason === "compiler-artifact" &&
    "executable" in artifact &&
    typeof artifact.executable === "string"
  ) {
    executable = artifact.executable;
  }
}
if (!executable) {
  console.error("Cargo did not produce the backend executable.");
  process.exit(1);
}
const extension = target.includes("windows") ? ".exe" : "";
const destination = join(
  root,
  "apps/desktop/src-tauri/binaries",
  `popcorn-server-${target}${extension}`,
);
await mkdir(dirname(destination), { recursive: true });
await copyFile(executable, destination);
// Also support invoking the Cargo-built backend directly (outside the shell).
await copyMediaTools(target, dirname(executable));
console.info(`Prepared sidecar for ${target}.`);
