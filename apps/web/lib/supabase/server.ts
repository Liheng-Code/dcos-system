import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
      auth: {
        // 02-USR Phase 4 fix: @supabase/ssr's createServerClient defaults to flowType:
        // "pkce". auth.resetPasswordForEmail() (called from lib/auth/auth-service.ts and
        // lib/admin-users/admin-users-service.ts) generates a PKCE code_challenge whenever
        // flowType is "pkce" and stores the matching code_verifier via this client's cookie
        // adapter — but that adapter is a no-op (getAll returns [], setAll does nothing),
        // so the verifier is generated and immediately discarded. The emailed recovery link
        // would then carry a `?code=` that can never be exchanged for a session, silently
        // breaking every forgot-password / force-reset / activation link. This mirrors
        // Supabase's own documented reasoning for why inviteUserByEmail() never uses PKCE:
        // "the browser initiating the [request] is often different from the browser
        // accepting [the link]." Using "implicit" here makes resetPasswordForEmail() emit
        // the classic token-in-hash-fragment link instead, which apps/web/lib/supabase/
        // client.ts's browser client can always complete regardless of its own configured
        // flowType (auth-js detects the callback type actually present in the URL, not the
        // client's configured flowType — see GoTrueClient._initialize()).
        flowType: "implicit",
      },
    }
  );
}

export async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
