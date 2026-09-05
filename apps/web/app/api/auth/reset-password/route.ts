import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { resetPasswordSchema } from "@/lib/auth/auth-schemas";
import { resetPassword } from "@/lib/auth/auth-service";

/**
 * POST /api/auth/reset-password — F2 (activation) + F6 (routine reset) shared completion
 * endpoint, BR2.01–BR2.05, BR6.03–BR6.05.
 *
 * Per `08-API-Reference.md`: "the Supabase recovery session is established client-side via the
 * token before this call; the server route operates within that recovery session context." In
 * practice that means the browser has already exchanged the emailed recovery token for a
 * session (e.g. via `supabase.auth.exchangeCodeForSession()` / `verifyOtp()` against the token
 * in the `/reset-password` link) before calling this route, so the Supabase session cookies
 * this route reads via `createUserClient()` already belong to the account being reset.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten(), code: "USR_PASSWORD_POLICY" }, { status: 400 });
  }

  const userClient = await createUserClient();
  const admin = createAdminClient();

  try {
    const result = await resetPassword(userClient, admin, parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[auth/reset-password] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
