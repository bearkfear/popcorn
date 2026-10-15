# Popcorn

Aplicativo desktop em desenvolvimento. Requisitos em `PRD.md` e desenho técnico em `TDD.md`.

## Catálogo e reprodução progressiva

O repositório contém a fundação do backend standalone e o primeiro fluxo completo
de exploração do catálogo:

- backend Rust/Axum em loopback, com catálogo SQLite somente leitura e `user.sqlite`
  separado, migração inicial e exclusividade do diretório de dados;
- `CatalogService` via Connect RPC, com contratos Protobuf e cliente TypeScript
  gerados para snapshot local, configuração do TMDB, listas, busca, gêneros,
  detalhes, temporadas e episódios;
- integração TMDB v3 com credencial do usuário, cache SQLite, expiração, fallback
  offline, limite de concorrência, cooldown de rate limit e imagens validadas;
- cliente SolidJS/Tailwind no Tauri 2, com configuração da credencial, filmes e
  séries, paginação manual, detalhes e estados reais de loading/empty/error/retry;
- bootstrap privado por stdin, credencial efêmera entregue à UI por IPC e
  supervisão do processo com prazos de inicialização e encerramento;
- autenticação bearer, Host exato e CORS restrito ao origin do WebView;
- `/health`, prontidão JSON em stdout e logs em stderr sem credenciais;
- atribuição permanente ao TMDB com o logo oficial aprovado e o aviso exigido;
- fontes manuais por magnet ou arquivo `.torrent`, associadas ao filme ou episódio
  escolhido e persistidas separadamente do catálogo instalado;
- resolução de metadados e seleção explícita do arquivo de vídeo pelo usuário;
- sessão BitTorrent embutida com `librqbit`, reprodução progressiva por HTTP Range,
  seek pelo player e apenas uma reprodução ativa;
- player em tela cheia com progresso, velocidade observada, peers e controles para
  pausar/retomar a transferência;
- interface escura orientada por pôsteres, inspirada no fluxo clássico de catálogo,
  detalhe e reprodução sem reutilizar marca ou assets proprietários.

O snapshot distribuído é intencionalmente vazio. Os testes do servidor cobrem
somente regras puras do core, sem rede ou bancos temporários.
O usuário deve fornecer somente fontes que tem
autorização para acessar; o aplicativo não procura nem distribui conteúdo.

A reprodução atual é direta e depende dos codecs aceitos pelo WebView da plataforma.
O perfil inicial é MP4 com H.264/AVC e AAC. Probe, remux/transcode com FFmpeg,
gerenciamento completo de cache e homologação Windows/macOS continuam nos gates
G3–G5 do `TDD.md`; formatos como MKV/HEVC ainda não são anunciados como compatíveis.

## Desenvolvimento desktop

Requer Rust 1.94 ou posterior, compilador C, Bun 1.3.14 e os pré-requisitos nativos
do Tauri 2 para o sistema em uso. Windows precisa das ferramentas C++ e WebView2;
macOS precisa das ferramentas de desenvolvimento da Apple.

```sh
bun install --frozen-lockfile
bun run desktop:dev
```

O comando prepara o `popcorn-server` para o target Rust e inicia o Vite em
`http://localhost:1420` e o shell nativo. O shell inicia o backend, resolve o
snapshot e os dados persistentes sem depender do diretório de trabalho e entrega
o endereço e o segredo somente por IPC. Uma segunda chamada de bootstrap reutiliza
a instância viva. Uma tentativa falha é encerrada e aguardada antes de permitir outra.

Para compilar o desktop:

```sh
bun run desktop:build
```

Os targets iniciais de produto continuam Windows x64 e macOS ARM64. A configuração
de bundle usa NSIS no Windows e app/DMG no macOS. Assinatura, notarização, instalação
e atualização nesses sistemas ainda precisam de homologação; compilar não comprova
esses gates. Linux é ambiente adicional de desenvolvimento, com bundling desativado.

Para inspecionar somente a interface em um navegador:

```sh
cd apps/desktop
bun run dev
```

Nesse modo a tela explica que o serviço precisa do aplicativo desktop; ela não
inventa conexão, títulos ou acesso ao IPC.

## Backend standalone

O snapshot já está em `resources/catalog.sqlite`. Não é preciso recriá-lo para
executar. Para desenvolvimento, crie um token privado fora do repositório.
Em macOS/Linux:

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

O TMDB pode ser configurado pela interface desktop. Para uma execução standalone
ou uma integração automatizada, também é possível fornecer o API Read Access Token
somente ao processo:

```sh
TMDB_READ_ACCESS_TOKEN='seu-token' cargo run -p popcorn-server -- serve \
  --catalog resources/catalog.sqlite \
  --data-dir data \
  --token-file /tmp/popcorn-dev.token
```

A variável não é persistida pelo backend. Sem ela, o status informa que o TMDB
ainda precisa ser configurado; o snapshot local continua disponível.

O processo emite uma linha como:

```json
{"event":"ready","address":"127.0.0.1:PORTA","protocol_version":"bootstrap.v1","instance_id":"UUID","catalog_version":"foundation-2"}
```

Use o endereço real emitido e envie `Authorization: Bearer <token>` para consultar
`GET /health`. O endpoint verifica acesso aos dois bancos; não é uma API de catálogo.
O protocolo `bootstrap.v1` é exclusivo do bootstrap; os contratos de domínio usam
o pacote Protobuf `popcorn.v1`. O SDK exporta `createCatalogClient`,
`createSourceClient` e `createPlaybackClient`, todos recebendo `(baseUrl, token)`.

Standalone recusa requisições com `Origin`, mas permite clientes autenticados sem
Origin. Ctrl-C encerra o servidor; em macOS/Linux, SIGTERM também. Um timeout de
encerramento retorna erro, não sucesso.

## Contratos e catálogo

```sh
bun run generate
bun run generate:check
bun run catalog:generate
```

A geração usa Buf e os geradores oficiais com versões fixadas. Na primeira
execução, os geradores Rust são instalados em `target/codegen`; não é necessário
instalá-los globalmente. `generate:check` compara a regeneração em diretório
temporário com os arquivos versionados. Os scripts usam Bash; no Windows, use
Git Bash para esses comandos de preparação.

`catalog:generate` substitui somente o snapshot vazio de desenvolvimento a partir
de `resources/catalog.sql`. Não execute para preservar um catálogo editado
manualmente. A aplicação nunca modifica nem migra o snapshot instalado.
Para criar um snapshot em outro caminho sem sobrescrever:

```sh
cargo run -p popcorn-server -- init-catalog --output /caminho/novo/catalog.sqlite
```

No modo privado `popcorn-server sidecar`, stdin recebe uma linha JSON
`initialize` com `catalog`, `data_dir`, `token` e `origin`; depois recebe
`shutdown`. Os paths e o segredo não são argumentos do processo. EOF do canal
também encerra o backend. Após liberar os bancos, ele emite `{"event":"stopped"}`.
O shell aguarda a saída, encerra somente o filho que iniciou em caso de timeout
e não inicia outra instância enquanto a saída anterior não for confirmada.

Origins permitidos no canal privado: `http://localhost:1420`,
`tauri://localhost`, `http://tauri.localhost` e `https://tauri.localhost`.
Cada instância aceita apenas o origin configurado, além de clientes sem Origin
com token. O preflight CORS não dispensa autenticação nas consultas.

## Verificar

```sh
bun install --frozen-lockfile
bun run generate:check
bun run check:sdk
bun run check:desktop
bun run --filter @popcorn/desktop build
bun run lint:server
cargo test -p popcorn-server --lib core::
```

O servidor mantém poucos testes de domínio em `src/core`. Não há suíte de
integração do servidor. O linter limita arquivos manuais a 250 linhas e funções
a 60 linhas, exige um comentário inicial e verifica as fronteiras das camadas.
O código gerado não entra nesses limites.

O servidor se organiza em `core` (entidades e regras), `application` (comandos,
consultas e contratos), `infra` (SQLite, TMDB, torrents e disco), `interface`
(RPC, HTTP e CLI) e `bootstrap` (composição e ciclo de vida). Comandos e consultas
compartilham processo e banco; não há barramento nem event sourcing.

Os gates G2–G5 permanecem parciais: o caminho direto foi implementado, mas ainda
precisa do seeder controlado, da matriz de runtimes WebView de Windows/macOS, de
FFmpeg, quota/limpeza e homologação dos instaladores. O código atual ainda não é
o MVP completo definido no PRD.

### Validação local desta etapa — 14/10/2026

Ambiente: Linux x86_64 no WSL, Rust 1.95.0 e Bun 1.3.14. A regeneração dos
contratos, formatação, Clippy sem avisos, testes de integração, verificação de tipos
e build de produção da interface foram executados localmente.

No Chrome, a interface consultou listagem e detalhes pelo SDK e backend reais,
com preflight CORS, em desktop claro e mobile escuro, sem overflow horizontal ou
credencial no DOM/storage. Somente o bootstrap IPC foi substituído nessa prova
de navegador; o snapshot sintético ficou em diretório temporário. Os demais
estados da interface também foram inspecionados em claro/escuro e desktop/mobile.

O shell Tauri foi compilado com a feature `desktop` e Clippy sem avisos, usando
GTK/WebKit isolados pelo Nix. A execução nativa iniciou o WebView e seu backend
automaticamente. A captura e interação com a janela nativa não estavam disponíveis
no portal Wayland desta estação; o botão nativo de fechar permanece sem QA manual.
O protocolo de encerramento, EOF de ambos os canais, reinício, persistência,
timeout de prontidão e descarte de prontidão tardia têm testes de processo.

Neste WSL sem pacotes de desenvolvimento GTK/WebKit instalados globalmente,
o ambiente usado para abrir o aplicativo pode ser reproduzido com Nix:

```sh
nix-shell \
  -I nixpkgs=https://github.com/NixOS/nixpkgs/archive/refs/heads/nixos-unstable.tar.gz \
  -p pkg-config gtk3 webkitgtk_4_1 openssl librsvg dbus \
  --run 'for flag in $(pkg-config --libs-only-L gtk+-3.0 webkit2gtk-4.1 dbus-1); do
    case "$flag" in
      -L*) export LD_LIBRARY_PATH="${flag#-L}:$LD_LIBRARY_PATH";;
    esac
  done
  bun run desktop:dev'
```

Esse comando é uma conveniência de desenvolvimento, não um instalador Linux nem
uma declaração de suporte de produto. Os testes de Windows/macOS e de instalação
continuam pendentes conforme os gates do TDD.
