import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/hr/telegram/bot";
import { sendEmail } from "@/lib/email/resend";

/**
 * Alert types Planning writes to task_alerts, on top of the Task module's own
 * vocabulary (task_assigned, task_submitted, ...). Kept here as the single
 * source of truth for callers; the DB-side CHECK constraint must allow the
 * same values (see supabase/migrations/…_schedule_alert_types_and_state.sql).
 */
export type ScheduleAlertType =
  | "schedule_critical_path_changed"
  | "schedule_overrun"
  | "schedule_float_consumed"
  | "progress_review_requested"
  | "progress_review_decided"
  | "programme_revision_submitted"
  | "programme_revision_decided"
  | "baseline_set"
  | "monthly_report_ready";

export interface DispatchScheduleAlertInput {
  projectId: string;
  /** Every recipient gets the same title/body; duplicates are ignored. */
  recipientIds: string[];
  alertType: ScheduleAlertType;
  title: string;
  body: string;
  /** Attach a single task when the alert concerns one (e.g. float consumed on activity X). Omit for project-level events. */
  taskId?: string | null;
  taskCode?: string | null;
  taskName?: string | null;
  metadata?: Record<string, unknown>;
  /** Dedupe key — a second dispatch with the same key is a silent no-op (task_alerts has a unique partial index on this). */
  sourceKey: string;
  /** Who triggered this, if any — never notified about their own action. */
  actorId?: string | null;
  actorName?: string | null;
}

interface RecipientPrefs {
  full_name: string | null;
  email: string;
  notification_preferences: {
    email?: boolean;
    telegram?: boolean;
    telegram_chat_id?: string | null;
    schedule_alerts_email?: boolean;
  } | null;
}

/**
 * Fans one schedule event out across every channel a recipient has opted
 * into: always in-app (task_alerts), Telegram when linked, email via Resend
 * when enabled. Must be called with a service-role client (server-only) since
 * it reads other users' profiles and holds the Resend API key. A failure in
 * one channel never blocks the others — this always runs after the schedule
 * write it describes has already succeeded.
 */
export async function dispatchScheduleAlert(
  adminClient: SupabaseClient,
  input: DispatchScheduleAlertInput,
): Promise<void> {
  const recipients = [...new Set(input.recipientIds)].filter((id) => id && id !== input.actorId);
  if (recipients.length === 0) return;

  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, full_name, email, notification_preferences")
    .in("id", recipients);

  if (profilesError) {
    console.error("dispatchScheduleAlert: failed to load recipient profiles:", profilesError.message);
    return;
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p as unknown as RecipientPrefs]));

  for (const recipientId of recipients) {
    const profile = byId.get(recipientId);

    // In-app — always attempted, one row per recipient, deduped on source_key.
    const { error: alertError } = await adminClient.from("task_alerts").insert({
      project_id: input.projectId,
      wbs_task_id: input.taskId ?? null,
      actor_id: input.actorId ?? null,
      actor_name: input.actorName ?? null,
      recipient_id: recipientId,
      source_key: `${input.sourceKey}:${recipientId}`,
      alert_type: input.alertType,
      title: input.title,
      body: input.body,
      task_code: input.taskCode ?? null,
      task_name: input.taskName ?? null,
      metadata: input.metadata ?? {},
    });
    if (alertError && alertError.code !== "23505") {
      console.error("dispatchScheduleAlert: task_alerts insert failed:", alertError.message);
    }

    const prefs = profile?.notification_preferences ?? null;

    if (prefs?.telegram && prefs.telegram_chat_id) {
      const chatId = Number(prefs.telegram_chat_id);
      if (Number.isFinite(chatId)) {
        try {
          await sendMessage(chatId, `*${input.title}*\n${input.body}`, { parseMode: "Markdown" });
        } catch (e) {
          console.error("dispatchScheduleAlert: Telegram send failed:", e instanceof Error ? e.message : e);
        }
      }
    }

    // schedule_alerts_email falls back to the general email toggle until the
    // preferences panel is updated to expose the dedicated key.
    const emailEnabled = prefs?.schedule_alerts_email ?? prefs?.email ?? false;
    if (emailEnabled && profile?.email) {
      try {
        await sendEmail({
          to: profile.email,
          subject: input.title,
          html: `<p>${input.body}</p>`,
        });
      } catch (e) {
        console.error("dispatchScheduleAlert: email send failed:", e instanceof Error ? e.message : e);
      }
    }
  }
}
