// I/O for the data-readiness report (doc 24 phase 1). Pure rules: readiness.ts.
// Tender source: the lines of every tender of the project (tender_register.project_id), as qs-bridge-service does.
// Contract source: qs_boq_items of the project's main-works BOQs (the locked baseline carried over at award, plus
// later items); preliminaries and other BOQ types are left out. Both read building / level / mapping from the line itself.
// Every .in() goes through inChunks (PostgREST URL limit).

import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages, inChunks } from "../activity-library/in-chunks";
import { listSavedLocations } from "../activity-library/location-map-service";
import {
  computeReadiness, type LabourResourceFact, type LocationFact, type ReadinessLine, type ReadinessReport, type WorkItemFacts,
} from "./readiness";

type Db = SupabaseClient;

export type ReadinessSource = "tender" | "contract";

export interface ProjectReadiness extends ReadinessReport {
  source: ReadinessSource;
  projectId: string;
}

const CURRENT_EXCLUDED = "(superseded,archived)";

interface TenderLine {
  id: string; item_code: string; description: string; total_amount: number | string | null;
  building_code: string | null; level: string | null; dwl_work_item_id: string | null;
}
interface ContractLine {
  id: string; item_code: string | null; item_no: string | null; description: string; total_amount: number | string | null;
  building_code: string | null; level: string | null; dwl_work_item_id: string | null;
}

async function tenderLines(db: Db, projectId: string): Promise<ReadinessLine[]> {
  const { data: tenders, error } = await db.from("tender_register").select("id").eq("project_id", projectId);
  if (error) throw new Error(error.message);
  const out: ReadinessLine[] = [];
  for (const t of (tenders ?? []) as { id: string }[]) {
    const rows = await allPages<TenderLine>((from, to) =>
      db.from("tender_boq_items").select("id, item_code, description, total_amount, building_code, level, dwl_work_item_id")
        .eq("tender_id", t.id).order("id").range(from, to));
    for (const r of rows) {
      out.push({
        id: r.id, itemCode: r.item_code, description: r.description, amount: Number(r.total_amount) || 0,
        buildingCode: r.building_code, level: r.level, workItemId: r.dwl_work_item_id,
      });
    }
  }
  return out;
}

async function contractLines(db: Db, projectId: string): Promise<ReadinessLine[]> {
  const rows = await allPages<ContractLine>((from, to) =>
    db.from("qs_boq_items")
      .select("id, item_code, item_no, description, total_amount, building_code, level, dwl_work_item_id, qs_boq_sections!inner(qs_boq!inner(boq_type))")
      .eq("project_id", projectId).eq("qs_boq_sections.qs_boq.boq_type", "main_works").order("id").range(from, to) as never);
  return rows.map((r) => ({
    id: r.id, itemCode: r.item_code ?? r.item_no ?? "", description: r.description, amount: Number(r.total_amount) || 0,
    buildingCode: r.building_code, level: r.level, workItemId: r.dwl_work_item_id,
  }));
}

/** Link and labour facts for the given BOQ items. */
export async function loadWorkItemFacts(db: Db, workItemIds: readonly string[]): Promise<Map<string, WorkItemFacts>> {
  const ids = [...new Set(workItemIds)];
  const [links, resources] = await Promise.all([
    inChunks<{ work_item_id: string; share_pct: number | string; plan_act_masters: { status: string } | { status: string }[] | null }>(ids, (p) =>
      db.from("plan_act_master_work_items").select("work_item_id, share_pct, plan_act_masters!inner(status)")
        .in("work_item_id", p).not("plan_act_masters.status", "in", CURRENT_EXCLUDED) as never),
    inChunks<{ work_item_id: string; consumption: number | string; basis_note: string | null; dwl_resources: { unit: string | null; category: string } | { unit: string | null; category: string }[] | null }>(ids, (p) =>
      db.from("dwl_work_item_resources").select("work_item_id, consumption, basis_note, dwl_resources!inner(unit, category)")
        .in("work_item_id", p).eq("dwl_resources.category", "labor") as never),
  ]);
  const facts = new Map<string, WorkItemFacts>(ids.map((id) => [id, { linked: false, labour: [] }]));
  for (const l of links) if (Number(l.share_pct) > 0) facts.get(l.work_item_id)!.linked = true;
  for (const r of resources) {
    const res = Array.isArray(r.dwl_resources) ? r.dwl_resources[0] : r.dwl_resources;
    if (!res) continue;
    const fact: LabourResourceFact = { unit: res.unit, consumption: Number(r.consumption), basisNote: r.basis_note };
    facts.get(r.work_item_id)!.labour.push(fact);
  }
  return facts;
}

/** Share of BOQ value that is mapped, linked, carries time-based labour and is located; plus the blocking lines. */
export async function getProjectReadiness(db: Db, projectId: string, opts: { source: ReadinessSource }): Promise<ProjectReadiness> {
  const [lines, saved] = await Promise.all([
    opts.source === "tender" ? tenderLines(db, projectId) : contractLines(db, projectId),
    listSavedLocations(db, projectId),
  ]);
  const workItems = await loadWorkItemFacts(db, lines.map((l) => l.workItemId).filter((x): x is string => !!x));
  const locations: LocationFact[] = saved.map((s) => ({
    building_code: s.building_code, qs_level_label: s.qs_level_label, wbs_node_id: s.wbs_node_id, status: s.status, split_rule: s.split_rule,
  }));
  return { source: opts.source, projectId, ...computeReadiness(lines, { workItems, locations }) };
}
