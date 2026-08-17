import { SupabaseClient } from "@supabase/supabase-js";

export const ATTENDANCE_TIME_ZONE = "Asia/Phnom_Penh";

export interface AttendanceEmployeeProfile {
  id: string;
  employee_id: string | null;
  full_name: string | null;
  status: string | null;
}

export function getBusinessDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getBusinessTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ATTENDANCE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function getBusinessMinutes(date = new Date()) {
  const [h, m] = getBusinessTime(date).split(":").map(Number);
  return h * 60 + m;
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function getAttendanceSiteAssignment(admin: SupabaseClient, employeeId: string, date: string) {
  const { data } = await admin
    .from("employee_attendance_site_assignments")
    .select("id, site_id, is_required, site_locations(id, name, lat, lng, radius_meters)")
    .eq("employee_id", employeeId)
    .eq("is_required", true)
    .lte("effective_from", date)
    .or(`effective_to.is.null,effective_to.gte.${date}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as {
    id: string;
    site_id: string;
    is_required: boolean;
    site_locations: {
      id: string;
      name: string;
      lat: number | null;
      lng: number | null;
      radius_meters: number;
    } | null;
  } | null;
}

export async function getAttendanceEmployeeProfile(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("id, employee_id, full_name, status")
    .eq("id", userId)
    .maybeSingle();

  return (data as AttendanceEmployeeProfile | null) ?? null;
}

export function getAttendanceProfileMessage(profile: AttendanceEmployeeProfile | null) {
  if (!profile) {
    return "Your login is not linked to an employee profile in Employee Master.";
  }

  if (profile.status !== "active") {
    return `Your employee profile is ${profile.status ?? "inactive"}. Contact HR before using attendance.`;
  }

  return null;
}

export function parseQrPayload(raw: unknown) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as { token?: unknown };
    if (typeof parsed.token === "string") return parsed.token.trim();
  } catch {
    // Existing QR codes contain the raw token only.
  }

  return trimmed;
}

export async function validateQrSite(
  admin: SupabaseClient,
  rawToken: unknown,
  coords?: { lat?: unknown; lng?: unknown },
) {
  const token = parseQrPayload(rawToken);
  if (!token) return { error: "qr_token required for QR attendance" } as const;

  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Location is required for QR attendance" } as const;
  }

  const { data: site } = await admin
    .from("site_locations")
    .select("id, name, lat, lng, radius_meters")
    .eq("qr_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (!site) {
    return { error: "Invalid QR code" } as const;
  }

  if (site.lat == null || site.lng == null) {
    return { error: "QR site has no set location" } as const;
  }

  const distance = haversineDistance(lat, lng, Number(site.lat), Number(site.lng));
  if (distance > site.radius_meters) {
    return {
      error: `You are ${Math.round(distance)}m from ${site.name}. Must be within ${site.radius_meters}m`,
    } as const;
  }

  return { site, distance } as const;
}

export function isAssignedSite(
  assignment: Awaited<ReturnType<typeof getAttendanceSiteAssignment>>,
  siteId: string | null,
) {
  return !assignment?.is_required || assignment.site_id === siteId;
}

export type AttendanceMethod =
  | "web"
  | "biometric"
  | "rfid"
  | "gps"
  | "qr"
  | "mobile"
  | "manual"
  | "telegram";

export interface AttendanceActionResult {
  status: number;
  body: Record<string, unknown>;
}

export interface PerformAttendanceCheckInInput {
  employeeId: string;
  method: AttendanceMethod;
  lat?: number | string | null;
  lng?: number | string | null;
  gpsAccuracy?: number | string | null;
  siteId?: string | null;
  qrToken?: unknown;
  selfieBuffer?: Buffer | null;
  selfieContentType?: string;
}

export type PerformAttendanceCheckOutInput = PerformAttendanceCheckInInput;

export async function getTodayAttendanceLog(
  admin: SupabaseClient,
  employeeId: string,
  date: string,
  logType: "check_in" | "check_out",
) {
  const { data } = await admin
    .from("attendance_logs")
    .select("id, log_time")
    .eq("employee_id", employeeId)
    .eq("log_type", logType)
    .gte("log_time", `${date}T00:00:00+07:00`)
    .maybeSingle();

  return data as { id: string; log_time: string } | null;
}

function hasCoords(lat: PerformAttendanceCheckInInput["lat"], lng: PerformAttendanceCheckInInput["lng"]) {
  return lat != null && lat !== "" && lng != null && lng !== "";
}

export async function performAttendanceCheckIn(
  admin: SupabaseClient,
  input: PerformAttendanceCheckInInput,
): Promise<AttendanceActionResult> {
  const { employeeId, method, lat, lng, gpsAccuracy, siteId, qrToken, selfieBuffer, selfieContentType } = input;

  const today = getBusinessDate();
  const assignment = await getAttendanceSiteAssignment(admin, employeeId, today);

  if (assignment?.is_required && !qrToken) {
    return {
      status: 403,
      body: { error: `QR attendance is required for ${assignment.site_locations?.name ?? "your assigned site"}` },
    };
  }

  const existing = await getTodayAttendanceLog(admin, employeeId, today, "check_in");
  if (existing) {
    return { status: 409, body: { error: "Already checked in today" } };
  }

  if (method === "gps" && !hasCoords(lat, lng)) {
    return { status: 400, body: { error: "lat and lng required for GPS check-in" } };
  }

  let resolvedSiteId: string | null = siteId ?? null;

  if (qrToken) {
    const validation = await validateQrSite(admin, qrToken, { lat, lng });
    if ("error" in validation) {
      return { status: 403, body: { error: validation.error } };
    }
    resolvedSiteId = validation.site.id;

    if (!isAssignedSite(assignment, resolvedSiteId)) {
      return {
        status: 403,
        body: { error: `This QR is not for ${assignment?.site_locations?.name ?? "your assigned site"}` },
      };
    }
  } else if (hasCoords(lat, lng)) {
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
      return { status: 403, body: { error: "Location is outside any registered site geofence" } };
    }
    resolvedSiteId = withinSite.id;
  }

  let selfieUrl: string | null = null;
  if (selfieBuffer) {
    const path = `${employeeId}/${today}_${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("attendance-selfies")
      .upload(path, selfieBuffer, { contentType: selfieContentType ?? "image/jpeg", upsert: true });
    if (!uploadError) selfieUrl = path;
  }

  let attendanceType = method === "qr" ? "SITE_WORK" : "PRESENT";
  const { data: shiftRow } = await admin
    .from("employee_shift_assignments")
    .select("shift_id, work_shifts(shift_type, start_time, grace_minutes)")
    .eq("employee_id", employeeId)
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
    employee_id: employeeId,
    log_type: "check_in",
    method,
    latitude: lat ?? null,
    longitude: lng ?? null,
    gps_accuracy: gpsAccuracy ?? null,
    site_id: resolvedSiteId,
    selfie_url: selfieUrl,
    is_valid: true,
  });

  if (logError) return { status: 500, body: { error: logError.message } };

  const checkInTime = getBusinessTime();
  const { error: recordError } = await admin.from("attendance_records").upsert(
    {
      employee_id: employeeId,
      attendance_date: today,
      attendance_type: attendanceType,
      check_in_time: checkInTime,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,attendance_date" },
  );

  if (recordError) return { status: 500, body: { error: recordError.message } };

  return {
    status: 200,
    body: {
      success: true,
      attendance_type: attendanceType,
      check_in_time: checkInTime,
      selfie_stored: selfieUrl !== null,
    },
  };
}

function minutesFromTimeString(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export async function performAttendanceCheckOut(
  admin: SupabaseClient,
  input: PerformAttendanceCheckOutInput,
): Promise<AttendanceActionResult> {
  const { employeeId, method, lat, lng, gpsAccuracy, qrToken, selfieBuffer, selfieContentType } = input;

  const today = getBusinessDate();
  const assignment = await getAttendanceSiteAssignment(admin, employeeId, today);

  if (assignment?.is_required && !qrToken) {
    return {
      status: 403,
      body: { error: `QR checkout is required for ${assignment.site_locations?.name ?? "your assigned site"}` },
    };
  }

  const log = await getTodayAttendanceLog(admin, employeeId, today, "check_in");
  if (!log) {
    return { status: 400, body: { error: "No check-in found for today" } };
  }

  const existingOut = await getTodayAttendanceLog(admin, employeeId, today, "check_out");
  if (existingOut) {
    return { status: 409, body: { error: "Already checked out today" } };
  }

  let resolvedSiteId: string | null = null;
  if (qrToken) {
    const validation = await validateQrSite(admin, qrToken, { lat, lng });
    if ("error" in validation) {
      return { status: 403, body: { error: validation.error } };
    }
    resolvedSiteId = validation.site.id;

    if (!isAssignedSite(assignment, resolvedSiteId)) {
      return {
        status: 403,
        body: { error: `This QR is not for ${assignment?.site_locations?.name ?? "your assigned site"}` },
      };
    }
  }

  let selfieUrl: string | null = null;
  if (selfieBuffer) {
    const path = `${employeeId}/${today}_${Date.now()}.jpg`;
    const { error: uploadError } = await admin.storage
      .from("attendance-selfies")
      .upload(path, selfieBuffer, { contentType: selfieContentType ?? "image/jpeg", upsert: true });
    if (!uploadError) selfieUrl = path;
  }

  const checkOutTime = getBusinessTime();
  const { error: logError } = await admin.from("attendance_logs").insert({
    employee_id: employeeId,
    log_type: "check_out",
    method,
    latitude: lat ?? null,
    longitude: lng ?? null,
    gps_accuracy: gpsAccuracy ?? null,
    site_id: resolvedSiteId,
    selfie_url: selfieUrl,
    is_valid: true,
  });

  if (logError) return { status: 500, body: { error: logError.message } };

  const { data: record } = await admin
    .from("attendance_records")
    .select("check_in_time")
    .eq("employee_id", employeeId)
    .eq("attendance_date", today)
    .maybeSingle();

  let hoursWorked: number | null = null;
  if (record?.check_in_time) {
    const inMinutes = minutesFromTimeString(record.check_in_time);
    const outMinutes = minutesFromTimeString(checkOutTime);
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
    .eq("employee_id", employeeId)
    .eq("attendance_date", today);

  return { status: 200, body: { success: true, check_out_time: checkOutTime, hours_worked: hoursWorked } };
}
