import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isApiError } from "@/lib/api-error";
import { getActorContext } from "./actor-context";
import { accountStatusActionSchema } from "./admin-users-schemas";
import { transitionAccountStatus } from "./admin-users-service";

type Params = { params: Promise<{ id: string }> };

/**
 * Shared POST handler factory for the four ACCOUNT_STATUS_ACTIONS endpoints
 * (`/api/admin/users/[id]/{lock,unlock,suspend,disable}`, F3, BR3.01–BR3.07). Keeps the four
 * route files themselves to a one-line re-export, matching the "route handlers thin, logic in
 * the service layer" convention while reusing identical actor-check/audit-log scaffolding.
 */
export function createAccountStatusHandler(action: "lock" | "unlock" | "suspend" | "disable") {
  return async function POST(request: NextRequest, { params }: Params) {
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
    const parsed = accountStatusActionSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    try {
      const result = await transitionAccountStatus(admin, {
        action,
        targetId: id,
        actorId: user.id,
        reason: parsed.data.reason,
      });
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      if (isApiError(err)) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      console.error(`[account-status:${action}] unexpected error:`, err);
      return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
    }
  };
}
