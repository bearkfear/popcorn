// Renderiza uma prévia ilustrativa do catálogo e do player do Popcorn.
import {
	CirclePause,
	Clock3,
	FolderOpen,
	Play,
	Search,
	Settings2,
	Volume2,
} from "lucide-solid";
import {
	playerChip,
	poster,
	preview,
} from "~/styles/product-preview";

const posters = [
	["Além do horizonte", "Aventura", "one"],
	["Noite orbital", "Ficção", "two"],
	["Última estação", "Drama", "three"],
	["Maré vermelha", "Suspense", "four"],
] as const;

export function ProductPreview() {
	const styles = preview();

	return (
		<div
			class={styles.stage()}
			role="img"
			aria-label="Demonstração ilustrativa da interface do Popcorn"
		>
			<div class={styles.glow()} />
			<div class={styles.window()}>
				<div class={styles.windowBar()}>
					<div class={styles.windowDots()}>
						<i />
						<i />
						<i />
					</div>
					<span>Popcorn</span>
					<Settings2 size={14} />
				</div>
				<div class={styles.windowBody()}>
					<aside class={styles.sidebar()}>
						<div class={styles.miniLogo()}>
							<span />
							<span />
							<span />
						</div>
						<Search size={17} />
						<Clock3 size={17} />
						<FolderOpen size={17} />
					</aside>
					<div class={styles.catalog()}>
						<div class={styles.catalogTopline()}>
							<div>
								<small>EXPLORAR</small>
								<strong>O que vamos assistir?</strong>
							</div>
							<div class={styles.fakeSearch()}>
								<Search size={12} /> Buscar filmes e séries
							</div>
						</div>
						<div class={styles.posterRow()}>
							{posters.map(([title, genre, art]) => (
								<div class={styles.posterCard()}>
									<div class={poster({ art })}>
										<span>{genre}</span>
										<i class={styles.posterPlay()} aria-hidden="true">
											<Play size={13} fill="currentColor" />
										</i>
									</div>
									<strong>{title}</strong>
									<small>2026</small>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			<div class={playerChip({ position: "left" })}>
				<span class={styles.chipIcon()}>
					<CirclePause size={18} />
				</span>
				<span>
					<small>CONTINUAR ASSISTINDO</small>
					<strong>42 min restantes</strong>
				</span>
			</div>
			<div class={playerChip({ position: "right" })}>
				<Volume2 size={17} />
				<span>
					<small>PROCESSAMENTO LOCAL</small>
					<strong>Seus dados ficam com você</strong>
				</span>
			</div>
		</div>
	);
}
