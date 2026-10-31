/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Turnstile site key. Unset in development = Cloudflare's always-pass test key. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** package.json version, set at build time (vite.config.ts). */
declare const __APP_VERSION__: string;
