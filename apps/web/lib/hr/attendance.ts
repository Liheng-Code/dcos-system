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
