import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (typeof window !== "undefined") {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set to create a Supabase client");
    }
    // Prerendering: NEXT_PUBLIC_* vars are inlined at build time. If they are
    // absent the client components still render their initial HTML on the
    // server; effects (which actually use the client) never run during
    // prerender, so a stub is safe here. The real client is created on the
    // client during hydration.
    return {} as SupabaseClient;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
