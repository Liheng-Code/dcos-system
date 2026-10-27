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
    shareGetUser(browserClient);
  }
  return browserClient;
}

// How long one auth.getUser() answer is shared. Any auth change (sign in/out, token refresh) clears it sooner.
const SHARED_USER_MS = 60_000;

/**
 * auth.getUser() asks the auth server every time, and supabase-js runs those calls one after another behind its
 * session lock. ~300 components call it on mount, so one page load made 4-17 sequential round trips (slow on
 * production, unnoticed locally). Callers now share one answer for a short time; an error is never shared.
 */
function shareGetUser(client: SupabaseClient) {
  const auth = client.auth;
  const original = auth.getUser.bind(auth);
  let shared: { at: number; promise: ReturnType<typeof original> } | null = null;

  auth.onAuthStateChange((event) => {
    if (event !== "INITIAL_SESSION") shared = null;
  });

  auth.getUser = ((jwt?: string) => {
    if (jwt) return original(jwt);
    if (shared && Date.now() - shared.at < SHARED_USER_MS) return shared.promise;
    const promise = original();
    const entry = { at: Date.now(), promise };
    shared = entry;
    const forget = () => { if (shared === entry) shared = null; };
    promise.then((r) => { if (r.error) forget(); }, forget);
    return promise;
  }) as typeof auth.getUser;
}
