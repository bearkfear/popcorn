# Revisão da organização do backend — 2026-10-16

Atualizada em 2026-10-17 para a organização por caso de uso e por categoria de domínio.

Escopo: leitura estática de comandos, consultas, contratos e agregadores Rust, com validação por lint, compilação, testes de domínio e regressão local via RPC. Não é uma verificação de uma instância em produção nem um teste de integração com o TMDB ou peers remotos.

## Organização após a revisão

- As fronteiras entre core, application e adapters são verificadas pelo lint estrutural. SQL, HTTP e handles torrent ficam fora do domínio e dos contratos RPC.
- Catálogo: dois comandos em `commands/` e oito consultas em `queries/`, com pedido, execução e resultado específico juntos em cada arquivo. `queries/list_titles.rs` contém `ListTitles`, `SnapshotPage` e `handle`. Os envelopes compartilhados `Cached`, `ConnectionStatus` e `TitlePage` têm arquivos específicos na aplicação. As funções `handle` recebem diretamente metadata, snapshot ou ambos, conforme a operação; bootstrap seleciona os adapters concretos.
- Mídia: dez comandos (incluindo `ShutdownMedia`) em `commands/` e quatro consultas em `queries/`, com pedido e execução juntos por caso de uso. As funções `handle` recebem `MediaContext`, que mantém os ports e a única trava de playback/cache. Esse contexto é compartilhado entre consumidores e não implementa casos de uso. `OpenMedia` é consulta; `StartConvertedStream` é comando. Não há arquivo genérico `access.rs` nem uma camada intermediária de service.
- Os adaptadores chamam diretamente funções como `set_cache_limit::handle` e `get_playback::handle`. Não há `handlers.rs`, `CommandHandlers` nem `QueryHandlers`. Comandos podem retornar projeções atualizadas sem chamar outro caso de uso.
- Domínio: `core/catalog` e `core/media` distinguem `entities` e `value_objects`; regras puras de mídia ficam em `rules`. Projeções e resultados de leitura ficam junto de seus casos de uso na aplicação; o lint impede uma pasta de `read_models` em `core`. Valores de catálogo têm arquivos próprios com suas validações, e os testes existentes acompanham as regras. A classificação segue o [ADR 0002](adr/0002-domain-type-roles.md).
- Todos os arquivos Rust manuais de `src` já tinham um comentário inicial. Os cabeçalhos afetados foram ajustados e a regra foi formalizada no [ADR 0001](adr/0001-backend-file-responsibilities.md).
- Todos os 24 `mod.rs` manuais agora apenas agregam módulos e imports/reexports. Implementações foram movidas para arquivos descritivos. Os agregadores gerados ficam sob controle do gerador.

## Pontos ainda abertos

### Alta — remoção de fonte pode concorrer com início de playback

Em `application/media/commands/remove_source.rs`, `handle` verifica `in_use` e depois remove no banco sem adquirir a trava dos comandos. `handle`, em `commands/start_playback.rs`, carrega `playback_file` antes de adquirir essa trava. Uma intercalação permite que ambos passem pelas verificações e que o playback seja ativado com metadados de uma fonte já removida. É um risco identificado por leitura do código, sem reprodução concorrente nesta revisão.

Próximo ajuste: coordenar remoção e reserva/início com a mesma exclusão, incluindo a validação da existência da fonte dentro da região protegida. A reserva por identidade da fonte prevista no TDD evita depender apenas de uma checagem pontual.

### Média — comandos mantêm a trava durante preparação do torrent

`commands/start_playback.rs` mantém a trava `context.command` durante `prepare` e `activate`; `infra/media/transfer_control.rs` aguarda `wait_until_initialized` em `activate_playback`. Uma inicialização lenta pode atrasar pause, stop e operações de cache. Isso diverge da intenção do TDD de executar trabalho demorado fora do coordenador.

Próximo ajuste: reservar a transição sob a trava, preparar com cancelamento fora dela e revalidar a reserva ao publicar o playback. O shutdown também precisa participar desse protocolo para impedir ativação posterior ao cancelamento.

Esses pontos continuam abertos; a reorganização de arquivos não altera o protocolo de concorrência existente.

## Validação

- `bun run lint:server`: verificação estrutural de 147 arquivos Rust manuais, rustfmt e Clippy sem avisos.
- `cargo test -p popcorn-server --lib`: 27 testes de domínio aprovados.
- `bun run check:scripts`: verificação TypeScript aprovada.
- O novo guard de `mod.rs` foi exercitado com oito exemplos temporários, incluindo agregadores válidos, comentários/literais, ausência de cabeçalho e implementações proibidas.
- `cargo build -p popcorn-server` e `python3 scripts/test-cache-limit.py`: servidor real com dados temporários; aprovados comandos/consultas de cache, adição de fonte, início/parada de playback, proteção de arquivos em uso e encerramento. A execução precisou de permissão fora do sandbox para abrir o listener local.
