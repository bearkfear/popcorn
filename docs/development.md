# Desenvolvimento

## Requisitos

Instale [Devbox](https://www.jetify.com/devbox/), depois entre no ambiente do projeto. Ele fixa Rust 1.94.0 e Bun 1.3.13 e fornece dependências nativas usadas pelo desktop.

```sh
devbox shell
bun install --frozen-lockfile
```

## Executar

```sh
bun run dev
```

O comando prepara o backend e as ferramentas de mídia, inicia a interface Vite e abre o launcher. Encerre pelo menu do aplicativo ou com Ctrl+C.

Para trabalhar apenas na interface web:

```sh
devbox run web
```

Esse modo não inicia o backend nem oferece integração com o shell Tauri. Para mais comandos de geração e verificação, consulte os scripts em `package.json`; a geração de catálogo substitui o snapshot de desenvolvimento.

## Site

As instruções específicas do site estão em [apps/site/README.md](../apps/site/README.md).
