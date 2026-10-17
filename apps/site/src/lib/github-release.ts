// Valida a release estável mais recente do GitHub e normaliza seus instaladores.
export const RELEASES_URL = "https://github.com/bearkfear/popcorn/releases";
const LATEST_RELEASE_API =
	"https://api.github.com/repos/bearkfear/popcorn/releases/latest";

export type Platform = "windows" | "macos";

export interface ReleaseAsset {
	name: string;
	url: string;
	size: number;
	checksumUrl?: string;
}

export interface LatestRelease {
	version: string;
	tag: string;
	publishedAt: string;
	releaseUrl: string;
	assets: Partial<Record<Platform, ReleaseAsset>>;
}

interface GitHubAsset {
	name: string;
	browser_download_url: string;
	size: number;
	state: string;
}

interface GitHubRelease {
	tag_name: string;
	published_at: string;
	html_url: string;
	draft: boolean;
	prerelease: boolean;
	assets: GitHubAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isGitHubAsset(value: unknown): value is GitHubAsset {
	return (
		isRecord(value) &&
		typeof value.name === "string" &&
		typeof value.browser_download_url === "string" &&
		typeof value.size === "number" &&
		typeof value.state === "string"
	);
}

function parseGitHubRelease(value: unknown): GitHubRelease {
	if (
		!isRecord(value) ||
		typeof value.tag_name !== "string" ||
		typeof value.published_at !== "string" ||
		typeof value.html_url !== "string" ||
		typeof value.draft !== "boolean" ||
		typeof value.prerelease !== "boolean" ||
		!Array.isArray(value.assets) ||
		!value.assets.every(isGitHubAsset)
	) {
		throw new Error("O GitHub retornou uma release em um formato inesperado.");
	}

	return {
		tag_name: value.tag_name,
		published_at: value.published_at,
		html_url: value.html_url,
		draft: value.draft,
		prerelease: value.prerelease,
		assets: value.assets,
	};
}

function findAsset(assets: GitHubAsset[], name: string) {
	const matches = assets.filter(
		(asset) => asset.state === "uploaded" && asset.name === name,
	);
	if (matches.length > 1) {
		throw new Error(`A release contém mais de um asset chamado ${name}.`);
	}
	return matches[0];
}

function normalizeAsset(
	asset: GitHubAsset | undefined,
	checksum: GitHubAsset | undefined,
): ReleaseAsset | undefined {
	if (!asset) return undefined;
	const downloadUrl = new URL(asset.browser_download_url);
	const expectedPrefix = "/bearkfear/popcorn/releases/download/";
	if (
		downloadUrl.origin !== "https://github.com" ||
		!downloadUrl.pathname.startsWith(expectedPrefix)
	) {
		throw new Error(
			`O asset ${asset.name} possui um endereço de download inesperado.`,
		);
	}
	return {
		name: asset.name,
		url: asset.browser_download_url,
		size: asset.size,
		...(checksum ? { checksumUrl: checksum.browser_download_url } : {}),
	};
}

export async function fetchLatestRelease(
	signal?: AbortSignal,
): Promise<LatestRelease> {
	const response = await fetch(LATEST_RELEASE_API, {
		cache: "no-store",
		headers: {
			Accept: "application/vnd.github+json",
		},
		...(signal ? { signal } : {}),
	});

	if (response.status === 404) {
		throw new Error("A primeira versão pública ainda não foi publicada.");
	}
	if (response.status === 403 || response.status === 429) {
		throw new Error(
			"O GitHub limitou temporariamente as consultas deste navegador.",
		);
	}
	if (!response.ok) {
		throw new Error("Não foi possível consultar a versão mais recente agora.");
	}

	const release = parseGitHubRelease(await response.json());
	// Release tags use a numeric CalVer variant. The final segment can also
	// include the build number (for example: v2026.10.1703).
	const match = /^v(\d{4}\.\d{2}\.\d+)$/.exec(release.tag_name);
	if (!match || release.draft || release.prerelease) {
		throw new Error(
			"A versão mais recente não segue o formato de release estável do Popcorn.",
		);
	}

	const version = match[1];
	if (!version) throw new Error("A release não possui uma versão válida.");

	const windowsChecksum = findAsset(release.assets, "SHA256SUMS-windows.txt");
	const macosChecksum = findAsset(release.assets, "SHA256SUMS-macos.txt");
	const windows = normalizeAsset(
		findAsset(release.assets, `Popcorn_${version}_windows_x64_setup.exe`),
		windowsChecksum,
	);
	const macos = normalizeAsset(
		findAsset(release.assets, `Popcorn_${version}_macos_arm64.dmg`),
		macosChecksum,
	);

	return {
		version,
		tag: release.tag_name,
		publishedAt: release.published_at,
		releaseUrl: release.html_url,
		assets: {
			...(windows ? { windows } : {}),
			...(macos ? { macos } : {}),
		},
	};
}

export function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function formatReleaseDate(value: string) {
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "long",
		year: "numeric",
	}).format(new Date(value));
}
