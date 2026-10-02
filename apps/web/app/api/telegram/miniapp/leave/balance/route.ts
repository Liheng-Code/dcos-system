import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMiniAppProfile } from "@/lib/hr/telegram/miniapp-auth";
import { getLeaveBalanceSummary } from "@/lib/hr/leave";

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const result = await requireMiniAppProfile(request, admin);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { profile } = result;
    const balances = await getLeaveBalanceSummary(admin, profile.id);

    return NextResponse.json({ balances });
  } catch (err) {
    console.error("Telegram mini app leave balance error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
