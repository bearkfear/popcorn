# Popcorn

Aplicativo desktop em desenvolvimento. Requisitos em `PRD.md` e desenho técnico em `TDD.md`.

## Primeiro incremento: I1a

Esta entrega implementa somente a fundação do backend standalone:

- workspace Rust, com biblioteca e executável `popcorn-server`;
- catálogo SQLite aberto somente para leitura, com schema validado;
- `user.sqlite` separado, migração inicial e lock exclusivo do diretório de dados;
- listener restrito a `127.0.0.1`, com porta livre por padrão;
- diagnóstico `GET /health` protegido por token e validação de Host;
- evento JSON de prontidão em stdout, logs JSON em stderr e encerramento por sinal.

O snapshot inicial contém apenas metadados de versão, sem filmes ou torrents.
Não há cliente Tauri, Connect RPC, TMDB, downloads ou player nesta entrega.
O próximo incremento de I1 conectará os contratos RPC e o cliente mínimo a essa fundação.

## Executar

Requer Rust 1.94 ou posterior e compilador C para a dependência SQLite empacotada.

```sh
cargo run -p popcorn-server -- init-catalog --output resources/catalog.sqlite
```

A criação falha se o arquivo já existir; não sobrescreve snapshots. O comando é uma
ferramenta de preparação do catálogo, não uma etapa que o usuário final precisará executar.

Para desenvolvimento, crie um token privado fora do repositório. Em macOS/Linux:

```sh
umask 077
openssl rand -hex 32 > /tmp/popcorn-dev.token
cargo run -p popcorn-server -- serve \
  --catalog resources/catalog.sqlite \
  --data-dir data \
  --token-file /tmp/popcorn-dev.token
```

Em Windows, use um arquivo privado contendo 64 caracteres hexadecimais e os mesmos
argumentos com os caminhos correspondentes. Windows ainda não foi homologado.
O token não é um argumento de linha de comando, não aparece no evento de prontidão
e não deve ser versionado ou compartilhado.

O processo emite uma linha como:

```json
{"event":"ready","address":"127.0.0.1:PORTA","protocol_version":"bootstrap.v1","instance_id":"UUID","catalog_version":"foundation-1"}
```

Use o endereço real emitido e envie `Authorization: Bearer <token>` para consultar
`GET /health`. O endpoint verifica acesso aos dois bancos; não é uma API de catálogo.
O protocolo `bootstrap.v1` não substitui os futuros contratos Connect.

Neste incremento, requisições com `Origin` são recusadas: integração com origins do
WebView será adicionada junto do cliente. Ctrl-C encerra o servidor; em macOS/Linux,
SIGTERM também. Um timeout de encerramento retorna erro, não sucesso.

## Verificar

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```
