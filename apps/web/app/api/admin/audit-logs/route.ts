import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { getActorContext } from "@/lib/admin-users/actor-context";
import { auditLogsQuerySchema } from "@/lib/admin-users/admin-users-schemas";
import { listAuditLogs } from "@/lib/admin-users/admin-users-service";

// GET /api/admin/audit-logs — Phase 4 gap-fill powering USR-06 (Audit Log Page). See
// admin-users-schemas.ts's auditLogsQuerySchema doc comment for why this route was added
// beyond the original Phase 3 endpoint list.
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
  const parsed = auditLogsQuerySchema.safeParse({
    user_id: searchParams.get("user_id") ?? undefined,
    actor_id: searchParams.get("actor_id") ?? undefined,
    event_type: searchParams.get("event_type") ?? undefined,
    date_from: searchParams.get("date_from") ?? undefined,
    date_to: searchParams.get("date_to") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await listAuditLogs(admin, parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[admin/audit-logs] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
