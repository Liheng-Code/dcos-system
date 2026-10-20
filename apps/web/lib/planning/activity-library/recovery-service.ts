// Recovery scenarios - data access (Phase 3.6). Works with any client (browser or server): it only reads the live programme,
// the calendar and the library standards, and stores scenarios the planner chooses to keep. It never edits a task.

import type { SupabaseClient } from "@supabase/supabase-js";
import { addWorkingDays, buildWorkCalendar, type PlanCalendarExceptionRow, type PlanCalendarRow, type WorkCalendar } from "../work-calendar";
import { listProductivityStandards } from "./library-service";
import { adjustedProductivity, baseOutputPerDay, calculateDuration } from "./productivity-engine";
import {
  analyseRecovery, DEFAULT_RECOVERY_SETTINGS, type MethodAlternative, type RecoveryAnalysis, type RecoverySettings, type RecoveryTask, type Scenario,
} from "./recovery-engine";

type Db = SupabaseClient;

export interface RecoveryInputs {
  tasks: RecoveryTask[];
  cal: WorkCalendar;
  projectStart: string;
  baselineFinish: string | null;
  alternatives: Map<string, MethodAlternative[]>;
}

async function loadCalendar(db: Db, projectId: string): Promise<WorkCalendar> {
  const { data: row } = await db.from("plan_calendars")
    .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday, hours_per_day")
    .eq("project_id", projectId).order("is_default", { ascending: false }).limit(1).maybeSingle();
  let exceptions: PlanCalendarExceptionRow[] = [];
  if (row?.id) {
    const { data } = await db.from("plan_calendar_exceptions").select("exception_date, is_working").eq("calendar_id", row.id).limit(5000);
    exceptions = (data ?? []) as PlanCalendarExceptionRow[];
  }
  return buildWorkCalendar((row as PlanCalendarRow | null) ?? null, exceptions);
}

const COLS = "id, task_code, task_name, discipline, start_date, end_date, baseline_finish_date, progress, is_milestone, manually_scheduled, constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days, activity_master_id, activity_method_id";

export async function loadRecoveryInputs(db: Db, projectId: string): Promise<RecoveryInputs> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("wbs_tasks").select(COLS).eq("project_id", projectId).order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  const crewable = await crewableTaskIds(db, rows);
  const tasks: RecoveryTask[] = rows.map((r) => ({
    id: r.id as string, code: (r.task_code as string) ?? "", name: (r.task_name as string) ?? "", discipline: (r.discipline as string | null) ?? null,
    start: (r.start_date as string | null) ?? null, finish: (r.end_date as string | null) ?? null, progress: Number(r.progress ?? 0),
    isMilestone: r.is_milestone === true, manual: r.manually_scheduled === true, crewable: crewable.has(r.id as string),
    constraintType: (r.constraint_type as string | null) ?? null, constraintDate: (r.constraint_date as string | null) ?? null,
    depIds: (r.dependency_task_ids as string[] | null) ?? [], depTypes: (r.dependency_types as string[] | null) ?? [], depLags: ((r.dependency_lag_days as number[] | null) ?? []).map(Number),
  }));

  const [cal, { data: proj }] = await Promise.all([loadCalendar(db, projectId), db.from("projects").select("start_date").eq("id", projectId).maybeSingle()]);
  const starts = tasks.map((t) => t.start).filter((x): x is string => !!x).sort();
  const projectStart = ((proj as { start_date: string | null } | null)?.start_date ?? starts[0]) ?? new Date().toISOString().slice(0, 10);
  const baselineFinish = rows.map((r) => r.baseline_finish_date as string | null).filter((x): x is string => !!x).sort().slice(-1)[0] ?? null;

  return { tasks, cal, projectStart, baselineFinish, alternatives: await methodAlternatives(db, rows) };
}

/** Labour-driven work that crews can speed up: it has a productivity norm on its task work, or it was generated from the library. */
async function crewableTaskIds(db: Db, rows: Record<string, unknown>[]): Promise<Set<string>> {
  const out = new Set(rows.filter((r) => r.activity_master_id).map((r) => r.id as string));
  const ids = rows.map((r) => r.id as string);
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from("plan_task_work").select("task_id").in("task_id", ids.slice(i, i + 150)).not("norm_id", "is", null);
    if (error) throw new Error(error.message);
    for (const w of (data ?? []) as { task_id: string }[]) out.add(w.task_id);
  }
  return out;
}

/** For tasks generated from the library: the other methods of the same activity whose standard gives a shorter duration. */
async function methodAlternatives(db: Db, rows: Record<string, unknown>[]): Promise<Map<string, MethodAlternative[]>> {
  const out = new Map<string, MethodAlternative[]>();
  const generated = rows.filter((r) => r.activity_master_id && r.activity_method_id && Number(r.progress ?? 0) === 0);
  if (generated.length === 0) return out;

  const ids = generated.map((r) => r.id as string);
  const qty = new Map<string, number>();
  const crews = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db.from("plan_task_work").select("task_id, quantity, crews").in("task_id", ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    for (const w of (data ?? []) as { task_id: string; quantity: number | null; crews: number | null }[]) {
      if (w.quantity != null && Number(w.quantity) > 0) qty.set(w.task_id, Number(w.quantity));
      if (Number(w.crews) > 0) crews.set(w.task_id, Number(w.crews));
    }
  }

  const standardsByMaster = new Map<string, Awaited<ReturnType<typeof listProductivityStandards>>>();
  const methodName = new Map<string, string>();
  for (const masterId of [...new Set(generated.map((r) => r.activity_master_id as string))]) {
    standardsByMaster.set(masterId, await listProductivityStandards(db, masterId));
    const { data } = await db.from("plan_act_methods").select("id, name").eq("master_id", masterId);
    for (const m of (data ?? []) as { id: string; name: string }[]) methodName.set(m.id, m.name);
  }

  for (const r of generated) {
    const q = qty.get(r.id as string);
    if (!q) continue;
    const alts: MethodAlternative[] = [];
    for (const s of standardsByMaster.get(r.activity_master_id as string) ?? []) {
      if (!s.method_id || s.method_id === r.activity_method_id || s.status === "retired") continue;
      const crew = s.resources.filter((x) => x.kind === "labor" && x.allocation_rule === "per_crew").reduce((a, x) => a + x.workers_per_crew, 0);
      const base = baseOutputPerDay({ output_per_day: s.output_per_day, labour_constant_hr_per_unit: s.labour_constant_hr_per_unit, crew_workers: crew, hours_per_day: s.hours_per_day_basis, efficiency_pct: s.efficiency_pct });
      if (base == null) continue;
      // same crews as the task has now, so the alternative is compared like for like
      const d = calculateDuration(q, adjustedProductivity(base, s.factors).adjusted * (crews.get(r.id as string) ?? 1));
      if (d) alts.push({ methodName: methodName.get(s.method_id) ?? s.name, durationWd: d.days, draft: s.status !== "approved" });
    }
    if (alts.length) out.set(r.id as string, alts);
  }
  return out;
}

export type TargetSpec = { mode: "baseline" } | { mode: "earlier"; days: number } | { mode: "date"; date: string };

export function resolveTarget(spec: TargetSpec, liveFinish: string | null, baselineFinish: string | null, cal: WorkCalendar): string | null {
  if (spec.mode === "baseline") return baselineFinish;
  if (spec.mode === "date") return spec.date || null;
  return liveFinish ? addWorkingDays(cal, liveFinish, -Math.max(0, Math.trunc(spec.days))) : null;
}

export interface OpenDelay {
  id: string;
  code: string | null;
  description: string | null;
  delayType: string | null;
  cause: string | null;
  responsible: string | null;
  impactDays: number;
  status: string;
  /** activities the entry is logged against (its main task plus linked tasks) */
  taskIds: string[];
}

/** Open or disputed entries of the delay register: the logged reasons the programme is late. Read-only. */
export async function loadOpenDelays(db: Db, projectId: string): Promise<OpenDelay[]> {
  const { data, error } = await db.from("delay_register")
    .select("id, delay_code, description, delay_type, cause, responsible_party, impact_days, status, wbs_task_id")
    .eq("project_id", projectId).in("status", ["open", "disputed"]).order("impact_days", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const { data: links } = await db.from("delay_register_tasks").select("delay_id, wbs_task_id").in("delay_id", rows.map((r) => r.id as string));
  const linked = new Map<string, string[]>();
  for (const l of (links ?? []) as { delay_id: string; wbs_task_id: string }[]) linked.set(l.delay_id, [...(linked.get(l.delay_id) ?? []), l.wbs_task_id]);
  return rows.map((r) => ({
    id: r.id as string, code: (r.delay_code as string | null) ?? null, description: (r.description as string | null) ?? null,
    delayType: (r.delay_type as string | null) ?? null, cause: (r.cause as string | null) ?? null, responsible: (r.responsible_party as string | null) ?? null,
    impactDays: Number(r.impact_days ?? 0), status: r.status as string,
    taskIds: [...new Set([...(r.wbs_task_id ? [r.wbs_task_id as string] : []), ...(linked.get(r.id as string) ?? [])])],
  }));
}

export interface RecoveryRun { inputs: RecoveryInputs; analysis: RecoveryAnalysis; settings: RecoverySettings; targetFinish: string | null; delays: OpenDelay[] }

/** Load, resolve the target and analyse. The same call runs in the browser and in the AI route, so both see identical scenarios. */
export async function runRecovery(db: Db, projectId: string, spec: TargetSpec, settings: RecoverySettings = DEFAULT_RECOVERY_SETTINGS): Promise<RecoveryRun> {
  const inputs = await loadRecoveryInputs(db, projectId);
  // first pass without a target gives the live forecast, needed to resolve "N days earlier"
  const probe = analyseRecovery(inputs.tasks, inputs.cal, inputs.projectStart, null, inputs.alternatives, settings);
  const targetFinish = resolveTarget(spec, probe.liveFinish, inputs.baselineFinish, inputs.cal);
  const analysis = targetFinish ? analyseRecovery(inputs.tasks, inputs.cal, inputs.projectStart, targetFinish, inputs.alternatives, settings) : probe;
  return { inputs, analysis, settings, targetFinish, delays: await loadOpenDelays(db, projectId).catch(() => []) };
}

// ── saved scenarios ──────────────────────────────────────────────────────

export interface SavedScenario {
  id: string; name: string; family_key: string; target_finish: string | null; forecast_finish: string | null; scenario_finish: string | null;
  recovered_wd: number; remaining_gap_wd: number; meets_target: boolean; risk: "low" | "medium" | "high";
  resource_note: string | null; status: "proposed" | "adopted" | "dismissed"; decision_note: string | null; created_at: string;
  levers: { code: string; name: string; label: string; gainWd: number }[];
}

export async function saveRecoveryScenario(
  db: Db, projectId: string, s: Scenario, ctx: { targetFinish: string | null; forecastFinish: string | null; settings: RecoverySettings; aiSuggestionId?: string },
): Promise<string> {
  const { data, error } = await db.from("plan_act_recovery_scenarios").insert({
    project_id: projectId, name: `${s.key} · ${s.name}`, family_key: s.key, target_finish: ctx.targetFinish, forecast_finish: ctx.forecastFinish,
    scenario_finish: s.finish, recovered_wd: s.recoveredWd, remaining_gap_wd: s.remainingGapWd, meets_target: s.meetsTarget, risk: s.risk,
    settings: ctx.settings, levers: s.levers.map((l) => ({ kind: l.kind, taskId: l.taskId, code: l.code, name: l.name, label: l.label, fromWd: l.fromWd, toWd: l.toWd, gainWd: l.gainWd, risk: l.risk })),
    resource_note: s.resourceNote, ai_suggestion_id: ctx.aiSuggestionId ?? null,
  }).select("id").single();
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Saving a recovery scenario requires planning/schedule edit permission." : error.message);
  return (data as { id: string }).id;
}

export async function listRecoveryScenarios(db: Db, projectId: string): Promise<SavedScenario[]> {
  const { data, error } = await db.from("plan_act_recovery_scenarios").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SavedScenario[];
}

export async function setScenarioStatus(db: Db, id: string, status: "adopted" | "dismissed" | "proposed", note?: string): Promise<void> {
  const { error } = await db.from("plan_act_recovery_scenarios").update({
    status, decision_note: note?.trim() || null, decided_at: status === "proposed" ? null : new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);
}
