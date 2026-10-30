// Data access for the Requirements Tracker and the record pickers (submittals, ITP lines).
// Requirement = a catalogue item (shop drawing type, method statement, T&C item, coordination item) linked to the master activity of a
// project task (wbs_tasks.activity_master_id). Record = a submittal, ITP line, Design MEP commissioning record or
// Design coordination log entry that names that catalogue item (20261030161500, 20261030164500). Reads only; RLS applies.

import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages, inChunks } from "./in-chunks";
import {
  commissioningState, coordinationLogState, itpState, overallState, submittalState, type RequirementKind, type RequirementState,
} from "./requirement-status";

type Db = SupabaseClient;

export interface CatalogueOption {
  id: string; code: string; name: string; csi_division_code?: string | null;
  /** T&C items only. */
  tc_type?: string; standard_ref?: string | null; acceptance_criteria?: string | null;
}

export interface RequirementTask { id: string; task_code: string | null; task_name: string; wbs_node_id: string | null }
export interface RequirementRecord { id: string; label: string; status: string; state: RequirementState }
export interface Requirement {
  kind: RequirementKind;
  item: CatalogueOption;
  tasks: RequirementTask[];
  records: RequirementRecord[];
  state: RequirementState;
}

const CATALOGUE: Record<RequirementKind, { table: string; link: string; ref: string; cols: string }> = {
  shop_drawing: { table: "plan_act_shop_drawing_types", link: "plan_act_master_shop_drawings", ref: "shop_drawing_type_id", cols: "id, code, name, csi_division_code" },
  method_statement: { table: "plan_act_method_statements", link: "plan_act_master_method_statements", ref: "method_statement_id", cols: "id, code, name, csi_division_code" },
  tc: { table: "plan_act_tc_items", link: "plan_act_master_tc_items", ref: "tc_item_id", cols: "id, code, name, csi_division_code, tc_type, standard_ref, acceptance_criteria" },
  coordination: { table: "plan_act_coordination_items", link: "plan_act_master_coordination", ref: "coordination_item_id", cols: "id, code, name" },
};
const KINDS = Object.keys(CATALOGUE) as RequirementKind[];

/** Active catalogue items of one kind, by code (for the record pickers). */
export async function listCatalogueOptions(db: Db, kind: RequirementKind): Promise<CatalogueOption[]> {
  const { table, cols } = CATALOGUE[kind];
  const { data, error } = await db.from(table).select(cols).eq("is_active", true).order("code").limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CatalogueOption[];
}

async function catalogueById(db: Db, kind: RequirementKind, ids: string[]): Promise<Map<string, CatalogueOption>> {
  const { table, cols } = CATALOGUE[kind];
  const rows = await inChunks<CatalogueOption>(ids, (p) => db.from(table).select(cols).in("id", p) as never);
  return new Map(rows.map((r) => [r.id, r]));
}

/** Records of a project that name a catalogue item, keyed `${kind}:${itemId}`. */
async function projectRecords(db: Db, projectId: string): Promise<Map<string, RequirementRecord[]>> {
  const [subs, itpLines, commissioning, coordLog] = await Promise.all([
    allPages<{ id: string; submittal_number: string; title: string; consultant_status: string; shop_drawing_type_id: string | null; method_statement_id: string | null }>((from, to) =>
      db.from("submittal_packages").select("id, submittal_number, title, consultant_status, shop_drawing_type_id, method_statement_id")
        .eq("project_id", projectId).or("shop_drawing_type_id.not.is.null,method_statement_id.not.is.null").order("id").range(from, to)),
    allPages<{ id: string; activity: string; tc_item_id: string; itp: { title: string; status: string } | null }>((from, to) =>
      db.from("itp_items").select("id, activity, tc_item_id, itp:itps!inner(title, status, project_id)")
        .eq("itp.project_id", projectId).not("tc_item_id", "is", null).order("id").range(from, to) as never),
    allPages<{ id: string; system_name: string; status: string; tc_item_id: string }>((from, to) =>
      db.from("design_mep_commissioning").select("id, system_name, status, tc_item_id")
        .eq("project_id", projectId).not("tc_item_id", "is", null).order("id").range(from, to)),
    allPages<{ id: string; subject: string; status: string; coordination_item_id: string }>((from, to) =>
      db.from("design_coordination_log").select("id, subject, status, coordination_item_id")
        .eq("project_id", projectId).not("coordination_item_id", "is", null).order("id").range(from, to)),
  ]);
  const out = new Map<string, RequirementRecord[]>();
  const add = (key: string, r: RequirementRecord) => out.set(key, [...(out.get(key) ?? []), r]);
  for (const s of subs) {
    const rec = { id: s.id, label: `${s.submittal_number} ${s.title}`, status: s.consultant_status, state: submittalState(s.consultant_status) };
    if (s.shop_drawing_type_id) add(`shop_drawing:${s.shop_drawing_type_id}`, rec);
    if (s.method_statement_id) add(`method_statement:${s.method_statement_id}`, rec);
  }
  for (const l of itpLines) {
    add(`tc:${l.tc_item_id}`, { id: l.id, label: `${l.itp?.title ?? "ITP"}: ${l.activity}`, status: l.itp?.status ?? "", state: itpState(l.itp?.status) });
  }
  for (const c of commissioning) {
    add(`tc:${c.tc_item_id}`, { id: c.id, label: `Commissioning: ${c.system_name}`, status: c.status, state: commissioningState(c.status) });
  }
  for (const c of coordLog) {
    const state = coordinationLogState(c.status);
    if (state) add(`coordination:${c.coordination_item_id}`, { id: c.id, label: `Coordination log: ${c.subject}`, status: c.status, state });
  }
  return out;
}

/**
 * Requirements of a project's activities (optionally only the tasks of one WBS node), each with the tasks that need
 * it, the records that fulfil it and its overall state. Ordered by kind, then code.
 */
export async function listProjectRequirements(db: Db, projectId: string, opts: { wbsNodeId?: string | null; kinds?: RequirementKind[] } = {}): Promise<Requirement[]> {
  const kinds = opts.kinds ?? KINDS;
  const tasks = await allPages<RequirementTask & { activity_master_id: string }>((from, to) => {
    let qb = db.from("wbs_tasks").select("id, task_code, task_name, wbs_node_id, activity_master_id").eq("project_id", projectId).not("activity_master_id", "is", null);
    if (opts.wbsNodeId) qb = qb.eq("wbs_node_id", opts.wbsNodeId);
    return qb.order("id").range(from, to);
  });
  const masterIds = [...new Set(tasks.map((t) => t.activity_master_id))];
  const tasksByMaster = new Map<string, RequirementTask[]>();
  for (const t of tasks) {
    tasksByMaster.set(t.activity_master_id, [...(tasksByMaster.get(t.activity_master_id) ?? []), { id: t.id, task_code: t.task_code, task_name: t.task_name, wbs_node_id: t.wbs_node_id }]);
  }

  const [records, ...perKind] = await Promise.all([
    projectRecords(db, projectId),
    ...kinds.map(async (kind) => {
      const { link, ref } = CATALOGUE[kind];
      const links = await inChunks<Record<string, string>>(masterIds, (p) => db.from(link).select(`master_id, ${ref}`).in("master_id", p) as never);
      const items = await catalogueById(db, kind, [...new Set(links.map((l) => l[ref]))]);
      return { kind, links, ref, items };
    }),
  ]);

  const out: Requirement[] = [];
  for (const { kind, links, ref, items } of perKind) {
    const tasksByItem = new Map<string, Map<string, RequirementTask>>();
    for (const l of links) {
      const m = tasksByItem.get(l[ref]) ?? new Map<string, RequirementTask>();
      for (const t of tasksByMaster.get(l.master_id) ?? []) m.set(t.id, t);
      tasksByItem.set(l[ref], m);
    }
    for (const [itemId, taskMap] of tasksByItem) {
      const item = items.get(itemId);
      if (!item) continue;
      const recs = records.get(`${kind}:${itemId}`) ?? [];
      out.push({ kind, item, tasks: [...taskMap.values()], records: recs, state: overallState(recs.map((r) => r.state)) });
    }
  }
  return out.sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.item.code.localeCompare(b.item.code));
}
