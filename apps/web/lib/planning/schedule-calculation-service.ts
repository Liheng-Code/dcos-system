// Doc 35 E3 / E6: project calendars for activity calendars, and the calculation log.
// Every saved schedule calculation is recorded in plan_schedule_calculations with the engine
// version and an input fingerprint, so a stored programme can be reproduced and audited.

import { createClient } from "@/lib/supabase/client";
import {
  ENGINE_VERSION,
  buildWorkCalendar,
  scheduleInputHash,
  type EngineTask,
  type FloatThresholds,
  type PlanCalendarExceptionRow,
  type PlanCalendarRow,
  type ScheduleOptions,
  type ScheduleResult,
  type WorkCalendar,
} from "@dcos/scheduling-engine";

const db = () => createClient();

/** Every calendar of the project by id (for activities with their own calendar_id). */
export async function loadProjectCalendars(projectId: string): Promise<Map<string, WorkCalendar>> {
  const { data: rows } = await db()
    .from("plan_calendars")
    .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday, hours_per_day")
    .eq("project_id", projectId);
  const out = new Map<string, WorkCalendar>();
  const list = (rows ?? []) as PlanCalendarRow[];
  if (list.length === 0) return out;
  const { data: exc } = await db()
    .from("plan_calendar_exceptions")
    .select("calendar_id, exception_date, is_working")
    .in("calendar_id", list.map((r) => r.id))
    .limit(20000);
  const byCal = new Map<string, PlanCalendarExceptionRow[]>();
  for (const e of (exc ?? []) as (PlanCalendarExceptionRow & { calendar_id: string })[]) {
    if (!byCal.has(e.calendar_id)) byCal.set(e.calendar_id, []);
    byCal.get(e.calendar_id)!.push(e);
  }
  for (const r of list) out.set(r.id, buildWorkCalendar(r, byCal.get(r.id) ?? []));
  return out;
}

export interface CalculationRecordInput {
  projectId: string;
  source: "sheet" | "wbs_builder" | "other";
  tasks: EngineTask[];
  calendar: WorkCalendar;
  projectStart: string;
  thresholds: FloatThresholds;
  options: ScheduleOptions;
  result: Extract<ScheduleResult, { ok: true }>;
  changedCount: number;
}

/** Append one row to the calculation log. Best effort: a failure never blocks the schedule save. */
export async function recordScheduleCalculation(input: CalculationRecordInput): Promise<void> {
  const { result, options } = input;
  let finish: string | null = null;
  let critical = 0;
  for (const d of result.dates.values()) if (!finish || d.finish > finish) finish = d.finish;
  for (const f of result.float.values()) if (f.critical) critical++;
  const { data: auth } = await db().auth.getUser();
  const { error } = await db().from("plan_schedule_calculations").insert({
    project_id: input.projectId,
    engine_version: ENGINE_VERSION,
    input_hash: scheduleInputHash(input.tasks, input.calendar, input.projectStart, input.thresholds, options),
    source: input.source,
    project_start: input.projectStart,
    data_date: options.dataDate ?? null,
    project_finish: finish,
    task_count: input.tasks.length,
    changed_count: input.changedCount,
    critical_count: critical,
    settings: {
      thresholds: input.thresholds,
      lagCalendar: options.lagCalendar ?? "predecessor",
      mustFinishBy: options.mustFinishBy ?? null,
      calendars: options.calendars ? options.calendars.size : 0,
    },
    diagnostics: {
      openStart: result.diagnostics.openStart.length,
      openFinish: result.diagnostics.openFinish.length,
      danglingLinks: result.diagnostics.danglingLinks.length,
      selfLinks: result.diagnostics.selfLinks.length,
      criticalPaths: result.criticalPaths.length,
      longestPath: result.longestPath.length,
    },
    warnings: [...result.violations.entries()].slice(0, 200).map(([taskId, message]) => ({ taskId, message })),
    created_by: auth.user?.id ?? null,
  });
  if (error) console.warn("[planning] calculation log not saved:", error.message);
}
