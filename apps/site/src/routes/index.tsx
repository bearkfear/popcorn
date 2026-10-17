// Compõe a landing page pública, seus metadados e todas as seções de produto.
import { Accordion } from "@ark-ui/solid/accordion";
import { Link, Meta, Title } from "@solidjs/meta";
import {
	ArrowDown,
	ArrowRight,
	ChevronDown,
	CirclePlay,
	CloudOff,
	Code2,
	Database,
	ExternalLink,
	HardDrive,
	History,
	Search,
	ShieldCheck,
	Sparkles,
} from "lucide-solid";
import { For } from "solid-js";
import { BrandMark } from "~/components/brand-mark";
import { Downloads } from "~/components/downloads";
import { ProductPreview } from "~/components/product-preview";
import { site } from "~/config/site";
import { action, eyebrow, page } from "~/styles/site";

const features = [
	{
		icon: Search,
		number: "01",
		title: "Descubra sem perder o fio",
		text: "Explore filmes e séries, pesquise por título e navegue por temporadas e episódios em uma interface pensada para o sofá.",
	},
	{
		icon: CirclePlay,
		number: "02",
		title: "Comece antes de terminar",
		text: "O Popcorn prepara a mídia e inicia a reprodução progressiva quando a fonte e o formato permitem.",
	},
	{
		icon: History,
		number: "03",
		title: "Volte exatamente de onde parou",
		text: "Seu histórico, posição e listas pessoais ficam salvos localmente para a próxima sessão.",
	},
] as const;

const faqs = [
	{
		id: "content",
		question: "O Popcorn fornece filmes ou séries?",
		answer:
			"Não. O aplicativo apresenta metadados e permite que você associe arquivos ou fontes que tenha autorização para acessar. O Popcorn não procura nem distribui conteúdo.",
	},
	{
		id: "account",
		question: "Preciso criar uma conta?",
		answer:
			"Não. O aplicativo é executado no seu computador, e o histórico e as configurações permanecem no diretório local da instalação.",
	},
	{
		id: "systems",
		question: "Quais sistemas são suportados?",
		answer:
			"Os primeiros pacotes são destinados a Windows x64 e macOS em Macs com Apple Silicon. O suporte oficial para Linux está planejado para uma etapa futura.",
	},
	{
		id: "formats",
		question: "Quais formatos de vídeo funcionam?",
		answer:
			"A reprodução direta depende dos codecs aceitos pela plataforma. O perfil inicial prioriza MP4 com H.264/AVC e AAC, e o aplicativo pode usar as ferramentas FFmpeg incluídas quando uma conversão compatível for necessária.",
	},
	{
		id: "downloads",
		question: "De onde vêm os instaladores?",
		answer:
			"Os botões consultam a release pública mais recente do repositório oficial no GitHub e usam o endereço do asset publicado ali. A consulta é repetida no momento do clique.",
	},
] as const;

const structuredData = JSON.stringify({
	"@context": "https://schema.org",
	"@graph": [
		{
			"@type": "WebSite",
			"@id": `${site.url}/#website`,
			name: site.name,
			url: `${site.url}/`,
			inLanguage: "pt-BR",
		},
		{
			"@type": "SoftwareApplication",
			"@id": `${site.url}/#software`,
			name: "Popcorn",
			description: site.description,
			url: `${site.url}/`,
			applicationCategory: "MultimediaApplication",
			operatingSystem: ["Windows", "macOS"],
			isAccessibleForFree: true,
			offers: { "@type": "Offer", price: 0, priceCurrency: "BRL" },
			codeRepository: site.repositoryUrl,
		},
	],
});

function scrollToDownload(event: MouseEvent) {
	const downloadSection = document.getElementById("download");
	if (!downloadSection) return;

	event.preventDefault();
	downloadSection.scrollIntoView({
		behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
			? "auto"
			: "smooth",
		block: "start",
	});
	window.history.replaceState(null, "", "#download");
}

export default function Home() {
	const styles = page();

	return (
		<>
			<Title>Popcorn — Filmes e séries no seu desktop</Title>
			<Meta name="description" content={site.description} />
			<Meta
				name="robots"
				content="index, follow, max-image-preview:large, max-snippet:-1"
			/>
			<Meta property="og:type" content="website" />
			<Meta property="og:locale" content="pt_BR" />
			<Meta property="og:site_name" content="Popcorn" />
			<Meta property="og:title" content="Popcorn — Seu cinema, do seu jeito" />
			<Meta property="og:description" content={site.description} />
			<Meta property="og:url" content={`${site.url}/`} />
			<Meta name="twitter:card" content="summary" />
			<Meta name="theme-color" content="#111113" />
			<Link rel="canonical" href={`${site.url}/`} />
			<Link rel="icon" href="/favicon.svg" type="image/svg+xml" />
			<Link rel="manifest" href="/site.webmanifest" />
			<script type="application/ld+json" innerHTML={structuredData} />

			<a class={styles.skipLink()} href="#content">
				Pular para o conteúdo
			</a>
			<header class={styles.header()}>
				<a class={styles.brand()} href="#top" aria-label="Popcorn, início">
					<BrandMark class={styles.brandMark()} />
					<span>Popcorn</span>
				</a>
				<nav class={styles.nav()} aria-label="Navegação principal">
					<a href="#experiencia">Experiência</a>
					<a href="#privacidade">Como funciona</a>
					<a href="#duvidas">Dúvidas</a>
				</nav>
				<a
					class={styles.headerDownload()}
					href="#download"
					onClick={scrollToDownload}
				>
					Baixar agora <ArrowDown size={16} />
				</a>
			</header>

			<main id="content">
				<span id="top" />
				<section class={styles.hero()}>
					<div class={styles.heroNoise()} />
					<div class={styles.heroCopy()}>
						<p class={eyebrow()}>Feito para o desktop</p>
						<h1 class={styles.heroTitle()}>
							Seu catálogo.
							<br />
							Suas fontes.
							<br />
							<em>Seu cinema.</em>
						</h1>
						<p class={styles.heroLede()}>
							Descubra, organize e reproduza seus filmes e séries em uma
							experiência local, direta e sem contas.
						</p>
						<div class={styles.heroActions()}>
							<a
								class={action()}
								href="#download"
								onClick={scrollToDownload}
							>
								Baixar o Popcorn <ArrowDown size={18} />
							</a>
							<a
								class={action({ intent: "secondary" })}
								href={site.repositoryUrl}
								target="_blank"
								rel="noreferrer"
							>
								<Code2 size={18} /> Ver código-fonte <ExternalLink size={14} />
							</a>
						</div>
						<div class={styles.heroNotes()}>
							<span>
								<ShieldCheck size={16} /> Código aberto
							</span>
							<span>
								<CloudOff size={16} /> Sem conta
							</span>
							<span>
								<HardDrive size={16} /> Dados locais
							</span>
						</div>
					</div>
					<ProductPreview />
					<a
						class={styles.scrollCue()}
						href="#experiencia"
						aria-label="Conhecer a experiência"
					>
						<span>Conheça a experiência</span>
						<ArrowDown size={15} />
					</a>
				</section>

				<section
					class={`${styles.section()} ${styles.paperSection()}`}
					id="experiencia"
					aria-labelledby="experience-title"
				>
					<div class={`${styles.sectionHeading()} ${styles.experienceHeading()}`}>
						<div>
							<p class={eyebrow({ tone: "paper" })}>Uma sessão inteira</p>
							<h2 id="experience-title">
								Da descoberta aos créditos,
								<br />
								sem sair do fluxo.
							</h2>
							<p>
								O Popcorn combina catálogo, fontes, reprodução e histórico em um
								aplicativo desktop único — sem transformar sua biblioteca em mais
								uma assinatura.
							</p>
						</div>
					</div>
					<div class={styles.featureList()}>
						<For each={features}>
							{(feature) => {
								const Icon = feature.icon;
								return (
									<article class={styles.featureRow()}>
										<span class={styles.featureNumber()}>{feature.number}</span>
										<span class={styles.featureIcon()}>
											<Icon size={24} strokeWidth={1.7} />
										</span>
										<div class={styles.featureCopy()}>
											<h3>{feature.title}</h3>
											<p>{feature.text}</p>
										</div>
									</article>
								);
							}}
						</For>
					</div>
				</section>

				<section
					class={styles.localSection()}
					id="privacidade"
					aria-labelledby="local-title"
				>
					<div class={styles.localCopy()}>
						<p class={eyebrow({ tone: "accent" })}>Local por princípio</p>
						<h2 id="local-title">
							A nuvem fica no céu.
							<br />
							Seus dados ficam com você.
						</h2>
						<p>
							O cliente e o serviço do Popcorn rodam juntos no seu computador.
							Não há conta obrigatória, servidor de streaming próprio ou
							sincronização silenciosa do seu histórico.
						</p>
						<a href={site.repositoryUrl} target="_blank" rel="noreferrer">
							Conhecer a arquitetura <ArrowRight size={16} />
						</a>
					</div>
					<div
						class={styles.localDiagram()}
						role="img"
						aria-label="Fluxo local do aplicativo"
					>
						<div class={styles.diagramNode()}>
							<BrandMark class={styles.diagramLogo()} />
							<span>
								<small>APLICATIVO</small>
								<strong>Popcorn</strong>
							</span>
						</div>
						<div class={styles.diagramLine()}>
							<i />
							<span>localhost</span>
							<i />
						</div>
						<div class={styles.diagramNode()}>
							<Database size={22} />
							<span>
								<small>SEUS DADOS</small>
								<strong>Histórico e fontes</strong>
							</span>
						</div>
						<div class={styles.privacySeal()}>
							<ShieldCheck size={20} />
							<span>
								<strong>Permanece local</strong>
								<small>por padrão</small>
							</span>
						</div>
					</div>
				</section>

				<Downloads />

				<section
					class={`${styles.section()} ${styles.paperSection()}`}
					id="duvidas"
					aria-labelledby="faq-title"
				>
					<div class={`${styles.sectionHeading()} ${styles.faqHeading()}`}>
						<div>
							<p class={eyebrow({ tone: "paper" })}>Antes da pipoca</p>
							<h2 id="faq-title">
								Perguntas honestas.
								<br />
								Respostas diretas.
							</h2>
						</div>
						<Sparkles size={34} strokeWidth={1.4} />
					</div>
					<Accordion.Root
						class={styles.faqList()}
						collapsible
						defaultValue={["content"]}
					>
						<For each={faqs}>
							{(item, index) => (
								<Accordion.Item class={styles.faqItem()} value={item.id}>
									<Accordion.ItemTrigger class={styles.faqTrigger()}>
										<span class={styles.faqNumber()}>0{index() + 1}</span>
										<span>{item.question}</span>
										<Accordion.ItemIndicator class={styles.faqIndicator()}>
											<ChevronDown size={19} />
										</Accordion.ItemIndicator>
									</Accordion.ItemTrigger>
									<Accordion.ItemContent class={styles.faqContent()}>
										<p>{item.answer}</p>
									</Accordion.ItemContent>
								</Accordion.Item>
							)}
						</For>
					</Accordion.Root>
				</section>

				<section class={styles.closingSection()}>
					<BrandMark class={styles.closingMark()} />
					<p class={eyebrow({ centered: true })}>A próxima sessão começa aqui</p>
					<h2 class={styles.closingTitle()}>
						Escolha o filme.
						<br />
						<em>O Popcorn cuida do resto.</em>
					</h2>
					<a
						class={`${action()} mt-10`}
						href="#download"
						onClick={scrollToDownload}
					>
						Encontrar meu download <ArrowDown size={18} />
					</a>
				</section>
			</main>

			<footer class={styles.footer()}>
				<div class={styles.footerBrand()}>
					<BrandMark class={styles.footerMark()} />
					<div>
						<strong>Popcorn</strong>
						<span>Seu cinema, do seu jeito.</span>
					</div>
				</div>
				<div class={styles.footerLinks()}>
					<a href={site.repositoryUrl} target="_blank" rel="noreferrer">
						GitHub
					</a>
					<a
						href={`${site.repositoryUrl}/releases`}
						target="_blank"
						rel="noreferrer"
					>
						Releases
					</a>
					<a href="#duvidas">Perguntas frequentes</a>
				</div>
				<div class={styles.footerLegal()}>
					<p>
						Use somente arquivos e fontes que você tenha autorização para
						acessar.
					</p>
					<p>
						This product uses the TMDB API but is not endorsed or certified by
						TMDB.
					</p>
				</div>
			</footer>
		</>
	);
}
