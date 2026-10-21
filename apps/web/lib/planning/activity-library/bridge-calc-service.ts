// Data access for the bridge calculation (doc 21, Phase 3). The calculation is pure (bridge-calc.ts).
// Apply writes plan_act_quantity_links rows with source "bridge_rule" (RLS: project member + planning/schedule edit),
// replacing the project's previous bridge rows; planner-confirmed rows (source "manual") are never touched.

import type { SupabaseClient } from "@supabase/supabase-js";
import { boqLinkProvider } from "./boq-provider";
import { inChunks } from "./in-chunks";
import type { MasterRate, ProposedLink } from "./bridge-calc";
import { adjustedProductivity, baseOutputPerDay } from "./productivity-engine";

type Db = SupabaseClient;
const CHUNK = 500;

interface NormRow {
  id: string;
  code: string;
  status: "draft" | "approved" | "retired";
  version: number;
  method_id: string | null;
  activity_master_id: string;
  output_per_day: number | null;
  labour_constant_hr_per_unit: number;
  hours_per_day_basis: number | null;
  efficiency_pct: number | null;
}

/**
 * One rate per (master, quantity rule): the productivity standard generation would pick for the master's default
 * method (approved before draft, newest version), adjusted by its factors.
 */
export async function loadMasterRates(db: Db): Promise<MasterRate[]> {
  const { data: masters, error: mErr } = await db
    .from("plan_act_masters")
    .select("id, code, name, status, version, default_unit, default_work_group, duration_basis")
    .in("status", ["draft", "under_review", "approved", "active"]);
  if (mErr) throw new Error(mErr.message);
  // one row per code: the active version, else the newest
  const byCode = new Map<string, Record<string, unknown>>();
  for (const m of (masters ?? []) as Record<string, unknown>[]) {
    const cur = byCode.get(m.code as string);
    if (!cur || (m.status === "active" && cur.status !== "active") || (cur.status !== "active" && (m.version as number) > (cur.version as number))) {
      byCode.set(m.code as string, m);
    }
  }
  const ids = [...byCode.values()].map((m) => m.id as string);
  if (ids.length === 0) return [];

  const [rules, methods, norms] = await Promise.all([
    inChunks<{ master_id: string; metric_code: string; unit: string | null }>(ids, (part) => db.from("plan_act_quantity_rules").select("master_id, metric_code, unit").in("master_id", part)),
    inChunks<{ id: string; master_id: string; is_default: boolean }>(ids, (part) => db.from("plan_act_methods").select("id, master_id, is_default").in("master_id", part)),
    inChunks<NormRow>(ids, (part) => db.from("plan_productivity_norms")
      .select("id, code, status, version, method_id, activity_master_id, output_per_day, labour_constant_hr_per_unit, hours_per_day_basis, efficiency_pct")
      .is("project_id", null)
      .in("activity_master_id", part)
      .neq("status", "retired")),
  ]);

  const normIds = norms.map((n) => n.id);
  const [factorRows, resRows] = await Promise.all([
    inChunks<{ norm_id: string; value: number }>(normIds, (part) => db.from("plan_act_productivity_factors").select("norm_id, value").in("norm_id", part)),
    inChunks<{ norm_id: string; kind: string; workers_per_crew: number; allocation_rule: string }>(normIds, (part) => db.from("plan_productivity_norm_resources").select("norm_id, kind, workers_per_crew, allocation_rule").in("norm_id", part)),
  ]);
  const factors = new Map<string, { value: number }[]>();
  for (const f of factorRows) factors.set(f.norm_id, [...(factors.get(f.norm_id) ?? []), { value: Number(f.value) }]);
  const crew = new Map<string, number>();
  for (const r of resRows) {
    if (r.kind === "labor" && r.allocation_rule === "per_crew") crew.set(r.norm_id, (crew.get(r.norm_id) ?? 0) + Number(r.workers_per_crew));
  }

  const defaultMethod = new Map<string, string>();
  for (const m of methods) if (m.is_default) defaultMethod.set(m.master_id, m.id);
  const rank = (s: NormRow) => (s.status === "approved" ? 0 : 1);

  const out: MasterRate[] = [];
  for (const r of rules) {
    const m = [...byCode.values()].find((x) => x.id === r.master_id);
    if (!m) continue;
    const methodId = defaultMethod.get(r.master_id) ?? null;
    const pool = norms.filter((n) => n.activity_master_id === r.master_id && (methodId ? n.method_id === methodId : !n.method_id));
    const norm = [...pool].sort((a, b) => rank(a) - rank(b) || b.version - a.version)[0] ?? null;
    let output: number | null = null;
    if (norm) {
      const base = baseOutputPerDay({
        output_per_day: norm.output_per_day == null ? null : Number(norm.output_per_day),
        labour_constant_hr_per_unit: Number(norm.labour_constant_hr_per_unit),
        crew_workers: crew.get(norm.id) ?? 0,
        hours_per_day: Number(norm.hours_per_day_basis ?? 8),
        efficiency_pct: Number(norm.efficiency_pct ?? 100),
      });
      output = base == null ? null : adjustedProductivity(base, factors.get(norm.id) ?? []).adjusted;
    }
    out.push({
      master_id: r.master_id,
      master_code: m.code as string,
      master_name: m.name as string,
      metric: r.metric_code,
      unit: (m.default_unit as string | null) ?? r.unit,
      work_group: (m.default_work_group as string | null) ?? null,
      duration_basis: ((m.duration_basis as string) ?? "quantity") as MasterRate["duration_basis"],
      norm_code: norm?.code ?? null,
      norm_status: norm?.status ?? null,
      output_per_day: output,
    });
  }
  const wgOrder = ["EW", "FD", "ST", "WP", "AR", "M1", "M2", "ME", "QA"];
  return out.sort((a, b) => wgOrder.indexOf(a.work_group ?? "") - wgOrder.indexOf(b.work_group ?? "") || a.master_code.localeCompare(b.master_code));
}

/** Level/metric pairs a planner linked by hand: the bridge never writes to them. */
export async function listManualPairs(db: Db, projectId: string): Promise<Set<string>> {
  const { data, error } = await db.from("plan_act_quantity_links").select("wbs_node_id, metric_code").eq("project_id", projectId).eq("source", "manual");
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { wbs_node_id: string; metric_code: string }[]).map((r) => `${r.wbs_node_id}|${r.metric_code}`));
}

export async function countBridgeLinks(db: Db, projectId: string): Promise<{ count: number; at: string | null }> {
  const { data, count, error } = await db
    .from("plan_act_quantity_links")
    .select("confirmed_at", { count: "exact" })
    .eq("project_id", projectId)
    .eq("source", "bridge_rule")
    .order("confirmed_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return { count: count ?? 0, at: (data?.[0] as { confirmed_at?: string } | undefined)?.confirmed_at ?? null };
}

/** Replaces the project's bridge links with `links`. */
export async function applyBridgeLinks(db: Db, projectId: string, links: ProposedLink[]): Promise<number> {
  const { error: delErr } = await db.from("plan_act_quantity_links").delete().eq("project_id", projectId).eq("source", "bridge_rule");
  if (delErr) throw new Error(delErr.message);
  const now = new Date().toISOString();
  const rows = links.map((l) => ({
    project_id: projectId,
    wbs_node_id: l.wbs_node_id,
    metric_code: l.metric_code,
    boq_source: "tender_boq",
    boq_item_id: l.boq_item_id,
    boq_item_ref: l.boq_item_ref,
    boq_description: l.boq_description,
    boq_unit: l.boq_unit,
    boq_quantity_at_link: l.boq_quantity,
    factor: l.factor,
    metric_unit: l.metric_unit,
    source: "bridge_rule",
    bridge_rule_id: l.bridge_rule_id,
    note: "QS Bridge",
    confirmed_at: now,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("plan_act_quantity_links").insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

export interface TaskWorkRefresh {
  updated: number;
  keptManual: number;
  noQuantity: number;
}

/**
 * Existing activities that carry an Activity Master get their level's linked quantity in Task Work (source "import"),
 * so Task Work derives their duration. A quantity typed in by hand (source "manual") is kept.
 */
export async function refreshTaskWorkFromLinks(db: Db, projectId: string, rates: MasterRate[]): Promise<TaskWorkRefresh> {
  const [tasksRes, nodesRes] = await Promise.all([
    db.from("wbs_tasks").select("id, wbs_node_id, activity_master_id").eq("project_id", projectId).not("activity_master_id", "is", null),
    db.from("wbs_nodes").select("id, parent_id, node_type").eq("project_id", projectId),
  ]);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  const tasks = (tasksRes.data ?? []) as { id: string; wbs_node_id: string | null; activity_master_id: string }[];
  if (tasks.length === 0) return { updated: 0, keptManual: 0, noQuantity: 0 };

  const nodes = new Map(((nodesRes.data ?? []) as { id: string; parent_id: string | null; node_type: string }[]).map((n) => [n.id, n]));
  const levelOf = (nodeId: string | null): string | null => {
    for (let id = nodeId, guard = 0; id && guard < 20; guard++) {
      const n = nodes.get(id);
      if (!n) return null;
      if (n.node_type === "level" || n.node_type === "segment") return n.id;
      id = n.parent_id;
    }
    return null;
  };

  const work = await inChunks<{ task_id: string; quantity: number | null; quantity_source: string; norm_id: string | null }>(tasks.map((t) => t.id), (part) =>
    db.from("plan_task_work").select("task_id, quantity, quantity_source, norm_id").in("task_id", part));
  const workByTask = new Map(work.map((w) => [w.task_id, w]));

  const { data: normRows } = await db.from("plan_productivity_norms").select("id, code").is("project_id", null).in("code", rates.map((r) => r.norm_code).filter((c): c is string => !!c));
  const normIdByCode = new Map(((normRows ?? []) as { id: string; code: string }[]).map((n) => [n.code, n.id]));

  const provider = boqLinkProvider(db, projectId);
  let updated = 0, keptManual = 0, noQuantity = 0;
  for (const t of tasks) {
    const rate = rates.find((r) => r.master_id === t.activity_master_id);
    const level = levelOf(t.wbs_node_id);
    const existing = workByTask.get(t.id);
    if (existing?.quantity_source === "manual" && existing.quantity != null) { keptManual++; continue; }
    if (!rate || !level) { noQuantity++; continue; }
    const v = await provider.get(level, rate.metric);
    if (!v) { noQuantity++; continue; }
    const { error } = await db.from("plan_task_work").upsert({
      task_id: t.id,
      project_id: projectId,
      quantity: v.value,
      quantity_unit: v.unit,
      quantity_source: "import",
      quantity_reason: `QS Bridge: ${v.source_ref ?? "BOQ"}`.slice(0, 500),
      norm_id: existing?.norm_id ?? (rate.norm_code ? normIdByCode.get(rate.norm_code) ?? null : null),
    }, { onConflict: "task_id" });
    if (error) throw new Error(error.message);
    updated++;
  }
  return { updated, keptManual, noQuantity };
}
