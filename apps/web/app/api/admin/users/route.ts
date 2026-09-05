import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { getActorContext } from "@/lib/admin-users/actor-context";
import { listUsersQuerySchema } from "@/lib/admin-users/admin-users-schemas";
import { listUsers } from "@/lib/admin-users/admin-users-service";

// GET /api/admin/users — powers USR-01 (User Management list) and dashboard counts.
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const parsed = listUsersQuerySchema.safeParse({
    account_status: searchParams.get("account_status") ?? undefined,
    department_id: searchParams.get("department_id") ?? undefined,
    role: searchParams.get("role") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await listUsers(admin, parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[admin/users] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
