import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/auth/auth-schemas";
import { forgotPassword } from "@/lib/auth/auth-service";
import { resolveRedirectTo } from "@/lib/auth/redirect";

// POST /api/auth/forgot-password — F6, BR6.01–BR6.06. Unauthenticated, email-enumeration-safe.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    // The only distinguishable error this endpoint ever returns is malformed input — never an
    // existence signal (BR6.01/BR6.06).
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await forgotPassword(admin, {
    email: parsed.data.email,
    redirectTo: resolveRedirectTo(parsed.data.redirect_to),
  });

  return NextResponse.json(result, { status: 200 });
}
