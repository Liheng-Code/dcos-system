// Productivity learning - data access (Phase 3.3). Reads the site productivity logs behind one standard and, on request,
// writes a PROPOSED new version as a draft. Approval stays with the norms approval permission (Planning Manager).
// Visibility follows RLS: a user sees the logs of the projects they belong to, so statistics reflect what they can see.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_THRESHOLDS, summariseHistory, type HistoryLog, type HistoryStats, type LearningThresholds, type Proposal } from "./productivity-learning";
import type { ActProductivityStandard } from "./types";

type Db = SupabaseClient;

const CHUNK = 150;

async function inChunks<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await run(ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** Logs recorded against tasks that used this standard (or a project copy calibrated from it). */
export async function loadStandardHistory(db: Db, stdId: string): Promise<HistoryLog[]> {
  const { data: derived, error: de } = await db.from("plan_productivity_norms").select("id").eq("source_norm_id", stdId);
  if (de) throw new Error(de.message);
  const normIds = [stdId, ...((derived ?? []) as { id: string }[]).map((d) => d.id)];

  const work = await inChunks<{ task_id: string }>(normIds, (part) => db.from("plan_task_work").select("task_id").in("norm_id", part));
  const taskIds = [...new Set(work.map((w) => w.task_id))];
  if (!taskIds.length) return [];

  const [logs, tasks] = await Promise.all([
    inChunks<Record<string, unknown>>(taskIds, (part) =>
      db.from("plan_productivity_logs").select("id, project_id, task_id, log_date, quantity_done, actual_hours, productivity_index, pi_status").in("task_id", part)),
    inChunks<{ id: string; wbs_node_id: string | null }>(taskIds, (part) => db.from("wbs_tasks").select("id, wbs_node_id").in("id", part)),
  ]);
  const nodeOf = new Map(tasks.map((t) => [t.id, t.wbs_node_id]));
  const num = (v: unknown) => (v == null ? null : Number(v));
  return logs.map((l) => ({
    id: l.id as string, project_id: l.project_id as string, location_id: nodeOf.get(l.task_id as string) ?? null,
    log_date: l.log_date as string, quantity_done: num(l.quantity_done), actual_hours: num(l.actual_hours),
    productivity_index: num(l.productivity_index), pi_status: l.pi_status as string,
  }));
}

export async function standardHistoryStats(db: Db, stdId: string, th: LearningThresholds = DEFAULT_THRESHOLDS): Promise<HistoryStats> {
  return summariseHistory(await loadStandardHistory(db, stdId), th);
}

/**
 * Create the proposed next version of an APPROVED standard as a company draft: same activity, method, crew and factors,
 * observed labour constant and output. The previous version stays in force until a manager approves the new one.
 */
export async function createCalibratedVersion(db: Db, std: ActProductivityStandard, proposal: Proposal): Promise<string> {
  if (std.status !== "approved") throw new Error("Only an approved standard can be calibrated from site logs");
  const { data: row, error } = await db.from("plan_productivity_norms").select("*").eq("id", std.id).single();
  if (error) throw new Error(error.message);
  const n = row as Record<string, unknown>;
  const baseCode = String(n.code).replace(/-V\d+$/i, "");
  const { data: created, error: ce } = await db.from("plan_productivity_norms").insert({
    project_id: null, code: `${baseCode}-V${proposal.nextVersion}`, name: n.name, trade: n.trade, discipline: n.discipline,
    activity_key: n.activity_key, unit: n.unit, labour_constant_hr_per_unit: proposal.labour_constant_hr_per_unit,
    hours_per_day_basis: n.hours_per_day_basis, efficiency_pct: n.efficiency_pct, source: "calibrated",
    basis_note: proposal.basisNote, status: "draft", source_norm_id: std.id, version: proposal.nextVersion,
    activity_master_id: n.activity_master_id, method_id: n.method_id, output_per_day: proposal.output_per_day,
  }).select("id").single();
  if (ce) {
    throw new Error(/row-level security/i.test(ce.message) ? "You do not have permission to create company productivity standards (planning/norms)." : ce.message);
  }
  const newId = (created as { id: string }).id;

  const { data: res } = await db.from("plan_productivity_norm_resources").select("*").eq("norm_id", std.id);
  if (res?.length) {
    const rows = (res as Record<string, unknown>[]).map(({ id: _i, created_at: _c, ...r }) => { void _i; void _c; return { ...r, norm_id: newId }; });
    const { error: re } = await db.from("plan_productivity_norm_resources").insert(rows);
    if (re) throw new Error(re.message);
  }
  const { data: fac } = await db.from("plan_act_productivity_factors").select("*").eq("norm_id", std.id);
  if (fac?.length) {
    const rows = (fac as Record<string, unknown>[]).map(({ id: _i, created_at: _c, ...r }) => { void _i; void _c; return { ...r, norm_id: newId }; });
    const { error: fe } = await db.from("plan_act_productivity_factors").insert(rows);
    if (fe) throw new Error(fe.message);
  }
  return newId;
}
