// Configura Vite, SolidStart, Tailwind e o prerender das rotas públicas.
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [solidStart(), tailwindcss(), nitro()],
	nitro: {
		prerender: {
			routes: ["/", "/robots.txt", "/sitemap.xml"],
			failOnError: true,
		},
	},
});
