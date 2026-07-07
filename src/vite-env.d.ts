/// <reference types="vite/client" />

// Server-provided credentials, all optional. Set them in a `.env` file at the
// project root on the server (see .env.example). Because this is a static
// build, any VITE_* value is embedded into the public JS bundle at build time
// — fine for the non-secret ones (Google client ID, Supabase URL + Anon key),
// but note VITE_ERP_API_SECRET is NOT truly hidden from someone who inspects
// the page source. When set, each maps to the matching Settings field, which
// then shows read-only ("set on the server"). Edit the .env and rebuild to
// change them.
interface ImportMetaEnv {
  readonly VITE_ERP_BASE_URL?: string;
  readonly VITE_ERP_API_KEY?: string;
  readonly VITE_ERP_API_SECRET?: string;
  readonly VITE_ERP_DOCTYPE?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ANTHROPIC_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
