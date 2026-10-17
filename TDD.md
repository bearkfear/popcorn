# TDD — Popcorn
**Technical Design Document**

**Versão:** 0.3 — Draft  
**Data:** 14/10/2026  
**Status:** Desenho proposto; implementação condicionada às validações da seção 13  
**Documento de origem:** `PRD.md`, versão 0.4

## 1. Objetivo e escopo

Traduzir os requisitos do PRD em arquitetura, contratos, persistência, fluxos e critérios de verificação. TDD significa aqui documento de desenho técnico; a estratégia de testes está na seção 12.

O repositório contém apenas documentação na data deste desenho. Nenhuma integração, desempenho ou compatibilidade descrita como proposta foi comprovada por código.

O MVP cobre todos os requisitos P0: catálogo de filmes e séries, catálogo SQLite distribuído com fontes previamente vinculadas, fontes manuais por magnet e `.torrent`, reprodução progressiva, controles do player e gerenciamento de downloads/cache. Legendas, biblioteca, configurações adicionais e arquivos locais são P1. O aplicativo não indexa torrents nem tenta associá-los automaticamente ao TMDB em tempo de execução; os vínculos distribuídos são preparados antes de publicar o pacote.

As escolhas do PRD permanecem: Rust, Tokio, Axum, Connect RPC, Protobuf/Buf, SQLite, rqbit, Tauri 2, SolidJS e Tailwind CSS. Não incluir usuários, serviços em nuvem próprios, clientes adicionais ou microserviços.

A distribuição inicial é um único instalador desktop com dois executáveis: cliente Tauri e backend Rust. O usuário abre somente o cliente, que inicia o backend como sidecar. O shell do cliente é Rust; a interface continua SolidJS no WebView. Docker e configuração manual de um servidor não fazem parte da instalação inicial.

## 2. Arquitetura

```text
Shell Tauri (Rust) ── inicia/supervisiona ── popcorn-server
       │                                      │
       │ bootstrap via IPC                    ├─ catálogo ── catalog.sqlite + TMDB
       ▼                                      ├─ fontes/downloads ── librqbit ── peers
SolidJS + SDK ── Connect RPC ── Axum            ├─ reprodução ── mídia/FFmpeg
Player HTML ─── HTTP local ──── Axum            └─ dados locais ── user.sqlite + disco
```

O shell controla o ciclo de vida do processo e seletores de arquivos/diretórios. A UI recebe endereço e credencial de conexão pelo IPC e usa o SDK para o domínio. Não duplicar regras de negócio em comandos Tauri.

O backend é um monólito modular com fronteiras hexagonais leves: regras e serviços por funcionalidade, transporte e integrações nas bordas. Axum hospeda RPC e mídia no mesmo listener loopback; objetos de domínio não dependem de tipos Axum, Tauri ou Protobuf. O executável standalone reutiliza exatamente os mesmos serviços do sidecar.

### 2.1 Responsabilidades e dependências

| Local proposto | Responsabilidade |
|---|---|
| `apps/desktop/` | SolidJS, player, shell Tauri e bootstrap |
| `apps/server/` | Composição, listener, adaptadores RPC/HTTP e encerramento |
| `packages/sdk/` | Tipos e cliente TypeScript gerados; configuração do transporte |
| `packages/ui/` | Componentes compartilhados, sem lógica do backend |
| `apps/server/src/core/` | Entidades, valores e regras puras de catálogo e mídia |
| `apps/server/src/application/` | Casos de uso, comandos, consultas e contratos externos |
| `apps/server/src/infra/` | SQLite, TMDB, motor torrent, arquivos e migrações |
| `apps/server/src/interface/` | Adaptação RPC, HTTP e CLI, incluindo conversões Protobuf |
| `apps/server/src/bootstrap/` | Configuração, composição, prontidão e encerramento |
| `proto/popcorn/v1/` | Serviços, mensagens e enums públicos versionados |

O backend começa como um único crate com `main.rs` para bootstrap e `lib.rs` para composição dos serviços testáveis. Separar crates somente quando houver reutilização ou necessidade real de isolamento; não criar um crate por módulo no início.

Decisão de 15/10/2026: a estrutura física segue camadas, com conceitos de catálogo e mídia dentro delas. `core` não depende das camadas externas nem de SQL, HTTP ou Protobuf. `application` coordena casos de uso por contratos de fronteira; `infra` implementa integrações; `interface` traduz entradas e saídas; `bootstrap` compõe os serviços concretos.

DDD é aplicado de forma leve, sem repositórios genéricos nem uma interface por struct. Comandos e consultas são separados no código, mas usam o mesmo processo e banco: sem barramento, event sourcing ou infraestrutura CQRS adicional.

Arquivos Rust manuais do servidor têm no máximo 250 linhas, funções têm limite de 60 linhas pelo Clippy, e todo arquivo começa com um comentário sobre sua finalidade. O código gerado é excluído. A suíte automatizada do servidor se limita a poucos testes das regras puras em `core`; essa decisão substitui a abrangência de testes do servidor proposta na seção 12.

O [ADR 0001](docs/adr/0001-backend-file-responsibilities.md) formaliza o comentário inicial de uma linha e restringe `mod.rs` a declarações de módulos e imports/reexports. Cada caso de uso fica em `commands/<operacao>.rs` ou `queries/<operacao>.rs`, com o pedido e sua função `handle` juntos. Os `mod.rs` dessas pastas apenas declaram casos de uso e reexportam tipos. Os adaptadores chamam as funções diretamente. No catálogo elas recebem os ports necessários; na mídia recebem `MediaContext`, que compartilha os ports e a trava dos comandos. A [revisão do backend](docs/backend-health.md) registra a organização atual e os pontos de concorrência ainda abertos.

Tipos `librqbit`, processos FFmpeg e conexões SQL não atravessam os contratos RPC. Introduzir interfaces somente nas fronteiras externas que precisem de substituição/testes, sem repositório genérico ou camada obrigatória para cada struct.

### 2.2 Propriedade do estado e concorrência

| Estado | Dono e contrato |
|---|---|
| Conteúdos publicados | `catalog`, somente leitura; `sources` consulta os vínculos sem alterá-los |
| Fontes e preferências locais | `sources`, com transações executadas por `storage` |
| Sessão torrent, seleção e reservas de arquivos em uso | `downloads`, único dono dos handles e das mutações no motor |
| Sessão de reprodução e subprocesso FFmpeg | `playback`, incluindo cancelamento e revogação de credenciais |
| Histórico/favoritos P1 | `library`, persistência local |
| Paths, contagem de espaço e remoção física | `storage`; apagar dados somente após autorização e ausência de reservas em `downloads` |

Ordenar comandos conflitantes do motor por um coordenador de `downloads`, com canal limitado e resposta individual: selecionar, pausar, retomar, reservar/liberar arquivo, preparar remoção de fonte e preparar exclusão. A reserva é adquirida antes da preparação/leitura da reprodução e impede apagar os dados. Preparar remoção verifica reservas existentes e instala a barreira contra novas reservas atomicamente no mesmo coordenador, por identidade resolvida da fonte; preparar exclusão também impede novas reservas até concluir ou cancelar a operação. Não manter uma trava global durante rede, probe, SQL ou leitura de vídeo.

O coordenador atualiza estado e inicia trabalhos, mas não aguarda peças enquanto processa comandos. Streams de bytes, resolução de metadados e FFmpeg executam em tarefas canceláveis separadas, com backpressure. Encerramento pertence à composição do servidor, que cancela e aguarda seus trabalhos antes de sair. Sem barramento externo, microserviços ou actors para todos os módulos.

## 3. Inicialização e ciclo de vida

1. O shell resolve os recursos instalados e o diretório de dados locais pelo Tauri e inicia o backend empacotado para o target, fornecendo os caminhos resolvidos pelo canal de controle.
2. O backend adquire exclusividade sobre o diretório de dados antes de abrir `user.sqlite`, aplicar migrações ou iniciar o motor. Abre `catalog.sqlite` somente para leitura e valida a compatibilidade do schema antes de anunciar prontidão. Uma segunda instância sobre os mesmos dados falha com erro explícito.
3. O servidor vincula `127.0.0.1` em porta livre atribuída pelo sistema.
4. O shell fornece um segredo efêmero por canal privado de stdin, nunca por argumentos. O backend emite em stdout uma mensagem de prontidão com porta, versão de API e identificador da instância; logs seguem para stderr.
5. O shell aguarda esse evento com timeout limitado e entrega o bootstrap à UI pelo IPC. Em erro ou timeout de inicialização, solicita encerramento do processo iniciado; se ele não sair no prazo, termina somente esse processo. Aguarda confirmação de saída e liberação dos canais antes de habilitar tentar novamente. Se não conseguir confirmar a saída, mantém o erro e não inicia uma segunda instância. Eventos tardios da tentativa anterior são descartados pelo identificador da tentativa; não há reinício automático infinito.
6. Ao fechar o desktop, o shell solicita encerramento pelo canal de controle. O servidor cancela streams, salva o estado necessário, fecha banco e motor e confirma o encerramento. Se exceder o prazo, o shell termina somente o processo que iniciou.

O backend também encerra quando perde seu canal de controle no modo sidecar. No modo standalone, usa um arquivo de credencial com permissões restritas, sinais do sistema e porta configurável, mantendo loopback. Esse modo não depende de Tauri instalado.

`catalog.sqlite` é a autoridade para os vínculos publicados; `user.sqlite` é a autoridade para configurações, fontes manuais e estado particular da instalação. O estado de retomada do motor fica em diretório próprio dentro dos dados locais e deve ser reconciliado no início. Não gravar contadores de peers ou velocidade como estado durável.

## 4. Contratos RPC e eventos

### 4.1 Serviços propostos

Os nomes abaixo são o desenho do contrato, não APIs já implementadas.

| Serviço | Métodos principais | Requisitos |
|---|---|---|
| `CatalogService` | `ListTitles`, `SearchTitles`, `GetTitle`, `ListSeasons`, `ListEpisodes` | RF-01 |
| `SourceService` | `AddSource`, `ListSources`, `GetSource`, `ListFiles`, `SelectFile`, `RemoveSource` | RF-02 |
| `PlaybackService` | `StartPlayback`, `GetPlayback`, `StopPlayback` | RF-03 |
| `DownloadService` | `ListDownloads`, `PauseDownload`, `ResumeDownload`, `RemoveDownload`, `WatchDownloads` | RF-06 |
| `SettingsService` | `GetSettings`, `UpdateSettings`, `GetStorageUsage`, `ClearCache` | RF-06/07 |
| `LibraryService` (P1) | `SetFavorite`, `ListFavorites`, `SaveProgress`, `GetHistory`, `SetWatched` | RF-05 |
| `PlaybackService` (P1) | `ListTracks`, `SelectAudioTrack`, `AddSubtitle`, `SelectSubtitle`, `SetSubtitleOffset` | RF-04 |
| `SourceService` (P1) | `AddLocalSource` | RF-08 |

`AddSource` aceita um `oneof` com magnet ou bytes de `.torrent`, limitado a 10 MiB como valor inicial de projeto. A importação não aceita uma URL arbitrária nem um caminho fornecido diretamente pelo frontend. O seletor Tauri lê o arquivo escolhido; clientes standalone podem enviar os bytes.

`ContentRef` identifica `{media_type, tmdb_id, season_number?, episode_number?}`. Temporada/episódio são obrigatórios para uma associação de episódio e ausentes para filme. IDs locais de fonte, download e reprodução são opacos; IDs internos do rqbit nunca são o contrato público.

`AddSource` retorna imediatamente um ID persistido e estado `RESOLVING`; os arquivos ficam disponíveis quando os metadados chegam. Consultas de disponibilidade refletem uma observação do motor, não uma garantia de reprodução.

`ListSources` combina fontes publicadas e fontes locais por `ContentRef`, respeitando ocultações locais e deduplicando por infohash. IDs públicos distinguem a origem publicada/local sem expor IDs do motor. Ao iniciar reprodução de uma fonte publicada, materializar em `user.sqlite` uma fonte local com magnet ou bytes de `.torrent`, vínculo e arquivo selecionado, deduplicada por infohash. O download passa a depender dessa cópia, não de uma linha do catálogo instalado.

Quando as duas origens representam a mesma fonte, a entrada mesclada retorna o ID publicado como `source_id` e inclui `published_source_id` e `local_source_id` em sua proveniência. Sem versão publicada, retorna o ID local. Mutações aceitam qualquer um desses IDs, resolvem o mesmo infohash e consideram ambas as origens; a escolha do ID não muda a política de remoção. Ocultação vale para a entrada inteira, não só para uma das origens. Downloads preservados continuam acessíveis pela listagem de downloads, mesmo quando sua fonte está oculta no catálogo.

`StartPlayback` recebe `source_id`, `file_index` e posição inicial opcional. Retorna `playback_id`, modo de entrega, URL de mídia e expiração da credencial de mídia. A sessão pode estar preparando dados; o método não fica esperando peers indefinidamente.

`GetPlayback` recebe `playback_id` e `renew_media_credentials`. Com renovação solicitada, retorna novas URLs e expiração para a mesma sessão e assets, sem reiniciar download, transformação ou posição. A credencial anterior permanece válida por 60 segundos de sobreposição, valor inicial a validar no G3. O cliente renova antes da expiração e conserva posição e estado de pause ao substituir a URL; se o player recarregar, aguarda metadados e restaura a posição antes de continuar. Para HLS, renovar também as referências aos segmentos. Sessão encerrada não pode renovar.

Play/pause de vídeo são comandos do player local. Pausar vídeo não pausa download. Seek é efetuado pelo player sobre HTTP; no modo FFmpeg, a sessão deve traduzir a posição para a linha do tempo da saída conforme a estratégia validada na seção 7.

### 4.2 Evolução e semântica

- Pacote `popcorn.v1`; campos removidos terão números e nomes reservados.
- Enums começam em `*_UNSPECIFIED`; valores desconhecidos não causam quebra do cliente.
- Durações e posições usam milissegundos inteiros. Tamanhos e contadores usam `uint64`; a UI faz conversões explícitas ao apresentar valores.
- Listagens usam paginação com tamanho máximo 100, definido como limite inicial.
- Inclusão de magnet/`.torrent` é deduplicada por infohash. Uma fonte pode ter várias associações; uma seleção de reprodução pertence à sessão, não altera outras associações.
- Mutação repetida de pause/resume/stop e remoção já concluída é idempotente. `StartPlayback` recebe chave de idempotência, com resultado mantido durante a vida da sessão.
- Operações usam deadlines e propagam cancelamento ao trabalho associado. Cancelar uma consulta não apaga um download durável.
- Geração Rust/TypeScript deve usar o mesmo conjunto de `.proto`; fixar versões dos geradores e dependências ao implementar.

### 4.3 Eventos

Proposta: `WatchDownloads` usa server streaming Connect no WebView. Cada conexão recebe primeiro um snapshot completo, depois atualizações com `instance_id` e sequência crescente. Reconexão abre uma nova assinatura e recebe outro snapshot; não pressupor replay durável.

Agregar métricas em no máximo uma atualização por segundo por download, com fila limitada. Se o consumidor não acompanhar, encerrar a assinatura para que ele obtenha um snapshot novo. Não acumular eventos ilimitadamente.

Estados de reprodução combinam fatos do servidor com eventos do player: `PREPARING`, `READY`, `PLAYING`, `PAUSED`, `BUFFERING`, `ENDED`, `FAILED`, `STOPPED`. `PLAYING`/`PAUSED` são observados na UI; o servidor não infere que o vídeo está tocando apenas porque respondeu HTTP.

Streaming Connect no WebView é um gate técnico. Se falhar, a alternativa a avaliar é polling de snapshots via RPC; a decisão precisa ser registrada antes de mudar o contrato de eventos.

## 5. Persistência e armazenamento

### 5.1 Dois bancos com ciclos de vida separados

`catalog.sqlite` é um snapshot versionado no repositório e incluído no instalador como recurso. Contém:

| Entidade publicada | Campos principais |
|---|---|
| `catalog_metadata` | Versão do catálogo e do schema, instante de publicação |
| `catalog_contents` | `ContentRef`, títulos e metadados disponíveis para apresentação local |
| `catalog_sources` | ID estável, infohash único, magnet ou bytes de `.torrent`, origem, qualidade e idioma conhecidos |
| `catalog_bindings` | Fonte, `ContentRef` e índice de arquivo quando conhecido; suporta vários episódios por torrent |

IDs publicados são preservados entre versões. O snapshot não contém dados de usuários, downloads nem credenciais; disponibilidade histórica não é garantia de peers atuais. O aplicativo nunca escreve ou aplica migrações nesse banco. A preparação editorial do catálogo pode evoluir separadamente; não exige um indexador rodando na máquina do usuário.

As entidades abaixo pertencem a `user.sqlite`, criado na primeira execução e migrado nas atualizações. Foreign keys ficam restritas a esse banco; referências ao catálogo são IDs estáveis e dados suficientes copiados, sem cascata entre bancos.

### 5.2 Modelo local

| Entidade | Campos e invariantes principais |
|---|---|
| `sources` | ID, tipo torrent/local, infohash único para torrent, origem magnet/torrent ou referência externa P1, criação, estado visível/removido |
| `source_bindings` | Fonte, `ContentRef`, índice de arquivo opcional; associação única |
| `storage_roots` | ID, caminho canônico gerenciado, estado atual/anterior |
| `downloads` | Fonte torrent, arquivos selecionados, estado desejado, root ID e caminho relativo, retenção |
| `external_files` (P1) | Fonte local, caminho absoluto escolhido via canal confiável, tamanho e modificação observados; nunca propriedade do cache |
| `settings` | Versão, `installation_id` persistente, diretório, limite de cache; demais preferências P1 |
| `catalog_cache` | Chave com idioma/tipo/consulta/página, payload, instante e validade |
| `catalog_source_preferences` | ID da fonte publicada, infohash e estado oculto local; nunca altera o catálogo instalado |
| `favorites` (P1) | `ContentRef` único e criação |
| `playback_history` (P1) | `ContentRef`, fonte/arquivo, posição, duração, atualizado, assistido |

Aplicar foreign keys e transações nas alterações relacionadas. Migrações numeradas são executadas antes de anunciar prontidão; erro de migração impede inicialização sem destruir o banco. Sessões e credenciais de reprodução são efêmeras.

O banco guarda IDs de raízes gerenciadas e caminhos relativos a cada raiz para downloads e saídas transformadas. Referências externas P1 guardam caminhos absolutos em entidade separada e nunca participam de limpeza gerenciada. Arquivos do motor, mídia e saídas FFmpeg ficam separados. SQLite não armazena o vídeo.

### 5.3 Diretórios da instalação

`/app` e `/data` são nomes lógicos neste desenho, não diretórios absolutos obrigatórios na raiz do sistema.

```text
app/                         pacote instalado, sem escrita em execução
  cliente Tauri
  popcorn-server
  resources/catalog.sqlite
data/                        diretório persistente do usuário
  user.sqlite
  torrent-state/
  logs/
  downloads/                 destino inicial configurável
  media-cache/               saídas temporárias de reprodução
```

O shell resolve `Resource` para o catálogo e `app_local_data_dir` para os dados [R4]. Passa paths absolutos ao backend, que não depende do diretório de trabalho nem de APIs Tauri. No modo standalone, esses paths são configurados explicitamente. O diretório do banco também acomoda arquivos auxiliares SQLite; não tratar `user.sqlite` isolado como toda a persistência.

Downloads usam a raiz inicial dentro dos dados locais, mas podem mudar conforme RF-06. Atualizar/reinstalar o programa substitui recursos de `app`, não dados de `data` nem raízes de downloads. A remoção desses dados exige ação explícita do usuário.

Cada destino escolhido é uma base para um subdiretório gerenciado `popcorn-<installation_id>`, com identidade persistida em `user.sqlite`; instalações com diretórios de dados diferentes não misturam seus arquivos, mesmo escolhendo a mesma base. `storage_roots` registra esse subdiretório canônico, não assume propriedade da pasta inteira escolhida.

Antes de qualquer leitura pelo motor, escrita ou exclusão, adquirir lock exclusivo de sistema operacional na raiz gerenciada e mantê-lo até terminar as tarefas que a utilizam. Isso também bloqueia duas instâncias que reutilizem o mesmo namespace por cópia dos dados locais. Falha de lock deixa downloads dessa raiz indisponíveis, sem iniciar transferência ou limpeza. Ao configurar um novo destino, validar e bloquear sua raiz antes de persistir a alteração; em falha, manter o destino anterior. Diretórios externos importados P1 não são raízes de downloads e continuam fora da limpeza.

### 5.4 Cache e exclusão

- Cache é mídia temporária gerenciada; downloads que o usuário decide manter são marcados como retidos e contabilizados separadamente.
- O limite é verificado contra espaço reservado/alocado pelo motor, não só bytes já recebidos. A medição exata de arquivos esparsos é parte do spike.
- Exceder o limite ou faltar espaço pausa novas gravações e mostra erro recuperável; não apagar conteúdo em uso para liberar espaço.
- Limpeza automática usa os temporários menos recentemente utilizados, excluindo downloads/sessões ativos e itens retidos.
- `RemoveSource` solicita ao coordenador a preparação de remoção. Se houver reserva de reprodução, inclusive sessão em preparação, falha com `failed_precondition` sem pausar o motor. Caso contrário, instala atomicamente a barreira contra novas reservas, pausa a transferência e, após confirmação do motor, remove associações e marca a fonte como removida em transação, sem apagar arquivos. Mantém a barreira até confirmar a transação; sucesso conclui a transição com a fonte removida, rejeitando novos inícios por essa fonte até reativação explícita. Em erro/cancelamento, confirma o fim dos trabalhos da remoção antes de liberar a barreira; uma falha entre pausa e transação deixa a fonte visível e pausada, permitindo repetir a operação. A listagem de fontes a oculta; a listagem de downloads mantém o item pelo seu ID e permite retomá-lo ou removê-lo. Preservar a linha da fonte e os metadados mínimos enquanto houver download referenciando-a; removê-la fisicamente somente depois de remover o último download. Reimportar o mesmo infohash reativa a fonte existente.
- Para fonte publicada, `RemoveSource` grava a ocultação em `catalog_source_preferences`; se houver cópia local, aplica também o ciclo de pausa/remoção acima. Não apagar a linha do catálogo somente leitura. A ocultação persiste após atualizar o pacote.
- Ao remover pelo ID local de uma fonte mesclada, gravar também a ocultação publicada por infohash, na mesma transação que marca a fonte local como removida. Resolver referências publicadas atuais e persistidas; a ausência da fonte na versão atual do catálogo não elimina a preferência. `AddSource` por importação manual explícita limpa essa ocultação e reativa a fonte/vínculo solicitado em transação. Atualização de catálogo, materialização ou retomada de download não limpam ocultações.
- `RemoveDownload` exige política explícita de manter ou apagar dados. Manter desvincula o motor, mas preserva um registro de dados retidos, seu root ID e caminho para futura gestão; não elimina a referência necessária para encontrá-los.
- A reprodução ativa deve ser parada antes de apagar seus dados. A UI apresenta a consequência antes de enviar a operação.
- O backend resolve o root ID persistido de cada item e valida o destino canônico e a propriedade dos arquivos antes de remover. Symlinks e caminhos fora dessa raiz gerenciada não são candidatos à limpeza.
- Exclusão tem estado persistido `DELETING`: parar o motor, remover arquivos, concluir a transação. Após falha/reinício, reconciliar esse estado sem alegar sucesso antes da remoção.
- Mudar diretório cria ou seleciona uma raiz gerenciada atual e vale para novos downloads. Dados existentes preservam seu root ID; raízes anteriores continuam válidas para leitura, contabilização e limpeza segura. A quota agrega temporários de todas as raízes, com retidos separados. Uma raiz indisponível aparece como inacessível, sem zerar seu uso conhecido nem permitir novas reservas sem reconciliação. Remover seu registro somente quando não houver itens referenciando-a; não fazer migração ou apagar pastas implicitamente.

## 6. Catálogo e fontes

O catálogo é independente da disponibilidade de mídia. Consultas consideram os metadados publicados em `catalog.sqlite`; TMDB continua fornecendo pesquisa, listas e enriquecimento além do snapshot, com cache local. Sem rede, os itens incluídos no snapshot permanecem consultáveis; não prometer um catálogo completo offline. As fontes publicadas já vêm vinculadas a `ContentRef`; fontes manuais continuam exigindo associação explícita. Nenhuma consulta inicia download de mídia ou promete uma fonte reproduzível.

O backend recebe a credencial TMDB de configuração local/ambiente, nunca do bundle público como segredo presumidamente protegido. Como proposta para uso pessoal, a configuração inicial solicita a credencial do usuário; o modelo de distribuição e os termos TMDB precisam ser fechados antes do release.

Cachear consultas por idioma e parâmetros completos. TTL inicial proposto: 1 hora para listas/busca e 24 horas para detalhes. Sem rede, servir entradas existentes indicando desatualização; sem entrada, apresentar indisponibilidade. Respeitar `Retry-After`, limitar requisições concorrentes e cancelar buscas substituídas.

Não registrar tokens em logs. A UI deve cumprir a atribuição exigida pelo TMDB; formato e uso de imagens dependem da revisão dos termos.

O motor usa `librqbit` dentro do processo, sem publicar a API/Web UI do rqbit. Metadados são obtidos antes da escolha do vídeo. Extensão ajuda a listar candidatos; probe confirma compatibilidade. Torrents com vários vídeos exigem escolha explícita do usuário.

Estados de download: `RESOLVING`, `QUEUED`, `DOWNLOADING`, `PAUSED`, `COMPLETED`, `FAILED`, `DELETING`. Peers ausentes deixam a operação pendente/buffering com ação de cancelar; não devem virar erro de formato.

Política inicial proposta: após conclusão, parar a transferência e não manter seeding em segundo plano. Durante transferência ativa, upload segue a política do motor e os limites configurados. Explicitar esse comportamento na interface; pausar download também pausa a transferência BitTorrent.

## 7. Reprodução e compatibilidade

### 7.1 Entrega direta

O player inicial é o elemento de vídeo do WebView. A matriz de contêiner/codecs varia por sistema alvo e deve ser medida, não deduzida apenas da extensão.

Seek significa mudar a posição temporal do vídeo: avançar para um trecho ou voltar a outro. O player traduz a posição em leituras do contêiner; não assumir uma conversão linear de segundos para bytes. No torrent, um trecho ainda ausente exige priorizar e aguardar seus blocos, apresentando buffering sem esperar o download inteiro.

Para arquivo compatível:

1. Recuperar o download e reservar o arquivo da sessão contra limpeza.
2. Abrir leitura progressiva pelo adaptador torrent.
3. Emitir URL local da sessão.
4. O player requisita cabeçalho/início e os ranges necessários.
5. A leitura aguarda blocos verificados e prioriza os blocos demandados por meio do motor.
6. Seek fecha a leitura anterior quando cancelada e passa a atender o novo intervalo.

Não carregar o arquivo inteiro em memória e não servir regiões ainda não verificadas como zeros. Aplicar backpressure. Se a peça não chegar dentro do deadline da leitura, interromper a resposta/stream e indicar indisponibilidade recuperável; depois de enviar headers, não é possível trocar o status HTTP.

### 7.2 HTTP de mídia

Endpoint proposto: `GET /media/{playback_id}/{asset_id}` com credencial opaca de escopo restrito à sessão. Não aceitar caminhos de arquivo na URL.

| Requisição | Resposta esperada |
|---|---|
| `HEAD` válido | Headers de tamanho, tipo e `Accept-Ranges: bytes`, sem corpo |
| `GET` sem Range | `200`, entrega progressiva e tamanho conhecido |
| Range único válido | `206`, `Content-Range` e `Content-Length` corretos |
| Range além do tamanho | `416` e `Content-Range: bytes */{size}` |
| Range sintaticamente inválido | `400`, sem abrir a leitura |
| Múltiplos ranges | Ignorar Range e responder `200` no MVP, sem multipart |
| Sessão inexistente/encerrada | `404`/`410` |
| Credencial ausente ou inválida | `401`/`403`, sem entregar bytes |

Suportar intervalos fechados, abertos e suffix ranges. Fixar o tamanho por sessão. O comportamento de headers e credenciais deve ser testado no player real, inclusive seek.

### 7.3 FFmpeg

Probe determina contêiner, codecs, duração e faixas. Usar entrega direta primeiro; se só o contêiner for incompatível, avaliar remux; se codecs não forem suportados, avaliar transcodificação para a matriz escolhida.

O uso de FFmpeg previsto no PRD permanece, mas não implica suporte universal a MKV, HEVC ou áudio multicanal. Saída progressiva, seek, custo de CPU e empacotamento são gates antes de prometer cada perfil.

A prova de conceito deve escolher a saída para remux/transcode, incluindo se HLS será necessário. Saída transformada não reutiliza índices de bytes ou duração presumida do arquivo original. Se HLS for escolhido, playlist e segmentos pertencem à sessão e seguem a mesma proteção e quota; Range do arquivo original não é o mecanismo de seek.

Executar o binário sem shell, com argumentos controlados, leitura restrita ao recurso local e protocolo de rede desabilitado quando não necessário. Limitar a uma transformação ativa no MVP e finalizar o processo no cancelamento. Arquivo não suportado retorna erro explícito com codecs detectados.

### 7.4 Perfil recomendado e decisão por arquivo

A extensão do torrent não define a compatibilidade. `.torrent` descreve a transferência; avaliar o contêiner e os codecs do arquivo de vídeo escolhido. O perfil inicial recomendado para a prova de conceito é MP4, H.264/AVC 8-bit 4:2:0 e AAC-LC estéreo, com fixtures 720p e 1080p. É um alvo de validação, não suporte já comprovado nem um limite definitivo de resolução.

| Arquivo detectado | Estratégia proposta |
|---|---|
| MP4 com H.264/AAC dentro do perfil validado | Entrega direta por HTTP Range |
| MKV com vídeo e áudio compatíveis | Testar remux para saída progressiva compatível, preservando os codecs |
| Vídeo compatível e áudio incompatível | Copiar vídeo e converter somente áudio para AAC estéreo |
| HEVC/H.265, vídeo 10-bit, HDR ou perfil não validado | Medir suporte direto por plataforma; se necessário, avaliar transcode para o perfil inicial |
| Formato que excede a capacidade medida ou não é reconhecido | Informar limitação; não iniciar transformação sem perspectiva de reprodução em tempo real |

Remux/streamcopy reorganiza os streams sem decodificar e recodificar os fluxos copiados [R6]. Preferir entrega direta, depois cópia/remux, depois conversão somente das faixas incompatíveis. Não transcodificar todo MKV automaticamente e não prometer 4K, HDR ou preservação de multicanal no primeiro release.

G3 deve medir probe em arquivo incompleto, dados necessários do início/fim do contêiner, tempo até primeiro frame, seek e custo de CPU nas duas plataformas. Se uma conversão for anunciada como suportada, ela deve sustentar reprodução na máquina de referência definida no gate. Saída remux/transcode, HLS versus outro transporte e parâmetros finais ficam pendentes até essa prova, sem substituir o requisito de reprodução progressiva.

## 8. Funcionalidades P1

- Legendas: importar SRT/WebVTT escolhidos pelo usuário; converter SRT para WebVTT, validar tamanho/encoding e apresentar via tracks do player sem executar markup. Offset é preferência da sessão.
- Áudio: seleção depende das capacidades medidas do player ou da transformação FFmpeg; não prometer troca nativa universal.
- Histórico: salvar por evento de pause, seek concluído, encerramento e checkpoints agregados. O servidor mantém o último checkpoint recebido; falha abrupta pode perder progresso posterior a ele.
- Continuar: restaurar fonte, arquivo e posição somente se existirem. Caso contrário, manter histórico e pedir seleção de outra fonte.
- Assistido: marcação manual e regra automática proposta de 90% da duração conhecida; validar a regra de produto antes de implementar.
- Qualidade preferida: selecionar entre fontes já associadas com qualidade conhecida, sem baixar outra fonte automaticamente.
- Arquivos locais: o shell recebe a escolha pelo seletor e registra o caminho canônico com o backend pelo canal de controle confiável. O backend devolve um token de importação de uso único, vinculado à instância e com validade inicial de 60 segundos. `AddLocalSource` recebe esse token e `ContentRef`, nunca um path arbitrário do JavaScript, e persiste a referência em `external_files`. Em standalone, a CLI local registra o arquivo pelo canal administrativo protegido; esse mecanismo integra o gate P1, não a API de importação torrent.
- `StartPlayback` resolve a variante da fonte: torrent usa `file_index`; arquivo local exige índice ausente e leitura do arquivo externo registrado. Revalidar existência e acesso em cada abertura; arquivo movido/removido retorna `SOURCE_UNAVAILABLE`, preservando histórico e permitindo nova importação. `RemoveSource` de arquivo local remove somente associação/referência quando não houver sessão ativa. O original nunca entra em remoção de cache; apenas saídas derivadas gerenciadas podem ser limpas.

## 9. Segurança local

Loopback restringe exposição na rede, mas não substitui autorização. O segredo efêmero autentica o cliente local, não representa conta de usuário.

- RPC exige bearer token; middleware valida `Host` e, quando presente, `Origin` contra allowlist exata do WebView/dev server.
- CORS sem wildcard; origins de produção são descobertos e testados por plataforma. Clientes standalone sem Origin continuam exigindo credencial.
- O elemento de vídeo pode não enviar o header RPC. Usar credencial de mídia separada, opaca, de curta duração, na URL, válida só para assets da sessão. Renovação/expiração deve preservar seek; validar isso no spike.
- O player define política de referrer restritiva; logs omitem query strings e segredos. Encerrar sessão revoga sua credencial.
- CSP permite conexão/mídia apenas ao backend local e imagens às origens TMDB necessárias; nenhuma navegação remota ganha acesso ao IPC.
- Capabilities Tauri liberam apenas bootstrap e seleção de arquivos/diretórios necessários, sem shell arbitrário exposto ao frontend.
- Validar magnet, metadados torrent, índices, tamanhos de payload, nomes e travessia de diretórios na fronteira.
- API de controle e mídia ficam em loopback. Conexões BitTorrent a peers são outra superfície; mDNS, servidor UPnP de mídia e exposição LAN ficam desabilitados.

## 10. Erros, concorrência e observabilidade

Usar erros de domínio tipados e mapear na borda para códigos Connect: `invalid_argument`, `not_found`, `already_exists`, `failed_precondition`, `resource_exhausted`, `unavailable`, `internal`. A UI usa um motivo estável como `NO_SPACE`, `UNSUPPORTED_MEDIA` ou `SOURCE_UNAVAILABLE`, sem depender do texto humano.

Logs estruturados incluem request ID, operação, IDs locais, duração e código de erro. Não incluir magnet completo, paths pessoais, tokens ou credenciais. O diagnóstico inicial é local, sem telemetria automática.

Tokio gerencia rede e tarefas canceláveis. SQLite, probe e operações bloqueantes usam execução apropriada fora das tarefas de UI e sem bloquear o executor assíncrono. Limitar jobs e streams; buffers/filas são limitados.

Permitir apenas uma reprodução ativa no MVP. Trocar vídeo encerra a sessão anterior antes de abrir outra. Downloads em segundo plano podem continuar; o teto inicial de downloads concorrentes será definido no spike de recursos.

## 11. Distribuição

Produzir backend sidecar para cada target suportado e empacotá-lo via `externalBin`. O guia Tauri exige os binários específicos por target [R3]. Gerar contratos antes de build e validar compatibilidade de API durante bootstrap.

O instalador inclui cliente, backend e `catalog.sqlite`; não exige Docker, ferramentas de desenvolvimento ou execução manual do backend. Incluir o snapshot via `bundle.resources` [R4]. O artefato do catálogo acompanha o código no Git e é validado antes de empacotar: integridade SQLite, schema compatível, IDs/vínculos válidos e ausência de dados pessoais.

Atualizações do catálogo acompanham novas versões do aplicativo. Com cliente/backend encerrados, instalar o pacote novo e abrir seu snapshot na próxima execução, sem copiar o catálogo para `data` nem substituir `user.sqlite`. Migrações locais preservam preferências, histórico, fontes e downloads; fonte publicada removida não elimina a cópia local de um download já iniciado. Não há atualizador separado de catálogo no MVP nem compromisso de atualização automática do aplicativo.

Windows e macOS são prioritários e ambos devem passar pelos gates de instalação e reprodução antes do release inicial. Linux é posterior. Targets iniciais propostos: `x86_64-pc-windows-msvc` e `aarch64-apple-darwin`; macOS Intel e Windows ARM64 permanecem candidatos posteriores, sem suporte presumido por emulação.

A primeira execução de desenvolvimento pode ocorrer no macOS ARM64 disponível, mas não substitui QA de Windows. Versões mínimas dos sistemas, estratégia de installer Windows/WebView2 e assinatura/notarização permanecem pendentes até a validação G4. Tauri usa WebView2 no Windows e WKWebView no macOS [R5]; validar RPC, origins e reprodução em cada runtime, não somente em um navegador de desenvolvimento.

O pacote FFmpeg, sua configuração e licenças precisam ser registrados junto às dependências. Usar builds e lockfiles reproduzíveis; não depender de FFmpeg instalado globalmente para um perfil anunciado como suportado.

## 12. Estratégia de verificação

Não existem testes ou aplicação executáveis neste estágio. A tabela define a evidência exigida da implementação, não resultados obtidos.

| Requisito | Verificação esperada |
|---|---|
| RF-01 / FL-01 | Paginação, busca, detalhes, temporadas/episódios; TMDB simulado, cache expirado, falha de rede e credencial ausente |
| RF-02 | Magnet e `.torrent`, metadados assíncronos, deduplicação com proveniência, remoção por ambos os IDs, ocultação após atualizar catálogo e reimportação explícita sem apagar dados |
| RF-03 / FL-02 | Torrent autorizado com seeder controlado; iniciar antes de completar, pause/play, seek para peça ausente, cancelamento e retorno de peers |
| RF-06 | Métricas, pause/resume, reinício, quota entre raízes, disco cheio, exclusão em falha parcial, fontes preservadas e duas instâncias escolhendo a mesma base ou raiz gerenciada |
| RNF-04 | Cliente TypeScript gerado falando com Rust; unary, server streaming, snapshot após reconexão e erros |
| RNF-05/07 | Dois bancos separados, catálogo somente leitura, migrações locais, recuperação e backend standalone sem Tauri |
| RNF-06/08/10 | UI responsiva sob carga, filas limitadas, bloqueio de clientes sem token/origin inválida, renovação de mídia durante reprodução/seek e logs sem segredos |
| RNF-09/11/12 | Instalar sem Docker, iniciar sidecar automaticamente, timeout/prontidão tardia com saída confirmada antes de retry, encerrar sem órfãos e atualizar pacote/catálogo preservando dados e downloads |
| RF-04 (P1) | SRT/VTT, offset e faixas usando fixtures da matriz suportada |
| RF-05 / FL-03 (P1) | Retomada após reinício, fonte removida, favoritos e regra de assistido |
| RF-07/08 (P1) | Persistência de preferências, token de importação local inválido/expirado, arquivo externo movido e impossibilidade de apagá-lo via cache |

Camadas: unitários para regras de domínio; integração com SQLite real em diretório temporário, servidor RPC/HTTP real e swarm local controlado; E2E no desktop para player e empacotamento. Verificar Range com comparação exata dos bytes, inclusive suffix e limites.

Testar a disputa entre `RemoveSource` e `StartPlayback` por sinais explícitos do coordenador: uma reserva existente deve impedir a remoção sem pausar a sessão; uma remoção já preparada deve rejeitar nova reserva até sua conclusão/cancelamento. Cobrir sucesso, falha de persistência e cancelamento, sem usar delays para criar a disputa.

Testes não dependem de peers públicos nem TMDB ao vivo. Registrar subscriptions de prontidão, evento ou conclusão antes de provocar a ação, com timeout limitado; não usar sleeps para supor que o motor terminou. Rede ausente e buffering são cenários explícitos.

O smoke externo de TMDB e mídias autorizadas complementa, mas não substitui os testes determinísticos. Registrar arquivo/codecs, tamanho, plataforma, recursos, tempo até primeiro frame, seek e uso de CPU/memória/disco. Metas numéricas de reprodução serão propostas após o spike sob condições documentadas.

## 13. Gates e sequência de implementação

| Gate | Experimento | Condição de saída |
|---|---|---|
| G1 — RPC | Axum + implementação Rust Connect + SDK TypeScript no WebView | Unary, autenticação, cancelamento e stream de snapshots funcionam |
| G2 — Torrent | `librqbit` com fixture autorizada e seeder controlado | Leitura antes do término, seek, pausa/retomada e reabertura verificadas |
| G3 — Player | Matriz de codecs no sistema alvo; direta, remux e transcode | Perfis anunciáveis, estratégia FFmpeg/seek e limitações documentadas |
| G4 — Desktop | Cliente, sidecar e catálogo empacotados, paths nativos e atualização | Instalação sem Docker, prontidão, encerramento sem órfãos e preservação de dados |
| G5 — Dados | Quota, alocação, disco cheio e falha durante exclusão | Nenhuma perda de dados externos/retidos e recuperação consistente |

Os gates são exercitados durante os incrementos, não antes da fundação. Evidência preliminar significa validar um caminho limitado; gate concluído exige todas as condições de saída da tabela, nos targets prioritários. A estimativa de oito semanas é provisória e será recalibrada com as evidências preliminares de I1–I3, sem tratar G4 como concluído antes dos testes de atualização em I5. G5 precede disponibilizar limpeza automática. A implementação Rust Connect consultada documenta integração Tower/Axum e está pre-1.0 [R1]; isso reduz a incerteza de existência da integração, não comprova o caminho dentro do Popcorn.

O rqbit documenta streaming com priorização e seek [R2]. O adaptador e o player ainda precisam demonstrar esse comportamento nas condições do produto.

A sequência executável é a dos incrementos da seção 13.2: fundação, fluxo direto, compatibilidade, produto P0, armazenamento/distribuição e P1. Seus gates acompanham essa sequência. O roadmap do PRD é estimativa, não evidência de viabilidade.

### 13.1 Primeiro fluxo vertical

Seek significa mudar a posição de reprodução: avançar ou voltar para outro instante do vídeo. No torrent, o arquivo pode estar incompleto; o backend deve solicitar e priorizar os blocos necessários ao novo trecho. Tempo do vídeo e offset em bytes não são equivalentes: o player/demuxer determina as leituras, e saídas transformadas usam a própria linha do tempo.

Antes de completar catálogo, biblioteca ou todas as telas:

1. Instalar e abrir um cliente mínimo, com backend e um snapshot de teste autorizado empacotados.
2. Iniciar o sidecar, validar bancos e receber prontidão autenticada por IPC.
3. Consultar por RPC um filme do snapshot e sua fonte vinculada.
4. Resolver metadados e listar os vídeos da fonte, sem iniciar download de mídia apenas para navegar. Para magnet, resolução pode contactar peers; se o catálogo não trouxer a lista, o adaptador deve obtê-la sob demanda.
5. Selecionar o vídeo, materializar a fonte local e iniciar o download/reprodução.
6. Exibir o primeiro frame antes do término da transferência, com progresso visível.
7. Pausar, retomar e fazer seek para um trecho ainda ausente; depois voltar a um trecho anterior, verificando buffering e recuperação com um seeder controlado. Pausar vídeo não pausa o download.
8. Encerrar o cliente sem órfãos; reabrir e recuperar configurações e o download. Posição de reprodução persistida continua P1, não requisito desse primeiro fluxo.

Verificar também que o snapshot do catálogo não foi modificado e que fonte/download materializados existem somente nos dados locais.

Esse fluxo exercita G1–G4 em Windows e macOS com o perfil direto inicial; não encerra a matriz completa G3 nem o gate de atualização G4. Remux/transcode têm testes próprios no G3 antes de serem anunciados. Seeder e condições de rede são controlados, não dependem de disponibilidade pública. O cliente mínimo é um instrumento de validação, não o MVP entregue.

### 13.2 Plano de implementação por incrementos

Cada incremento depende dos anteriores, termina com evidência observável e mantém o backend executável. Validar o primeiro fluxo antes de investir nas telas completas; não confundir prova técnica com aceite de todo o MVP.

| Incremento | Entrega | Evidência de conclusão |
|---|---|---|
| I1 — Fundação | Workspace, crate modular, Proto/SDK, RPC autenticado, cliente mínimo, sidecar, dois bancos e paths | Cliente inicia e encerra o backend, consulta snapshot por RPC; banco local sobrevive ao reinício; geração de contratos reproduzível |
| I2 — Fluxo vertical direto | Fonte publicada de teste, metadados, escolha de arquivo, `librqbit`, HTTP Range e player | Fluxo da seção 13.1 passa em Windows e macOS com seeder controlado, incluindo seek para dados ausentes e backend standalone |
| I3 — Compatibilidade | Probe, matriz medida e estratégia FFmpeg para os perfis assumidos | Entrega direta e cada conversão anunciada passam início progressivo, seek, cancelamento e medição de recursos nas duas plataformas |
| I4 — Produto P0 | Catálogo/TMDB, filmes/séries/episódios, importação manual, fontes mescladas, métricas e controles | RF-01/02/03 e métricas/pause/resume de RF-06 completos; deduplicação/ocultação corretas, UI sem bloqueio e erros recuperáveis apresentados |
| I5 — Armazenamento e distribuição | Diretórios, exclusividade, quota, limpeza, disco cheio, atualização do catálogo/pacote e instaladores | RF-06 completo, G5 e demais critérios P0 passam; atualizar preserva bancos, ocultações e downloads; instaladores verificados em ambos os targets |
| I6 — P1 e expansão | Legendas/áudio, favoritos/histórico, preferências e arquivos locais; depois avaliar Linux | Cada requisito P1 verificado separadamente; Linux recebe seus próprios gates antes de anúncio de suporte |

Em cada incremento registrar: versão do código, plataforma/runtime, fixture usada, resultados de testes e QA e limitações encontradas. Fixar versões de dependências/geradores na fundação; em I2/I3 definir máquinas de referência e versões mínimas por evidência. Não aumentar a matriz de mídia antes de concluir o perfil inicial.

G1/G4 começam em I1; G1/G2 concluem quando todos os seus critérios forem satisfeitos em I2. I2 também fornece evidência preliminar do caminho direto G3 e do ciclo de vida G4, sem concluir esses dois gates. A matriz completa G3 fecha em I3; G4/G5 concluem com empacotamento/atualização e armazenamento em I5. Recalibrar estimativas após a evidência preliminar de I1–I3.

### 13.3 Decisões ainda abertas

| Decisão | Evidência necessária |
|---|---|
| Targets propostos e versões mínimas | Validar Windows x64/macOS ARM64 no G4; Linux posterior |
| Versões de Connect, geradores e integração Axum | G1; fixar versões e teste de regeneração |
| Perfis de mídia e distribuição FFmpeg | G3 e revisão de licenças |
| Streaming de eventos no WebView | G1; aprovar alternativa se necessário |
| Credencial/atribuição TMDB distribuída | Revisão dos termos e experiência de configuração |
| Buffer, deadlines, quota padrão e concorrência | Medições G2/G3/G5 |
| Regra automática de assistido | Decisão de produto P1 |

## 14. Referências técnicas

Consultadas em 14/10/2026. Referências sustentam capacidades das dependências; as escolhas do Popcorn acima continuam propostas até os gates.

- [R1] `https://github.com/connectrpc/connect-rust` — README oficial: runtime Tower, integração Axum, geração e status pre-1.0.
- [R2] `https://github.com/ikatson/rqbit` — README oficial: biblioteca, streaming, priorização e seek.
- [R3] `https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/develop/sidecar.mdx` — guia oficial consultado via Context7: `externalBin`, targets e execução pelo shell Rust.
- [R4] `https://v2.tauri.app/develop/resources/` e documentação Tauri consultada via Context7 — recursos empacotados, resolução de `Resource` e diretório de dados locais.
- [R5] `https://v2.tauri.app/reference/webview-versions/` — guia oficial e consulta Context7: runtimes WebView por plataforma.
- [R6] `https://ffmpeg.org/ffmpeg.html` — documentação oficial, seção Streamcopy: cópia de streams sem decodificação/recodificação.

## 15. Registro de revisão

Versão 0.1: desenho inicial baseado no PRD 0.1; acompanha PRD 0.2 com critérios P0 completos, explicitação de P1/arquivos locais e distinção entre contas de usuário e proteção da API local. Não cria compromisso novo de plataforma ou suporte universal a codecs.

Versão 0.2: instalação desktop com cliente e backend no mesmo pacote, sem Docker; catálogo SQLite versionado junto ao código e distribuído como recurso somente leitura; banco local e downloads separados; atualização do pacote preserva dados particulares e cópias de fontes em uso.

Versão 0.3: Windows e macOS prioritários, Linux posterior; targets iniciais propostos, perfil de mídia recomendado, monólito modular com fronteiras hexagonais leves e implementação orientada por fluxo vertical.
