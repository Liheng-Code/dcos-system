// Doc 35 I2: data access for previewing and saving a calendar change (pure logic in calendar-change.ts).
// Saving writes the calendar change, then (unless deferred) recalculates the programme under the new calendars
// and writes the activities that moved, with a calculation-log row, as the Sheet's Calculate does.

import { createClient } from "@/lib/supabase/client";
import {
  applyScheduleDates,
  deletePlanCalendarById,
  deletePlanCalendarExceptionById,
  insertPlanCalendarException,
  updatePlanCalendarById,
} from "./planning-queries";
import { DEFAULT_FLOAT_THRESHOLDS } from "./schedule-engine";
import { recordScheduleCalculation } from "./schedule-calculation-service";
import {
  WEEKDAYS,
  applyCalendarEdit,
  calculateProgramme,
  compareProgrammes,
  lockedNodes,
  type CalendarEdit,
  type CalendarException,
  type CalendarImpact,
  type CalendarRow,
  type CalendarSet,
  type ProgrammeTask,
} from "./calendar-change";

const db = () => createClient();

const TASK_COLS =
  "id, task_code, task_name, wbs_node_id, start_date, end_date, duration_days, duration_unit, is_milestone, manually_scheduled, " +
  "constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days, calendar_id, " +
  "actual_start_date, actual_finish_date, progress";

async function loadCalendarSet(projectId: string): Promise<CalendarSet> {
  const { data: rows, error } = await db()
    .from("plan_calendars")
    .select(`id, name, description, is_default, hours_per_day, ${WEEKDAYS.join(", ")}`)
    .eq("project_id", projectId)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw new Error(error.message);
  const list = (rows ?? []) as unknown as CalendarRow[];
  if (!list.length) return { rows: [], exceptions: [] };
  const { data: exc, error: e2 } = await db()
    .from("plan_calendar_exceptions")
    .select("id, calendar_id, exception_date, is_working, reason")
    .in("calendar_id", list.map((r) => r.id))
    .limit(20000);
  if (e2) throw new Error(e2.message);
  return { rows: list, exceptions: (exc ?? []) as CalendarException[] };
}

async function loadTasks(projectId: string): Promise<ProgrammeTask[]> {
  const out: ProgrammeTask[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from("wbs_tasks").select(TASK_COLS).eq("project_id", projectId).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as ProgrammeTask[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadContext(projectId: string) {
  const [set, tasks, project, nodes, milestones] = await Promise.all([
    loadCalendarSet(projectId),
    loadTasks(projectId),
    db().from("projects").select("data_date").eq("id", projectId).maybeSingle(),
    db().from("wbs_nodes").select("id, parent_id, is_locked").eq("project_id", projectId).limit(20000),
    db().from("plan_contract_milestones").select("code, name, contract_date, revised_date, task_id").eq("project_id", projectId),
  ]);
  return {
    set,
    tasks,
    dataDate: (project.data?.data_date as string | null) ?? null,
    locked: lockedNodes((nodes.data ?? []) as { id: string; parent_id: string | null; is_locked: boolean | null }[]),
    milestones: (milestones.data ?? []) as { code: string; name: string; contract_date: string; revised_date: string | null; task_id: string | null }[],
  };
}

const cycleError = (cycle: string[], tasks: ProgrammeTask[]) => {
  const code = new Map(tasks.map((t) => [t.id, t.task_code ?? t.id.slice(0, 8)]));
  return new Error(`The links loop (${cycle.map((id) => code.get(id) ?? id).join(" → ")}); fix them before changing the calendar`);
};

/** What the edit would move, without saving anything. */
export async function previewCalendarChange(projectId: string, edit: CalendarEdit): Promise<CalendarImpact & { set: CalendarSet; activities: number }> {
  const ctx = await loadContext(projectId);
  const before = calculateProgramme(ctx.tasks, ctx.set, ctx.dataDate, ctx.locked);
  if (!before.ok) throw cycleError(before.cycle, ctx.tasks);
  const after = calculateProgramme(ctx.tasks, applyCalendarEdit(ctx.set, edit), ctx.dataDate, ctx.locked);
  if (!after.ok) throw cycleError(after.cycle, ctx.tasks);
  return { ...compareProgrammes(ctx.tasks, before.dates, after.dates, ctx.milestones), set: ctx.set, activities: ctx.tasks.length };
}

async function saveEdit(projectId: string, edit: CalendarEdit): Promise<void> {
  let error: { message: string } | null = null;
  switch (edit.kind) {
    case "update":
      if (edit.patch.is_default) {
        // one default per project
        const r = await db().from("plan_calendars").update({ is_default: false }).eq("project_id", projectId).neq("id", edit.calendarId);
        if (r.error) throw new Error(r.error.message);
      }
      ({ error } = await updatePlanCalendarById(edit.patch, edit.calendarId));
      break;
    case "add_exception": {
      const old = await db().from("plan_calendar_exceptions").delete().eq("calendar_id", edit.calendarId).eq("exception_date", edit.date);
      if (old.error) throw new Error(old.error.message);
      ({ error } = await insertPlanCalendarException({
        calendar_id: edit.calendarId, exception_date: edit.date, is_working: edit.isWorking, reason: edit.reason,
      }));
      break;
    }
    case "remove_exception":
      ({ error } = await deletePlanCalendarExceptionById(edit.exceptionId));
      break;
    case "delete":
      ({ error } = await deletePlanCalendarById(edit.calendarId));
      break;
  }
  if (error) throw new Error(error.message);
}

/**
 * Save the edit; then, unless `recalculate` is false, recalculate under the saved calendars and write the
 * activities that moved. Returns how many were written.
 */
export async function applyCalendarChange(projectId: string, edit: CalendarEdit, recalculate = true): Promise<{ written: number }> {
  await saveEdit(projectId, edit);
  if (!recalculate) return { written: 0 };
  const ctx = await loadContext(projectId);
  const run = calculateProgramme(ctx.tasks, ctx.set, ctx.dataDate, ctx.locked);
  if (!run.ok) throw cycleError(run.cycle, ctx.tasks);
  const rows = ctx.tasks.flatMap((t) => {
    const d = run.dates.get(t.id);
    return d && (d.start !== t.start_date || d.finish !== t.end_date) ? [{ id: t.id, start_date: d.start, end_date: d.finish }] : [];
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await applyScheduleDates({ p_project_id: projectId, p_rows: rows.slice(i, i + 500) });
    if (error) throw new Error(error.message);
  }
  if (rows.length) {
    void recordScheduleCalculation({
      projectId, source: "other", tasks: run.engineTasks, calendar: run.calendar, projectStart: run.start,
      thresholds: DEFAULT_FLOAT_THRESHOLDS, options: { dataDate: ctx.dataDate, calendars: run.calendars },
      result: run.result, changedCount: rows.length,
    });
  }
  return { written: rows.length };
}
