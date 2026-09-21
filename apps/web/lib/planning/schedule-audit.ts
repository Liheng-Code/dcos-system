import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Action vocabulary written to wbs_audit_log by Planning. Extends (never
 * renames) the vocabulary the Task module already writes and the
 * create_task_alert_from_audit() trigger already matches on — see
 * supabase/migrations/20260527000024_create_task_alerts.sql and
 * 20260608000003_update_alert_trigger.sql. Adding a new value here has no
 * effect on alerts until a matching branch exists in that trigger function.
 */
export type ScheduleAuditAction =
  | "Plan Start Changed"
  | "Plan Finish Changed"
  | "Duration Changed"
  | "Dependency Changed"
  | "Constraint Changed"
  | "Task Created"
  | "Task Deleted"
  | "Task Moved"
  /** A downstream ripple from the CPM engine after another edit — not a direct user action on this task. */
  | "Task Rescheduled"
  | "Baseline Set"
  | "Data Date Advanced"
  /** Direct progress edit (grid cell / wheel) — distinct from the Phase 2 review flow's Submitted/Confirmed/Rejected. */
  | "Progress Updated"
  | "Progress Submitted"
  | "Progress Confirmed"
  | "Progress Rejected"
  | "Revision Submitted"
  | "Revision Approved"
  | "Revision Rejected";

export interface ScheduleAuditEntry {
  projectId: string;
  /** Null for project-level events (data date, baseline, revision) that aren't tied to one task. */
  taskId?: string | null;
  nodeId?: string | null;
  userId: string | null;
  action: ScheduleAuditAction;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

/**
 * Writes one wbs_audit_log row for a Planning edit — same insert shape as
 * lib/tasks/assign-task.ts, kept in its own helper so every Planning write
 * path (Gantt, Sheet, baselines, data date) logs consistently instead of
 * inlining the insert at each call site.
 */
export async function logScheduleAudit(
  supabase: SupabaseClient,
  entry: ScheduleAuditEntry,
): Promise<void> {
  const { error } = await supabase.from("wbs_audit_log").insert({
    project_id: entry.projectId,
    wbs_task_id: entry.taskId ?? null,
    wbs_node_id: entry.nodeId ?? null,
    user_id: entry.userId,
    action: entry.action,
    field_name: entry.fieldName ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });

  if (error) {
    // Audit logging must never break the underlying schedule edit — the write
    // it describes has already succeeded by the time this is called.
    console.error("Schedule audit log insert failed:", error.message);
  }
}

/** Writes one audit row per changed field, skipping fields that didn't change. Returns the number of rows written. */
export async function logScheduleFieldChanges(
  supabase: SupabaseClient,
  base: Pick<ScheduleAuditEntry, "projectId" | "taskId" | "nodeId" | "userId">,
  changes: { action: ScheduleAuditAction; fieldName: string; oldValue: string | null; newValue: string | null }[],
): Promise<number> {
  const toWrite = changes.filter((c) => (c.oldValue ?? "") !== (c.newValue ?? ""));
  for (const c of toWrite) {
    await logScheduleAudit(supabase, {
      ...base,
      action: c.action,
      fieldName: c.fieldName,
      oldValue: c.oldValue,
      newValue: c.newValue,
    });
  }
  return toWrite.length;
}
