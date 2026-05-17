/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly TAURI_ENV_DEBUG?: string;
  readonly TAURI_ENV_PLATFORM?: string;
  readonly TAURI_ENV_ARCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
