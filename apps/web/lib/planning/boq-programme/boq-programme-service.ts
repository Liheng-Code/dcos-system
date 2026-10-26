// I/O for the BOQ-driven programme (doc 24 phase 2): load everything the pure planner needs, preview, commit through
// plan_boq_commit_programme, then lay the dates out with the whole-project scheduler. Planner rules: boq-programme-planner.ts.
// Lines: contract = qs_boq_items of the project main-works BOQs (no prelims).
//        tender   = lines of ONE tender of the project, so revisions are not counted twice: the awarded tender if there
//        is one, else the most recently created tender that is not cancelled (see pickTender).
// Every .in() goes through inChunks (PostgREST URL limit).

import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages, inChunks } from "../activity-library/in-chunks";
import { listLevelGfa, listSavedLocations, listWbsLevels } from "../activity-library/location-map-service";
import { wbsLevelCanonical, type WbsLevel } from "../activity-library/location-map";
import { runProjectSchedule } from "../project-schedule";
import { applyScheduleDates } from "../planning-queries";
import {
  planBoqProgramme, type BoqProgrammePreview, type ExistingTask, type LinkFact, type LogicRuleFact, type MasterFact,
  type PlannedTask, type PlannerInput, type PlannerLine, type ResourceFact,
} from "./boq-programme-planner";
import type { ReadinessSource } from "./readiness-service";

type Db = SupabaseClient;

export type ProgrammeSource = ReadinessSource;

export interface LoadOptions {
  source: ProgrammeSource;
  defaultCrew?: number;
  /** Working days; default derived from the project's start and end dates (Mon-Sat). */
  projectDurationDays?: number | null;
}

export interface ProgrammePreview extends BoqProgrammePreview {
  projectId: string;
  source: ProgrammeSource;
  /** projects.start_date, used by the commit when none is given. */
  projectStart: string | null;
  projectDurationDays: number | null;
  /** Tasks in the project that have started (progress > 0 or actual dates). Scheduling defaults to off when > 0. */
  startedTaskCount: number;
}

export interface CommitResult {
  runId: string;
  created: number;
  updated: number;
  skippedStarted: number;
  skippedLocked: number;
  cleared: number;
  /** From the RPC: tasks whose manually entered work was kept. */
  keptManualWork: number;
  /** From the RPC: tasks it skipped because the payload flagged them. */
  skippedFlagged: number;
  /** payload key (masterId|nodeId) -> task id */
  taskIds: Record<string, string>;
}

export type ScheduleSkipReason = "disabled" | "started_tasks" | "no_start_date" | "cycle" | "error";

/** `ran` says whether dates were calculated; when not, `reason` and `note` say why. */
export type ScheduleOutcome =
  | { ran: true; start: string; finish: string; workingDays: number; criticalCount: number; changed: number; projectStartUpdated: boolean }
  | { ran: false; reason: ScheduleSkipReason; note: string; cycle?: string[] };

export interface CommitProgrammeResult { commit: CommitResult; schedule: ScheduleOutcome }

const CURRENT_EXCLUDED = "(superseded,archived)";

// ---------------------------------------------------------------- loaders

interface TenderRec { id: string; item_code: string; description: string; unit: string | null; quantity: number | string; total_amount: number | string | null; building_code: string | null; level: string | null; dwl_work_item_id: string | null }
interface ContractRec { id: string; item_code: string | null; item_no: string | null; description: string; unit: string | null; quantity: number | string | null; total_amount: number | string | null; building_code: string | null; level: string | null; dwl_work_item_id: string | null }

async function loadLines(db: Db, projectId: string, source: ProgrammeSource): Promise<PlannerLine[]> {
  if (source === "tender") {
    const { data: tenders, error } = await db.from("tender_register").select("id, status, created_at").eq("project_id", projectId);
    if (error) throw new Error(error.message);
    const chosen = pickTender((tenders ?? []) as { id: string; status: string; created_at: string }[]);
    const out: PlannerLine[] = [];
    for (const t of chosen ? [{ id: chosen }] : []) {
      const rows = await allPages<TenderRec>((from, to) =>
        db.from("tender_boq_items").select("id, item_code, description, unit, quantity, total_amount, building_code, level, dwl_work_item_id")
          .eq("tender_id", t.id).order("id").range(from, to));
      for (const r of rows) {
        out.push({
          id: r.id, source, qty: Number(r.quantity) || 0, amount: Number(r.total_amount) || 0, workItemId: r.dwl_work_item_id,
          building: r.building_code, level: r.level, itemCode: r.item_code, description: r.description, unit: r.unit,
        });
      }
    }
    return out;
  }
  const rows = await allPages<ContractRec>((from, to) =>
    db.from("qs_boq_items")
      .select("id, item_code, item_no, description, unit, quantity, total_amount, building_code, level, dwl_work_item_id, qs_boq_sections!inner(qs_boq!inner(boq_type))")
      .eq("project_id", projectId).eq("qs_boq_sections.qs_boq.boq_type", "main_works").order("id").range(from, to) as never);
  return rows.map((r) => ({
    id: r.id, source, qty: Number(r.quantity) || 0, amount: Number(r.total_amount) || 0, workItemId: r.dwl_work_item_id,
    building: r.building_code, level: r.level, itemCode: r.item_code ?? r.item_no ?? "", description: r.description, unit: r.unit,
  }));
}

async function loadLinks(db: Db, workItemIds: readonly string[]): Promise<Map<string, LinkFact[]>> {
  const rows = await inChunks<{ work_item_id: string; master_id: string; share_pct: number | string; duration_days_per_unit: number | string | null }>(
    [...new Set(workItemIds)],
    (p) => db.from("plan_act_master_work_items")
      .select("work_item_id, master_id, share_pct, duration_days_per_unit, plan_act_masters!inner(status)")
      .in("work_item_id", p).not("plan_act_masters.status", "in", CURRENT_EXCLUDED) as never,
  );
  const out = new Map<string, LinkFact[]>();
  for (const r of rows) {
    const list = out.get(r.work_item_id) ?? [];
    list.push({ masterId: r.master_id, sharePct: Number(r.share_pct), daysPerUnit: r.duration_days_per_unit === null ? null : Number(r.duration_days_per_unit) });
    out.set(r.work_item_id, list);
  }
  return out;
}

async function loadResources(db: Db, workItemIds: readonly string[]): Promise<Map<string, ResourceFact[]>> {
  type Rec = { work_item_id: string; resource_id: string; consumption: number | string; dwl_resources: { description: string; category: string; unit: string | null } | { description: string; category: string; unit: string | null }[] | null };
  const rows = await inChunks<Rec>(
    [...new Set(workItemIds)],
    (p) => db.from("dwl_work_item_resources").select("work_item_id, resource_id, consumption, dwl_resources!inner(description, category, unit)")
      .in("work_item_id", p).in("dwl_resources.category", ["labor", "equipment"]) as never,
  );
  const out = new Map<string, ResourceFact[]>();
  for (const r of rows) {
    const res = Array.isArray(r.dwl_resources) ? r.dwl_resources[0] : r.dwl_resources;
    if (!res) continue;
    const list = out.get(r.work_item_id) ?? [];
    list.push({ resourceId: r.resource_id, name: res.description, kind: res.category === "equipment" ? "equipment" : "labor", unit: res.unit, perUnit: Number(r.consumption) });
    out.set(r.work_item_id, list);
  }
  return out;
}

async function loadMasters(db: Db, ids: readonly string[]): Promise<Map<string, MasterFact>> {
  const rows = await inChunks<{
    id: string; code: string; visible_code: string | null; name: string; csi_division_code: string | null; default_unit: string | null;
    crew_size: number | null; hours_per_day: number | string | null; min_duration_pct: number | string | null; max_duration_pct: number | string | null;
  }>([...new Set(ids)], (p) =>
    db.from("plan_act_masters")
      .select("id, code, visible_code, name, csi_division_code, default_unit, crew_size, hours_per_day, min_duration_pct, max_duration_pct").in("id", p));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return new Map(rows.map((m) => [m.id, {
    code: m.code, visibleCode: m.visible_code, name: m.name, csiDivision: m.csi_division_code, unit: m.default_unit,
    crewSize: n(m.crew_size), hoursPerDay: n(m.hours_per_day), minPct: n(m.min_duration_pct), maxPct: n(m.max_duration_pct),
  }]));
}

async function loadLogicRules(db: Db, masterIds: readonly string[]): Promise<LogicRuleFact[]> {
  const rows = await inChunks<{ predecessor_master_id: string; successor_master_id: string; relation: string; lag_days: number | string }>(
    [...new Set(masterIds)], (p) => db.from("plan_act_logic_rules").select("predecessor_master_id, successor_master_id, relation, lag_days").in("successor_master_id", p));
  const set = new Set(masterIds);
  return rows.filter((r) => set.has(r.predecessor_master_id)).map((r) => ({
    predMasterId: r.predecessor_master_id, succMasterId: r.successor_master_id, relation: r.relation, lagDays: Number(r.lag_days) || 0,
  }));
}

interface NodeRec { id: string; parent_id: string | null; is_locked: boolean | null }
interface TaskRec {
  id: string; wbs_node_id: string; activity_master_id: string | null; task_name: string; progress: number | string | null;
  sort_order: number | string | null; duration_days: number | string | null; budget_cost: number | string | null;
  actual_start_date: string | null; started_at: string | null;
}

async function loadExistingTasks(
  db: Db, projectId: string, levelIds: ReadonlySet<string>, manager: boolean,
): Promise<{ tasks: ExistingTask[]; lockedNodes: Set<string> }> {
  const [nodes, tasks] = await Promise.all([
    allPages<NodeRec>((from, to) => db.from("wbs_nodes").select("id, parent_id, is_locked").eq("project_id", projectId).order("id").range(from, to)),
    allPages<TaskRec>((from, to) =>
      db.from("wbs_tasks").select("id, wbs_node_id, activity_master_id, task_name, progress, sort_order, duration_days, budget_cost, actual_start_date, started_at")
        .eq("project_id", projectId).not("activity_master_id", "is", null).order("id").range(from, to)),
  ]);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // effective lock = the node or any ancestor is locked (wbs_node_effectively_locked); a WBS manager may edit anyway
  const lockedNodes = new Set<string>();
  if (!manager) {
    for (const n of nodes) {
      const seen = new Set<string>();
      for (let cur: NodeRec | undefined = n; cur && !seen.has(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
        seen.add(cur.id);
        if (cur.is_locked) { lockedNodes.add(n.id); break; }
      }
    }
  }
  const mapped = tasks.map((t) => {
    let floor: string | null = null;
    const locked = lockedNodes.has(t.wbs_node_id);
    const seen = new Set<string>();
    for (let cur = byId.get(t.wbs_node_id); cur && !seen.has(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      seen.add(cur.id);
      if (floor === null && levelIds.has(cur.id)) floor = cur.id;
    }
    return {
      id: t.id, nodeId: t.wbs_node_id, floorNodeId: floor, masterId: t.activity_master_id, name: t.task_name,
      progress: Number(t.progress) || 0, started: !!(t.actual_start_date || t.started_at), locked, sortOrder: Number(t.sort_order) || 0,
      durationDays: t.duration_days === null ? null : Number(t.duration_days), budgetCost: t.budget_cost === null ? null : Number(t.budget_cost),
    };
  });
  return { tasks: mapped, lockedNodes };
}

/** Tasks of the project that have started: progress above 0, or an actual start / finish date. */
async function countStartedTasks(db: Db, projectId: string): Promise<number> {
  const { count, error } = await db.from("wbs_tasks").select("id", { count: "exact", head: true })
    .eq("project_id", projectId).or("progress.gt.0,actual_start_date.not.is.null,actual_finish_date.not.is.null");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const MISSING_RELATION_RE = /does not exist|could not find the table|schema cache/i;

/** Task ids that hold plan_task_boq_lines rows now. Only a missing table counts as "none yet"; other errors are thrown. */
async function loadBoqTaskIds(db: Db, projectId: string): Promise<string[]> {
  try {
    const rows = await allPages<{ task_id: string }>((from, to) =>
      db.from("plan_task_boq_lines").select("task_id").eq("project_id", projectId).order("id").range(from, to));
    return [...new Set(rows.map((r) => r.task_id))];
  } catch (e) {
    if (e instanceof Error && MISSING_RELATION_RE.test(e.message)) return [];
    throw e;
  }
}

/** True when the signed-in user may edit locked WBS nodes (is_wbs_manager). A failed check counts as "no". */
async function isWbsManager(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc("is_wbs_manager");
  return !error && data === true;
}

/**
 * The tender whose lines drive the programme. tender_register has no revision link, so: the awarded tender of the
 * project if there is one; otherwise the most recently created tender that is not cancelled. Earlier revisions
 * (and cancelled ones) are ignored so their lines are not counted twice.
 */
export function pickTender(tenders: readonly { id: string; status: string; created_at: string }[]): string | null {
  const live = tenders.filter((t) => t.status !== "cancelled");
  const awarded = live.filter((t) => t.status === "awarded");
  const pool = awarded.length ? awarded : live;
  return [...pool].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0]?.id ?? null;
}

/** Level nodes in building order: building, then basements first and the roof last. */
export function orderFloors(levels: readonly WbsLevel[]): string[] {
  return [...levels]
    .sort((a, b) => {
      const ba = (a.building_code ?? "").localeCompare(b.building_code ?? "");
      if (ba) return ba;
      const ra = wbsLevelCanonical(a)?.rank ?? 500;
      const rb = wbsLevelCanonical(b)?.rank ?? 500;
      return ra - rb || a.wbs_code.localeCompare(b.wbs_code, undefined, { numeric: true });
    })
    .map((l) => l.id);
}

/** Working days between two dates, counting Mon-Sat (the DCOS default week). */
export function workingDaysBetween(start: string, end: string): number | null {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  const days = Math.round((b - a) / 86400000) + 1;
  return Math.max(1, Math.round((days * 6) / 7));
}

/** Everything the planner needs for a project, ready for planBoqProgramme. */
export async function loadPlannerInput(
  db: Db, projectId: string, opts: LoadOptions,
): Promise<{ input: PlannerInput; projectStart: string | null; startedTaskCount: number }> {
  const [lines, locations, levels, gfaByNode, boqTaskIds, project, manager, startedTaskCount] = await Promise.all([
    loadLines(db, projectId, opts.source),
    listSavedLocations(db, projectId),
    listWbsLevels(db, projectId),
    listLevelGfa(db, projectId),
    loadBoqTaskIds(db, projectId),
    db.from("projects").select("start_date, end_date").eq("id", projectId).maybeSingle(),
    isWbsManager(db),
    countStartedTasks(db, projectId),
  ]);
  const workItemIds = lines.map((l) => l.workItemId).filter((x): x is string => !!x);
  const [linksByWorkItem, resourcesByWorkItem] = await Promise.all([loadLinks(db, workItemIds), loadResources(db, workItemIds)]);
  const masterIds = [...new Set([...linksByWorkItem.values()].flatMap((l) => l.map((x) => x.masterId)))];
  const [masters, logicRules, existing] = await Promise.all([
    loadMasters(db, masterIds),
    loadLogicRules(db, masterIds),
    loadExistingTasks(db, projectId, new Set(levels.map((l) => l.id)), manager),
  ]);
  const p = (project.data ?? null) as { start_date: string | null; end_date: string | null } | null;
  const duration = opts.projectDurationDays !== undefined ? opts.projectDurationDays : p?.start_date && p?.end_date ? workingDaysBetween(p.start_date, p.end_date) : null;
  return {
    projectStart: p?.start_date ?? null,
    startedTaskCount,
    input: {
      lines, locations, levels, gfaByNode, linksByWorkItem, resourcesByWorkItem, masters, existingTasks: existing.tasks,
      nodeBuilding: new Map(levels.map((l) => [l.id, l.building_code])), lockedNodes: existing.lockedNodes,
      existingBoqTaskIds: boqTaskIds, logicRules, floorOrder: orderFloors(levels), projectDurationDays: duration, defaultCrew: opts.defaultCrew,
    },
  };
}

/** Writes nothing: what the BOQ would turn into. */
export async function previewBoqProgramme(db: Db, projectId: string, opts: LoadOptions): Promise<ProgrammePreview> {
  const { input, projectStart, startedTaskCount } = await loadPlannerInput(db, projectId, opts);
  return {
    ...planBoqProgramme(input), projectId, source: opts.source, projectStart, startedTaskCount,
    projectDurationDays: input.projectDurationDays ?? null,
  };
}

// ---------------------------------------------------------------- commit

export interface CommitTaskPayload {
  key: string;
  existing_task_id: string | null;
  wbs_node_id: string;
  task_name: string;
  activity_master_id: string;
  duration_days: number;
  budget_cost: number;
  quantity: number;
  unit: string | null;
  predecessors: { key: string | null; task_id: string | null; type: "FS" | "SS" | "FF" | "SF"; lag_days: number }[];
  boq_lines: { tender_boq_item_id: string | null; qs_boq_item_id: string | null; share_pct: number; quantity: number; amount: number }[];
  resource_hours: { dwl_resource_id: string; kind: "labor" | "equipment"; hours: number }[];
  /** The RPC leaves a flagged task untouched. */
  skip?: "started" | "locked";
}

export interface CommitPayload {
  project_id: string;
  source: ProgrammeSource;
  project_start?: string;
  tasks: CommitTaskPayload[];
  clear_task_ids: string[];
}

/** The RPC payload for a preview. Skipped (started / locked) tasks are included so the database can count them. */
export function buildCommitPayload(preview: ProgrammePreview, opts: { projectStart?: string | null } = {}): CommitPayload {
  const toTask = (t: PlannedTask): CommitTaskPayload => ({
    key: t.key,
    existing_task_id: t.existingTaskId,
    wbs_node_id: t.nodeId,
    task_name: t.name,
    activity_master_id: t.masterId,
    duration_days: t.durationDays,
    budget_cost: t.budget,
    quantity: t.quantity,
    unit: t.unit,
    predecessors: t.predecessors.map((p) => ({ key: p.key, task_id: p.taskId, type: p.type.toUpperCase() as "FS" | "SS" | "FF" | "SF", lag_days: p.lagDays })),
    boq_lines: t.boqLines.map((l) => ({
      tender_boq_item_id: l.source === "tender" ? l.lineId : null,
      qs_boq_item_id: l.source === "contract" ? l.lineId : null,
      share_pct: l.sharePct, quantity: l.quantity, amount: l.amount,
    })),
    resource_hours: t.resourceHours.map((h) => ({ dwl_resource_id: h.resourceId, kind: h.kind, hours: h.hours })),
    ...(t.action === "skip_started" ? { skip: "started" as const } : t.action === "skip_locked" ? { skip: "locked" as const } : {}),
  });
  const start = opts.projectStart ?? preview.projectStart;
  return {
    project_id: preview.projectId,
    source: preview.source,
    ...(start ? { project_start: start } : {}),
    tasks: preview.tasks.map(toTask),
    clear_task_ids: preview.clear,
  };
}

const CHUNK = 500;

/**
 * Calculates dates for the whole project from `start`. The project start date is only stored when `setProjectStart`
 * is true; otherwise the dates are applied without touching projects.start_date.
 */
async function scheduleAfterCommit(projectId: string, start: string | null, setProjectStart: boolean): Promise<ScheduleOutcome> {
  if (!start) {
    return { ran: false, reason: "no_start_date", note: "The project has no start date, so dates were not calculated. Set a start date and run Schedule." };
  }
  try {
    const r = setProjectStart
      ? await runProjectSchedule(projectId, start)
      : await runProjectSchedule(projectId, start, { dryRun: true });
    if (!r.ok) {
      return { ran: false, reason: "cycle", cycle: r.cycle, note: "The task links form a loop, so dates were not calculated. Fix the loop and run Schedule." };
    }
    if (!setProjectStart) {
      for (let i = 0; i < r.rows.length; i += CHUNK) {
        const { error } = await applyScheduleDates({ p_project_id: projectId, p_rows: r.rows.slice(i, i + CHUNK) });
        if (error) throw new Error(error.message);
      }
    }
    return { ran: true, start: r.start, finish: r.finish, workingDays: r.workingDays, criticalCount: r.criticalCount, changed: r.changed, projectStartUpdated: setProjectStart };
  } catch (e) {
    return {
      ran: false, reason: "error",
      note: `Tasks were saved but dates could not be calculated (${e instanceof Error ? e.message : String(e)}). Run Schedule from the WBS builder.`,
    };
  }
}

export interface CommitOptions {
  /** Start used for new tasks and for scheduling; default projects.start_date. */
  projectStart?: string | null;
  /**
   * Calculate dates for the whole project after the commit. Default: true, but false when the project already has
   * started tasks (preview.startedTaskCount > 0), because a re-schedule moves every unlocked task. Pass true to force.
   */
  schedule?: boolean;
  /** Also store projectStart as projects.start_date. Default false. */
  setProjectStart?: boolean;
}

/**
 * Commits a preview in one transaction (plan_boq_commit_programme), then optionally calculates dates with the
 * whole-project scheduler (see CommitOptions). `schedule.ran` tells whether it ran, and if not, why. The scheduler uses
 * the browser Supabase client, so outside the app it comes back as ran:false with reason 'error'.
 */
export async function commitBoqProgramme(
  db: Db, projectId: string, preview: ProgrammePreview, opts: CommitOptions = {},
): Promise<CommitProgrammeResult> {
  if (preview.projectId !== projectId) throw new Error("This preview belongs to another project.");
  const payload = buildCommitPayload(preview, opts);
  const { data, error } = await db.rpc("plan_boq_commit_programme", { p: payload });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as {
    run_id: string; created: number; updated: number; skipped_started: number; skipped_locked: number; cleared: number;
    kept_manual_work?: number; skipped_flagged?: number; task_ids: Record<string, string>;
  };
  const commit: CommitResult = {
    runId: r.run_id, created: r.created, updated: r.updated, skippedStarted: r.skipped_started, skippedLocked: r.skipped_locked,
    cleared: r.cleared, keptManualWork: r.kept_manual_work ?? 0, skippedFlagged: r.skipped_flagged ?? 0, taskIds: r.task_ids ?? {},
  };

  const hasStarted = preview.startedTaskCount > 0;
  const wantSchedule = opts.schedule ?? !hasStarted;
  let schedule: ScheduleOutcome;
  if (!wantSchedule) {
    schedule = opts.schedule === false
      ? { ran: false, reason: "disabled", note: "Dates were not calculated (turned off)." }
      : {
          ran: false, reason: "started_tasks",
          note: `${preview.startedTaskCount} task(s) have started, so dates were not recalculated automatically. Run Schedule when you are ready.`,
        };
  } else {
    schedule = await scheduleAfterCommit(projectId, opts.projectStart ?? preview.projectStart, opts.setProjectStart === true);
  }
  return { commit, schedule };
}
