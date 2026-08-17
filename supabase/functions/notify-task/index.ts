import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Triggered by Supabase Database Webhook on task_alerts INSERT.
// Payload: { type: "INSERT", table: "task_alerts", record: { ... }, schema: "public" }

interface TaskAlertRecord {
  id: string;
  project_id: string | null;
  wbs_task_id: string | null;
  recipient_id: string | null;
  alert_type: string;
  title: string;
  body: string | null;
  task_code: string | null;
  task_name: string | null;
}

interface NotificationPreferences {
  email: boolean;
  telegram: boolean;
  telegram_chat_id: string | null;
}

interface WebhookPayload {
  type: "INSERT";
  table: string;
  record: TaskAlertRecord;
  schema: string;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload: WebhookPayload = await req.json();
  const alert = payload.record;

  if (!alert.recipient_id) {
    return new Response(JSON.stringify({ skipped: "no recipient" }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Fetch recipient profile + notification preferences
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email:id, notification_preferences")
    .eq("id", alert.recipient_id)
    .single();

  if (!profile) {
    return new Response(JSON.stringify({ skipped: "profile not found" }), { status: 200 });
  }

  const prefs: NotificationPreferences = (profile.notification_preferences as NotificationPreferences) ?? {
    email: true,
    telegram: false,
    telegram_chat_id: null,
  };

  // Fetch the actual email from auth.users via service role
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const authUser = users.find((u) => u.id === alert.recipient_id);
  const recipientEmail = authUser?.email;

  const taskLine = alert.task_code || alert.task_name
    ? `\nTask: ${alert.task_code ?? ""} · ${alert.task_name ?? ""}`
    : "";
  const messageText = `[DCOS] ${alert.title}\n${alert.body ?? ""}${taskLine}`;

  const results: Record<string, unknown> = {};

  // ── Email via Resend ───────────────────────────────────────────────────────
  if (prefs.email && recipientEmail) {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey) {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: "DCOS Notifications <notifications@dcos.app>",
          to: recipientEmail,
          subject: alert.title,
          text: messageText,
        }),
      });
      results.email = emailRes.ok ? "sent" : `failed (${emailRes.status})`;
    } else {
      results.email = "skipped (no RESEND_API_KEY)";
    }
  }

  // ── Telegram via Bot API ───────────────────────────────────────────────────
  if (prefs.telegram && prefs.telegram_chat_id) {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (botToken) {
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: prefs.telegram_chat_id, text: messageText }),
      });
      results.telegram = tgRes.ok ? "sent" : `failed (${tgRes.status})`;
    } else {
      results.telegram = "skipped (no TELEGRAM_BOT_TOKEN)";
    }
  }

  return new Response(JSON.stringify({ alert_id: alert.id, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
