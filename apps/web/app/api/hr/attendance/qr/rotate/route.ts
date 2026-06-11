"use server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only HR_Manager/admin can generate or replace a site's fixed QR.
  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "HR_Manager", "hr_manager"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { site_id } = await request.json();
  if (!site_id) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: site } = await admin
    .from("site_locations")
    .select("id")
    .eq("id", site_id)
    .single();

  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const newToken = crypto.randomUUID();

  const { error } = await admin
    .from("site_locations")
    .update({ qr_token: newToken, qr_expires_at: null })
    .eq("id", site_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ qr_token: newToken, expires_at: null });
}
