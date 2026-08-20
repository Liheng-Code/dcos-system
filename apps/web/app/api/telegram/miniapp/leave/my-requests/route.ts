import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMiniAppProfile } from "@/lib/telegram/miniapp-auth";
import { getMyLeaveRequests } from "@/lib/hr/leave";

export async function GET(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const result = await requireMiniAppProfile(request, admin);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { profile } = result;
    const requests = await getMyLeaveRequests(admin, profile.id);

    return NextResponse.json({ requests });
  } catch (err) {
    console.error("Telegram mini app leave my-requests error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
