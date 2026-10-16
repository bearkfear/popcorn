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

A navegação do aplicativo é online pelo TMDB: pesquisa e coleções → página de
detalhes → página de reprodução. Não há seletor de catálogo offline/local na
interface. Os detalhes incluem sinopse, elenco, temporadas/episódios e trailer
do YouTube quando disponibilizado pelo TMDB; o trailer só é carregado ao clicar.

Nos detalhes, selecione um arquivo de uma fonte vinculada para analisar suas
faixas. Depois escolha a qualidade e o áudio disponível e clique em **Reproduzir**.
Arquivos com múltiplas faixas passam pelo conversor para respeitar o áudio escolhido.
O player ocupa uma página própria, sem o catálogo ou um modal atrás do vídeo.

O progresso é salvo a cada cinco segundos e ao pausar/sair do player, no
armazenamento persistente do WebView, sem URLs de transmissão ou credenciais.
A pesquisa tem **Continuar assistindo**, **Já assistidos** e **Quero assistir**.
Cada episódio mantém seu próprio ponto de retomada; ao concluir 95% da duração,
o título passa para assistidos. O histórico pertence a este dispositivo e à
instalação/origem do aplicativo, sem sincronização entre dispositivos.

Para verificar as regras de histórico e retomada:

```sh
bun test apps/desktop/tests
```

Requer Rust 1.94 ou posterior, compilador C, Bun 1.3.14 e os pré-requisitos nativos
do Tauri 2 para o sistema em uso. Windows precisa das ferramentas C++ e WebView2;
macOS precisa das ferramentas de desenvolvimento da Apple.

### Devbox no WSL/Linux

O repositório inclui um `devbox.json` com Bun 1.3, Rust 1.94, compilador C,
SQLite e as bibliotecas de desenvolvimento WebKitGTK 4.1 usadas pelo Tauri.
Depois de instalar o Devbox, execute:

```sh
devbox shell
devbox run doctor
devbox run web
```

Na primeira entrada, o shell instala as dependências JavaScript do lockfile se
`node_modules` ainda não existir. `devbox run setup` força essa preparação e
repete o diagnóstico; `devbox run check` executa geração, lint, typecheck e os
testes de domínio. Em WSL, uma janela Linux requer WSLg e `DISPLAY` ou
`WAYLAND_DISPLAY` configurado.

O modo web permite trabalhar na interface, mas não disponibiliza IPC nem inicia o
backend. Para executar o cliente gráfico completo no WSL com WSLg, use
`devbox run desktop`. O preparo seguro inclui distribuições revisadas de
FFmpeg/ffprobe para Linux x64, Windows x64 e macOS ARM64; os executáveis não são
substituídos por cópias encontradas no `PATH`.

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

### Release para Windows pelo GitHub Actions

O workflow `Release Windows` compila o aplicativo em um runner Windows, preserva
o instalador NSIS e seu `SHA256SUMS.txt` como artifact da execução e publica os
mesmos arquivos no GitHub Releases. A tag precisa coincidir com a versão de
`apps/desktop/src-tauri/tauri.conf.json`.

Para publicar a versão `0.1.0`:

```sh
git tag v0.1.0
git push origin v0.1.0
```

Também é possível iniciar o workflow manualmente em **Actions → Release Windows
→ Run workflow**, informando `v0.1.0`. Uma execução manual cria a tag no commit
selecionado se ela ainda não existir. O instalador não é assinado nesta etapa e,
por isso, o Windows SmartScreen pode exibir um aviso.

Os targets iniciais de produto continuam Windows x64 e macOS ARM64. A configuração
de bundle usa NSIS no Windows e app/DMG no macOS. Assinatura, notarização, instalação
e atualização nesses sistemas ainda precisam de homologação; compilar não comprova
esses gates. Linux é ambiente adicional de desenvolvimento, com bundling desativado.

### Empacotamento de FFmpeg e ffprobe

`prepare:sidecar` prepara também as duas ferramentas internas. Não é necessário
instalar FFmpeg, codecs ou ferramentas de extração, e o aplicativo não procura
FFmpeg no `PATH`. A preparação baixa builds estáticas de FFmpeg 9.0.2,
fixadas no macOS em Martin Riedl `1789931890_9.0.2` e no Windows em Gyan
`9.0.2-essentials_build`, verifica SHA256 dos arquivos e dos executáveis antes de executá-los e
preserva licenças, avisos e proveniência. Os inputs revisados estão em
`apps/desktop/scripts/media-tools.lock.ts`; nenhuma URL `latest` é usada.

Para preparar ou verificar somente os inputs do bundle:

```sh
bun apps/desktop/scripts/prepare-media-tools.ts
bun apps/desktop/scripts/prepare-media-tools.ts --check
bun apps/desktop/scripts/prepare-media-tools.ts --target x86_64-pc-windows-msvc
# Backend executado diretamente por cargo run (sem o hook Tauri):
bun apps/desktop/scripts/prepare-media-tools.ts --server-dir "$PWD/target/debug"
```

O target padrão é `TAURI_ENV_TARGET_TRIPLE` ou a plataforma/arquitetura do Bun;
o hook `prepare:sidecar` usa o target Rust escolhido para o servidor.
São aceitos `aarch64-apple-darwin`, `x86_64-pc-windows-msvc` e
`x86_64-unknown-linux-gnu`. Preparar um target estrangeiro verifica hash e
arquitetura, mas não equivale à execução nesse SO.
No host nativo, o preparo executa `-version` sem `PATH`, valida versão/licença e
confere os encoders `libx264`/`aac` e filtros `zscale`/`tonemap`;
no macOS também recusa dependências fora de `/usr/lib` e `/System/Library`.

Os arquivos ficam em `apps/desktop/src-tauri/binaries/`, já ignorado pelo Git:
`popcorn-ffmpeg-<target>` e `popcorn-ffprobe-<target>` (com `.exe` no Windows).
O Tauri remove o sufixo do target e instala `popcorn-ffmpeg`, `popcorn-ffprobe`
e `popcorn-server` como executáveis irmãos: `Contents/MacOS` no app macOS e
o diretório do aplicativo no Windows. O backend resolve os nomes irmãos a partir
de `current_exe`, nunca do diretório de trabalho. O preparo também copia os nomes
sem sufixo ao lado do servidor em `binaries/` e no diretório produzido pelo Cargo,
para execução direta de desenvolvimento.
Para outro `CARGO_TARGET_DIR`, use `--server-dir` com o diretório real do
executável. Alternativamente, `POPCORN_MEDIA_BIN_DIR` no backend pode indicar
explicitamente `apps/desktop/src-tauri/binaries/`, que contém os nomes irmãos.

É possível fornecer cópias locais **da mesma build fixada**, com caminhos
absolutos em `POPCORN_FFMPEG_PATH` e `POPCORN_FFPROBE_PATH` (ambas obrigatórias
quando usadas). Seus hashes também são conferidos; não é uma permissão para
empacotar builds arbitrárias com avisos de licença incorretos. Em uma preparação
sem rede, preserve também `binaries/media-tools/<target>/` de uma preparação verificada.
Um arquivo existente com hash incorreto causa erro, sem substituição silenciosa:
remova deliberadamente o arquivo inválido para permitir novo download.
O modo `--check` não baixa nem repara arquivos. Qualquer ferramenta ou licença
ausente/inválida falha; o hook de release interrompe o build se o preparo falhar.
`beforeBundleCommand` repete a verificação sem downloads, inclusive quando
`tauri bundle` é executado separadamente de `tauri build`.
Nenhuma mudança em `package.json` é necessária.

Os recursos `licenses/media-tools/` do bundle contêm o GPLv3 integral, o aviso
original de licença do FFmpeg, LGPLv2.1, informações da build do fornecedor,
`NOTICE.txt` e `provenance.json`.
A build escolhida é **GPL-3.0-or-later**, com dependências estáticas; não é uma
build LGPL-only. FFmpeg e ffprobe são processos separados, não bibliotecas ligadas
ao Popcorn. Antes de distribuir publicamente, o responsável pelo release deve
disponibilizar o código-fonte correspondente completo, incluindo dependências e
scripts de build, com acesso equivalente junto ao download, conforme GPL seção 6.
As versões estão no arquivo do fornecedor; o aviso indica os repositórios e
scripts de build. Arquive também os avisos/licenças de todas as dependências
estáticas junto aos fontes antes de publicar: links upstream e avisos não
substituem essa obrigação. O preparo não certifica o cumprimento desse gate.
Assinatura/notarização e instalação macOS/Windows
ainda precisam de validação própria; executar as ferramentas não homologa o
instalador nem a política de codecs.

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

### Diagnóstico local de reprodução

O desktop e o servidor salvam diagnósticos automaticamente, também no build de
produção, em `<diretório de dados do app>/logs/`. No macOS:

```text
~/Library/Application Support/app.popcorn.desktop/logs/server.jsonl
~/Library/Application Support/app.popcorn.desktop/logs/desktop.jsonl
```

Em execução standalone, o caminho é `<--data-dir>/logs/server.jsonl`.
Cada arquivo é JSONL (um evento JSON por linha), tem limite de 5 MiB e mantém
três arquivos anteriores (`.jsonl.1` a `.jsonl.3`): até 20 MiB por componente.
Os eventos são gravados conforme acontecem e permanecem após fechar/reabrir o app.
No Unix, a pasta usa permissão `0700` e os arquivos `0600`.

`server.jsonl` inclui os logs do backend, status/tempo HTTP, bytes e esperas de
leitura/escrita, estado do download, metadados de vídeo/áudio, plano de conversão,
argumentos filtrados, PID/saída do FFmpeg/ffprobe e o trecho final do stderr.
O stderr é drenado continuamente, filtrado e limitado; linhas incompletas
excessivamente grandes são descartadas, sem bloquear o conversor.

`desktop.jsonl` registra as transições da reprodução, falhas de RPC e a exceção
original do MediaSource/SourceBuffer **antes** da limpeza do player, com fase,
bytes recebidos/anexados, buffers, timestamps e geração da transmissão. Inclui
dimensões/CSS do vídeo, estado de tela cheia, quadros decodificados, apresentados
e descartados, além do tempo sem avanço. A coleta periódica ocorre a cada cinco
segundos; falhas e mudanças de estado são registradas imediatamente.

Use `timestamp_ms`, `run_id`, `playback_id`, `stream_generation` e `attempt_id`
para correlacionar as tentativas. O registro HTTP nunca inclui URI/query ou
headers completos. URLs privadas, magnets, bearer tokens e credenciais são
removidos dos textos de erro e dos demais dados antes da escrita. Nenhum
diagnóstico é enviado a serviços externos; os bytes do vídeo não são registrados.

Depois de atualizar essa instrumentação, encerre o processo de desenvolvimento
com Ctrl+C e execute `bun run desktop:dev` novamente para atualizar também os
comandos nativos e o servidor. Reproduza o problema e preserve os arquivos atuais
e rotacionados para investigação. O antigo log temporário de desenvolvimento
`popcorn-media-diagnostics.log` não é mais utilizado.

Para verificar persistência, rotação, filtragem de credenciais e captura de falhas:

```sh
cargo test -p popcorn-diagnostics
```

### Verificações do projeto

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
