# ADR 0001 — Responsabilidade explícita dos arquivos do backend

Data: 2026-10-16. Atualizada em 2026-10-17. Status: aceita.

## Contexto

O backend separa domínio, aplicação, infraestrutura, interface e composição. A regra existente já exige um comentário inicial e limita arquivos Rust manuais a 250 linhas. Entretanto, `mod.rs` também continha serviços, regras e handlers, escondendo responsabilidades atrás de um nome de agregador. No catálogo, os arquivos de comandos e consultas descreviam entradas, mas a execução estava no agregador.

## Decisão

- Todo arquivo Rust manual do backend começa com um comentário de uma linha que descreve sua responsabilidade e o conteúdo que oferece. Preferir `//!` para documentação do módulo. Descrever o comportamento concreto; “helpers” ou “adapter” isoladamente não explica o arquivo.
- `mod.rs` contém apenas documentação, declarações externas de módulos e imports/reexports, com atributos como `#[cfg(test)]` quando necessários. Não contém structs, enums, traits, constantes, funções, impls, macros de implementação ou módulos inline.
- Organizar comandos e consultas por caso de uso. Cada arquivo `commands/<operacao>.rs` ou `queries/<operacao>.rs` contém o tipo do pedido e uma função livre `handle` que o executa. Exemplo: `commands/set_cache_limit.rs` contém `SetCacheLimit` e `handle(context, command)`. Usar nomes em snake_case alinhados ao pedido.
- `router.rs` compõe rotas; `backend.rs` controla o ciclo de vida. Arquivos específicos de domínio contêm entidades e regras.
- Auxiliares exclusivos e resultados específicos ficam junto de seu caso de uso: `queries/list_titles.rs` inclui `ListTitles`, `SnapshotPage` e a função de leitura. Extrair apenas o que é compartilhado de fato. Não manter arquivos paralelos de pedidos e execução.
- Cada arquivo expõe uma função livre `handle`; não há structs `CommandHandlers`/`QueryHandlers` nem uma struct de handler por operação. `commands/mod.rs` e `queries/mod.rs` declaram os casos de uso e reexportam seus pedidos/resultados. Os adaptadores traduzem entradas HTTP/RPC e chamam diretamente funções como `set_cache_limit::handle(context, command)`.
- Não há arquivo `handlers.rs`. As funções de catálogo recebem diretamente os ports necessários: metadata, snapshot ou ambos. Os adapters concretos são selecionados em bootstrap.
- `media/context.rs` guarda os ports de fontes, transferências e cache e uma única trava para comandos conflitantes. `MediaContext` é compartilhado por `Arc` entre os consumidores; contém apenas estado e construção, sem encaminhar operações. As funções de mídia recebem esse contexto por referência, preservando a coordenação existente.
- Não há `service.rs` obrigatório. Um serviço de domínio ou coordenador adicional só deve existir quando tiver responsabilidade própria. O encerramento dos recursos de mídia fica em `commands/shutdown_media.rs` e é chamado pela composição do backend.
- Consultas podem preencher caches de infraestrutura sem se tornarem comandos de negócio. `OpenMedia` abre um leitor autorizado do arquivo original e pertence às consultas. `StartConvertedStream` inicia/substitui uma geração FFmpeg e pertence aos comandos. Não criar uma terceira categoria genérica de `access`.
- Preservar os caminhos de acesso dos consumidores por reexports e limitar a visibilidade ao escopo necessário. Não introduzir barramento, event sourcing ou bancos separados.
- Código gerado em `apps/server/src/generated` continua sob responsabilidade do gerador e está excluído dessas regras manuais.

## Verificação e consequências

`bun run lint:server` verifica o comentário inicial, o limite de tamanho, as fronteiras de camadas e a ausência de implementação em `mod.rs`, além de executar rustfmt e Clippy. A qualidade semântica do comentário continua sendo responsabilidade da revisão. `build.rs` também deve seguir a convenção de comentário, embora esteja fora da varredura estrutural de `src`.

A navegação exige alguns arquivos adicionais, mas seus nomes revelam onde procurar regras, estado, mutações e leitura. A mudança é de organização; contratos RPC e comportamento de execução são preservados. A refatoração não resolve por si só concorrência, idempotência ou encerramento.
