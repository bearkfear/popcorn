# ADR 0001 — Responsabilidade dos arquivos do backend

**Status:** aceita. **Data:** 2026-10-16; atualizada em 2026-10-17.

## Contexto

Agregadores como `mod.rs` e handlers centralizados escondiam onde regras e operações eram executadas.

## Decisão

- Cada arquivo Rust manual começa com comentário de módulo que descreve sua responsabilidade. Máximo de 250 linhas; código gerado fica fora da regra.
- `mod.rs` declara módulos e faz imports/reexports; não contém implementação.
- Cada comando ou consulta tem arquivo próprio em `commands/` ou `queries/`, com o tipo do pedido e uma função livre `handle`. O adaptador traduz a entrada e chama essa função.
- Resultado exclusivo fica junto do caso de uso que o produz. Contrato compartilhado sem proprietário claro fica em arquivo específico.
- `router.rs` compõe rotas; `backend.rs` controla ciclo de vida. Contexto compartilhado de mídia guarda estado e coordenação, não encaminha operações.
- Não criar `handlers.rs`, barramento, event sourcing ou `service.rs` obrigatório. Extrair serviço somente quando houver responsabilidade própria.
- Ver [ADR 0002](0002-domain-type-roles.md) para categorias de tipos do domínio.

## Consequência

Os nomes dos arquivos mostram onde ficam regras, estado, mutações e consultas. A organização não altera contratos nem resolve concorrência por si só.
