// Data access for Phase 4: labour rate / OT lookups, the WBS cost rollup RPC, and reading plan_task_cost_lines.

import { createClient } from "@/lib/supabase/client";

export interface LaborRate {
  dailyRate: number;
  currency: string;
}

/** dwl_resource_id -> its resolved daily rate, mirroring plan_resolve_labor_rate()'s "latest valid_from" pick. */
export async function listLaborRates(): Promise<Map<string, LaborRate>> {
  const { data, error } = await createClient()
    .from("dwl_v_labor_rates")
    .select("resource_id, daily_basic_rate, currency, valid_from")
    .not("daily_basic_rate", "is", null)
    .order("valid_from", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  const map = new Map<string, LaborRate>();
  for (const r of data ?? []) {
    const id = r.resource_id as string;
    if (!map.has(id)) map.set(id, { dailyRate: Number(r.daily_basic_rate), currency: (r.currency as string) ?? "USD" });
  }
  return map;
}

/** ot_type -> multiplier, mirroring plan_resolve_ot_multiplier() (latest effective_date <= today, active only). */
export async function listOvertimeMultipliers(): Promise<Map<string, number>> {
  const { data, error } = await createClient()
    .from("overtime_rates")
    .select("ot_type, multiplier, effective_date")
    .eq("is_active", true)
    .lte("effective_date", new Date().toISOString().slice(0, 10))
    .order("effective_date", { ascending: false });
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const t = r.ot_type as string;
    if (!map.has(t)) map.set(t, Number(r.multiplier));
  }
  return map;
}

export interface WbsCostRollupRow {
  wbsNodeId: string;
  plannedCost: number;
  pricedTasks: number;
  totalTasks: number;
  boqValue: number;
  mappedTasks: number;
  variance: number;
}

export async function getWbsCostRollup(projectId: string): Promise<WbsCostRollupRow[]> {
  const { data, error } = await createClient().rpc("plan_wbs_cost_rollup", { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    wbsNodeId: r.wbs_node_id as string,
    plannedCost: Number(r.planned_cost),
    pricedTasks: Number(r.priced_tasks),
    totalTasks: Number(r.total_tasks),
    boqValue: Number(r.boq_value),
    mappedTasks: Number(r.mapped_tasks),
    variance: Number(r.variance),
  }));
}

export interface CostLine {
  taskId: string;
  roleLabel: string;
  rateSource: "dwl" | "none";
  dailyRate: number | null;
  normalHours: number;
  otHours: number;
  normalCost: number | null;
  otCost: number | null;
  lineCost: number | null;
  currency: string | null;
}

const PAGE = 1000;

/** task_id -> planned_cost (null when the task has no resolvable cost), for the whole project — paged past
 *  PostgREST's 1000-row cap. Used by the cost-levelling before/after diagram (Phase 5 part B). */
export async function listPlannedCosts(projectId: string): Promise<Map<string, number | null>> {
  const supabase = createClient();
  const map = new Map<string, number | null>();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("plan_task_work")
      .select("task_id, planned_cost")
      .eq("project_id", projectId)
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) map.set(r.task_id as string, r.planned_cost == null ? null : Number(r.planned_cost));
    if ((data ?? []).length < PAGE) break;
  }
  return map;
}

export async function listCostLines(taskId: string): Promise<CostLine[]> {
  const { data, error } = await createClient()
    .from("plan_task_cost_lines")
    .select("task_id, role_label, rate_source, daily_rate, normal_hours, ot_hours, normal_cost, ot_cost, line_cost, currency")
    .eq("task_id", taskId)
    .order("role_label");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    taskId: r.task_id as string,
    roleLabel: r.role_label as string,
    rateSource: r.rate_source as "dwl" | "none",
    dailyRate: r.daily_rate == null ? null : Number(r.daily_rate),
    normalHours: Number(r.normal_hours),
    otHours: Number(r.ot_hours),
    normalCost: r.normal_cost == null ? null : Number(r.normal_cost),
    otCost: r.ot_cost == null ? null : Number(r.ot_cost),
    lineCost: r.line_cost == null ? null : Number(r.line_cost),
    currency: (r.currency as string | null) ?? null,
  }));
}
