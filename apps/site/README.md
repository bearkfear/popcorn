# Site do Popcorn

Landing de download construída com SolidStart v2, Ark UI e Tailwind CSS. A rota principal,
o `robots.txt` e o sitemap são prerenderizados em `.output/public`.

Antes de um build público, defina `VITE_SITE_URL` com a origem canônica do site:

```sh
VITE_SITE_URL=https://popcorn.example bun run build
```

Os dados da release são consultados diretamente no navegador pela API pública do GitHub. A
consulta ocorre ao carregar a seção de downloads e é repetida quando o visitante clica em um
instalador. Nenhum token deve ser adicionado ao frontend.
