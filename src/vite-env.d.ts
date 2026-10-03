/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_AI_MODEL?: string;
  readonly VITE_AI_BASE_URL?: string;
  /** Development builds only — see .env.example. */
  readonly VITE_DEV_OPENAI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
