import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireMiniAppProfile } from "@/lib/telegram/miniapp-auth";

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient();
    const result = await requireMiniAppProfile(request, admin);

    if (!result.ok) {
      return NextResponse.json({ linked: false, error: result.error }, { status: result.status });
    }

    const { profile } = result;
    return NextResponse.json({
      linked: true,
      profile: {
        id: profile.id,
        fullName: profile.full_name,
        employeeId: profile.employee_id,
      },
    });
  } catch (err) {
    console.error("Telegram mini app session error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
