"use server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import {
  getAttendanceEmployeeProfile,
  getAttendanceProfileMessage,
  performAttendanceCheckOut,
} from "@/lib/hr/attendance";

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

  const result = await performAttendanceCheckOut(admin, {
    employeeId: user.id,
    method,
    lat,
    lng,
    gpsAccuracy: gps_accuracy,
    qrToken: qr_token,
  });

  return NextResponse.json(result.body, { status: result.status });
}
