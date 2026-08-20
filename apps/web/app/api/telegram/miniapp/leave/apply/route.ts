import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMiniAppProfile } from "@/lib/telegram/miniapp-auth";
import { createLeaveRequest } from "@/lib/hr/leave";
import { LeaveApplySchema } from "@/lib/hr/leave-schemas";

// Business-rule rejections (insufficient_balance, date_conflict,
// gender_restricted, probation_not_allowed, probation_requires_hr,
// max_days_exceeded, half_day_not_allowed, invalid_leave_type,
// validation_error — see CreateLeaveRequestError in lib/hr/leave.ts) all map
// to 422: the request was well-formed but violates a leave policy. Only a
// malformed body (missing/invalid fields) is a 400.

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const result = await requireMiniAppProfile(request, admin);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const body = await request.json().catch(() => null);
    const parsed = LeaveApplySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
    }

    const { profile } = result;
    const outcome = await createLeaveRequest(admin, profile.id, {
      leaveTypeId: parsed.data.leave_type_id,
      startDate: parsed.data.start_date,
      endDate: parsed.data.end_date,
      daySelections: parsed.data.day_selections,
      reason: parsed.data.reason,
    });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error, message: outcome.message }, { status: 422 });
    }

    return NextResponse.json({ requestId: outcome.requestId }, { status: 200 });
  } catch (err) {
    console.error("Telegram mini app leave apply error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
