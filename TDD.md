# Desenho técnico

Este documento registra as fronteiras e restrições técnicas do Popcorn. Use os [ADRs](docs/adr/) para decisões específicas do backend. O código atual é a referência do comportamento implementado; este desenho não substitui a revisão do código.

## Arquitetura

- **Desktop:** shell Tauri inicia e supervisiona o backend Rust; SolidJS apresenta a interface no navegador/WebView.
- **Backend:** Rust, Tokio e Axum hospedam API e entrega de mídia. Connect RPC e Protobuf definem os contratos do cliente.
- **Persistência:** `catalog.sqlite` é distribuído somente para leitura. `user.sqlite` e os arquivos de usuário ficam no diretório local de dados.
- **Mídia:** o backend gerencia fontes, transferência e sessões; HTTP serve vídeo. FFmpeg/ffprobe são ferramentas separadas usadas quando necessárias.
- **Integrações:** TMDB fornece metadados. rqbit gerencia transferência BitTorrent.

O backend é um monólito modular. Regras e contratos de produto ficam no backend para que clientes não reimplementem políticas. A UI mantém estado de apresentação e envia intenções e observações do player.

## Segurança e ciclo de vida

O launcher inicia o backend com credenciais efêmeras por canal privado, não por argumentos de processo. A API valida autenticação e origens permitidas; a credencial de mídia tem escopo limitado à sessão. Segredos, magnets e dados pessoais não devem aparecer nos logs.

O backend valida entradas, controla acesso a arquivos e serializa operações que podem conflitar. Encerrar uma sessão cancela seus trabalhos. O modo standalone permanece local e exige credencial.

## Dados e compatibilidade

Atualizações do aplicativo não devem substituir o banco pessoal nem apagar downloads mantidos pelo usuário. Exclusões precisam respeitar sessões e arquivos em uso. A leitura do catálogo instalado não o modifica.

A reprodução direta depende dos codecs do sistema. Remux ou transcodificação só devem ser usados para perfis medidos; não anunciar formatos, HDR ou desempenho sem validação nos sistemas suportados.

## Verificação de releases

Antes de anunciar suporte, validar nos alvos desktop: instalação e atualização, inicialização e encerramento do backend, preservação de dados, autenticação/origens e reprodução dos perfis publicados. Testes de mídia usam fontes autorizadas e condições controladas, sem depender de peers públicos ou TMDB ao vivo.
