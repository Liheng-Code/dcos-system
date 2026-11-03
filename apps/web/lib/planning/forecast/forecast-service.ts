// Forecast snapshots (doc 35 F5): record the live forecast with its assumptions (plan_capture_forecast) and read the
// records back. A record is never changed; the trend and comparisons are pure: forecast-trend.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ForecastSnapshot, SnapshotTask } from "./forecast-trend";

type Db = SupabaseClient;

const LIST_COLS =
  "id, period, label, data_date, forecast_finish, baseline_finish, contract_finish, variance_wd, progress_pct, planned_pct, critical_count, task_count, open_delays, open_delay_days, assumptions, basis, milestones, captured_by, captured_at";

/** Every record of the project, newest first, without the per-activity dates (see getSnapshotTasks). */
export async function listForecastSnapshots(db: Db, projectId: string): Promise<ForecastSnapshot[]> {
  const { data, error } = await db.from("plan_forecast_snapshots").select(LIST_COLS).eq("project_id", projectId).order("captured_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ForecastSnapshot[];
}

export async function getSnapshotTasks(db: Db, id: string): Promise<SnapshotTask[]> {
  const { data, error } = await db.from("plan_forecast_snapshots").select("tasks").eq("id", id).single();
  if (error) throw new Error(error.message);
  return ((data as { tasks: SnapshotTask[] }).tasks ?? []) as SnapshotTask[];
}

export async function captureForecast(db: Db, projectId: string, assumptions: string, label?: string): Promise<string> {
  const { data, error } = await db.rpc("plan_capture_forecast", { p_project_id: projectId, p_assumptions: assumptions, p_label: label?.trim() || null });
  if (error) throw new Error(error.message);
  return data as string;
}

export interface LiveForecast {
  forecast: string | null;
  baseline: string | null;
  contract: string | null;
  dataDate: string | null;
}

/** The forecast as the programme stands now (latest finish), against the baseline and contract completion. */
export async function getLiveForecast(db: Db, projectId: string): Promise<LiveForecast> {
  const [f, b, p] = await Promise.all([
    db.from("wbs_tasks").select("end_date").eq("project_id", projectId).not("end_date", "is", null).order("end_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("wbs_tasks").select("baseline_finish_date").eq("project_id", projectId).not("baseline_finish_date", "is", null).order("baseline_finish_date", { ascending: false }).limit(1).maybeSingle(),
    db.from("projects").select("end_date, data_date").eq("id", projectId).maybeSingle(),
  ]);
  return {
    forecast: (f.data as { end_date: string } | null)?.end_date ?? null,
    baseline: (b.data as { baseline_finish_date: string } | null)?.baseline_finish_date ?? null,
    contract: (p.data as { end_date: string | null } | null)?.end_date ?? null,
    dataDate: (p.data as { data_date: string | null } | null)?.data_date ?? null,
  };
}

/** Code and name of activities, for a comparison list. */
export async function taskLabels(db: Db, ids: string[]): Promise<Map<string, { code: string; name: string }>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await db.from("wbs_tasks").select("id, task_code, task_name").in("id", ids.slice(0, 150));
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { id: string; task_code: string; task_name: string }[]).map((t) => [t.id, { code: t.task_code, name: t.task_name }]));
}
