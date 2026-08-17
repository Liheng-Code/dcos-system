"use server";
import { NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

const CODE_TTL_MS = 10 * 60 * 1000;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();

  // Invalidate any previously-issued unused codes for this employee so only
  // the freshest code is redeemable.
  await admin
    .from("telegram_link_codes")
    .update({ expires_at: now.toISOString() })
    .eq("employee_id", user.id)
    .is("used_at", null);

  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();

  let code = generateCode();
  let { error: insertError } = await admin
    .from("telegram_link_codes")
    .insert({ employee_id: user.id, code, expires_at: expiresAt });

  if (insertError) {
    // Astronomically unlikely collision on the unique-partial-index over
    // currently-unused codes — regenerate once and retry.
    code = generateCode();
    ({ error: insertError } = await admin
      .from("telegram_link_codes")
      .insert({ employee_id: user.id, code, expires_at: expiresAt }));
  }

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ code, expires_at: expiresAt, bot_username: "dcos_Attendance_bot" });
}
