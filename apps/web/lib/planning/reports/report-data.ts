// Loads what the Planning reports are built from (doc 35 M1). Works with any client; the report route passes the
// caller's client, so row-level security decides what the report can see. Float and the critical path are
// recalculated with the scheduling engine from the data date, the same way the monthly report always has.

import type { SupabaseClient } from "@supabase/supabase-js";
import { depsFromArrays, engineDuration, scheduleProject, type EngineTask, type TaskDates, type TaskFloat } from "../schedule-engine";
import { buildWorkCalendar, todayISO, type PlanCalendarExceptionRow, type PlanCalendarRow, type WorkCalendar } from "../work-calendar";
import { computeScheduleKpis, type ScheduleKpis } from "../schedule-kpis";
import { listRecoveryScenarios, type SavedScenario } from "../activity-library/recovery-service";
import type { ReportBasis } from "./report-model";

type Db = SupabaseClient;

export interface ReportTask {
  id: string; code: string; name: string; nodeId: string | null;
  start: string | null; finish: string | null; baselineStart: string | null; baselineFinish: string | null;
  actualStart: string | null; actualFinish: string | null;
  durationWd: number | null; progress: number; status: string; isMilestone: boolean; manual: boolean;
  constraintType: string | null; constraintDate: string | null;
  depIds: string[]; depTypes: string[]; depLags: number[];
  totalFloat: number | null; critical: boolean;
}

export interface ReportNode { id: string; code: string; name: string; parentId: string | null; sortOrder: number }

export interface ReportDelay {
  code: string | null; description: string | null; type: string | null; cause: string | null; responsible: string | null;
  impactDays: number; status: string; lifecycle: string | null; openedAt: string | null; taskId: string | null;
}

export interface ReportProgress { taskId: string; asOf: string; kind: string; value: number | null; previous: number | null; source: string | null; approvedAt: string | null }

export interface ReportData {
  asAt: string;
  cal: WorkCalendar;
  tasks: ReportTask[];
  nodes: ReportNode[];
  delays: ReportDelay[];
  progress: ReportProgress[];
  scenarios: SavedScenario[];
  kpis: ScheduleKpis;
  scurve: { livePct: number | null; history: { date: string; planned: number | null; actual: number | null }[] };
  generatedBy: string | null;
}

const TASK_COLS =
  "id, wbs_node_id, task_code, task_name, start_date, end_date, baseline_start_date, baseline_finish_date, actual_start_date, actual_finish_date, duration_days, duration_unit, progress, status, is_milestone, manually_scheduled, constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days";

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function loadReportData(db: Db, projectId: string, basis: ReportBasis, userId: string | null): Promise<ReportData> {
  const asAt = basis.project?.data_date ?? todayISO();
  type Row = Record<string, unknown>;
  const [rows, nodes, calRes, settingsRes, delayRes, progRes, scurveRes, scenarios, me] = await Promise.all([
    allRows<Row>((a, b) => db.from("wbs_tasks").select(TASK_COLS).eq("project_id", projectId).order("id").range(a, b)),
    allRows<Row>((a, b) => db.from("wbs_nodes").select("id, wbs_code, wbs_name, parent_id, sort_order").eq("project_id", projectId).order("id").range(a, b)),
    db.from("plan_calendars").select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday, hours_per_day")
      .eq("project_id", projectId).order("is_default", { ascending: false }).limit(1).maybeSingle(),
    db.from("plan_schedule_settings").select("critical_float_threshold_days, near_critical_float_threshold_days").eq("project_id", projectId).maybeSingle(),
    db.from("delay_register").select("delay_code, description, delay_type, cause, responsible_party, impact_days, status, lifecycle, opened_at, created_at, wbs_task_id").eq("project_id", projectId),
    db.from("v_plan_progress_history").select("task_id, as_of, kind, value, previous_value, source, approved_at").eq("project_id", projectId)
      .gte("as_of", new Date(Date.parse(`${asAt}T00:00:00Z`) - 62 * 86_400_000).toISOString().slice(0, 10)).limit(5000),
    db.rpc("get_scurve_series", { p_project_id: projectId }),
    listRecoveryScenarios(db, projectId).catch(() => [] as SavedScenario[]),
    userId ? db.from("profiles").select("full_name").eq("id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const calRow = (calRes.data ?? null) as PlanCalendarRow | null;
  let exceptions: PlanCalendarExceptionRow[] = [];
  if (calRow) {
    const { data } = await db.from("plan_calendar_exceptions").select("exception_date, is_working").eq("calendar_id", calRow.id).limit(5000);
    exceptions = (data ?? []) as PlanCalendarExceptionRow[];
  }
  const cal = buildWorkCalendar(calRow, exceptions);
  const s = settingsRes.data as { critical_float_threshold_days: number; near_critical_float_threshold_days: number } | null;
  const thresholds = s ? { critical: s.critical_float_threshold_days, nearCritical: s.near_critical_float_threshold_days } : { critical: 0, nearCritical: 5 };

  const engine: EngineTask[] = rows.map((t) => {
    const { durationWd, elapsed } = engineDuration(cal, {
      start: t.start_date as string | null, finish: t.end_date as string | null, isMilestone: t.is_milestone as boolean | null,
      durationDays: t.duration_days as number | null, unit: t.duration_unit as string | null,
    });
    return {
      id: t.id as string, start: t.start_date as string | null, finish: t.end_date as string | null, durationWd, elapsed,
      manuallyScheduled: (t.manually_scheduled as boolean | null) ?? false,
      constraintType: t.constraint_type as string | null, constraintDate: t.constraint_date as string | null,
      deps: depsFromArrays(t.dependency_task_ids as string[] | null, t.dependency_types as string[] | null, t.dependency_lag_days as number[] | null),
    };
  });
  let float = new Map<string, TaskFloat>();
  let dates = new Map<string, TaskDates>();
  if (engine.length > 0) {
    const r = scheduleProject(engine, cal, asAt, thresholds);
    if (r.ok) { float = r.float; dates = r.dates; }
  }
  const durById = new Map(engine.map((e) => [e.id, e.durationWd]));

  const tasks: ReportTask[] = rows.map((t) => {
    const f = float.get(t.id as string);
    return {
      id: t.id as string, code: (t.task_code as string) ?? "", name: (t.task_name as string) ?? "", nodeId: (t.wbs_node_id as string | null) ?? null,
      start: t.start_date as string | null, finish: t.end_date as string | null,
      baselineStart: t.baseline_start_date as string | null, baselineFinish: t.baseline_finish_date as string | null,
      actualStart: t.actual_start_date as string | null, actualFinish: t.actual_finish_date as string | null,
      durationWd: t.is_milestone ? 0 : durById.get(t.id as string) ?? null, progress: Number(t.progress ?? 0), status: (t.status as string) ?? "not_started",
      isMilestone: t.is_milestone === true, manual: t.manually_scheduled === true,
      constraintType: t.constraint_type as string | null, constraintDate: t.constraint_date as string | null,
      depIds: (t.dependency_task_ids as string[] | null) ?? [], depTypes: (t.dependency_types as string[] | null) ?? [], depLags: ((t.dependency_lag_days as number[] | null) ?? []).map(Number),
      totalFloat: f ? f.totalFloat : null, critical: f?.critical ?? false,
    };
  });

  const kpis = computeScheduleKpis(
    tasks.map((t) => ({ id: t.id, start_date: t.start, end_date: t.finish, progress: t.progress, status: t.status })),
    float, dates, cal, asAt, basis.project?.contract_finish ?? null, null,
  );
  const sc = (scurveRes.data ?? null) as { live?: { pct: number }; actual?: { date: string; pct: number; planned_pct: number }[] } | null;

  return {
    asAt, cal, tasks,
    nodes: nodes.map((n) => ({ id: n.id as string, code: (n.wbs_code as string) ?? "", name: (n.wbs_name as string) ?? "", parentId: (n.parent_id as string | null) ?? null, sortOrder: Number(n.sort_order ?? 0) })),
    delays: ((delayRes.data ?? []) as Row[]).map((d) => ({
      code: d.delay_code as string | null, description: d.description as string | null, type: d.delay_type as string | null, cause: d.cause as string | null,
      responsible: d.responsible_party as string | null, impactDays: Number(d.impact_days ?? 0), status: (d.status as string) ?? "open",
      lifecycle: d.lifecycle as string | null, openedAt: ((d.opened_at ?? d.created_at) as string | null)?.slice(0, 10) ?? null, taskId: d.wbs_task_id as string | null,
    })),
    progress: ((progRes.data ?? []) as Row[]).map((p) => ({
      taskId: p.task_id as string, asOf: p.as_of as string, kind: p.kind as string, value: p.value == null ? null : Number(p.value),
      previous: p.previous_value == null ? null : Number(p.previous_value), source: p.source as string | null, approvedAt: p.approved_at as string | null,
    })),
    scenarios,
    kpis,
    scurve: {
      livePct: sc?.live?.pct ?? null,
      history: (sc?.actual ?? []).slice(-6).map((p) => ({ date: p.date, planned: p.planned_pct ?? null, actual: p.pct ?? null })),
    },
    generatedBy: ((me as { data: { full_name: string } | null }).data?.full_name) ?? null,
  };
}
