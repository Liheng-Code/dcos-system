import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { changePasswordSchema } from "@/lib/auth/auth-schemas";
import { changePassword } from "@/lib/auth/auth-service";

// Reads the `session_id` claim out of the caller's own access token (no signature
// verification needed — the token already came from our own authenticated session cookie).
// Used so change-password can revoke every OTHER session without also signing the caller out
// of the request they're currently making.
function decodeJwtSessionId(accessToken: string): string | null {
  try {
    const payloadSegment = accessToken.split(".")[1];
    const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

// POST /api/auth/change-password — F5, BR5.01–BR5.04. Self-service only.
export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const {
    data: { session },
  } = await userClient.auth.getSession();
  const currentSessionId = session?.access_token ? decodeJwtSessionId(session.access_token) : null;

  try {
    const result = await changePassword(admin, user.id, parsed.data, currentSessionId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[auth/change-password] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
