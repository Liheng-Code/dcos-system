import { NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { getActorContext } from "@/lib/admin-users/actor-context";
import { getAccountSummary } from "@/lib/admin-users/admin-users-service";

// GET /api/admin/dashboard/account-summary — F11, BR11.01–BR11.03.
export async function GET() {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const actor = await getActorContext(admin, user.id);
  if (!actor.isHr) {
    return NextResponse.json({ error: "Forbidden", code: "USR_FORBIDDEN" }, { status: 403 });
  }

  try {
    const result = await getAccountSummary(admin);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[admin/dashboard/account-summary] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
