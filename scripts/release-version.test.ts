// Exercise calendar boundaries, migration ordering, and fail-before-write validation.
import { describe, expect, test } from "bun:test";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertNewer, nextVersion, parseVersion, replaceVersion } from "./release-version";

describe("release versions", () => {
  test("migrates the existing release and increments same-day revisions", () => {
    const today = new Date(2026, 9, 17, 12);
    expect(nextVersion("2026.10.17", today)).toBe("2026.10.1702");
    expect(nextVersion("2026.10.1702", today)).toBe("2026.10.1703");
  });

  test("starts a new day's revision and preserves numeric ordering", () => {
    expect(nextVersion("2026.10.1799", new Date(2026, 9, 18))).toBe("2026.10.1801");
    expect(nextVersion("2026.12.3199", new Date(2027, 0, 1))).toBe("2027.1.101");
    expect(() => assertNewer("2026.10.18", "2026.10.1702")).toThrow();
  });

  test("rejects invalid dates, zero revisions, exhaustion and clock rollback", () => {
    for (const value of ["2026.2.3001", "2026.10.1700", "2026.10.17-2", "2026.13.101", "2027.01.0101", "2026.10.99"]) {
      expect(() => parseVersion(value)).toThrow();
    }
    expect(parseVersion("2028.2.2901").date).toBe("2028-02-29");
    expect(() => nextVersion("2026.10.1799", new Date(2026, 9, 17))).toThrow();
    expect(() => nextVersion("2026.10.1702", new Date(2026, 9, 16))).toThrow();
    expect(() => assertNewer("2026.10.1702", "2026.10.1702")).toThrow();
  });

  test("updates version fields without touching dependency references", () => {
    const source = 'version = "2026.10.17"\ndep = "2026.10.17"\n';
    expect(replaceVersion(source, "2026.10.17", "2026.10.1702", 1))
      .toBe('version = "2026.10.1702"\ndep = "2026.10.17"\n');
    expect(() => replaceVersion(source, "2026.10.17", "2026.10.1702", 2)).toThrow();
  });
});

test("CLI synchronizes all six files and rejects inconsistent inputs without writing", async () => {
  const root = resolve(import.meta.dir, "..");
  const fixture = await mkdtemp(join(tmpdir(), "popcorn-release-"));
  const files = ["Cargo.toml", "Cargo.lock", "bun.lock", "apps/desktop/package.json",
    "packages/sdk/package.json", "apps/desktop/src-tauri/tauri.conf.json"];
  try {
    for (const path of [...files, "scripts/release.ts", "scripts/release-version.ts"]) {
      await mkdir(dirname(join(fixture, path)), { recursive: true });
      await cp(join(root, path), join(fixture, path));
    }
    const config = JSON.parse(await readFile(join(fixture, "apps/desktop/src-tauri/tauri.conf.json"), "utf8")) as { version: string };
    for (const path of files) {
      const source = await readFile(join(fixture, path), "utf8");
      const count = path === "Cargo.lock" ? 4 : path === "bun.lock" ? 2 : 1;
      await writeFile(join(fixture, path), replaceVersion(source, config.version, "2026.10.17", count));
    }
    expect(Bun.spawnSync(["git", "init", "--quiet", fixture]).exitCode).toBe(0);
    const run = (...args: string[]) => Bun.spawnSync([process.execPath, "scripts/release.ts", ...args], { cwd: fixture });
    const original = await readFile(join(fixture, "Cargo.toml"), "utf8");
    expect(run("2026.10.1702", "--dry-run").exitCode).toBe(0);
    expect(await readFile(join(fixture, "Cargo.toml"), "utf8")).toBe(original);
    expect(run("2026.10.1702").exitCode).toBe(0);
    expect(run("--check", "--tag", "v2026.10.1702").exitCode).toBe(0);
    expect(run("--check", "--tag", "v2026.10.17").exitCode).toBe(1);
    expect(run("2026.10.17").exitCode).toBe(1);
    const prepared = await Promise.all(files.map((path) => readFile(join(fixture, path), "utf8")));
    await writeFile(join(fixture, "packages/sdk/package.json"), '{"version":"2026.10.17"}\n');
    expect(run("2026.10.1703").exitCode).toBe(1);
    for (const [index, path] of files.entries()) {
      const expected = prepared[index];
      if (expected === undefined) throw new Error(`Missing fixture: ${path}`);
      if (path !== "packages/sdk/package.json") expect(await readFile(join(fixture, path), "utf8")).toBe(expected);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
