# PRD — Popcorn
**Product Requirements Document**

**Versão:** 0.4 — Draft  
**Data:** 14/10/2026  
**Status:** Planejamento  
**Plataforma inicial:** Desktop — Windows e macOS; Linux posteriormente

---

## 1. Visão geral

O Popcorn será um aplicativo desktop de código aberto para descoberta, organização e reprodução de filmes e séries, inspirado na experiência do Popcorn Time original.

A aplicação oferecerá uma interface moderna, catálogo de conteúdos, integração com fontes BitTorrent autorizadas e reprodução progressiva de mídia.

O usuário instalará um único pacote no sistema operacional, contendo o cliente Tauri e o backend Rust como executáveis separados. Ao abrir o cliente, o backend será iniciado automaticamente em segundo plano; não será necessário instalar Docker nem configurar um servidor.

O produto será projetado com uma arquitetura cliente-servidor, permitindo futuramente o desenvolvimento de clientes web, mobile ou para TV, sem reescrever o backend.

## 2. Objetivos

- Proporcionar uma experiência de navegação semelhante à de plataformas de streaming.
- Reproduzir conteúdos via BitTorrent sem exigir download completo.
- Executar localmente, sem necessidade de infraestrutura em nuvem própria.
- Distribuir um catálogo SQLite com fontes previamente vinculadas, separado dos dados particulares da instalação.
- Preservar dados do usuário e downloads ao atualizar o programa.
- Compartilhar contratos tipados entre backend e clientes.
- Manter o backend independente da interface desktop.
- Permitir evolução modular sem adotar microserviços prematuramente.

### 2.1 Fora do escopo inicial

- Autenticação e gerenciamento de usuários.
- Cliente web, mobile ou Smart TV.
- Infraestrutura de streaming em nuvem.
- Sistema de pagamentos ou assinaturas.
- Transmissão de conteúdo para dispositivos externos.
- Indexação automatizada de fontes não autorizadas.
- Docker ou configuração manual de servidor como requisito de instalação.
- Atualização independente do catálogo em tempo de execução.

A ausência de contas de usuário não elimina a proteção da API local: o backend deverá aceitar apenas clientes locais autorizados. Os mecanismos técnicos estão descritos em `TDD.md`.

### 2.2 Recorte do MVP

Todos os requisitos P0 fazem parte do MVP, incluindo catálogo de séries e episódios, importação de arquivos `.torrent` e controles de downloads. Requisitos P1 são incrementos posteriores e não condicionam o aceite do MVP, mesmo quando aparecem como candidatos no roadmap.

O suporte a arquivos locais citado na visão de público será entregue como P1 (RF-08). Windows e macOS têm a mesma prioridade de produto e condicionam o aceite inicial; Linux será atendido posteriormente. Os targets técnicos iniciais propostos são Windows x64 e macOS ARM64. macOS Intel e Windows ARM64 não estão excluídos, mas dependem de validação e não condicionam o primeiro release. Versões mínimas dos sistemas e matriz de formatos/codecs serão fechadas com evidência antes do release; não há promessa de suporte universal.

## 3. Público-alvo

Usuários que desejam descobrir, organizar e reproduzir conteúdos audiovisuais em um aplicativo desktop, com suporte a arquivos locais e fontes BitTorrent autorizadas.

O uso inicial será pessoal, em um único dispositivo.

## 4. Requisitos funcionais

### RF-01 — Catálogo

**Prioridade: P0**

- Consultar filmes e séries através da API TMDB.
- Exibir títulos populares, lançamentos e categorias.
- Pesquisar conteúdos por título.
- Consultar detalhes, sinopse, elenco, gênero, avaliação e ano.
- Exibir pôsteres e imagens de fundo.
- Navegar entre temporadas e episódios.
- Consultar os conteúdos presentes no `catalog.sqlite` distribuído com o aplicativo, inclusive sem acesso ao TMDB.
- Atualizar esse snapshot junto às novas versões do programa, mantendo a integração TMDB para consultas e enriquecimento além dos dados distribuídos.

### RF-02 — Gerenciamento de fontes

**Prioridade: P0**

- Adicionar fontes utilizando magnet links ou arquivos `.torrent`.
- Associar uma fonte a um filme ou episódio.
- Detectar arquivos de mídia disponíveis no torrent.
- Selecionar o arquivo que será reproduzido.
- Exibir informações de tamanho e disponibilidade.
- Permitir remover fontes e downloads.
- Exibir fontes previamente vinculadas a filmes e episódios no catálogo distribuído, sem exigir associação manual dessas fontes.
- Manter fontes manuais e ocultações de fontes publicadas nos dados locais, sem modificar o catálogo instalado.

Os vínculos publicados são preparados antes da distribuição; o aplicativo não executa indexação ou identificação automática de torrents no MVP. Consultar uma fonte não inicia o download de mídia.

### RF-03 — Reprodução de mídia

**Prioridade: P0**

- Iniciar a reprodução antes de concluir o download.
- Priorizar os blocos necessários à reprodução.
- Suportar play, pause e seek.
- Exibir estados de carregamento e buffering.
- Recuperar-se de interrupções quando possível.
- Reproduzir formatos compatíveis com o player.
- Utilizar FFmpeg quando necessário para compatibilidade.

Seek é avançar ou voltar para outra posição do vídeo. Deve funcionar também para trechos ainda não baixados, apresentando buffering enquanto os blocos necessários são obtidos.

O perfil inicial recomendado para validação é MP4 com H.264/AVC e AAC estéreo. A decisão é por arquivo e por plataforma: preferir reprodução direta, depois remux/cópia de streams e conversão apenas das faixas incompatíveis. Esse perfil é uma recomendação técnica a medir, não promessa de suporte universal nem recusa automática de outros formatos. A matriz anunciada será definida pelo gate de reprodução no TDD.

### RF-04 — Legendas e áudio

**Prioridade: P1**

- Carregar legendas externas em SRT e WebVTT.
- Selecionar faixas de legenda disponíveis.
- Permitir ajuste de sincronização.
- Selecionar faixas de áudio quando disponíveis.

### RF-05 — Biblioteca pessoal

**Prioridade: P1**

- Adicionar filmes e séries aos favoritos.
- Registrar histórico de reprodução.
- Salvar posição de reprodução.
- Continuar assistindo de onde parou.
- Identificar conteúdos já assistidos.

### RF-06 — Downloads e cache

**Prioridade: P0**

- Exibir progresso de download.
- Exibir velocidade e quantidade de peers.
- Permitir pausar e continuar downloads.
- Configurar diretório de armazenamento.
- Definir limite de espaço destinado ao cache.
- Remover arquivos temporários.

### RF-07 — Configurações

**Prioridade: P1**

- Diretório de downloads.
- Limites de velocidade de download e upload.
- Idioma preferido das legendas.
- Qualidade de reprodução preferida.
- Limpeza de cache.
- Configurações de reprodução.

O diretório de armazenamento, o limite de cache e sua limpeza já são P0 pelo RF-06; as demais preferências deste requisito são P1.

### RF-08 — Arquivos locais

**Prioridade: P1**

- Importar explicitamente um arquivo de mídia escolhido pelo usuário.
- Associar o arquivo a um filme ou episódio.
- Reproduzir o arquivo quando compatível com a matriz suportada.
- Preservar o arquivo original: remoção de fonte ou limpeza de cache não apaga arquivos locais importados.

## 5. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Backend implementado em Rust |
| RNF-02 | Cliente desktop utilizando Tauri 2 |
| RNF-03 | Interface desenvolvida com SolidJS |
| RNF-04 | Comunicação via Connect RPC e Protobuf |
| RNF-05 | Persistência local com SQLite |
| RNF-06 | Operações de longa duração não podem bloquear a interface |
| RNF-07 | Backend executável independentemente do cliente |
| RNF-08 | API vinculada a localhost por padrão |
| RNF-09 | Instaladores para plataformas desktop suportadas |
| RNF-10 | Tratamento padronizado de erros e logs estruturados |
| RNF-11 | Cliente e backend incluídos no mesmo instalador, com inicialização automática do backend |
| RNF-12 | Catálogo distribuído somente leitura, dados locais separados e atualização sem apagar dados do usuário ou downloads |

## 6. Arquitetura técnica

### 6.1 Frontend

- Tauri 2 para empacotamento e integração com o sistema operacional.
- SolidJS para interface reativa.
- Tailwind CSS para estilização.
- SDK TypeScript gerado a partir dos contratos Protobuf.
- Cliente Connect RPC para comunicação com o servidor.

### 6.2 Backend

- Rust e Tokio.
- Axum como servidor HTTP.
- Connect RPC para comunicação entre clientes e backend.
- Buf para gerenciamento e geração de contratos Proto3.
- rqbit como motor BitTorrent.
- SQLite para persistência.
- Integração com TMDB para metadados.
- FFmpeg para operações de mídia quando necessário.

### 6.3 Protocolos

**Connect RPC:**
- Comandos e consultas.
- Gerenciamento de torrents.
- Catálogo e biblioteca.
- Configurações.
- Streaming de eventos e progresso, conforme suporte do transporte selecionado.

**HTTP tradicional:**
- Entrega de arquivos de mídia.
- Suporte a Range Requests.
- Reprodução progressiva e operações de seek.
- Entrega de legendas e recursos binários.

O uso de HTTP para mídia será interno e independente dos contratos RPC.

O detalhamento de contratos, persistência, ciclo de vida, segurança e validações técnicas está em `TDD.md`. As integrações permanecem propostas até passarem pelos gates definidos nesse documento.

### 6.4 Organização do código

```text
popcorn/
├── apps/
│   ├── desktop/
│   └── server/
│       └── src/
│           ├── api/
│           ├── catalog/
│           ├── sources/
│           ├── downloads/
│           ├── playback/
│           ├── library/
│           └── storage/
├── packages/
│   ├── ui/
│   └── sdk/
├── proto/
└── Cargo.toml
```

O domínio da aplicação não deverá depender diretamente de Axum, Tauri ou da implementação de transporte RPC.

O backend será um monólito modular com fronteiras hexagonais leves, inicialmente um crate organizado por funcionalidades. Serviços definem regras e estado; adaptadores conectam HTTP/RPC, SQLite, TMDB e motor torrent. A separação futura em crates dependerá de necessidade concreta, não será requisito inicial.

### 6.5 Distribuição e diretórios

- O cliente é um executável Tauri com shell Rust e interface SolidJS; o backend é um executável Rust independente, empacotado como sidecar.
- `catalog.sqlite` acompanha o código no Git e o pacote instalado. Contém conteúdos, fontes e vínculos publicados; é aberto somente para leitura.
- `user.sqlite` é criado na primeira execução e armazena configurações, fontes manuais, downloads e, nos incrementos P1, favoritos e histórico.
- `/app` representa logicamente os recursos instalados, incluindo o catálogo. `/data` representa o diretório persistente do usuário. Os caminhos físicos seguem as convenções de cada sistema operacional.
- Downloads e cache usam diretórios separados dentro dos dados locais por padrão; o destino de downloads é configurável.
- Atualizar o programa substitui executáveis e catálogo, preservando dados locais, ocultações e downloads. Fontes necessárias a downloads iniciados são copiadas para o banco local, sem dependência de sua permanência no catálogo publicado.

## 7. Principais fluxos

### FL-01 — Descoberta de conteúdo

1. Usuário abre o aplicativo.
2. O cliente consulta o serviço de catálogo.
3. O servidor consulta o snapshot instalado, o cache local e o TMDB conforme a consulta.
4. O catálogo é apresentado na interface.
5. Usuário seleciona um filme ou série.
6. O aplicativo apresenta seus detalhes e fontes associadas.

### FL-02 — Reprodução

1. Usuário seleciona uma fonte disponível.
2. O cliente solicita o início da reprodução por RPC.
3. O servidor inicializa ou recupera a sessão BitTorrent.
4. O motor prioriza os blocos necessários.
5. O backend disponibiliza um endpoint HTTP local.
6. O player começa a reprodução quando houver dados suficientes.
7. O progresso e os eventos são enviados ao cliente.

### FL-03 — Continuar assistindo

1. O cliente consulta o histórico local.
2. O usuário seleciona um conteúdo iniciado anteriormente.
3. O servidor recupera a posição salva.
4. A sessão de reprodução é restaurada, quando a fonte ainda estiver disponível.

## 8. Critérios de aceite do MVP

O MVP será considerado concluído quando:

- [ ] O aplicativo puder ser instalado e iniciado em Windows e macOS, nos targets iniciais validados.
- [ ] O instalador incluir cliente e backend, e o cliente iniciar o backend automaticamente sem Docker.
- [ ] O catálogo distribuído apresentar conteúdos e suas fontes previamente vinculadas, sem escrita no snapshot.
- [ ] Atualizar o programa e seu catálogo preservar configurações, fontes locais, ocultações e downloads existentes.
- [ ] O catálogo apresentar filmes e permitir buscas.
- [ ] O catálogo apresentar séries, temporadas e episódios, além de listas de populares, lançamentos e categorias.
- [ ] A tela de detalhes mostrar os metadados de um filme.
- [ ] Detalhes de filmes e séries incluírem sinopse, elenco, gênero, avaliação, ano e imagens, quando fornecidos pelo TMDB.
- [ ] O usuário conseguir adicionar manualmente um magnet link autorizado.
- [ ] O usuário conseguir importar um arquivo `.torrent` e associar fontes a filmes ou episódios.
- [ ] O sistema conseguir identificar e selecionar o arquivo de vídeo.
- [ ] O sistema apresentar tamanho e disponibilidade observada dos arquivos da fonte.
- [ ] A reprodução começar sem aguardar o download completo, quando houver peers e dados suficientes.
- [ ] Play, pause e seek funcionarem.
- [ ] O progresso do torrent estiver visível.
- [ ] Velocidade e quantidade de peers estiverem visíveis, e downloads puderem ser pausados e retomados.
- [ ] O cache puder ser gerenciado.
- [ ] O diretório de armazenamento e o limite de cache puderem ser configurados.
- [ ] Fontes, downloads e arquivos temporários puderem ser removidos com política explícita, sem apagar dados em uso ou arquivos externos.
- [ ] Interrupções recuperáveis apresentarem buffering ou ação de retomada, e formatos não suportados apresentarem erro explícito.
- [ ] A matriz de mídia suportada estiver documentada, incluindo os perfis que exigem FFmpeg, e verificada no sistema alvo.
- [ ] O backend funcionar independentemente do Tauri.
- [ ] Operações de catálogo, download e reprodução não bloquearem a interface.
- [ ] A API de controle e mídia ficar restrita a loopback e recusar acessos sem autorização local.

## 9. Roadmap

| Fase | Período | Entrega |
|---|---|---|
| Fundação | Semanas 1–2 | Monorepo, contratos, servidor Rust, Tauri e SQLite |
| Fluxo vertical | Antes das telas completas; prazo após primeiros gates | Snapshot de teste, fonte, reprodução progressiva, seek e encerramento em Windows e macOS |
| Catálogo | Semanas 2–4 | TMDB, pesquisa e interface |
| BitTorrent | Semanas 3–5 | Motor, fontes e download progressivo |
| Reprodução | Semanas 5–6 | Player, seek, buffering e legendas básicas |
| Biblioteca | Semana 7 | Histórico, favoritos e configurações |
| Release | Semana 8 | Testes, empacotamento e MVP |

**Estimativa:** oito semanas de desenvolvimento, sujeitas à validação técnica do motor de streaming e da compatibilidade entre formatos de mídia e player.

As entregas P1 de legendas, biblioteca e configurações adicionais são candidatas dentro desse período, não requisitos de aceite P0. A estimativa deverá ser revista após os gates de RPC, torrent, player e sidecar descritos no TDD.

O plano de execução por incrementos e seus critérios de conclusão estão na seção 13 do TDD. O fluxo vertical usa cliente mínimo e fixtures para validar a integração; não substitui o aceite completo do MVP.

## 10. Riscos e decisões pendentes

| Tema | Risco ou decisão |
|---|---|
| Connect RPC Rust | Validar maturidade e integração com Axum |
| BitTorrent | Confirmar capacidades de streaming e priorização do rqbit |
| Player | Definir estratégia para MKV, HEVC, áudio multicanal e legendas |
| Tauri | Validar gerenciamento do backend como sidecar |
| Catálogo distribuído | Validar snapshot, IDs estáveis, compatibilidade de schema e atualização sem perda de dados locais |
| Distribuição | Windows e macOS prioritários; validar targets propostos, versões mínimas e instaladores; Linux posteriormente |
| Fontes | Utilizar conteúdos licenciados, próprios ou de distribuição autorizada |
| Segurança | Restringir endpoints locais e validar origens das requisições |
| Licenças | Verificar compatibilidade das licenças das dependências e do FFmpeg |

## 11. Evolução futura

Funcionalidades candidatas a versões posteriores:

- Cliente web.
- Cliente desktop Linux após Windows e macOS.
- Clientes mobile e Smart TV.
- Servidor dedicado na rede doméstica.
- Sincronização de biblioteca entre dispositivos.
- Descoberta de fontes de mídia autorizadas.
- Recomendações personalizadas.
- Reprodução remota e casting.
- Downloads programados.
- Suporte a plugins e extensões.

---

**Resumo da decisão:** o Popcorn será desenvolvido inicialmente como aplicativo desktop Tauri, com frontend SolidJS e backend Rust independente, utilizando Axum, Connect RPC, Protobuf, SQLite e rqbit. A arquitetura permitirá clientes adicionais sem incluí-los no MVP.

Cliente e backend serão distribuídos no mesmo instalador, sem Docker. O catálogo SQLite versionado acompanhará o pacote; dados do usuário e downloads permanecerão separados dos recursos instalados.

## 12. Histórico de revisão

| Versão | Data | Alterações |
|---|---|---|
| 0.1 | 14/10/2026 | PRD inicial |
| 0.2 | 14/10/2026 | Aceite cobrindo todos os P0; distinção entre P0 e P1 no roadmap/configurações; arquivos locais explicitados como P1; proteção local separada de contas de usuário; referência ao TDD |
| 0.3 | 14/10/2026 | Instalação única sem Docker; backend iniciado pelo cliente; catálogo SQLite distribuído com vínculos prontos; banco local e downloads separados e preservados nas atualizações |
| 0.4 | 14/10/2026 | Windows e macOS prioritários, Linux posterior; desenho dos módulos, perfil de mídia recomendado e fluxo vertical definidos no TDD |
