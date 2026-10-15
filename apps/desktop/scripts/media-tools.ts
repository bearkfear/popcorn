// Stages only reviewed, hash-pinned executables; never discovers FFmpeg on PATH.
import { chmod, copyFile, mkdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mediaNotices, mediaRelease, mediaTargets } from "./media-tools.lock";
import { MediaToolsError, stageAsset, verifyHash } from "./media-assets";
export { MediaToolsError } from "./media-assets";

export const mediaDirectory = fileURLToPath(new URL("../src-tauri/binaries/", import.meta.url));
const noticeRoot = join(mediaDirectory, "media-tools");
const tools = ["ffmpeg", "ffprobe"] as const;
type MediaTarget = keyof typeof mediaTargets;
const nativeTarget = process.platform === "darwin" && process.arch === "arm64"
  ? "aarch64-apple-darwin"
  : process.platform === "win32" && process.arch === "x64"
    ? "x86_64-pc-windows-msvc"
    : undefined;

export function hostTarget(): MediaTarget {
  if (!nativeTarget) throw new MediaToolsError(`No reviewed FFmpeg distribution for ${process.platform}/${process.arch}.`);
  return nativeTarget;
}

function parseTarget(target: string): MediaTarget {
  if (target === "aarch64-apple-darwin" || target === "x86_64-pc-windows-msvc") return target;
  throw new MediaToolsError(`No reviewed FFmpeg distribution for ${target}; Linux is not staged yet.`);
}

async function runTool(path: string, args: string[]): Promise<string> {
  const process = Bun.spawn([path, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
    env: { ...Bun.env, PATH: "", DYLD_LIBRARY_PATH: "", DYLD_FALLBACK_LIBRARY_PATH: "" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (code !== 0) throw new MediaToolsError(`${path} ${args.join(" ")} failed (${code}): ${stderr}`);
  return stdout;
}

export async function validateMediaTools(targetName: string): Promise<void> {
  const target = parseTarget(targetName);
  const noticeDirectory = join(noticeRoot, target);
  const extension = target.includes("windows") ? ".exe" : "";
  const native = target === nativeTarget;
  for (const tool of tools) {
    const path = join(mediaDirectory, `popcorn-${tool}-${target}${extension}`);
    const bytes = await Bun.file(path).bytes();
    verifyHash(bytes, mediaTargets[target][tool].sha256, path);
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const valid = target === "aarch64-apple-darwin"
      ? header.getUint32(0, true) === 0xfeedfacf && header.getUint32(4, true) === 0x0100000c
      : bytes[0] === 0x4d && bytes[1] === 0x5a &&
        header.getUint32(header.getUint32(0x3c, true), true) === 0x4550 &&
        header.getUint16(header.getUint32(0x3c, true) + 4, true) === 0x8664;
    if (!valid) throw new MediaToolsError(`Wrong executable architecture: ${path}`);
    if (!native) continue;
    const version = await runTool(path, ["-version"]);
    if (!version.startsWith(`${tool} version ${mediaRelease.version}`) ||
        !version.includes("--enable-gpl") || !version.includes("--enable-version3") ||
        version.includes("--enable-nonfree")) {
      throw new MediaToolsError(`Unexpected version or license configuration: ${path}`);
    }
    if (tool === "ffmpeg") {
      const filters = await runTool(path, ["-hide_banner", "-filters"]);
      const encoders = await runTool(path, ["-hide_banner", "-encoders"]);
      for (const filter of ["zscale", "tonemap"]) {
        if (!new RegExp(`\\s${filter}\\s`).test(filters)) throw new MediaToolsError(`Missing ${filter}: ${path}`);
      }
      for (const encoder of ["libx264", "aac"]) {
        if (!new RegExp(`\\s${encoder}\\s`).test(encoders)) throw new MediaToolsError(`Missing ${encoder}: ${path}`);
      }
    }
    if (target === "aarch64-apple-darwin") {
      const dependencies = await runTool("/usr/bin/otool", ["-L", path]);
      const external = dependencies.split("\n").slice(1).filter((line) => line.trim()).filter(
        (line) => !/^\s+\/(usr\/lib|System\/Library)\//.test(line),
      );
      if (external.length) throw new MediaToolsError(`Non-system dependencies in ${path}: ${external.join(", ")}`);
    }
  }
  for (const notice of [...mediaNotices, ...mediaTargets[target].notices]) {
    const path = join(noticeDirectory, notice.name);
    verifyHash(await Bun.file(path).bytes(), notice.sha256, path);
  }
  const notice = Bun.file(new URL("./media-tools-NOTICE.txt", import.meta.url));
  const stagedNotice = Bun.file(join(noticeDirectory, "NOTICE.txt"));
  if (await notice.text() !== await stagedNotice.text()) {
    throw new MediaToolsError("Bundled media NOTICE.txt is stale.");
  }
  const provenance = JSON.stringify({
    ...mediaRelease, target, distribution: mediaTargets[target], notices: mediaNotices,
  }, null, 2) + "\n";
  if (await Bun.file(join(noticeDirectory, "provenance.json")).text() !== provenance) {
    throw new MediaToolsError("Bundled media provenance.json is stale.");
  }
}

export async function stageMediaTools(targetName: string): Promise<void> {
  const target = parseTarget(targetName);
  const noticeDirectory = join(noticeRoot, target);
  const extension = target.includes("windows") ? ".exe" : "";
  const explicit = [Bun.env["POPCORN_FFMPEG_PATH"], Bun.env["POPCORN_FFPROBE_PATH"]];
  if (explicit.some(Boolean) && !explicit.every(Boolean)) {
    throw new MediaToolsError("Set both POPCORN_FFMPEG_PATH and POPCORN_FFPROBE_PATH, or neither.");
  }
  await mkdir(noticeDirectory, { recursive: true });
  for (const tool of tools) {
    const asset = mediaTargets[target][tool];
    const source = Bun.env[tool === "ffmpeg" ? "POPCORN_FFMPEG_PATH" : "POPCORN_FFPROBE_PATH"];
    const destination = join(mediaDirectory, `popcorn-${tool}-${target}${extension}`);
    if (source) {
      if (!isAbsolute(source)) throw new MediaToolsError(`Explicit tool path must be absolute: ${source}`);
      verifyHash(await Bun.file(source).bytes(), asset.sha256, source);
      if (source !== destination) await copyFile(source, destination);
    } else {
      await stageAsset(destination, asset);
    }
    await chmod(destination, 0o755);
  }
  for (const notice of [...mediaNotices, ...mediaTargets[target].notices]) {
    await stageAsset(join(noticeDirectory, notice.name), notice);
  }
  await copyFile(
    fileURLToPath(new URL("./media-tools-NOTICE.txt", import.meta.url)),
    join(noticeDirectory, "NOTICE.txt"),
  );
  await Bun.write(join(noticeDirectory, "provenance.json"), JSON.stringify({
    ...mediaRelease, target, distribution: mediaTargets[target], notices: mediaNotices,
  }, null, 2) + "\n");
  await validateMediaTools(target);
  // Direct runs of the staged server also resolve plain sibling executable names.
  await copyMediaTools(target, mediaDirectory);
  console.info(`Prepared FFmpeg ${mediaRelease.version} and ffprobe for ${target}${target === nativeTarget ? " (native execution verified)" : " (hash/architecture verified; native execution required)"}.`);
}

export async function copyMediaTools(target: string, directory: string): Promise<void> {
  const extension = parseTarget(target).includes("windows") ? ".exe" : "";
  await mkdir(directory, { recursive: true });
  for (const tool of tools) {
    const name = `popcorn-${tool}${extension}`;
    const destination = join(directory, name);
    await copyFile(join(mediaDirectory, `popcorn-${tool}-${target}${extension}`), destination);
    await chmod(destination, 0o755);
  }
}
