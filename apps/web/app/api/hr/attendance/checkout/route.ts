"use server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import {
  getAttendanceEmployeeProfile,
  getAttendanceProfileMessage,
  getAttendanceSiteAssignment,
  getBusinessDate,
  getBusinessTime,
  isAssignedSite,
  validateQrSite,
} from "@/lib/hr/attendance";

function minutesFromTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { method = "web", qr_token, lat, lng, gps_accuracy } = body;

  const admin = createAdminClient();
  const employeeProfile = await getAttendanceEmployeeProfile(admin, user.id);
  const employeeProfileMessage = getAttendanceProfileMessage(employeeProfile);
  if (employeeProfileMessage) {
    return NextResponse.json({ error: employeeProfileMessage }, { status: 403 });
  }

  const today = getBusinessDate();
  const assignment = await getAttendanceSiteAssignment(admin, user.id, today);

  if (assignment?.is_required && method !== "qr") {
    return NextResponse.json(
      { error: `QR checkout is required for ${assignment.site_locations?.name ?? "your assigned site"}` },
      { status: 403 }
    );
  }

  const { data: log } = await admin
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", user.id)
    .eq("log_type", "check_in")
    .gte("log_time", `${today}T00:00:00+07:00`)
    .maybeSingle();

  if (!log) {
    return NextResponse.json({ error: "No check-in found for today" }, { status: 400 });
  }

  const { data: existingOut } = await admin
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", user.id)
    .eq("log_type", "check_out")
    .gte("log_time", `${today}T00:00:00+07:00`)
    .maybeSingle();

  if (existingOut) {
    return NextResponse.json({ error: "Already checked out today" }, { status: 409 });
  }

  let resolvedSiteId: string | null = null;
  if (method === "qr") {
    const validation = await validateQrSite(admin, qr_token, { lat, lng });
    if ("error" in validation) {
      return NextResponse.json({ error: validation.error }, { status: 403 });
    }
    resolvedSiteId = validation.site.id;

    if (!isAssignedSite(assignment, resolvedSiteId)) {
      return NextResponse.json(
        { error: `This QR is not for ${assignment?.site_locations?.name ?? "your assigned site"}` },
        { status: 403 }
      );
    }
  }

  const checkOutTime = getBusinessTime();
  const { error: logError } = await admin.from("attendance_logs").insert({
    employee_id: user.id,
    log_type: "check_out",
    method,
    latitude: lat ?? null,
    longitude: lng ?? null,
    gps_accuracy: gps_accuracy ?? null,
    site_id: resolvedSiteId,
    is_valid: true,
  });

  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

  const { data: record } = await admin
    .from("attendance_records")
    .select("check_in_time")
    .eq("employee_id", user.id)
    .eq("attendance_date", today)
    .maybeSingle();

  let hoursWorked: number | null = null;
  if (record?.check_in_time) {
    const inMinutes = minutesFromTime(record.check_in_time);
    const outMinutes = minutesFromTime(checkOutTime);
    const diff = outMinutes >= inMinutes ? outMinutes - inMinutes : outMinutes + 24 * 60 - inMinutes;
    hoursWorked = Math.round((diff / 60) * 100) / 100;
  }

  await admin
    .from("attendance_records")
    .update({
      check_out_time: checkOutTime,
      hours_worked: hoursWorked,
      updated_at: new Date().toISOString(),
    })
    .eq("employee_id", user.id)
    .eq("attendance_date", today);

  return NextResponse.json({ success: true, check_out_time: checkOutTime, hours_worked: hoursWorked });
}
