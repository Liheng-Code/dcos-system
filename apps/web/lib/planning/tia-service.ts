import { createClient } from "@/lib/supabase/client";
import { runTia, type FragnetActivity, type TiaInput, type TiaResult, type TiaTask } from "./time-impact-analysis";
import { buildWorkCalendar, todayISO, workingDaysBetween, type PlanCalendarExceptionRow, type PlanCalendarRow, type WorkCalendar } from "./work-calendar";
import { depsFromArrays } from "./schedule-engine";

/** Completion Plan 3.1 — loads everything runTia() needs for one project, client-side. */
export async function loadTiaContext(projectId: string): Promise<{ tasks: TiaTask[]; cal: WorkCalendar; dataDate: string }> {
  const supabase = createClient();
  const [taskRes, projectRes, calRes] = await Promise.all([
    supabase
      .from("wbs_tasks")
      .select(
        "id, task_code, task_name, start_date, end_date, baseline_start_date, baseline_finish_date, progress, is_milestone, manually_scheduled, constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days",
      )
      .eq("project_id", projectId)
      .limit(1000),
    supabase.from("projects").select("data_date").eq("id", projectId).maybeSingle(),
    supabase
      .from("plan_calendars")
      .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday")
      .eq("project_id", projectId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (taskRes.error) throw new Error(taskRes.error.message);

  const calRow = (calRes.data ?? null) as PlanCalendarRow | null;
  let exceptions: PlanCalendarExceptionRow[] = [];
  if (calRow) {
    const exRes = await supabase.from("plan_calendar_exceptions").select("exception_date, is_working").eq("calendar_id", calRow.id);
    exceptions = (exRes.data ?? []) as PlanCalendarExceptionRow[];
  }
  const cal = buildWorkCalendar(calRow, exceptions);
  const dataDate = projectRes.data?.data_date ?? todayISO();

  const tasks: TiaTask[] = (taskRes.data ?? []).map((t) => ({
    id: t.id as string,
    task_code: t.task_code as string,
    task_name: t.task_name as string,
    start_date: t.start_date as string | null,
    end_date: t.end_date as string | null,
    baseline_start: t.baseline_start_date as string | null,
    baseline_finish: t.baseline_finish_date as string | null,
    progress: Number(t.progress ?? 0),
    is_milestone: !!t.is_milestone,
    manually_scheduled: !!t.manually_scheduled,
    constraint_type: t.constraint_type as string | null,
    constraint_date: t.constraint_date as string | null,
    dependency_task_ids: (t.dependency_task_ids as string[] | null) ?? [],
    dependency_types: (t.dependency_types as string[] | null) ?? [],
    dependency_lag_days: (t.dependency_lag_days as number[] | null) ?? [],
  }));

  return { tasks, cal, dataDate };
}

/** Working-day duration a task would carry if it were dropped into a fragnet — used to seed the editor. */
export function workingDaysOf(cal: WorkCalendar, start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  return Math.max(1, workingDaysBetween(cal, start, end));
}

export interface TiaScenarioRow {
  id: string;
  project_id: string;
  delay_id: string | null;
  name: string;
  data_date: string;
  base_finish: string | null;
  impacted_finish: string | null;
  slip_wd: number | null;
  input_json: { fragnet: FragnetActivity[]; impactedActivityIds: string[] };
  result_json: TiaResult;
  created_at: string;
}

export async function listTiaScenarios(projectId: string): Promise<TiaScenarioRow[]> {
  const { data, error } = await createClient()
    .from("plan_tia_scenarios")
    .select("id, project_id, delay_id, name, data_date, base_finish, impacted_finish, slip_wd, input_json, result_json, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TiaScenarioRow[];
}

export async function saveTiaScenario(
  projectId: string,
  name: string,
  delayId: string | null,
  input: TiaInput,
  result: TiaResult,
): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("plan_tia_scenarios")
    .insert({
      project_id: projectId,
      delay_id: delayId,
      name,
      data_date: input.dataDate,
      base_finish: result.ok ? result.baseFinish : null,
      impacted_finish: result.ok ? result.impactedFinish : null,
      slip_wd: result.ok ? result.slipWd : null,
      input_json: { fragnet: input.fragnet, impactedActivityIds: input.impactedActivityIds },
      result_json: result,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteTiaScenario(id: string): Promise<void> {
  const { error } = await createClient().from("plan_tia_scenarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export { runTia, depsFromArrays };
export type { FragnetActivity, TiaInput, TiaResult, TiaTask };
