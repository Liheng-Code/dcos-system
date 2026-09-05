import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Canonical `user_audit_logs.event_type` vocabulary for this module.
 * Reproduced verbatim from `docs/04-Business-Modules/02-USR-User-Management/04-Database-Schema.md`
 * §9. No ad-hoc event-type strings are introduced outside this list (BR10.01).
 */
export const USR_EVENT_TYPES = {
  ACCOUNT_INVITED: "account_invited",
  ACCOUNT_ACTIVATED: "account_activated",
  PASSWORD_CHANGED: "password_changed",
  PASSWORD_RESET_REQUESTED: "password_reset_requested",
  PASSWORD_RESET_COMPLETED: "password_reset_completed",
  FORCE_RESET_TRIGGERED: "force_reset_triggered",
  ACCOUNT_LOCKED: "account_locked",
  ACCOUNT_UNLOCKED: "account_unlocked",
  ACCOUNT_SUSPENDED: "account_suspended",
  ACCOUNT_DISABLED: "account_disabled",
  ACCOUNT_AUTO_DISABLED_INACTIVITY: "account_auto_disabled_inactivity",
  SESSION_REVOKED: "session_revoked",
  EMPLOYMENT_STATUS_CHANGED: "employment_status_changed",
} as const;

export type UsrEventType = (typeof USR_EVENT_TYPES)[keyof typeof USR_EVENT_TYPES];

/** Event types surfaced on the admin Security/Dashboard "recent activity" feed (F11, BR11.01). */
export const ACCOUNT_LIFECYCLE_FEED_EVENT_TYPES: string[] = [
  USR_EVENT_TYPES.ACCOUNT_INVITED,
  USR_EVENT_TYPES.ACCOUNT_ACTIVATED,
  USR_EVENT_TYPES.PASSWORD_CHANGED,
  USR_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
  USR_EVENT_TYPES.PASSWORD_RESET_COMPLETED,
  USR_EVENT_TYPES.FORCE_RESET_TRIGGERED,
  USR_EVENT_TYPES.ACCOUNT_LOCKED,
  USR_EVENT_TYPES.ACCOUNT_UNLOCKED,
  USR_EVENT_TYPES.ACCOUNT_SUSPENDED,
  USR_EVENT_TYPES.ACCOUNT_DISABLED,
  USR_EVENT_TYPES.ACCOUNT_AUTO_DISABLED_INACTIVITY,
  USR_EVENT_TYPES.SESSION_REVOKED,
];

export interface AuditLogEntry {
  user_id: string;
  /** null only for system-initiated events (BR10.03) — e.g. the 90-day auto-disable job. */
  actor_id: string | null;
  event_type: UsrEventType | string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  note?: string | null;
}

/**
 * Appends one row to `public.user_audit_logs`. Append-only by design (BR10.02) — never
 * updated or deleted after insert, matching the table's RLS (no UPDATE/DELETE policy).
 */
export async function writeAuditLog(supabase: SupabaseClient, entry: AuditLogEntry) {
  const { error } = await supabase.from("user_audit_logs").insert({
    user_id: entry.user_id,
    actor_id: entry.actor_id,
    event_type: entry.event_type,
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    note: entry.note ?? null,
  });
  // Audit logging failures must not silently corrupt the primary action's success response,
  // but they also must not be swallowed invisibly — surface to server logs.
  if (error) {
    console.error(`[user_audit_logs] failed to write event "${entry.event_type}" for user ${entry.user_id}:`, error.message);
  }
}
