import { type SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";

export type WeeklyPlanStatus = "draft" | "submitted" | "approved";

export interface WeeklyPlanRecord {
  id: string;
  project_id: string;
  department_id: string | null;
  week_start_date: string;
  title: string | null;
  status: WeeklyPlanStatus;
}

export interface WeeklyPlanAssignment {
  wbs_task_id: string;
  responsible_id: string;
  responsible_name: string | null;
  target_progress: number;
}

export interface SavedPlanAssignment extends WeeklyPlanAssignment {
  id: string;
}

export function toWeekStartDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export async function fetchWeekPlan(
  supabase: SupabaseClient,
  params: { projectId: string; departmentId: string; weekStart: string },
): Promise<WeeklyPlanRecord | null> {
  const { data, error } = await supabase
    .from("weekly_plans")
    .select("id, project_id, department_id, week_start_date, title, status")
    .eq("project_id", params.projectId)
    .eq("department_id", params.departmentId)
    .eq("week_start_date", params.weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as WeeklyPlanRecord | null) ?? null;
}

export async function fetchPlanAssignments(
  supabase: SupabaseClient,
  planId: string,
): Promise<SavedPlanAssignment[]> {
  const { data, error } = await supabase
    .from("weekly_plan_tasks")
    .select("id, wbs_task_id, responsible_id, responsible_name, target_progress")
    .eq("weekly_plan_id", planId);
  if (error) throw error;
  return (data ?? []) as SavedPlanAssignment[];
}

export async function ensureWeekPlan(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    departmentId: string;
    weekStart: string;
    userId: string;
    title: string;
  },
): Promise<WeeklyPlanRecord> {
  const existing = await fetchWeekPlan(supabase, params);
  if (existing) return existing;

  const { error } = await supabase.from("weekly_plans").insert({
    project_id: params.projectId,
    department_id: params.departmentId,
    week_start_date: params.weekStart,
    title: params.title,
    status: "draft",
    created_by: params.userId,
  });
  if (error && error.code !== "23505") throw error;

  const plan = await fetchWeekPlan(supabase, params);
  if (!plan) throw new Error("Failed to create the weekly plan");
  return plan;
}

/** Syncs plan rows to the given assignments: removes dropped tasks, upserts the rest. */
export async function savePlanAssignments(
  supabase: SupabaseClient,
  planId: string,
  assignments: WeeklyPlanAssignment[],
): Promise<void> {
  const existing = await fetchPlanAssignments(supabase, planId);
  const nextTaskIds = new Set(assignments.map((a) => a.wbs_task_id));
  const removedIds = existing
    .filter((row) => !nextTaskIds.has(row.wbs_task_id))
    .map((row) => row.id);

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from("weekly_plan_tasks")
      .delete()
      .in("id", removedIds);
    if (error) throw error;
  }

  if (assignments.length > 0) {
    const { error } = await supabase.from("weekly_plan_tasks").upsert(
      assignments.map((a) => ({
        weekly_plan_id: planId,
        wbs_task_id: a.wbs_task_id,
        responsible_id: a.responsible_id,
        responsible_name: a.responsible_name,
        target_progress: a.target_progress,
      })),
      { onConflict: "weekly_plan_id,wbs_task_id" },
    );
    if (error) throw error;
  }
}

export async function setWeeklyPlanStatus(
  supabase: SupabaseClient,
  planId: string,
  status: Exclude<WeeklyPlanStatus, "approved">,
): Promise<void> {
  const { error } = await supabase
    .from("weekly_plans")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", planId);
  if (error) throw error;
}
