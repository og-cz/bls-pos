/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Turnstile site key. Unset in development = Cloudflare's always-pass test key. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
