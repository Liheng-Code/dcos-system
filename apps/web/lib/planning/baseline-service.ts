import { createClient } from "@/lib/supabase/client";

export type BaselineType = "contract" | "revised" | "current";
/** Doc 35 R3: a baseline takes effect only once a second person approves it; approved ones never change. */
export type BaselineStatus = "pending" | "approved" | "rejected";

export interface BaselineRow {
  id: string;
  baseline_number: number;
  baseline_name: string;
  baseline_date: string;
  is_active: boolean;
  set_by: string | null;
  task_count: number;
  /** Completion Plan 1.3 — baseline governance. */
  baseline_type: BaselineType;
  reason: string | null;
  locked: boolean;
  client_accepted: boolean;
  client_accepted_at: string | null;
  status: BaselineStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_comment: string | null;
}

/** All numbered baselines for a project, ordered by number. */
export async function listBaselines(projectId: string): Promise<BaselineRow[]> {
  const { data, error } = await createClient()
    .from("wbs_baselines")
    .select(
      "id, baseline_number, baseline_name, baseline_date, is_active, set_by, snapshot_data, baseline_type, reason, locked, client_accepted, client_accepted_at, status, decided_by, decided_at, decision_comment",
    )
    .eq("project_id", projectId)
    .order("baseline_number");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const snap = r.snapshot_data as { tasks?: unknown[] } | null;
    return {
      id: r.id as string,
      baseline_number: r.baseline_number as number,
      baseline_name: r.baseline_name as string,
      baseline_date: r.baseline_date as string,
      is_active: r.is_active as boolean,
      set_by: (r.set_by as string | null) ?? null,
      task_count: Array.isArray(snap?.tasks) ? snap!.tasks!.length : 0,
      baseline_type: (r.baseline_type as BaselineType | null) ?? "current",
      reason: (r.reason as string | null) ?? null,
      locked: Boolean(r.locked),
      client_accepted: Boolean(r.client_accepted),
      client_accepted_at: (r.client_accepted_at as string | null) ?? null,
      status: ((r.status as BaselineStatus | null) ?? "approved"),
      decided_by: (r.decided_by as string | null) ?? null,
      decided_at: (r.decided_at as string | null) ?? null,
      decision_comment: (r.decision_comment as string | null) ?? null,
    };
  });
}

/**
 * Snapshot the schedule into baseline `number` (0 = "Baseline", 1–10) as a version waiting for
 * approval. An approved number is refused: approved baselines are never overwritten.
 */
export async function setBaseline(
  projectId: string,
  number: number,
  taskIds?: string[] | null,
  governance?: { name?: string | null; type?: BaselineType; reason?: string | null },
): Promise<void> {
  const { error } = await createClient().rpc("set_baseline", {
    p_project_id: projectId,
    p_number: number,
    p_task_ids: taskIds && taskIds.length ? taskIds : null,
    p_name: governance?.name ?? null,
    p_type: governance?.type ?? "current",
    p_reason: governance?.reason ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Approve a pending baseline: it becomes the active one. The approver must not be the person who set it. */
export async function approveBaseline(baselineId: string, comment?: string | null): Promise<void> {
  const { error } = await createClient().rpc("approve_baseline", { p_baseline_id: baselineId, p_comment: comment ?? null });
  if (error) throw new Error(error.message);
}

/** Reject a pending baseline with a reason; it never takes effect. */
export async function rejectBaseline(baselineId: string, comment: string): Promise<void> {
  const { error } = await createClient().rpc("reject_baseline", { p_baseline_id: baselineId, p_comment: comment });
  if (error) throw new Error(error.message);
}

/** Records that the client has accepted an approved baseline (needs Planning programme approve). */
export async function acceptBaselineByClient(baselineId: string): Promise<void> {
  const { error } = await createClient().rpc("accept_baseline_by_client", { p_baseline_id: baselineId });
  if (error) throw new Error(error.message);
}

export async function clearBaseline(
  projectId: string,
  number: number,
  taskIds?: string[] | null,
): Promise<void> {
  const { error } = await createClient().rpc("clear_baseline", {
    p_project_id: projectId,
    p_number: number,
    p_task_ids: taskIds && taskIds.length ? taskIds : null,
  });
  if (error) throw new Error(error.message);
}

/** Make baseline `number` the one drawn on the Gantt. */
export async function activateBaseline(projectId: string, number: number): Promise<void> {
  const { error } = await createClient().rpc("activate_baseline", {
    p_project_id: projectId,
    p_number: number,
  });
  if (error) throw new Error(error.message);
}

export interface BaselineTaskSnapshot {
  id: string;
  start_date: string | null;
  end_date: string | null;
  budget_cost: number | null;
}

/** The per-task dates/cost captured into baseline `number` — for multi-schedule comparison. */
export async function getBaselineSnapshot(
  projectId: string,
  number: number,
): Promise<BaselineTaskSnapshot[]> {
  const { data, error } = await createClient()
    .from("wbs_baselines")
    .select("snapshot_data")
    .eq("project_id", projectId)
    .eq("baseline_number", number)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const snap = (data?.snapshot_data as { tasks?: unknown[] } | null) ?? null;
  return (snap?.tasks ?? []) as BaselineTaskSnapshot[];
}
