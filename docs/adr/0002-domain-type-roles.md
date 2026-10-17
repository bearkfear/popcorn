# ADR 0002 — Categorias explícitas dos tipos de domínio

Data: 2026-10-17. Status: aceita.

## Contexto

`core/catalog/models.rs` misturava registros com identidade, valores descritivos e resultados de consulta. `values.rs` reunia validações distintas. Em mídia, identidade, estado de leitura e regras também apareciam em arquivos vizinhos sem uma categoria explícita. A organização não ajudava a localizar um conceito nem a decidir onde acrescentar outro.

## Decisão

Em `core`, usar nomes por extenso e no plural: `entities` e `value_objects`. Regras puras entre valores ficam em `rules` quando necessárias. Projeções e resultados de leitura pertencem à aplicação, junto do pedido e da função `handle` do caso de uso proprietário. Não há pasta obrigatória `read_models`. Não criar diretórios vazios só para completar uma árvore DDD.

| Local | Critério | Exemplos |
|---|---|---|
| `core/<dominio>/entities/` | Conceito reconhecido por uma identidade estável, mesmo quando seus atributos mudam | Título por tipo de mídia + TMDB ID; gênero por ID; fonte por ID local |
| `core/<dominio>/value_objects/` | Valor sem ciclo de vida próprio; validação e comportamento do valor ficam juntos | `TitleId`, `Page`, `SearchQuery`, `ReadAccessToken`, `Content`, `SourceInput` |
| `application/<dominio>/queries/<operacao>.rs` | Pedido, execução e resultado de uma consulta | `ListTitles` + `SnapshotPage`; `GetPlayback` + `Playback`; `GetCacheSettings` + `CacheSettings` |
| `core/<dominio>/rules/` | Funções puras que selecionam, combinam ou validam valores | Seleção de áudio/arquivo, quota, intervalos de bytes e extensão de vídeo |

A identidade de temporada e episódio é contextual: número dentro da série ou temporada selecionada. Seus metadados ficam em `catalog/entities`, junto dos títulos e gêneros. Um crédito de elenco (`CastData`) é um valor descritivo, sem identidade própria no modelo atual. Um arquivo de torrent (`SourceFile`) descreve uma parte imutável da fonte; não tem ciclo de vida independente.

A presença de um campo `id` não é suficiente para chamar um resultado de entidade: `Playback` é uma projeção do motor de transferência, e permanece junto de `GetPlayback` e `handle` em `application/media/queries/get_playback.rs`. Seu estado e suas descrições de áudio ficam em `value_objects`.

O mesmo padrão vale para comandos com resultados próprios, como `StartConvertedStream` + `ConvertedAccess`. `OpenMedia` + `MediaAccess` ficam juntos na consulta. Ports e adapters importam esses contratos diretamente, sem executar o caso de uso. A reutilização por comandos relacionados não exige remover o resultado do arquivo de sua consulta principal.

`Cached`, `ConnectionStatus` e `TitlePage` são contratos compartilhados entre operações de catálogo, sem proprietário único. Ficam nos arquivos específicos `application/catalog/cached.rs`, `connection_status.rs` e `title_page.rs`. Não criar uma pasta de resultados apenas por categoria.

Cada valor de catálogo fica em um arquivo com nome específico, com seus construtores, validação e operações. Valores coesos de compatibilidade de mídia permanecem juntos em `value_objects/playback_profile.rs`, com os testes existentes. Erros gerais permanecem em `error.rs`; erros exclusivos de uma regra podem acompanhá-la.

`mod.rs` apenas declara módulos e reexporta tipos. Reexports de domínio não expõem read models de aplicação; não manter arquivos genéricos `models.rs` ou `values.rs` como atalhos paralelos. Testes de regras e valores permanecem em `core`, junto de sua responsabilidade.

## Consequências e verificação

A árvore distingue domínio (identidade, valores e regras) de projeções e resultados da aplicação antes de abrir os arquivos. Esta decisão organiza o modelo existente; não introduz agregados novos, igualdade por identidade, campos adicionais ou alterações nos contratos de serialização.

Verificar por `bun run lint:server` e `cargo test -p popcorn-server --lib`: dependências entre camadas, proibição de `read_models` em `core`, comentários iniciais, agregadores, formatação, Clippy e regras de domínio existentes. A classificação semântica de novos tipos exige revisão.
