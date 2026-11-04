// Progress integrity (doc 35 Phase P): installed quantity per activity, the progress method and the
// approved progress history. Writes go through RPCs that enforce the scope cap and progress approval.

import { createClient } from "@/lib/supabase/client";

const db = () => createClient();

/** percentage = typed %, deliverable = weighted steps, quantity = installed / scope, milestone = weighted milestones. */
export type ProgressMethod = "percentage" | "deliverable" | "quantity" | "milestone";

export const PROGRESS_METHOD_LABEL: Record<ProgressMethod, string> = {
  percentage: "Percent complete (typed)",
  deliverable: "Steps (weighted)",
  quantity: "Installed quantity",
  milestone: "Weighted milestones (steps done / not done)",
};

export interface TaskQuantityStatus {
  method: ProgressMethod;
  scope: number | null;
  unit: string | null;
  installed: number;
  pending: number;
  remaining: number | null;
  percent: number | null;
}

export interface QuantityEntry {
  id: string;
  quantity: number;
  unit: string | null;
  as_of: string;
  note: string | null;
  source: "manual" | "daily_report";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
}

export interface ProgressHistoryRow {
  as_of: string;
  kind: "progress" | "quantity";
  value: number;
  previous_value: number | null;
  source: string;
  approved_at: string | null;
  note: string | null;
}

export async function getTaskQuantityStatus(taskId: string): Promise<TaskQuantityStatus | null> {
  const { data, error } = await db().rpc("task_quantity_status", { p_task_id: taskId });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    method: d.method as ProgressMethod,
    scope: num(d.scope),
    unit: (d.unit as string | null) ?? null,
    installed: Number(d.installed ?? 0),
    pending: Number(d.pending ?? 0),
    remaining: num(d.remaining),
    percent: num(d.percent),
  };
}

export async function listQuantityEntries(taskId: string): Promise<QuantityEntry[]> {
  const { data, error } = await db()
    .from("plan_task_quantity_progress")
    .select("id, quantity, unit, as_of, note, source, status, created_at, decided_at")
    .eq("task_id", taskId)
    .order("as_of", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as QuantityEntry[];
}

/** Record installed quantity (negative = correction). Returns "pending" when a planner must approve it. */
export async function recordTaskQuantity(taskId: string, quantity: number, asOf: string, note?: string): Promise<"direct" | "pending"> {
  const { data, error } = await db().rpc("record_task_quantity", {
    p_task_id: taskId, p_quantity: quantity, p_as_of: asOf, p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data as { mode?: string } | null)?.mode === "pending" ? "pending" : "direct");
}

/** The activity's own method; null = the project default (or steps / percent automatically). */
export async function setTaskProgressMethod(taskId: string, method: ProgressMethod | null): Promise<void> {
  const { error } = await db().from("wbs_tasks").update({ progress_method: method }).eq("id", taskId);
  if (error) throw new Error(error.message);
}

export async function getTaskStoredProgressMethod(taskId: string): Promise<ProgressMethod | null> {
  const { data } = await db().from("wbs_tasks").select("progress_method").eq("id", taskId).maybeSingle();
  return ((data?.progress_method as ProgressMethod | null) ?? null);
}

export async function listProgressHistory(taskId: string): Promise<ProgressHistoryRow[]> {
  const { data, error } = await db()
    .from("v_plan_progress_history")
    .select("as_of, kind, value, previous_value, source, approved_at, note")
    .eq("task_id", taskId)
    .order("as_of", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as ProgressHistoryRow[];
}

export async function getProjectDefaultProgressMethod(projectId: string): Promise<ProgressMethod | null> {
  const { data } = await db().from("plan_schedule_settings").select("progress_method_default").eq("project_id", projectId).maybeSingle();
  return ((data?.progress_method_default as ProgressMethod | null) ?? null);
}

export async function setProjectDefaultProgressMethod(projectId: string, method: ProgressMethod | null): Promise<void> {
  const { error } = await db()
    .from("plan_schedule_settings")
    .upsert({ project_id: projectId, progress_method_default: method, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}
