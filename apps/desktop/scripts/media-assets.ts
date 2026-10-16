// Build-time verified downloads and ZIP member extraction using OS-provided tools.
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MediaAsset } from "./media-tools.lock";

const downloads = fileURLToPath(new URL("../src-tauri/binaries/.downloads/", import.meta.url));
export class MediaToolsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaToolsError";
  }
}

export function verifyHash(bytes: Uint8Array, sha256: string, source: string): void {
  const actual = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (actual !== sha256) {
    throw new MediaToolsError(`SHA256 mismatch for ${source}: expected ${sha256}, got ${actual}.`);
  }
}

async function writeAsset(destination: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await Bun.write(temporary, bytes);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function stageAsset(destination: string, asset: MediaAsset): Promise<void> {
  const existing = Bun.file(destination);
  if (await existing.exists()) {
    verifyHash(await existing.bytes(), asset.sha256, destination);
    return;
  }
  let bytes: Uint8Array;
  if (asset.archive) {
    const format = asset.archive.format ?? "zip";
    const archive = join(downloads, `${asset.archive.sha256}.${format}`);
    await stageAsset(archive, { name: asset.name, url: asset.url, sha256: asset.archive.sha256 });
    const args =
      format === "tar.xz"
        ? ["/usr/bin/tar", "-xOJf", archive, asset.archive.member]
        : process.platform === "win32"
          ? [
              "powershell.exe",
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
                "$zip=[IO.Compression.ZipFile]::OpenRead($env:POPCORN_ARCHIVE); " +
                "try { $stream=$zip.GetEntry($env:POPCORN_ARCHIVE_MEMBER).Open(); " +
                "try { $stream.CopyTo([Console]::OpenStandardOutput()) } finally { $stream.Dispose() } " +
                "} finally { $zip.Dispose() }",
            ]
          : ["/usr/bin/unzip", "-p", archive, asset.archive.member];
    const extract = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
      env: { ...Bun.env, POPCORN_ARCHIVE: archive, POPCORN_ARCHIVE_MEMBER: asset.archive.member },
    });
    const [buffer, stderr, code] = await Promise.all([
      new Response(extract.stdout).arrayBuffer(),
      new Response(extract.stderr).text(),
      extract.exited,
    ]);
    if (code !== 0) throw new MediaToolsError(`Archive extraction failed (${code}): ${stderr}`);
    bytes = new Uint8Array(buffer);
  } else {
    // Build-time fetch only: bounded request, explicit status check, pinned content.
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok)
      throw new MediaToolsError(`Download failed (${response.status}): ${asset.url}`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  verifyHash(bytes, asset.sha256, asset.url);
  await writeAsset(destination, bytes);
}
