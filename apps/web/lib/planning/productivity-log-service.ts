// Data access for site productivity logs and calibrated-norm proposals (Productivity plan, Phase 5, part A).
//
// Tables/RPCs (migrations 20260922000011/12): plan_productivity_logs, plan_propose_calibrated_norm().
// The derived columns (actual_hours, earned_hours, productivity_index, pi_status) are filled by a database
// trigger, same pattern as plan_task_work — this module only ever writes INPUTS and reads results back.

import { createClient } from "@/lib/supabase/client";
import type { PiStatus } from "./productivity-index";

export type LogSource = "site_diary" | "timesheet" | "manual";

export interface ProductivityLog {
  id: string;
  project_id: string;
  task_id: string | null;
  trade_code: string;
  log_date: string;
  headcount: number;
  hours_normal: number;
  hours_ot: number;
  quantity_done: number | null;
  unit: string | null;
  condition_note: string | null;
  source: LogSource;
  timesheet_entry_id: string | null;
  norm_id: string | null;
  actual_hours: number | null;
  earned_hours: number | null;
  productivity_index: number | null;
  pi_status: PiStatus;
  pi_message: string | null;
  created_at: string;
  // convenience joins for the UI, not stored on this table
  task_code?: string | null;
  task_name?: string | null;
}

export interface ProductivityLogInput {
  task_id: string | null;
  trade_code: string;
  log_date: string;
  headcount: number;
  hours_normal: number;
  hours_ot: number;
  quantity_done: number | null;
  unit: string | null;
  condition_note: string | null;
}

const PAGE = 1000;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toLog(row: Record<string, unknown>): ProductivityLog {
  const task = row.wbs_tasks as { task_code: string; task_name: string } | null;
  return {
    id: row.id as string,
    project_id: row.project_id as string,
    task_id: (row.task_id as string | null) ?? null,
    trade_code: row.trade_code as string,
    log_date: row.log_date as string,
    headcount: Number(row.headcount),
    hours_normal: Number(row.hours_normal),
    hours_ot: Number(row.hours_ot),
    quantity_done: num(row.quantity_done),
    unit: (row.unit as string | null) ?? null,
    condition_note: (row.condition_note as string | null) ?? null,
    source: row.source as LogSource,
    timesheet_entry_id: (row.timesheet_entry_id as string | null) ?? null,
    norm_id: (row.norm_id as string | null) ?? null,
    actual_hours: num(row.actual_hours),
    earned_hours: num(row.earned_hours),
    productivity_index: num(row.productivity_index),
    pi_status: row.pi_status as PiStatus,
    pi_message: (row.pi_message as string | null) ?? null,
    created_at: row.created_at as string,
    task_code: task?.task_code ?? null,
    task_name: task?.task_name ?? null,
  };
}

/** Most recent first, paged past PostgREST's 1000-row cap. */
export async function listProductivityLogs(projectId: string, limit = 500): Promise<ProductivityLog[]> {
  const supabase = createClient();
  const rows: ProductivityLog[] = [];
  for (let page = 0; rows.length < limit; page++) {
    const from = page * PAGE;
    const to = Math.min(from + PAGE, limit) - 1;
    const { data, error } = await supabase
      .from("plan_productivity_logs")
      .select("*, wbs_tasks(task_code, task_name)")
      .eq("project_id", projectId)
      .order("log_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []).map((r) => toLog(r as Record<string, unknown>)));
    if ((data ?? []).length < to - from + 1) break;
  }
  return rows;
}

export async function createProductivityLog(projectId: string, input: ProductivityLogInput): Promise<void> {
  const { error } = await createClient()
    .from("plan_productivity_logs")
    .insert({ ...input, project_id: projectId, source: "manual" });
  if (error) throw new Error(friendly(error.message));
}

export async function deleteProductivityLog(id: string): Promise<void> {
  const { error } = await createClient().from("plan_productivity_logs").delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

export interface TaskWorkContext {
  /** The task's own recorded quantity unit (plan_task_work.quantity_unit), for pre-filling the log's unit. */
  quantityUnit: string | null;
  norm: { id: string; unit: string; labourConstantHrPerUnit: number } | null;
  /** plan_norm_trade() for the task's norm, for pre-filling the log's trade. */
  suggestedTrade: string | null;
}

/** Everything the entry form needs about a task in one round trip (plus one for the trade RPC when it has a norm). */
export async function getTaskWorkContext(taskId: string): Promise<TaskWorkContext> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plan_task_work")
    .select("quantity_unit, norm_id, plan_productivity_norms(unit, labour_constant_hr_per_unit)")
    .eq("task_id", taskId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { quantityUnit: null, norm: null, suggestedTrade: null };

  type NormEmbed = { unit: string; labour_constant_hr_per_unit: number };
  const normField = data.plan_productivity_norms as unknown as NormEmbed | NormEmbed[] | null;
  const normRow = Array.isArray(normField) ? (normField[0] ?? null) : normField;
  const normId = data.norm_id as string | null;
  const norm = normRow && normId ? { id: normId, unit: normRow.unit, labourConstantHrPerUnit: Number(normRow.labour_constant_hr_per_unit) } : null;

  let suggestedTrade: string | null = null;
  if (normId) {
    const { data: trade, error: tradeError } = await supabase.rpc("plan_norm_trade", { p_norm_id: normId });
    if (tradeError) throw new Error(tradeError.message);
    suggestedTrade = (trade as string | null) ?? null;
  }
  return { quantityUnit: (data.quantity_unit as string | null) ?? null, norm, suggestedTrade };
}

export interface CalibratedNormPreview {
  normId: string;
  code: string;
  name: string;
  unit: string;
  currentLc: number;
  sampleCount: number;
  observedLc: number | null;
}

/** How many usable (pi_status = ok) logs exist for this norm on this project, and what LC they'd produce — read-only, no write. */
export async function previewCalibratedNorm(normId: string, projectId: string): Promise<{ sampleCount: number; observedLc: number | null; fromDate: string | null; toDate: string | null }> {
  const supabase = createClient();
  // Two steps rather than a double-embedded PostgREST filter (wbs_tasks -> plan_task_work), which is fragile
  // to express reliably through supabase-js: first the tasks this norm is actually assigned to on this
  // project, then the ok-status logs against those tasks.
  const taskRes = await supabase.from("plan_task_work").select("task_id").eq("project_id", projectId).eq("norm_id", normId);
  if (taskRes.error) throw new Error(taskRes.error.message);
  const taskIds = (taskRes.data ?? []).map((r) => r.task_id as string);
  if (taskIds.length === 0) return { sampleCount: 0, observedLc: null, fromDate: null, toDate: null };

  const { data, error } = await supabase
    .from("plan_productivity_logs")
    .select("actual_hours, quantity_done, log_date")
    .eq("project_id", projectId)
    .eq("pi_status", "ok")
    .in("task_id", taskIds)
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { actual_hours: number; quantity_done: number; log_date: string }[];
  const sampleCount = rows.length;
  const actualSum = rows.reduce((s, r) => s + Number(r.actual_hours), 0);
  const qtySum = rows.reduce((s, r) => s + Number(r.quantity_done), 0);
  const dates = rows.map((r) => r.log_date).sort();
  return {
    sampleCount,
    observedLc: sampleCount > 0 && qtySum > 0 ? actualSum / qtySum : null,
    fromDate: dates[0] ?? null,
    toDate: dates[dates.length - 1] ?? null,
  };
}

/** Writes the new draft calibrated norm. Throws with the database's own "not enough logs" message if under the minimum. */
export async function proposeCalibratedNorm(normId: string, projectId: string, minLogs = 3): Promise<string> {
  const { data, error } = await createClient().rpc("plan_propose_calibrated_norm", {
    p_norm_id: normId,
    p_project_id: projectId,
    p_min_logs: minLogs,
  });
  if (error) throw new Error(friendly(error.message));
  return data as string;
}

function friendly(message: string): string {
  if (/row-level security/i.test(message)) return "You do not have permission to do that.";
  return message;
}
