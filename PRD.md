# Requisitos do produto

Este documento resume a intenção e os requisitos do Popcorn. É uma referência de planejamento, não um retrato garantido do estado atual do aplicativo. O [README](README.md) apresenta o projeto; o [TDD](TDD.md) descreve as fronteiras técnicas.

## Objetivo

Criar um aplicativo desktop open source para descobrir, organizar e reproduzir filmes e séries localmente. O usuário instala um pacote; o cliente inicia o backend no próprio computador. O sistema não exige conta nem infraestrutura de nuvem.

## Público e plataformas

O público são pessoas que querem explorar títulos e reproduzir fontes próprias ou autorizadas em um dispositivo. Windows e macOS são os alvos iniciais; Linux é uma possível expansão. Compatibilidade de sistema e mídia depende de validação por plataforma.

## Requisitos

- **Catálogo:** consultar e pesquisar filmes e séries no TMDB, ver detalhes, temporadas e episódios; um snapshot local pode manter conteúdo acessível offline.
- **Fontes:** adicionar magnet ou arquivo `.torrent`, associá-lo a um título e escolher o arquivo de vídeo. Não indexar nem descobrir fontes automaticamente.
- **Reprodução:** iniciar antes do download completo quando a fonte permitir; oferecer pausa, seek e estados de carregamento. Usar conversão apenas quando necessária e compatível.
- **Downloads e armazenamento:** mostrar progresso, permitir pausar/retomar e configurar limite e limpeza sem apagar arquivos externos do usuário.
- **P1 / evolução:** legendas, seleção de áudio, biblioteca e histórico, preferências adicionais e importação explícita de arquivos locais.

## Restrições

- Backend em Rust; cliente desktop com Tauri e SolidJS.
- Catálogo distribuído somente para leitura; dados pessoais e downloads ficam separados e devem sobreviver a atualizações.
- Usar somente fontes autorizadas. O aplicativo não distribui nem localiza conteúdo.
- Não prometer compatibilidade universal de codecs, sincronização entre dispositivos ou cliente adicional sem validação e decisão próprias.

## Critérios de produto

O fluxo principal deve permitir explorar um título, escolher uma fonte e reproduzir com feedback de carregamento. Atualizações não devem apagar dados locais ou downloads. As plataformas e formatos anunciados precisam passar por validação própria antes de serem considerados suportados.
