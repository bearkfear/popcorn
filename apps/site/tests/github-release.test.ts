// Verifica a interpretação dos assets e versões publicados no GitHub.
import { afterEach, describe, expect, test } from "bun:test";
import { fetchLatestRelease } from "../src/lib/github-release";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("fetchLatestRelease", () => {
	test("accepts a CalVer tag whose final segment includes a build number", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				Response.json({
					tag_name: "v2026.10.1703",
					published_at: "2026-10-17T03:00:00Z",
					html_url:
						"https://github.com/bearkfear/popcorn/releases/tag/v2026.10.1703",
					draft: false,
					prerelease: false,
					assets: [
						{
							name: "Popcorn_2026.10.1703_windows_x64_setup.exe",
							browser_download_url:
								"https://github.com/bearkfear/popcorn/releases/download/v2026.10.1703/Popcorn_2026.10.1703_windows_x64_setup.exe",
							size: 72_000_000,
							state: "uploaded",
						},
						{
							name: "Popcorn_2026.10.1703_macos_arm64.dmg",
							browser_download_url:
								"https://github.com/bearkfear/popcorn/releases/download/v2026.10.1703/Popcorn_2026.10.1703_macos_arm64.dmg",
							size: 69_000_000,
							state: "uploaded",
						},
					],
				}),
			)) as typeof fetch;

		const release = await fetchLatestRelease();

		expect(release.version).toBe("2026.10.1703");
		expect(release.assets.windows?.name).toBe(
			"Popcorn_2026.10.1703_windows_x64_setup.exe",
		);
		expect(release.assets.macos?.name).toBe(
			"Popcorn_2026.10.1703_macos_arm64.dmg",
		);
	});
});
