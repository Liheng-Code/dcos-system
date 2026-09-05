import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { getActorContext } from "@/lib/admin-users/actor-context";
import { inviteUserSchema } from "@/lib/admin-users/admin-users-schemas";
import { inviteUser } from "@/lib/admin-users/admin-users-service";
import { resolveRedirectTo } from "@/lib/auth/redirect";

// POST /api/admin/users/invite — F1, BR1.01–BR1.06.
export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => null);
  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten(), code: "USR_MISSING_FIELDS" },
      { status: 400 },
    );
  }

  try {
    const result = await inviteUser(
      admin,
      { ...parsed.data, redirect_to: resolveRedirectTo(parsed.data.redirect_to) },
      user.id,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[admin/users/invite] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
