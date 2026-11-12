# Popcorn

Aplicativo open source para descobrir e reproduzir filmes e séries no computador, com interface web local e backend próprio.

[![Rust 1.94.0](https://img.shields.io/badge/Rust-1.94.0-orange?logo=rust)](https://www.rust-lang.org/)
[![SolidJS 1.9.17](https://img.shields.io/badge/SolidJS-1.9.17-2c4f7c?logo=solid)](https://www.solidjs.com/)
[![New UI 0.2.0](https://img.shields.io/badge/New%20UI-0.2.0-6c5ce7)](https://www.npmjs.com/package/@egcs/newui)

O aplicativo consulta o TMDB e aceita fontes adicionadas pelo usuário. Use apenas conteúdo que você tem autorização para acessar; o Popcorn não fornece nem procura fontes.

## Baixar

Consulte os [lançamentos do Popcorn](https://github.com/bearkfear/popcorn/releases) para instaladores disponíveis. A experiência desktop usa um launcher Tauri, backend Rust e interface no navegador. Windows e macOS são os alvos iniciais; a compatibilidade de mídia depende do sistema e dos codecs disponíveis.

## Desenvolver

Veja [docs/development.md](docs/development.md) para preparar o ambiente e executar o aplicativo.

## Documentação do projeto

- [PRD](PRD.md): objetivos e requisitos do produto.
- [TDD](TDD.md): arquitetura e decisões técnicas gerais.
- [ADRs](docs/adr/): decisões específicas do backend.
- [Migração para New UI](docs/newui-migration.md): registro e pendências da migração.
- [Instruções do site](apps/site/README.md): desenvolvimento da página de downloads.

O Popcorn usa dados do [TMDB](https://www.themoviedb.org/) e não é endossado nem certificado por ele.
