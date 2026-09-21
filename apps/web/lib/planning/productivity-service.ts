// Data access for productivity norms and task work (Productivity plan, Phase 1).
//
// Tables (migrations 20260922000005/6): plan_productivity_norms (+ _norm_resources), plan_task_work.
// The derived columns on plan_task_work (work_hours, crew_required …) are filled by a database trigger,
// so this module only ever writes INPUTS and reads the results back.

import { createClient } from "@/lib/supabase/client";
import type { CalcStatus, DurationMode } from "./work-engine";
import type { DraftNorm, DwlAssembly, DwlWorkItem } from "./dwl-norm-import";

export type NormStatus = "draft" | "approved" | "retired";
export type NormSource = "manual" | "dwl_work_item" | "dwl_assembly" | "calibrated";

export interface NormCrewLine {
  id?: string;
  kind: "labor" | "equipment";
  role_label: string;
  trade_code: string | null;
  dwl_resource_id: string | null;
  workers_per_crew: number;
  hours_per_day: number | null;
  sort_order: number;
}

export interface Norm {
  id: string;
  project_id: string | null; // null = company library
  code: string;
  name: string;
  trade: string | null;
  discipline: string | null;
  activity_key: string | null;
  unit: string;
  labour_constant_hr_per_unit: number;
  hours_per_day_basis: number;
  efficiency_pct: number;
  source: NormSource;
  dwl_work_item_id: string | null;
  dwl_assembly_id: string | null;
  basis_note: string;
  status: NormStatus;
  approved_by: string | null;
  approved_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  source_norm_id: string | null;
  created_at: string;
  updated_at: string;
  crew: NormCrewLine[];
}

/** The fields a user edits; everything else is managed by the database. */
export interface NormInput {
  code: string;
  name: string;
  trade: string | null;
  discipline: string | null;
  activity_key: string | null;
  unit: string;
  labour_constant_hr_per_unit: number;
  hours_per_day_basis: number;
  efficiency_pct: number;
  source: NormSource;
  dwl_work_item_id: string | null;
  dwl_assembly_id: string | null;
  basis_note: string;
  valid_from: string | null;
  valid_to: string | null;
  source_norm_id: string | null;
}

const num = (v: unknown): number => (v === null || v === undefined ? NaN : Number(v));

function toNorm(row: Record<string, unknown>): Norm {
  const crewRows = (row.plan_productivity_norm_resources as Record<string, unknown>[] | null) ?? [];
  return {
    ...(row as unknown as Norm),
    labour_constant_hr_per_unit: num(row.labour_constant_hr_per_unit),
    hours_per_day_basis: num(row.hours_per_day_basis),
    efficiency_pct: num(row.efficiency_pct),
    crew: crewRows
      .map((c) => ({
        id: c.id as string,
        kind: c.kind as "labor" | "equipment",
        role_label: c.role_label as string,
        trade_code: (c.trade_code as string | null) ?? null,
        dwl_resource_id: (c.dwl_resource_id as string | null) ?? null,
        workers_per_crew: num(c.workers_per_crew),
        hours_per_day: c.hours_per_day == null ? null : num(c.hours_per_day),
        sort_order: Number(c.sort_order ?? 0),
      }))
      .sort((a, b) => a.sort_order - b.sort_order),
  };
}

/** Company norms + the norms of this project, with their crews. */
export async function listNorms(projectId: string): Promise<Norm[]> {
  const { data, error } = await createClient()
    .from("plan_productivity_norms")
    .select("*, plan_productivity_norm_resources(*)")
    .or(`project_id.is.null,project_id.eq.${projectId}`)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toNorm(r as Record<string, unknown>));
}

async function replaceCrew(normId: string, crew: NormCrewLine[]): Promise<void> {
  const supabase = createClient();
  const del = await supabase.from("plan_productivity_norm_resources").delete().eq("norm_id", normId);
  if (del.error) throw new Error(del.error.message);
  if (crew.length === 0) return;
  const ins = await supabase.from("plan_productivity_norm_resources").insert(
    crew.map((c, i) => ({
      norm_id: normId,
      kind: c.kind,
      role_label: c.role_label.trim(),
      trade_code: c.trade_code,
      dwl_resource_id: c.dwl_resource_id,
      workers_per_crew: c.workers_per_crew,
      hours_per_day: c.kind === "equipment" ? c.hours_per_day : null,
      sort_order: i,
    })),
  );
  if (ins.error) throw new Error(ins.error.message);
}

/** Creates a DRAFT norm (company library when `projectId` is null). Returns its id. */
export async function createNorm(projectId: string | null, input: NormInput, crew: NormCrewLine[]): Promise<string> {
  const { data, error } = await createClient()
    .from("plan_productivity_norms")
    .insert({ ...input, project_id: projectId, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(friendly(error.message));
  await replaceCrew(data.id as string, crew);
  return data.id as string;
}

/** Updates a DRAFT norm and replaces its crew. (An approved norm is locked by the database.) */
export async function updateNorm(id: string, input: NormInput, crew: NormCrewLine[]): Promise<void> {
  const { error } = await createClient().from("plan_productivity_norms").update(input).eq("id", id);
  if (error) throw new Error(friendly(error.message));
  await replaceCrew(id, crew);
}

export async function setNormStatus(id: string, status: NormStatus): Promise<void> {
  const { error } = await createClient().from("plan_productivity_norms").update({ status }).eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

export async function deleteNorm(id: string): Promise<void> {
  const { error, count } = await createClient()
    .from("plan_productivity_norms")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(friendly(error.message));
  if (!count) throw new Error("Not deleted — an approved norm must be retired first.");
}

/** A copy as a new DRAFT, in the given scope (a project override keeps the code; the original is `source_norm_id`). */
export async function copyNormAsDraft(
  norm: Norm,
  scopeProjectId: string | null,
  code: string,
): Promise<string> {
  const input: NormInput = {
    code,
    name: norm.name,
    trade: norm.trade,
    discipline: norm.discipline,
    activity_key: norm.activity_key,
    unit: norm.unit,
    labour_constant_hr_per_unit: norm.labour_constant_hr_per_unit,
    hours_per_day_basis: norm.hours_per_day_basis,
    efficiency_pct: norm.efficiency_pct,
    source: norm.source,
    dwl_work_item_id: norm.dwl_work_item_id,
    dwl_assembly_id: norm.dwl_assembly_id,
    basis_note: norm.basis_note,
    valid_from: norm.valid_from,
    valid_to: norm.valid_to,
    source_norm_id: norm.id,
  };
  return createNorm(scopeProjectId, input, norm.crew.map((c) => ({ ...c, id: undefined })));
}

/** Turns a DWL-derived draft into the rows the norm tables need, and saves it as a draft. */
export async function createNormFromDwlDraft(projectId: string | null, d: DraftNorm): Promise<string> {
  const input: NormInput = {
    code: d.code,
    name: d.name,
    trade: null,
    discipline: null,
    activity_key: null,
    unit: d.unit,
    labour_constant_hr_per_unit: d.labourConstantHrPerUnit,
    hours_per_day_basis: d.hoursPerDayBasis,
    efficiency_pct: 100,
    source: d.source,
    dwl_work_item_id: d.dwlWorkItemId,
    dwl_assembly_id: d.dwlAssemblyId,
    basis_note: d.basisNote,
    valid_from: null,
    valid_to: null,
    source_norm_id: null,
  };
  const crew: NormCrewLine[] = d.crew.map((c, i) => ({
    kind: "labor",
    role_label: c.roleLabel,
    trade_code: null,
    dwl_resource_id: c.dwlResourceId,
    workers_per_crew: c.workersPerCrew,
    hours_per_day: null,
    sort_order: i,
  }));
  return createNorm(projectId, input, crew);
}

// ── DWL candidates ───────────────────────────────────────────────────────────
export async function listDwlWorkItemCandidates(): Promise<DwlWorkItem[]> {
  const { data, error } = await createClient()
    .from("dwl_work_item_resources")
    .select(
      "consumption, basis_note, dwl_resources!inner(id, code, description, unit, category), dwl_work_items!inner(id, code, description, unit)",
    )
    .eq("dwl_resources.category", "labor")
    .limit(2000);
  if (error) throw new Error(error.message);

  const items = new Map<string, DwlWorkItem>();
  for (const row of (data ?? []) as unknown as {
    consumption: number | string;
    basis_note: string | null;
    dwl_resources: { id: string; code: string | null; description: string; unit: string };
    dwl_work_items: { id: string; code: string; description: string; unit: string };
  }[]) {
    const wi = row.dwl_work_items;
    let item = items.get(wi.id);
    if (!item) {
      item = { id: wi.id, code: wi.code, description: wi.description, unit: wi.unit, lines: [] };
      items.set(wi.id, item);
    }
    item.lines.push({
      resourceId: row.dwl_resources.id,
      resourceCode: row.dwl_resources.code,
      resourceDescription: row.dwl_resources.description,
      resourceUnit: row.dwl_resources.unit,
      consumption: Number(row.consumption),
      basisNote: row.basis_note,
    });
  }
  return [...items.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export async function listDwlAssemblyCandidates(): Promise<DwlAssembly[]> {
  const supabase = createClient();
  const [costing, crew] = await Promise.all([
    supabase.from("dwl_assembly_costing").select("assembly_id, daily_output, dwl_assemblies!inner(id, code, description, unit)"),
    supabase.from("dwl_assembly_crew").select("assembly_id, resource_id, role_label, quantity"),
  ]);
  if (costing.error) throw new Error(costing.error.message);
  if (crew.error) throw new Error(crew.error.message);

  const crewBy = new Map<string, DwlAssembly["crew"]>();
  for (const c of crew.data ?? []) {
    const list = crewBy.get(c.assembly_id as string) ?? [];
    list.push({ resourceId: c.resource_id as string | null, roleLabel: c.role_label as string, quantity: Number(c.quantity) });
    crewBy.set(c.assembly_id as string, list);
  }
  return ((costing.data ?? []) as unknown as {
    assembly_id: string;
    daily_output: number | string | null;
    dwl_assemblies: { id: string; code: string; description: string; unit: string };
  }[])
    .map((r) => ({
      id: r.dwl_assemblies.id,
      code: r.dwl_assemblies.code,
      description: r.dwl_assemblies.description,
      unit: r.dwl_assemblies.unit,
      dailyOutput: r.daily_output == null ? null : Number(r.daily_output),
      crew: crewBy.get(r.assembly_id) ?? [],
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

// ── task work ────────────────────────────────────────────────────────────────
export interface TaskRow {
  id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean;
}

export interface TaskWork {
  task_id: string;
  quantity: number | null;
  quantity_unit: string | null;
  norm_id: string | null;
  crews: number;
  productivity_adjust_pct: number;
  duration_mode: DurationMode;
  // computed by the database
  work_hours: number | null;
  crew_workers_std: number | null;
  crew_required: number | null;
  crews_required: number | null;
  duration_wd_current: number | null;
  duration_wd_derived: number | null;
  hours_per_day_used: number | null;
  calc_status: CalcStatus;
  calc_message: string | null;
}

/** What the grid writes: inputs only. */
export interface TaskWorkInput {
  task_id: string;
  quantity: number | null;
  quantity_unit: string | null;
  norm_id: string | null;
  crews: number;
  productivity_adjust_pct: number;
  duration_mode: DurationMode;
}

const PAGE = 1000;

export async function listTasksForWork(projectId: string): Promise<TaskRow[]> {
  const supabase = createClient();
  const rows: TaskRow[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("wbs_tasks")
      .select("id, task_code, task_name, discipline, start_date, end_date, is_milestone")
      .eq("project_id", projectId)
      .order("task_code")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as unknown as TaskRow[]).map((t) => ({ ...t, is_milestone: !!t.is_milestone })));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export async function listTaskWork(projectId: string): Promise<TaskWork[]> {
  const supabase = createClient();
  const rows: TaskWork[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("plan_task_work")
      .select("*")
      .eq("project_id", projectId)
      .order("task_id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      rows.push({
        task_id: r.task_id as string,
        quantity: n(r.quantity),
        quantity_unit: (r.quantity_unit as string | null) ?? null,
        norm_id: (r.norm_id as string | null) ?? null,
        crews: Number(r.crews),
        productivity_adjust_pct: Number(r.productivity_adjust_pct),
        duration_mode: r.duration_mode as DurationMode,
        work_hours: n(r.work_hours),
        crew_workers_std: n(r.crew_workers_std),
        crew_required: n(r.crew_required),
        crews_required: n(r.crews_required),
        duration_wd_current: n(r.duration_wd_current),
        duration_wd_derived: n(r.duration_wd_derived),
        hours_per_day_used: n(r.hours_per_day_used),
        calc_status: r.calc_status as CalcStatus,
        calc_message: (r.calc_message as string | null) ?? null,
      });
    }
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

/**
 * Saves the inputs of many tasks. Existing rows are UPDATED and new ones INSERTED separately (an upsert would
 * demand the create right even to edit an existing row). The database trigger computes the derived columns.
 */
export async function saveTaskWork(rows: TaskWorkInput[], existingTaskIds: Set<string>): Promise<{ saved: number }> {
  const supabase = createClient();
  const fresh = rows.filter((r) => !existingTaskIds.has(r.task_id));
  const changed = rows.filter((r) => existingTaskIds.has(r.task_id));

  if (fresh.length > 0) {
    const { error } = await supabase
      .from("plan_task_work")
      .insert(fresh.map((r) => ({ ...r, quantity_source: "manual" })));
    if (error) throw new Error(friendly(error.message));
  }
  for (const r of changed) {
    const { task_id, ...patch } = r;
    const { error } = await supabase.from("plan_task_work").update(patch).eq("task_id", task_id);
    if (error) throw new Error(friendly(error.message));
  }
  return { saved: rows.length };
}

export async function clearTaskWork(taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  const { error } = await createClient().from("plan_task_work").delete().in("task_id", taskIds);
  if (error) throw new Error(friendly(error.message));
}

/** Re-runs the calculation for the whole project (after norms, task dates or calendars changed). */
export async function recomputeProjectWork(projectId: string): Promise<number> {
  const { data, error } = await createClient().rpc("recompute_task_work", { p_project_id: projectId });
  if (error) throw new Error(friendly(error.message));
  return Number(data ?? 0);
}

// ── calendar for client-side previews ────────────────────────────────────────
export async function getProjectCalendarRow(projectId: string) {
  const supabase = createClient();
  const { data: cal, error } = await supabase
    .from("plan_calendars")
    .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday, hours_per_day")
    .eq("project_id", projectId)
    .order("is_default", { ascending: false })
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cal) return { calendar: null, exceptions: [] as { exception_date: string; is_working: boolean }[] };
  const ex = await supabase
    .from("plan_calendar_exceptions")
    .select("exception_date, is_working")
    .eq("calendar_id", cal.id as string);
  return {
    calendar: cal as unknown as import("./work-calendar").PlanCalendarRow,
    exceptions: (ex.data ?? []) as { exception_date: string; is_working: boolean }[],
  };
}

/** Maps the database's guard messages to something a person can act on. */
function friendly(message: string): string {
  if (/row-level security/i.test(message)) return "You do not have permission to do that.";
  if (/duplicate key.*ux_plan_productivity_norms_code/i.test(message)) return "A norm with that code already exists in this scope.";
  return message;
}
