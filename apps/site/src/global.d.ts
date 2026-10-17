// Declara os tipos de ambiente disponibilizados ao frontend do site.
/// <reference types="@solidjs/start/env" />

interface ImportMetaEnv {
	readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
