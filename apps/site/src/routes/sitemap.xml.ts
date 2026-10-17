// Gera o sitemap XML canônico da landing page do Popcorn.
import { site } from "~/config/site";

export function GET() {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site.url}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

	return new Response(xml, {
		headers: { "content-type": "application/xml; charset=utf-8" },
	});
}
