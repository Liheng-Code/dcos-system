"use server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import {
  getAttendanceEmployeeProfile,
  getAttendanceProfileMessage,
  performAttendanceCheckIn,
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

  let selfieBuffer: Buffer | null = null;
  if (selfie_base64) {
    const base64Data = selfie_base64.replace(/^data:image\/\w+;base64,/, "");
    selfieBuffer = Buffer.from(base64Data, "base64");
  }

  const result = await performAttendanceCheckIn(admin, {
    employeeId: user.id,
    method,
    lat,
    lng,
    gpsAccuracy: gps_accuracy,
    siteId: site_id,
    qrToken: qr_token,
    selfieBuffer,
  });

  return NextResponse.json(result.body, { status: result.status });
}
