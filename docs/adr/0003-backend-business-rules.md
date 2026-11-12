# ADR 0003 — Regras de negócio no backend

**Status:** aceita. **Data:** 2026-10-17.

## Decisão

O backend é a autoridade para validação, políticas, persistência e execução. A interface apresenta estado, coleta escolhas e comunica eventos do ambiente; não redefine limites do produto.

| Backend | Interface / shell |
|---|---|
| Histórico, fontes, transferências, quota e limpeza | Navegação, filtros visuais, formulários e loading/retry |
| Credenciais, TMDB, cache, paginação, probe, compatibilidade e conversão | Eventos de vídeo, buffers, atalhos, fullscreen, janelas e seletores do sistema |
| Limites e resultados publicados pela API | Apresentação dos valores recebidos |

Validação no cliente pode melhorar o feedback, mas a validação do servidor continua obrigatória.

## Histórico

O servidor decide conclusão e retomada, grava alterações em transação e preserva o progresso anterior diante de um carregamento inválido em zero. Importação do histórico legado é idempotente: o cliente só remove sua cópia após confirmação do servidor. O histórico é local ao dispositivo; não há sincronização remota.
