import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { dispatchScheduleAlert, type ScheduleAlertType } from "@/lib/notifications/dispatch";
import {
  scheduleProject,
  signedWorkingDayGap,
  depsFromArrays,
  projectFinish,
  type EngineTask,
} from "@/lib/planning/schedule-engine";
import {
  buildWorkCalendar,
  todayISO,
  workingDaysBetween,
  type PlanCalendarExceptionRow,
  type PlanCalendarRow,
} from "@/lib/planning/work-calendar";

/**
 * Completion Plan 1.6 — schedule alerts (critical-path change, programme
 * overrun, float consumed). Re-runs the CPM engine server-side (the engine's
 * single source of truth stays in lib/planning/schedule-engine.ts — this
 * route must never re-implement CPM in SQL), diffs against the last-known
 * state in plan_schedule_state, and dispatches only what actually changed.
 * Deliberately idempotent: dispatchScheduleAlert's source_key dedupes retries
 * and repeated evaluations of an unchanged schedule.
 */

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

interface TaskRow {
  id: string;
  wbs_node_id: string;
  task_code: string;
  task_name: string;
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean | null;
  manually_scheduled: boolean | null;
  constraint_type: string | null;
  constraint_date: string | null;
  dependency_task_ids: string[] | null;
  dependency_types: string[] | null;
  dependency_lag_days: number[] | null;
  owner_id: string | null;
}

function toEngineTask(t: TaskRow, cal: ReturnType<typeof buildWorkCalendar>): EngineTask {
  let durationWd = 1;
  if (t.is_milestone) durationWd = 0;
  else if (t.start_date && t.end_date) durationWd = Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date));
  return {
    id: t.id,
    start: t.start_date,
    finish: t.end_date,
    durationWd,
    manuallyScheduled: t.manually_scheduled ?? false,
    constraintType: t.constraint_type,
    constraintDate: t.constraint_date,
    deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const supabase = createAdminClient();

  const [taskRes, projectRes, calRes, settingsRes, stateRes] = await Promise.all([
    supabase
      .from("wbs_tasks")
      .select(
        "id, wbs_node_id, task_code, task_name, start_date, end_date, is_milestone, manually_scheduled, constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days, owner_id",
      )
      .eq("project_id", projectId)
      .limit(1000),
    supabase.from("projects").select("data_date, end_date, project_manager_id").eq("id", projectId).maybeSingle(),
    supabase
      .from("plan_calendars")
      .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday")
      .eq("project_id", projectId)
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("plan_schedule_settings")
      .select("critical_float_threshold_days, near_critical_float_threshold_days")
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase.from("plan_schedule_state").select("critical_task_ids, near_critical_task_ids, project_finish").eq("project_id", projectId).maybeSingle(),
  ]);

  if (taskRes.error) return NextResponse.json({ error: taskRes.error.message }, { status: 500 });
  const tasks = (taskRes.data ?? []) as TaskRow[];
  if (tasks.length === 0) return NextResponse.json({ evaluated: 0 });

  const calRow = (calRes.data ?? null) as PlanCalendarRow | null;
  let exceptions: PlanCalendarExceptionRow[] = [];
  if (calRow) {
    const exRes = await supabase.from("plan_calendar_exceptions").select("exception_date, is_working").eq("calendar_id", calRow.id);
    exceptions = (exRes.data ?? []) as PlanCalendarExceptionRow[];
  }
  const cal = buildWorkCalendar(calRow, exceptions);

  const dataDate = projectRes.data?.data_date ?? todayISO();
  const contractEnd = projectRes.data?.end_date ?? null;
  const thresholds = settingsRes.data
    ? { critical: settingsRes.data.critical_float_threshold_days, nearCritical: settingsRes.data.near_critical_float_threshold_days }
    : { critical: 0, nearCritical: 5 };

  const result = scheduleProject(tasks.map((t) => toEngineTask(t, cal)), cal, dataDate, thresholds);
  if (!result.ok) return NextResponse.json({ error: `Circular dependency: ${result.cycle.join(" -> ")}` }, { status: 422 });

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const criticalIds: string[] = [];
  const nearCriticalIds: string[] = [];
  for (const [id, f] of result.float) {
    if (f.critical) criticalIds.push(id);
    else if (f.nearCritical) nearCriticalIds.push(id);
  }
  const forecastFinish = projectFinish(result.dates);

  const prevCritical = new Set<string>((stateRes.data?.critical_task_ids as string[] | null) ?? []);
  const prevFinish = (stateRes.data?.project_finish as string | null) ?? null;

  // Recipients: prefer project members with a planner/PM-ish role_code; fall
  // back to task owners + the project manager until Phase 2 populates roles
  // properly (this is the same fallback the Completion Plan calls for).
  const PLANNER_ROLE_CODES = ["L0", "L1", "L2", "L3", "L4", "PE"];
  const membersRes = await supabase.from("project_members").select("user_id, role_code").eq("project_id", projectId);
  let recipientIds = (membersRes.data ?? [])
    .filter((m) => m.role_code && PLANNER_ROLE_CODES.includes(m.role_code))
    .map((m) => m.user_id as string);
  if (recipientIds.length === 0) {
    const owners = new Set(tasks.map((t) => t.owner_id).filter((x): x is string => !!x));
    if (projectRes.data?.project_manager_id) owners.add(projectRes.data.project_manager_id);
    recipientIds = [...owners];
  }

  let alertsSent = 0;

  // 1. Newly critical tasks (float consumed to the critical threshold).
  const newlyCritical = criticalIds.filter((id) => !prevCritical.has(id));
  for (const id of newlyCritical.slice(0, 20)) {
    const t = byId.get(id);
    if (!t) continue;
    await dispatchScheduleAlert(supabase, {
      projectId,
      recipientIds,
      alertType: "schedule_float_consumed" satisfies ScheduleAlertType,
      title: `Float consumed: ${t.task_code}`,
      body: `"${t.task_name}" (${t.task_code}) has run out of float and is now on the critical path.`,
      taskId: t.id,
      taskCode: t.task_code,
      taskName: t.task_name,
      sourceKey: `schedule:${projectId}:float:${t.id}:${dataDate}`,
      actorId: user.id,
    });
    alertsSent++;
  }

  // 2. Critical-path composition changed at all (added or dropped members).
  const criticalSorted = [...criticalIds].sort();
  const criticalChanged = criticalSorted.length !== prevCritical.size || criticalSorted.some((id) => !prevCritical.has(id));
  if (criticalChanged && criticalSorted.length > 0) {
    await dispatchScheduleAlert(supabase, {
      projectId,
      recipientIds,
      alertType: "schedule_critical_path_changed",
      title: "Critical path changed",
      body: `The critical path now runs through ${criticalSorted.length} activit${criticalSorted.length === 1 ? "y" : "ies"}, forecast finish ${forecastFinish ?? "unknown"}.`,
      sourceKey: `schedule:${projectId}:critical:${dataDate}:${shortHash(criticalSorted.join(","))}`,
      actorId: user.id,
    });
    alertsSent++;
  }

  // 3. Programme overrun vs the contract end date.
  if (forecastFinish && contractEnd) {
    const overrunWd = signedWorkingDayGap(cal, contractEnd, forecastFinish);
    if (overrunWd > 0) {
      await dispatchScheduleAlert(supabase, {
        projectId,
        recipientIds,
        alertType: "schedule_overrun",
        title: "Programme overrun",
        body: `The schedule now forecasts finishing on ${forecastFinish}, ${overrunWd} working day${overrunWd === 1 ? "" : "s"} past the contract end (${contractEnd}).`,
        sourceKey: `schedule:${projectId}:overrun:${forecastFinish}`,
        actorId: user.id,
      });
      alertsSent++;
    }
  }

  // Persist the new state for the next evaluation's diff, only if it moved.
  if (criticalChanged || forecastFinish !== prevFinish) {
    await supabase.rpc("upsert_plan_schedule_state", {
      p_project_id: projectId,
      p_critical: criticalIds,
      p_near_critical: nearCriticalIds,
      p_project_finish: forecastFinish,
    });
  }

  return NextResponse.json({ evaluated: tasks.length, alertsSent, criticalCount: criticalIds.length, forecastFinish });
}
