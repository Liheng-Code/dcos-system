// I/O for cost loading and the manpower histogram (doc 24 phase 3). Both are read-only SQL RPCs (migration
// 20261027081636_boq_programme_phase3.sql) that spread wbs_tasks.budget_cost / plan_task_resource_hours evenly over
// each task's working days on the project calendar. Chart shaping is pure: loading-view.ts.

import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

export type LoadingPeriod = "day" | "week" | "month";
export type LoadingBasis = "current" | "baseline";
export type HistogramGroup = "resource" | "trade" | "division";
export type ResourceKind = "labor" | "equipment";

export interface CostLoading {
  meta: {
    period: LoadingPeriod;
    basis: LoadingBasis;
    hours_per_day: number;
    start: string | null;
    finish: string | null;
    task_count: number;
    total_budget: number;
    scheduled_budget: number;
    unscheduled_budget: number;
    unscheduled_tasks: number;
  };
  periods: { period: string; value: number; cumulative: number }[];
  divisions: { code: string; name: string; total: number }[];
  cells: { period: string; division: string; value: number }[];
  margin: { labour_hours: number; priced_hours: number; labour_cost: number; currency: string | null };
}

export interface ManpowerHistogram {
  meta: {
    period: LoadingPeriod;
    group: HistogramGroup;
    basis: LoadingBasis;
    hours_per_day: number;
    start: string | null;
    finish: string | null;
    labour_hours: number;
    equipment_hours: number;
    unscheduled_hours: number;
    task_count: number;
  };
  periods: {
    period: string;
    working_days: number;
    labor_hours: number;
    equipment_hours: number;
    labor_headcount: number;
    equipment_headcount: number;
    labor_peak: number;
    equipment_peak: number;
  }[];
  series: { key: string; label: string; kind: ResourceKind; total_hours: number }[];
  cells: { period: string; key: string; kind: ResourceKind; hours: number; headcount: number }[];
}

export async function getCostLoading(db: Db, projectId: string, period: LoadingPeriod = "month", basis: LoadingBasis = "current"): Promise<CostLoading> {
  const { data, error } = await db.rpc("plan_cost_loading", { p_project_id: projectId, p_period: period, p_basis: basis });
  if (error) throw new Error(error.message);
  return data as CostLoading;
}

export async function getManpowerHistogram(
  db: Db, projectId: string, period: LoadingPeriod = "week", group: HistogramGroup = "trade", basis: LoadingBasis = "current",
): Promise<ManpowerHistogram> {
  const { data, error } = await db.rpc("plan_manpower_histogram", { p_project_id: projectId, p_period: period, p_group: group, p_basis: basis });
  if (error) throw new Error(error.message);
  return data as ManpowerHistogram;
}
