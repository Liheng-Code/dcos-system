import { createClient } from "@/lib/supabase/client";

export interface BaselineRow {
  baseline_number: number;
  baseline_name: string;
  baseline_date: string;
  is_active: boolean;
  set_by: string | null;
  task_count: number;
}

/** All numbered baselines for a project, ordered by number. */
export async function listBaselines(projectId: string): Promise<BaselineRow[]> {
  const { data, error } = await createClient()
    .from("wbs_baselines")
    .select("baseline_number, baseline_name, baseline_date, is_active, set_by, snapshot_data")
    .eq("project_id", projectId)
    .order("baseline_number");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const snap = r.snapshot_data as { tasks?: unknown[] } | null;
    return {
      baseline_number: r.baseline_number as number,
      baseline_name: r.baseline_name as string,
      baseline_date: r.baseline_date as string,
      is_active: r.is_active as boolean,
      set_by: (r.set_by as string | null) ?? null,
      task_count: Array.isArray(snap?.tasks) ? snap!.tasks!.length : 0,
    };
  });
}

/** Snapshot the schedule into baseline `number` (0 = "Baseline", 1–10). */
export async function setBaseline(
  projectId: string,
  number: number,
  taskIds?: string[] | null,
): Promise<void> {
  const { error } = await createClient().rpc("set_baseline", {
    p_project_id: projectId,
    p_number: number,
    p_task_ids: taskIds && taskIds.length ? taskIds : null,
  });
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
