"use server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import {
  getAttendanceEmployeeProfile,
  getAttendanceProfileMessage,
  getAttendanceSiteAssignment,
  getBusinessDate,
  getBusinessMinutes,
  getBusinessTime,
  haversineDistance,
  isAssignedSite,
  validateQrSite,
} from "@/lib/hr/attendance";

export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { method, lat, lng, gps_accuracy, site_id, selfie_base64, qr_token } = body;

  if (!method) return NextResponse.json({ error: "method is required" }, { status: 400 });

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
      { error: `QR attendance is required for ${assignment.site_locations?.name ?? "your assigned site"}` },
      { status: 403 }
    );
  }

  const { data: existing } = await admin
    .from("attendance_logs")
    .select("id")
    .eq("employee_id", user.id)
    .eq("log_type", "check_in")
    .gte("log_time", `${today}T00:00:00+07:00`)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "Already checked in today" }, { status: 409 });
  }

  let resolvedSiteId: string | null = site_id ?? null;

  if (method === "gps") {
    if (lat == null || lng == null) {
      return NextResponse.json({ error: "lat and lng required for GPS check-in" }, { status: 400 });
    }

    const { data: sites } = await admin
      .from("site_locations")
      .select("id, lat, lng, radius_meters")
      .eq("is_active", true);

    const gpsLat = Number(lat);
    const gpsLng = Number(lng);
    const withinSite = (sites ?? []).find((s) => {
      if (s.lat == null || s.lng == null) return false;
      return haversineDistance(gpsLat, gpsLng, Number(s.lat), Number(s.lng)) <= s.radius_meters;
    });

    if (!withinSite) {
      return NextResponse.json({ error: "Location is outside any registered site geofence" }, { status: 403 });
    }
    resolvedSiteId = withinSite.id;
  }

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

  let selfieUrl: string | null = null;
  if (selfie_base64) {
    const base64Data = selfie_base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const path = `${user.id}/${today}_${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("attendance-selfies")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!uploadError) selfieUrl = path;
  }

  let attendanceType = method === "qr" ? "SITE_WORK" : "PRESENT";
  const { data: shiftRow } = await admin
    .from("employee_shift_assignments")
    .select("shift_id, work_shifts(shift_type, start_time, grace_minutes)")
    .eq("employee_id", user.id)
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const shift = (shiftRow as {
    work_shifts?: { shift_type: string; start_time: string | null; grace_minutes: number | null } | null;
  } | null)?.work_shifts;
  if (shift?.shift_type === "fixed" && shift?.start_time) {
    const [h, m] = shift.start_time.split(":").map(Number);
    const graceMin = shift.grace_minutes ?? 15;
    const shiftDeadline = h * 60 + m + graceMin;
    if (getBusinessMinutes() > shiftDeadline) attendanceType = "LATE";
  }

  const { error: logError } = await admin.from("attendance_logs").insert({
    employee_id: user.id,
    log_type: "check_in",
    method,
    latitude: lat ?? null,
    longitude: lng ?? null,
    gps_accuracy: gps_accuracy ?? null,
    site_id: resolvedSiteId,
    selfie_url: selfieUrl,
    is_valid: true,
  });

  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });

  const checkInTime = getBusinessTime();
  const { error: recordError } = await admin.from("attendance_records").upsert(
    {
      employee_id: user.id,
      attendance_date: today,
      attendance_type: attendanceType,
      check_in_time: checkInTime,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,attendance_date" }
  );

  if (recordError) return NextResponse.json({ error: recordError.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    attendance_type: attendanceType,
    check_in_time: checkInTime,
    selfie_stored: selfieUrl !== null,
  });
}
