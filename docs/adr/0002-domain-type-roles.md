# ADR 0002 — Categorias dos tipos de domínio

**Status:** aceita. **Data:** 2026-10-17.

## Decisão

- `core/<domínio>/entities/`: conceitos com identidade estável.
- `core/<domínio>/value_objects/`: valores sem ciclo de vida próprio, com validação e comportamento juntos.
- `core/<domínio>/rules/`: regras puras entre valores, quando necessárias.
- `application/<domínio>/queries/<operação>.rs`: pedido, execução e resultado da consulta. O resultado fica com seu caso de uso proprietário.
- Contratos compartilhados sem proprietário ficam em arquivos específicos de aplicação. Não criar pasta genérica `read_models`.
- `mod.rs` só declara módulos e reexporta tipos. Evitar arquivos genéricos `models.rs` e `values.rs`.

Um campo `id` sozinho não torna um tipo entidade. Temporada e episódio têm identidade contextual; projeções como `Playback` pertencem à aplicação. Consulte o [ADR 0001](0001-backend-file-responsibilities.md) para organização dos arquivos e casos de uso.

## Consequência

A árvore diferencia identidade, valores, regras e resultados de leitura. A classificação não muda contratos ou comportamento do sistema.
