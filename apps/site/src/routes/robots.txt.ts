// Gera dinamicamente as diretivas públicas de rastreamento do site.
import { site } from "~/config/site";

export function GET() {
	return new Response(
		`User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`,
		{
			headers: { "content-type": "text/plain; charset=utf-8" },
		},
	);
}
