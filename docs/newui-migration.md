# Migração da interface para New UI

Estado salvo para retomada em 10/11/2026. Implementação em andamento; não considerar a migração homologada.

## Direção acordada

- New UI é o padrão de componentes; reutilizar as composições prontas e remover código visual redundante.
- A tarefa inclui redesenho das telas, não apenas troca de imports.
- Preservar a identidade Popcorn: tomato, tema escuro, Google Sans e Tailwind para composição.
- Preferir densidade compacta: 4–8 px entre textos relacionados e 16 px entre grupos.
- Player e site estão fora desta etapa. Não substituir os seletores usados pelo player.
- Formulários podem usar solid-forms; evitar duplicar estado dos viewmodels.
- Achados para New UI devem ser de interface, com evidência, e removidos da lista após correção validada.

## Implementado nesta branch

- `@egcs/newui@0.2.0` e `solid-forms@0.5.2` fixados; escala primary ligada ao tomato e um único reset CSS.
- Navbar e Container para navegação/layout principal; Tabs para filmes, séries e biblioteca.
- Sidebar e VerticalMenu nas configurações, incluindo menu móvel.
- Busca, filtros, seletor de gêneros e Pagination no catálogo; destaque mais compacto.
- Detalhes com Badge, Collapsible e seletor de temporadas. Adaptador `AppSelect` separado dos controles legados do player.
- Dialog e controles de fontes com Button, Field, Input e FileInput.
- Configurações de armazenamento com Card, Progress, NumberInput e confirmação de limpeza.
- Importação/exportação com Card, Field, Textarea, FileInput, RadioGroup e Checkbox.
- TMDB redesenhado: guia, formulário solid-forms, estado conectado, atualização e desconexão progressivas.
- Ações comuns e pareamento migrados para componentes New UI. Posters, artwork e regras de domínio continuam específicos do aplicativo.

A correção de baseline do checkbox já vem da New UI 0.2.0. O contorno de grid foi retirado; descrição fixa e validação após envio permanecem como decisões de UX do Popcorn.

## Verificações realizadas

- Build do desktop com typecheck e Biome aprovado após a integração de Sidebar.
- `bun test apps/desktop/tests`: 60 testes, 238 asserções, zero falhas.
- Smoke de sessões/HTTP do backend passou durante a migração; repetir na revisão final.
- QA em Chrome sobre o aplicativo compilado, com RPCs simuladas somente na sessão de teste: busca, gênero, paginação, diálogo de fontes/Escape/retorno de foco, temporadas/episódios, biblioteca e viewport de 390 px passaram.
- Navbar/Sidebar móveis e salvamento de 21,5 GB passaram na sessão de QA.
- Com backend real e dados temporários, salvamento de 21,5 GB e prévia de catálogo por FileInput foram confirmados.
- O último QA parou ao tentar clicar diretamente no input de rádio visualmente oculto da importação. Adaptar o teste para o rótulo/controle visível e concluir confirmação, cancelamento e reimportação. Isso ainda não é um defeito confirmado da biblioteca.
- A correção do checkbox foi medida sem deslocamento em 1100 px e 390 px.
- `git diff --check` aprovado. Nenhum arquivo em `features/player` ou `apps/site` foi alterado.

## Como retomar

1. Instalar as dependências com `bun install --frozen-lockfile`.
2. Executar o fluxo normal: `bun run desktop:dev`. Ele prepara sidecar, build, Vite e launcher Tauri.
3. Fornecer a credencial TMDB apenas ao ambiente do processo ou pela interface; não versionar tokens.
4. O launcher abre a aplicação servida pelo backend no navegador. O Vite isolado em localhost:1420 não substitui esse bootstrap.
5. Após alterações no frontend servido pelo backend, executar `bun run --filter @popcorn/desktop build` e atualizar a aba, conforme README.
6. Concluir o QA de importação, navegação móvel/teclado e revisão visual no fluxo normal, usando dados reais apropriados ou fixtures claramente separadas.
7. Revisar e remover composições/estilos próprios que ainda dupliquem componentes da New UI, preservando as exceções do player.
8. Repetir checks pertinentes antes de marcar o PR pronto para revisão.

Scripts exploratórios, caches, processos locais e notas do Maestri não fazem parte desta entrega. A branch deve poder ser retomada pelos arquivos do projeto e por este documento.
