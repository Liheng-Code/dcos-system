// Extra facts the preview screen shows next to the planner output: location names and floor order, master CSI divisions,
// the current duration / budget of tasks that would be updated, and (on demand) the BOQ lines behind a task.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inChunks } from "../activity-library/in-chunks";
import { listWbsLevels } from "../activity-library/location-map-service";
import { orderFloors, type ProgrammePreview, type ProgrammeSource } from "./boq-programme-service";

type Db = SupabaseClient;

export interface PreviewContext {
  floorOrder: string[];
  nodeName: Map<string, string>;
  masterDivision: Map<string, string | null>;
  /** existing task id -> current values */
  existing: Map<string, { durationDays: number | null; budget: number | null }>;
}

export async function loadPreviewContext(db: Db, projectId: string, preview: ProgrammePreview): Promise<PreviewContext> {
  const nodeIds = [...new Set(preview.tasks.map((t) => t.nodeId))];
  const masterIds = [...new Set(preview.tasks.map((t) => t.masterId))];
  const existingIds = preview.tasks.map((t) => t.existingTaskId).filter((x): x is string => !!x);
  const [levels, nodes, masters, tasks] = await Promise.all([
    listWbsLevels(db, projectId),
    inChunks<{ id: string; wbs_code: string; wbs_name: string }>(nodeIds, (p) => db.from("wbs_nodes").select("id, wbs_code, wbs_name").in("id", p)),
    inChunks<{ id: string; csi_division_code: string | null }>(masterIds, (p) => db.from("plan_act_masters").select("id, csi_division_code").in("id", p)),
    inChunks<{ id: string; duration_days: number | string | null; budget_cost: number | string | null }>(existingIds, (p) =>
      db.from("wbs_tasks").select("id, duration_days, budget_cost").in("id", p)),
  ]);
  const n = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    floorOrder: orderFloors(levels),
    nodeName: new Map([...levels.map((l) => [l.id, `${l.wbs_code} ${l.wbs_name}`] as const), ...nodes.map((x) => [x.id, `${x.wbs_code} ${x.wbs_name}`] as const)]),
    masterDivision: new Map(masters.map((m) => [m.id, m.csi_division_code])),
    existing: new Map(tasks.map((t) => [t.id, { durationDays: n(t.duration_days), budget: n(t.budget_cost) }])),
  };
}

export interface LineInfo { itemCode: string; description: string }

/** Item code and description of BOQ lines (tender or contract), for the expanded row. */
export async function loadLineInfo(db: Db, source: ProgrammeSource, lineIds: readonly string[]): Promise<Map<string, LineInfo>> {
  if (source === "tender") {
    const rows = await inChunks<{ id: string; item_code: string; description: string }>(lineIds, (p) => db.from("tender_boq_items").select("id, item_code, description").in("id", p));
    return new Map(rows.map((r) => [r.id, { itemCode: r.item_code, description: r.description }]));
  }
  const rows = await inChunks<{ id: string; item_code: string | null; item_no: string | null; description: string }>(lineIds, (p) =>
    db.from("qs_boq_items").select("id, item_code, item_no, description").in("id", p));
  return new Map(rows.map((r) => [r.id, { itemCode: r.item_code ?? r.item_no ?? "", description: r.description }]));
}
