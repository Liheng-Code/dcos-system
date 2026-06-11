"use server";
import { NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import {
  getAttendanceEmployeeProfile,
  getAttendanceProfileMessage,
  getAttendanceSiteAssignment,
  getBusinessDate,
} from "@/lib/hr/attendance";

export async function GET() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const today = getBusinessDate();
  const employeeProfile = await getAttendanceEmployeeProfile(admin, user.id);
  const employeeProfileMessage = getAttendanceProfileMessage(employeeProfile);
  const assignment = await getAttendanceSiteAssignment(admin, user.id, today);

  const { data: record } = await admin
    .from("attendance_records")
    .select("attendance_type, check_in_time, check_out_time, hours_worked, verified")
    .eq("employee_id", user.id)
    .eq("attendance_date", today)
    .maybeSingle();

  const { data: checkInLog } = await admin
    .from("attendance_logs")
    .select("method, selfie_url, site_id")
    .eq("employee_id", user.id)
    .eq("log_type", "check_in")
    .gte("log_time", `${today}T00:00:00Z`)
    .maybeSingle();

  // Get assigned shift for today
  const { data: shiftRow } = await admin
    .from("employee_shift_assignments")
    .select("shift_id, work_shifts(name, shift_type, start_time, end_time, grace_minutes)")
    .eq("employee_id", user.id)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    date: today,
    employee_profile: {
      id: employeeProfile?.id ?? null,
      employee_id: employeeProfile?.employee_id ?? null,
      full_name: employeeProfile?.full_name ?? null,
      status: employeeProfile?.status ?? null,
      attendance_enabled: !employeeProfileMessage,
      message: employeeProfileMessage,
    },
    checked_in: !!record?.check_in_time,
    checked_out: !!record?.check_out_time,
    attendance_type: record?.attendance_type ?? null,
    check_in_time: record?.check_in_time ?? null,
    check_out_time: record?.check_out_time ?? null,
    hours_worked: record?.hours_worked ?? null,
    method: checkInLog?.method ?? null,
    site_id: checkInLog?.site_id ?? null,
    attendance_site: assignment ? {
      site_id: assignment.site_id,
      required: assignment.is_required,
      name: assignment.site_locations?.name ?? null,
    } : null,
    shift: (shiftRow as {
      work_shifts?: {
        name: string;
        shift_type: string;
        start_time: string | null;
        end_time: string | null;
        grace_minutes: number;
      } | null;
    } | null)?.work_shifts ?? null,
  });
}
