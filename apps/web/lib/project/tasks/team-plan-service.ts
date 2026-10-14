import type { SupabaseClient } from "@supabase/supabase-js";

export interface CapacityOverrideInput {
  profile_id: string;
  period_start: string;
  period_end: string;
  planned_hours?: number | null;
  available_hours?: number | null;
  utilization_pct?: number | null;
  /** Required, at least 5 characters. */
  reason: string;
}

export interface PublishResult {
  revision_no: number;
  tasks_assigned: number;
  notifications: number;
}

/**
 * Publishes a team plan in one database transaction (assignments, audit, notifications, revision record).
 * Throws the database's message when permissions, plan state or data checks fail.
 */
export async function publishTeamPlan(
  supabase: SupabaseClient,
  planId: string,
  options: { reason?: string; overrides?: CapacityOverrideInput[] } = {},
): Promise<PublishResult> {
  for (const o of options.overrides ?? []) {
    if (o.reason.trim().length < 5) throw new Error("Every capacity override needs a reason (at least 5 characters).");
  }
  const { data, error } = await supabase.rpc("publish_team_plan", {
    p_plan_id: planId,
    p_reason: options.reason ?? null,
    p_overrides: options.overrides ?? [],
  });
  if (error) throw new Error(error.message);
  return data as PublishResult;
}

/** Reopens a published plan for revision. The reason is recorded in the plan history. */
export async function reopenTeamPlan(supabase: SupabaseClient, planId: string, reason: string): Promise<void> {
  if (reason.trim().length < 5) throw new Error("A reason (at least 5 characters) is required.");
  const { error } = await supabase.rpc("reopen_team_plan", { p_plan_id: planId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export interface PlanningChanges {
  owner_id?: string | null;
  reviewer_id?: string | null;
  approver_id?: string | null;
  estimated_hours?: number | null;
  start_date?: string | null;
  end_date?: string | null;
}

/** Sets owner, reviewer, approver, estimate and dates in one checked, audited step. */
export async function setTaskPlanning(supabase: SupabaseClient, taskId: string, changes: PlanningChanges): Promise<void> {
  const { error } = await supabase.rpc("set_task_planning", { p_task: taskId, p_changes: changes });
  if (error) throw new Error(error.message);
}

export interface PlanHistory {
  revisions: { id: string; revision_no: number; action: string; reason: string | null; created_at: string; changed_by: string | null }[];
  overrides: { id: string; profile_id: string; utilization_pct: number | null; reason: string; created_at: string }[];
}

export async function loadPlanHistory(supabase: SupabaseClient, planId: string): Promise<PlanHistory> {
  const [r, o] = await Promise.all([
    supabase.from("team_plan_revisions").select("id, revision_no, action, reason, created_at, changed_by").eq("weekly_plan_id", planId).order("created_at", { ascending: false }),
    supabase.from("capacity_overrides").select("id, profile_id, utilization_pct, reason, created_at").eq("weekly_plan_id", planId).order("created_at", { ascending: false }),
  ]);
  if (r.error) throw new Error(r.error.message);
  if (o.error) throw new Error(o.error.message);
  return { revisions: (r.data ?? []) as PlanHistory["revisions"], overrides: (o.data ?? []) as PlanHistory["overrides"] };
}
