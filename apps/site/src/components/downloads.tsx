// Consulta releases e renderiza os cartões variantes de download por plataforma.
import {
	Apple,
	ArrowDownToLine,
	Check,
	ExternalLink,
	LoaderCircle,
	MonitorDown,
	Terminal,
} from "lucide-solid";
import {
	type Component,
	createSignal,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	fetchLatestRelease,
	formatBytes,
	formatReleaseDate,
	type LatestRelease,
	type Platform,
	RELEASES_URL,
} from "~/lib/github-release";
import { downloadCard, downloads } from "~/styles/downloads";
import { eyebrow } from "~/styles/site";

interface PlatformCardProps {
	platform: Platform;
	title: string;
	detail: string;
	icon: Component<{ size?: number; strokeWidth?: number }>;
	release: LatestRelease | undefined;
	recommended: boolean;
	pending: boolean;
	onDownload: (platform: Platform) => void;
}

function PlatformCard(props: PlatformCardProps) {
	const asset = () => props.release?.assets[props.platform];
	const Icon = props.icon;
	const styles = () => downloadCard({ recommended: props.recommended });

	return (
		<article class={styles().root()}>
			<div class={styles().topline()}>
				<span class={styles().icon()}>
					<Icon size={24} strokeWidth={1.8} />
				</span>
				<Show when={props.recommended}>
					<span class={styles().badge()}>Recomendado</span>
				</Show>
			</div>
			<div class={styles().copy()}>
				<h3>{props.title}</h3>
				<p>{props.detail}</p>
			</div>
			<div class={styles().meta()} aria-live="polite">
				<Show when={asset()} fallback={<span>Verificação em tempo real</span>}>
					{(current) => (
						<>
							<span>Versão {props.release?.version}</span>
							<span>{formatBytes(current().size)}</span>
						</>
					)}
				</Show>
			</div>
			<button
				class={styles().button()}
				type="button"
				disabled={props.pending}
				onClick={() => props.onDownload(props.platform)}
			>
				<Show when={props.pending} fallback={<ArrowDownToLine size={19} />}>
					<LoaderCircle class="animate-spin" size={19} />
				</Show>
				{props.pending
					? "Buscando a versão mais recente…"
					: `Baixar para ${props.title}`}
			</button>
			<Show when={asset()?.checksumUrl}>
				{(url) => (
					<a
						class={styles().checksum()}
						href={url()}
						target="_blank"
						rel="noreferrer"
					>
						Verificar SHA-256 <ExternalLink size={13} />
					</a>
				)}
			</Show>
		</article>
	);
}

function detectPlatform(): Platform | undefined {
	const value = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
	if (value.includes("mac")) return "macos";
	if (value.includes("win")) return "windows";
	return undefined;
}

export function Downloads() {
	const styles = downloads();
	const futureCard = downloadCard({ future: true });
	const [release, setRelease] = createSignal<LatestRelease>();
	const [recommended, setRecommended] = createSignal<Platform>();
	const [pending, setPending] = createSignal<Platform>();
	const [message, setMessage] = createSignal(
		"Consultando a versão mais recente no GitHub…",
	);

	async function refresh(signal?: AbortSignal) {
		const latest = await fetchLatestRelease(signal);
		setRelease(latest);
		setMessage(
			`Versão ${latest.version} · publicada em ${formatReleaseDate(latest.publishedAt)}`,
		);
		return latest;
	}

	onMount(() => {
		setRecommended(detectPlatform());
		const controller = new AbortController();
		void refresh(controller.signal).catch((error: unknown) => {
			if (controller.signal.aborted) return;
			setMessage(
				error instanceof Error
					? error.message
					: "Não foi possível consultar o GitHub.",
			);
		});
		onCleanup(() => controller.abort());
	});

	async function download(platform: Platform) {
		setPending(platform);
		setMessage("Confirmando a versão mais recente antes do download…");
		try {
			const latest = await refresh();
			const asset = latest.assets[platform];
			if (!asset)
				throw new Error(
					`A versão ${latest.version} ainda não possui esse instalador.`,
				);
			window.location.assign(asset.url);
		} catch (error) {
			setMessage(
				error instanceof Error
					? error.message
					: "Não foi possível iniciar o download.",
			);
		} finally {
			setPending(undefined);
		}
	}

	return (
		<section
			class={styles.section()}
			id="download"
			aria-labelledby="download-title"
		>
			<div class={styles.heading()}>
				<p class={eyebrow()}>Download</p>
				<h2 id="download-title">
					Escolha seu sistema. O resto é com o Popcorn.
				</h2>
				<p>
					Os instaladores vêm da release oficial mais recente no GitHub,
					conferida novamente no instante do clique.
				</p>
			</div>

			<div class={styles.status()} aria-live="polite">
				<Show
					when={release()}
					fallback={<LoaderCircle class="animate-spin" size={15} />}
				>
					<Check size={15} />
				</Show>
				<span>{message()}</span>
				<Show
					when={release()}
					fallback={
						<a href={RELEASES_URL} target="_blank" rel="noreferrer">
							Ver releases <ExternalLink size={13} />
						</a>
					}
				>
					{(current) => (
						<a href={current().releaseUrl} target="_blank" rel="noreferrer">
							Notas da versão <ExternalLink size={13} />
						</a>
					)}
				</Show>
			</div>

			<div class={styles.grid()}>
				<PlatformCard
					platform="windows"
					title="Windows"
					detail="Windows 10 ou posterior · x64 · instalador EXE"
					icon={MonitorDown}
					release={release()}
					recommended={recommended() === "windows"}
					pending={pending() === "windows"}
					onDownload={download}
				/>
				<PlatformCard
					platform="macos"
					title="macOS"
					detail="Mac com Apple Silicon · imagem DMG"
					icon={Apple}
					release={release()}
					recommended={recommended() === "macos"}
					pending={pending() === "macos"}
					onDownload={download}
				/>
				<article class={futureCard.root()}>
					<div class={futureCard.topline()}>
						<span class={futureCard.icon()}>
							<Terminal size={24} strokeWidth={1.8} />
						</span>
						<span class={futureCard.badge()}>No futuro</span>
					</div>
					<div class={futureCard.copy()}>
						<h3>Linux</h3>
						<p>O suporte oficial para Linux está no nosso horizonte.</p>
					</div>
					<a
						class={futureCard.button()}
						href={RELEASES_URL}
						target="_blank"
						rel="noreferrer"
					>
						Acompanhar o projeto <ExternalLink size={16} />
					</a>
				</article>
			</div>
		</section>
	);
}
