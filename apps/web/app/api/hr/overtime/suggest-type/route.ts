import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { isRestDay, type DailyShift } from "@/lib/hr/attendance-daily";
import { suggestOtType, type OtTypeRule } from "@/lib/hr/ot-type";

// GET ?start_time=YYYY-MM-DDTHH:mm&end_time=...  → the OT type HR's rules suggest for the signed-in
// employee, with the reason. The requester can still choose another type.

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export async function GET(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = (searchParams.get("start_time") ?? "").slice(0, 16);
  const end = (searchParams.get("end_time") ?? "").slice(0, 16);
  if (!WALL_CLOCK.test(start) || !WALL_CLOCK.test(end)) {
    return NextResponse.json({ error: "start_time and end_time are required" }, { status: 400 });
  }
  const date = start.slice(0, 10);

  const supabase = createAdminClient();
  const [rulesRes, ratesRes, holidayRes, assignRes] = await Promise.all([
    supabase.from("overtime_type_rules").select("priority, kind, params, ot_type, is_active"),
    supabase.from("overtime_rates").select("ot_type").eq("is_active", true).lte("effective_date", date),
    supabase.from("leave_public_holidays").select("id").eq("is_active", true).eq("holiday_date", date).limit(1),
    supabase.from("employee_shift_assignments").select("shift_id").eq("employee_id", user.id).lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`).order("effective_from", { ascending: false }).limit(1),
  ]);
  const error = rulesRes.error ?? ratesRes.error ?? holidayRes.error ?? assignRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shiftId = assignRes.data?.[0]?.shift_id;
  const { data: shift } = shiftId ? await supabase.from("work_shifts").select("*").eq("id", shiftId).maybeSingle() : { data: null };

  const suggestion = suggestOtType((rulesRes.data ?? []) as OtTypeRule[], {
    start,
    end,
    isHoliday: (holidayRes.data ?? []).length > 0,
    isRestDay: isRestDay(date, (shift as DailyShift | null) ?? null),
    ratedTypes: new Set((ratesRes.data ?? []).map((r: { ot_type: string }) => r.ot_type)),
  });
  return NextResponse.json({ suggestion });
}
