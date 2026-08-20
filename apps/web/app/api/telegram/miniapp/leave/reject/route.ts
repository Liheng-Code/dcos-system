import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMiniAppProfile } from "@/lib/telegram/miniapp-auth";
import { decideLeaveRequest, DecideLeaveRequestError } from "@/lib/hr/leave";
import { LeaveDecisionSchema } from "@/lib/hr/leave-schemas";

// See apps/web/app/api/telegram/miniapp/leave/approve/route.ts for the
// rationale behind this status mapping — identical here since both routes
// share the same DecideLeaveRequestError union. The one behavioral
// difference between approve/reject is enforced inside decideLeaveRequest
// itself (reject requires non-empty notes, surfaced as `reason_required`),
// not duplicated here.

const ERROR_STATUS: Record<DecideLeaveRequestError, number> = {
  not_found: 404,
  not_pending: 409,
  not_your_turn: 403,
  reason_required: 422,
};

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const result = await requireMiniAppProfile(request, admin);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const body = await request.json().catch(() => null);
    const parsed = LeaveDecisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { profile } = result;
    // approverId always comes from the verified mini app profile, never the
    // client body — the request body carries no identity claim at all.
    const outcome = await decideLeaveRequest(admin, {
      requestId: parsed.data.request_id,
      approverId: profile.id,
      decision: "rejected",
      notes: parsed.data.notes,
    });

    if (!outcome.ok) {
      const status = outcome.error ? ERROR_STATUS[outcome.error] : 500;
      return NextResponse.json({ error: outcome.error }, { status });
    }

    return NextResponse.json(outcome, { status: 200 });
  } catch (err) {
    console.error("Telegram mini app leave reject error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
