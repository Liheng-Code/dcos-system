import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireHrAdmin } from "@/lib/hr/auth";
import { buildAttendanceDailyRange, defaultBuildRange } from "@/lib/hr/attendance-daily-service";

// Rebuilds attendance_daily rows. Body { from?, to?, employee_ids? } (yyyy-mm-dd, Phnom Penh dates);
// omit from/to to rebuild yesterday. Callable by an HR admin, or by a scheduler that sends
// `Authorization: Bearer <CRON_SECRET>` (only accepted when CRON_SECRET is set).

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function authorise(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return { supabase: createAdminClient(), error: null, status: 200 };
  }
  return requireHrAdmin();
}

async function run(request: NextRequest, body: { from?: unknown; to?: unknown; employee_ids?: unknown }) {
  const auth = await authorise(request);
  if (auth.error || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const fallback = defaultBuildRange();
  const from = typeof body.from === "string" ? body.from : fallback.from;
  const to = typeof body.to === "string" ? body.to : from;
  if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ error: "from/to must be yyyy-mm-dd" }, { status: 400 });
  const employeeIds = Array.isArray(body.employee_ids)
    ? body.employee_ids.filter((id): id is string => typeof id === "string")
    : undefined;

  try {
    return NextResponse.json(await buildAttendanceDailyRange(auth.supabase, { from, to, employeeIds }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Build failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return run(request, await request.json().catch(() => ({})));
}

// Vercel Cron issues GET requests.
export async function GET(request: NextRequest) {
  return run(request, {});
}
