/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  // Add other VITE_ prefixed env vars here as needed
}

// Extend ImportMeta to include env property
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global constants defined in vite.config.mts
declare const __APP_VERSION__: string;
