// Renderiza a página de fallback para rotas públicas inexistentes.
import { Meta, Title } from "@solidjs/meta";
import { ArrowLeft } from "lucide-solid";
import { BrandMark } from "~/components/brand-mark";
import { action, eyebrow, page } from "~/styles/site";

export default function NotFound() {
	const styles = page();

	return (
		<main class={styles.notFound()}>
			<Title>Página não encontrada — Popcorn</Title>
			<Meta name="robots" content="noindex" />
			<BrandMark class={styles.closingMark()} />
			<p class={eyebrow({ centered: true })}>Erro 404</p>
			<h1>
				Essa sessão
				<br />
				não está em cartaz.
			</h1>
			<p>A página que você procura não existe ou mudou de endereço.</p>
			<a class={action()} href="/">
				<ArrowLeft size={18} /> Voltar ao início
			</a>
		</main>
	);
}
