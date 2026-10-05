import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { drainOutbox } from "@/lib/construction/daily-reporting/server";
import { drainGroupOutbox, refreshLaunchMessages } from "@/lib/construction/daily-reporting/telegram/telegram-server";

// Scheduled tick for Daily Reporting: raises reminders, missing reports and
// escalations (idempotent in the database), then delivers pending Telegram and
// email notifications. Call every 5–15 minutes with
// `Authorization: Bearer <CRON_SECRET>`.
async function tick(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: schedule, error } = await admin.rpc("dr_run_schedule");
  if (error) {
    console.error("dr cron tick:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const delivery = await drainOutbox(admin, 100);
  // Status lines for bound Telegram groups, and their launch buttons (tokens last at most 24 hours).
  const group = await drainGroupOutbox(admin, 100);
  const launch = await refreshLaunchMessages(admin);
  return NextResponse.json({ schedule, delivery, group, launch });
}

export const GET = tick;
export const POST = tick;
