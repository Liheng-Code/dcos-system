import { NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function POST() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("level")
    .eq("id", user.id)
    .single();

  const canProcess = profile?.level && [
    "HR_Manager", "HR_Admin", "Super_Admin", "Admin",
  ].includes(profile.level);

  if (!canProcess) {
    return NextResponse.json({ error: "Only HR admin can process notifications" }, { status: 403 });
  }

  // Fetch unsent notifications
  const { data: pending } = await supabase
    .from("overtime_notifications")
    .select("*")
    .is("sent_at", null)
    .order("queued_at", { ascending: true })
    .limit(50);

  if (!pending || pending.length === 0) {
    return NextResponse.json({ processed: 0, message: "No pending notifications" });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const notif of pending) {
    try {
      // In production, this would send an email/SMS/push notification
      // For now, we mark as sent with a simulated delivery
      await supabase
        .from("overtime_notifications")
        .update({
          sent_at: new Date().toISOString(),
          body: notif.body,
        })
        .eq("id", notif.id);

      processed++;
    } catch (e: any) {
      await supabase
        .from("overtime_notifications")
        .update({ error_message: e.message })
        .eq("id", notif.id);

      errors.push(e.message);
    }
  }

  return NextResponse.json({
    processed,
    total: pending.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export async function GET() {
  const supabase = createAdminClient();

  const [
    total,
    pending,
    sent,
  ] = await Promise.all([
    supabase.from("overtime_notifications").select("*", { count: "exact", head: true }),
    supabase.from("overtime_notifications").select("*", { count: "exact", head: true }).is("sent_at", null),
    supabase.from("overtime_notifications").select("*", { count: "exact", head: true }).not("sent_at", "is", null),
  ]);

  return NextResponse.json({
    total: total.count ?? 0,
    pending: pending.count ?? 0,
    sent: sent.count ?? 0,
  });
}
