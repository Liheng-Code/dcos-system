// BIM quantity provider - data access (Phase 3.4, Planning side). Reads bim_models / bim_element_takeoff (owned by
// Design/BIM) and the two planning tables from migration 20261013000001. Nothing here writes to the BIM tables.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateBim, bimLevelKey, coverageByClass, STRUCTURAL_CLASSES, suggestLevelMap,
  type BimElementRow, type BimMetricRule, type ClassCoverage, type LevelSuggestion,
} from "./bim-quantity";
import type { QuantityProvider } from "./quantity-resolver";

type Db = SupabaseClient;

export interface BimModelLite {
  id: string;
  model_name: string;
  discipline: string;
  revision: string;
  status: string;
  element_count: number;
}

export async function listProjectModels(db: Db, projectId: string): Promise<BimModelLite[]> {
  const { data, error } = await db.from("bim_models").select("id, model_name, discipline, revision, status, element_count")
    .eq("project_id", projectId).eq("status", "CURRENT").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BimModelLite[];
}

const PAGE = 1000;

/** Structural elements of a model (the only classes Planning reads), paged past the 1000-row cap. */
export async function loadModelElements(db: Db, modelId: string): Promise<BimElementRow[]> {
  const out: BimElementRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("bim_element_takeoff").select("ifc_class, unit, quantity, level, building_level, extra:raw_properties->_quantities")
      .eq("model_id", modelId).in("ifc_class", [...STRUCTURAL_CLASSES]).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows.map((r) => ({
      ifc_class: (r.ifc_class as string | null) ?? null, unit: (r.unit as string | null) ?? null,
      quantity: r.quantity == null ? null : Number(r.quantity), level: (r.level as string | null) ?? null,
      building_level: (r.building_level as string | null) ?? null,
      extra: r.extra && typeof r.extra === "object" ? (r.extra as Record<string, number>) : null,
    })));
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function listMetricMap(db: Db): Promise<(BimMetricRule & { id: string; note: string | null })[]> {
  const { data, error } = await db.from("plan_act_bim_metric_map").select("id, metric_code, ifc_class, unit, note").order("metric_code");
  if (error) throw new Error(error.message);
  return (data ?? []) as (BimMetricRule & { id: string; note: string | null })[];
}

export interface LevelMapRow { id: string; model_id: string; bim_level: string; wbs_node_id: string }

export async function listLevelMap(db: Db, projectId: string, modelId?: string): Promise<LevelMapRow[]> {
  let q = db.from("plan_act_bim_level_map").select("id, model_id, bim_level, wbs_node_id").eq("project_id", projectId);
  if (modelId) q = q.eq("model_id", modelId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as LevelMapRow[];
}

/** Replace the storey -> WBS level mapping of one model with the planner's confirmed choices. */
export async function saveLevelMap(db: Db, projectId: string, modelId: string, entries: { bim_level: string; wbs_node_id: string }[]): Promise<void> {
  const keep = new Set(entries.map((e) => e.bim_level));
  const existing = await listLevelMap(db, projectId, modelId);
  const drop = existing.filter((e) => !keep.has(e.bim_level)).map((e) => e.id);
  if (drop.length) {
    const { error } = await db.from("plan_act_bim_level_map").delete().in("id", drop);
    if (error) throw new Error(error.message);
  }
  if (entries.length) {
    const { error } = await db.from("plan_act_bim_level_map").upsert(
      entries.map((e) => ({ project_id: projectId, model_id: modelId, bim_level: e.bim_level, wbs_node_id: e.wbs_node_id })),
      { onConflict: "model_id,bim_level" },
    );
    if (error) throw new Error(error.message);
  }
}

export interface ModelReport {
  model: BimModelLite;
  coverage: ClassCoverage[];
  /** distinct storey labels with the number of usable elements on each */
  storeys: { label: string; elements: number }[];
  suggestions: LevelSuggestion[];
}

export async function modelReport(db: Db, model: BimModelLite, nodes: { id: string; name: string }[]): Promise<ModelReport> {
  const rows = await loadModelElements(db, model.id);
  const counts = new Map<string, number>();
  for (const r of rows) { const k = bimLevelKey(r); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const storeys = [...counts.entries()].map(([label, elements]) => ({ label, elements })).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return { model, coverage: coverageByClass(rows), storeys, suggestions: suggestLevelMap(storeys.map((s) => s.label), nodes) };
}

/**
 * QuantityProvider "bim": for a WBS node and metric, sum the usable elements (quantity > 0 and a storey) of the mapped
 * IFC classes on the BIM storeys the planner mapped to that node. A class below the coverage threshold is ignored, so a
 * half-extracted model can never silently under-count; the engine then falls through to BOQ / manual / calculated.
 */
export function bimProvider(db: Db, projectId: string): QuantityProvider {
  let setup: Promise<{ rules: BimMetricRule[]; map: LevelMapRow[]; models: Map<string, BimModelLite> }> | null = null;
  const rowsCache = new Map<string, Promise<{ rows: BimElementRow[]; ready: Set<string> }>>();

  const load = () => (setup ??= (async () => {
    const [rules, map, models] = await Promise.all([listMetricMap(db), listLevelMap(db, projectId), listProjectModels(db, projectId)]);
    return { rules, map, models: new Map(models.map((m) => [m.id, m])) };
  })());
  const modelRows = (modelId: string) => {
    if (!rowsCache.has(modelId)) {
      rowsCache.set(modelId, (async () => {
        const rows = await loadModelElements(db, modelId);
        return { rows, ready: new Set(coverageByClass(rows).filter((c) => c.ready).map((c) => c.ifc_class)) };
      })());
    }
    return rowsCache.get(modelId)!;
  };

  return {
    key: "bim",
    get: async (nodeId, metric) => {
      const { rules, map, models } = await load();
      const mapped = map.filter((m) => m.wbs_node_id === nodeId && models.has(m.model_id));
      const metricRules = rules.filter((r) => r.metric_code === metric);
      if (!mapped.length || !metricRules.length) return null;

      let total = 0;
      let elements = 0;
      let unit: string | null = null;
      const refs: string[] = [];
      for (const modelId of [...new Set(mapped.map((m) => m.model_id))]) {
        const { rows, ready } = await modelRows(modelId);
        const usable = metricRules.filter((r) => ready.has(r.ifc_class.toUpperCase()));
        const agg = aggregateBim(rows, usable, new Set(mapped.filter((m) => m.model_id === modelId).map((m) => m.bim_level)));
        if (!agg) continue;
        total += agg.value; elements += agg.elements; unit = unit ?? agg.unit;
        const model = models.get(modelId)!;
        refs.push(`BIM ${model.model_name} ${model.revision}: ${agg.elements} element${agg.elements === 1 ? "" : "s"}`);
      }
      return elements === 0 ? null : { value: Math.round(total * 1000) / 1000, unit, source_ref: refs.join(" + ") };
    },
  };
}
