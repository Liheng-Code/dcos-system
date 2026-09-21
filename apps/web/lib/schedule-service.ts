import { createClient } from "@/lib/supabase/client";

export interface ScheduleVarianceRow {
  task_id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  planned_start: string;
  planned_finish: string;
  baseline_start: string;
  baseline_finish: string;
  start_variance_days: number;
  finish_variance_days: number;
  is_delayed: boolean;
}

export interface CriticalPathRow {
  id: string;
  task_code: string;
  task_name: string;
  early_start: string;
  early_finish: string;
  late_start: string;
  late_finish: string;
  total_float_days: number;
  is_critical: boolean;
}

export interface LookaheadRow {
  task_id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  owner_name: string | null;
  start_date: string;
  end_date: string;
  progress: number;
  status: string;
  delay_status: string;
  priority: string;
}

export async function setProjectBaseline(projectId: string): Promise<void> {
  const supabase = createClient();
  // Numbered-baseline RPC (20260904000003); slot 0 = "Baseline", whole project.
  const { error } = await supabase.rpc("set_baseline", {
    p_project_id: projectId,
    p_number: 0,
    p_task_ids: null,
  });
  if (error) throw error;
}

export async function getScheduleVariance(projectId: string): Promise<ScheduleVarianceRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_schedule_variance", { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []) as ScheduleVarianceRow[];
}

export async function getCriticalPathTasks(projectId: string): Promise<CriticalPathRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_critical_path_tasks", { p_project_id: projectId });
  if (error) throw error;
  return (data ?? []) as CriticalPathRow[];
}

export interface ProgressSnapshotRow {
  id: string;
  project_id: string;
  snapshot_date: string;
  planned_progress: number | null;
  actual_progress: number | null;
  planned_cost: number | null;
  actual_cost: number | null;
}

export async function captureProgressSnapshot(projectId: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("capture_progress_snapshot", { p_project_id: projectId });
  if (error) throw error;
  return data as string;
}

export async function getProgressSnapshots(projectId: string): Promise<ProgressSnapshotRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("progress_snapshots")
    .select("id, project_id, snapshot_date, planned_progress, actual_progress, planned_cost, actual_cost")
    .eq("project_id", projectId)
    .order("snapshot_date");
  if (error) throw error;
  return (data ?? []) as ProgressSnapshotRow[];
}

export interface ScurvePoint {
  date: string;
  pct: number | null;
  value: number | null;
}

export interface ScurveActualPoint extends ScurvePoint {
  planned_pct: number | null;
}

export interface ScurveSeries {
  /** Dense analytic planned (BCWS) curve, project baseline start → finish. */
  planned: ScurvePoint[];
  /** Persisted progress_snapshots rows (project-level). */
  actual: ScurveActualPoint[];
  /** Earned value computed live from current task state, dated today. */
  live: ScurvePoint | null;
  meta: {
    baselined: number;
    total_tasks: number;
    weight_basis: "cost" | "duration" | "equal";
    has_cost: boolean;
    bac_cost: number | null;
    window_start: string | null;
    window_end: string | null;
  };
}

export async function getScurveSeries(projectId: string): Promise<ScurveSeries> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_scurve_series", { p_project_id: projectId });
  if (error) throw error;
  return data as ScurveSeries;
}

export async function getLookaheadTasks(projectId: string, weeks: number = 4): Promise<LookaheadRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_lookahead_tasks", {
    p_project_id: projectId,
    p_weeks: weeks,
  });
  if (error) throw error;
  return (data ?? []) as LookaheadRow[];
}
