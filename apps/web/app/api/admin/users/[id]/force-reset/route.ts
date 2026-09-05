import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { getActorContext } from "@/lib/admin-users/actor-context";
import { forceResetSchema } from "@/lib/admin-users/admin-users-schemas";
import { forceResetPassword } from "@/lib/admin-users/admin-users-service";
import { resolveRedirectTo } from "@/lib/auth/redirect";

type Params = { params: Promise<{ id: string }> };

// POST /api/admin/users/[id]/force-reset — F7, BR7.01–BR7.04.
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

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

  const body = await request.json().catch(() => ({}));
  const parsed = forceResetSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await forceResetPassword(admin, {
      targetId: id,
      actorId: user.id,
      redirectTo: resolveRedirectTo(parsed.data.redirect_to),
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (isApiError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[admin/users/[id]/force-reset] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
