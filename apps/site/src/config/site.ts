// Centraliza metadados, URL pública e endereço do repositório usados pelo site.
const configuredUrl = import.meta.env.VITE_SITE_URL?.replace(/\/$/, "");

export const site = {
	name: "Popcorn",
	url: configuredUrl || "http://localhost:3000",
	repositoryUrl: "https://github.com/bearkfear/popcorn",
	description:
		"Descubra, organize e reproduza filmes e séries em um aplicativo desktop local, aberto e feito para a sua própria biblioteca.",
} as const;
