# Migração para New UI

**Estado registrado em 10/11/2026:** implementação descrita como em andamento; migração não homologada. Este arquivo é um registro de trabalho, não um guia de uso.

## Direção

Usar `@egcs/newui` como padrão para a interface desktop, preservando a identidade Popcorn, o tema escuro e Tailwind para composição. Migrar a experiência das telas, não só trocar imports. Manter player e site fora do escopo; evitar duplicar o estado dos viewmodels.

## Registro

A migração abrangeu navegação, catálogo, detalhes, fontes, configurações, importação/exportação e pareamento. Componentes específicos do app, posters e artwork permanecem próprios. Dependências registradas: `@egcs/newui` 0.2.0, `solid-forms` 0.5.2 e `@solidjs/router` 1.0.1.

## Pendências registradas

O último registro pede concluir QA de importação (confirmação, cancelamento e reimportação), navegação móvel/teclado e revisão visual; depois repetir os checks pertinentes. Esse status precisa ser atualizado quando o trabalho for retomado.
