import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMiniAppProfile } from "@/lib/hr/telegram/miniapp-auth";
import { decideLeaveRequest, DecideLeaveRequestError } from "@/lib/hr/leave";
import { LeaveDecisionSchema } from "@/lib/hr/leave-schemas";

// Status mapping for DecideLeaveRequestError (mirrors the human-facing
// messages in lib/hr/telegram/leave-handlers.ts's decisionErrorMessage, adapted
// to HTTP semantics):
//   not_found      -> 404 (no such leave request)
//   not_pending    -> 409 (already decided / not currently awaiting a fresh
//                     approval — the request existed but is no longer in a
//                     state this decision can apply to)
//   not_your_turn  -> 403 (this approver isn't the one who can decide it
//                     right now — an authorization/turn-order rule, not a
//                     missing-resource or malformed-request problem)
//   reason_required-> 422 (well-formed request, but violates the decision's
//                     business rule — same convention as the apply route's
//                     business-rule rejections)

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
      decision: "approved",
      notes: parsed.data.notes,
    });

    if (!outcome.ok) {
      const status = outcome.error ? ERROR_STATUS[outcome.error] : 500;
      return NextResponse.json({ error: outcome.error }, { status });
    }

    return NextResponse.json(outcome, { status: 200 });
  } catch (err) {
    console.error("Telegram mini app leave approve error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
