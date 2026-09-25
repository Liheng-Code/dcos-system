// Data access for Phase 2: BOQ -> WBS quantity mapping, CSV import, and quantity revision history.
// Matching itself is pure (boq-matching.ts / task-work-csv.ts); this module only fetches candidates/tasks
// and writes the explicit result of a user's Apply / Import action — nothing here auto-applies anything.

import { createClient } from "@/lib/supabase/client";
import type { BoqCandidate, TaskForMatch } from "./boq-matching";

// ── BOQ candidates ───────────────────────────────────────────────────────────

/** The project's own qs_boq_items plus, when the project has a linked tender, its tender_boq_items. */
export async function listBoqCandidates(projectId: string): Promise<BoqCandidate[]> {
  const supabase = createClient();
  const [qsRows, budgetRes, tenderRes] = await Promise.all([
    fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("qs_boq_items")
        .select("id, item_code, item_no, description, unit, quantity, budget_code_id")
        .eq("project_id", projectId)
        .range(from, to),
    ),
    supabase.from("budget_codes").select("id, code"),
    supabase.from("tender_register").select("id").eq("project_id", projectId),
  ]);
  if (budgetRes.error) throw new Error(budgetRes.error.message);
  if (tenderRes.error) throw new Error(tenderRes.error.message);

  const budgetCodeById = new Map((budgetRes.data ?? []).map((b) => [b.id as string, b.code as string]));
  const candidates: BoqCandidate[] = [];

  for (const r of qsRows) {
    const qty = Number(r.quantity);
    if (!qty || qty <= 0) continue; // a placeholder/section header with no measured quantity isn't matchable
    candidates.push({
      id: r.id as string,
      source: "qs_boq",
      code: (r.item_code as string | null) || (r.item_no as string | null),
      description: r.description as string,
      unit: r.unit as string,
      quantity: qty,
      level: null, // qs_boq_items carries no level column; wbs_node_id (when set) would give one — none set yet locally
      budgetCode: r.budget_code_id ? budgetCodeById.get(r.budget_code_id as string) ?? null : null,
    });
  }

  const tenderIds = (tenderRes.data ?? []).map((t) => t.id as string);
  if (tenderIds.length > 0) {
    const tbiRows = await fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("tender_boq_items")
        .select("id, item_code, description, unit, quantity, level, budget_code_id")
        .in("tender_id", tenderIds)
        .range(from, to),
    );
    for (const r of tbiRows) {
      const qty = Number(r.quantity);
      if (!qty || qty <= 0) continue;
      candidates.push({
        id: r.id as string,
        source: "tender_boq",
        code: r.item_code as string | null,
        description: r.description as string,
        unit: r.unit as string,
        quantity: qty,
        level: (r.level as string | null) ?? null,
        budgetCode: r.budget_code_id ? budgetCodeById.get(r.budget_code_id as string) ?? null : null,
      });
    }
  }
  return candidates;
}

// ── tasks (with a resolved level label) ──────────────────────────────────────

interface WbsNodeLite {
  id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
}

/** Walks a task's WBS node up to the nearest ancestor of type 'level' (or the node itself if it is one). */
function resolveLevelLabel(nodeId: string | null, nodesById: Map<string, WbsNodeLite>): string | null {
  let cur = nodeId ? nodesById.get(nodeId) : undefined;
  for (let hop = 0; cur && hop < 12; hop++) {
    if (cur.node_type === "level") return cur.wbs_code || cur.wbs_name;
    cur = cur.parent_id ? nodesById.get(cur.parent_id) : undefined;
  }
  return null;
}

export interface TaskLink {
  taskId: string;
  source: "tender_boq" | "qs_boq";
  candidateId: string;
}

export interface TaskMappingData {
  tasks: TaskForMatch[];
  /** task_id -> its current BOQ link, for tasks that already have one. */
  currentLinks: Map<string, TaskLink>;
  /** task_code -> task id, for the CSV importer. */
  taskIdByCode: Map<string, string>;
}

const PAGE = 1000;

/** PostgREST caps a single request at max_rows (1000) regardless of .limit() — page past it. */
async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await run(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

export async function listTasksForMapping(projectId: string): Promise<TaskMappingData> {
  const supabase = createClient();
  const [taskRows, nodeRows, workRows] = await Promise.all([
    fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("wbs_tasks")
        .select("id, task_code, task_name, discipline, area_label, cost_code, wbs_node_id, is_milestone")
        .eq("project_id", projectId)
        .range(from, to),
    ),
    fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase.from("wbs_nodes").select("id, parent_id, node_type, wbs_code, wbs_name").eq("project_id", projectId).range(from, to),
    ),
    fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("plan_task_work")
        .select("task_id, quantity, quantity_source, tender_boq_item_id, qs_boq_item_id")
        .eq("project_id", projectId)
        .range(from, to),
    ),
  ]);

  const nodesById = new Map(nodeRows.map((n) => [n.id as string, n as unknown as WbsNodeLite]));
  const workByTask = new Map(workRows.map((w) => [w.task_id as string, w]));

  const tasks: TaskForMatch[] = [];
  const currentLinks = new Map<string, TaskLink>();
  const taskIdByCode = new Map<string, string>();

  for (const t of taskRows) {
    if (t.is_milestone) continue;
    const id = t.id as string;
    const code = t.task_code as string;
    taskIdByCode.set(code, id);
    const w = workByTask.get(id) as Record<string, unknown> | undefined;
    tasks.push({
      id,
      taskCode: code,
      taskName: t.task_name as string,
      discipline: (t.discipline as string | null) ?? null,
      levelLabel: resolveLevelLabel((t.wbs_node_id as string | null) ?? null, nodesById) ?? (t.area_label as string | null) ?? null,
      costCode: (t.cost_code as string | null) ?? null,
      hasQuantity: !!w && w.quantity != null,
    });
    if (w?.tender_boq_item_id) currentLinks.set(id, { taskId: id, source: "tender_boq", candidateId: w.tender_boq_item_id as string });
    else if (w?.qs_boq_item_id) currentLinks.set(id, { taskId: id, source: "qs_boq", candidateId: w.qs_boq_item_id as string });
  }
  return { tasks, currentLinks, taskIdByCode };
}

// ── applying a match / import (upsert into plan_task_work) ──────────────────

export interface QuantityWrite {
  taskId: string;
  quantity: number;
  quantityUnit: string;
  quantitySource: "boq" | "tender_boq" | "import";
  tenderBoqItemId: string | null;
  qsBoqItemId: string | null;
  reason: string;
}

function friendly(message: string): string {
  if (/row-level security/i.test(message)) return "You do not have permission to do that.";
  if (/A reason is required/i.test(message)) return "A reason is required when changing an already-recorded quantity.";
  if (/does not belong to this task's project/i.test(message)) return message;
  return message;
}

/** Writes one quantity (insert if the task has no work row yet, else update). */
export async function writeTaskQuantity(w: QuantityWrite): Promise<void> {
  const supabase = createClient();
  const existing = await supabase.from("plan_task_work").select("task_id").eq("task_id", w.taskId).maybeSingle();
  if (existing.error) throw new Error(friendly(existing.error.message));

  const patch = {
    quantity: w.quantity,
    quantity_unit: w.quantityUnit,
    quantity_source: w.quantitySource,
    quantity_reason: w.reason,
    tender_boq_item_id: w.tenderBoqItemId,
    qs_boq_item_id: w.qsBoqItemId,
  };
  if (existing.data) {
    const { error } = await supabase.from("plan_task_work").update(patch).eq("task_id", w.taskId);
    if (error) throw new Error(friendly(error.message));
  } else {
    const { error } = await supabase.from("plan_task_work").insert({ task_id: w.taskId, ...patch });
    if (error) throw new Error(friendly(error.message));
  }
}

/** Applies several quantities sequentially (small batches from the mapping tool / CSV import), collecting failures. */
export async function writeTaskQuantities(rows: QuantityWrite[]): Promise<{ applied: number; failed: { taskId: string; message: string }[] }> {
  let applied = 0;
  const failed: { taskId: string; message: string }[] = [];
  for (const r of rows) {
    try {
      await writeTaskQuantity(r);
      applied++;
    } catch (e) {
      failed.push({ taskId: r.taskId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return { applied, failed };
}

// ── quantity revision history ────────────────────────────────────────────────

export interface QuantityHistoryRow {
  id: string;
  changedAt: string;
  changedBy: string | null;
  oldQuantity: number | null;
  newQuantity: number | null;
  oldUnit: string | null;
  newUnit: string | null;
  oldSource: string | null;
  newSource: string | null;
  reason: string | null;
}

export async function getQuantityHistory(taskId: string): Promise<QuantityHistoryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("plan_task_work_quantity_history")
    .select("id, changed_at, changed_by, old_quantity, new_quantity, old_quantity_unit, new_quantity_unit, old_quantity_source, new_quantity_source, reason")
    .eq("task_id", taskId)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    changedAt: r.changed_at as string,
    changedBy: (r.changed_by as string | null) ?? null,
    oldQuantity: r.old_quantity == null ? null : Number(r.old_quantity),
    newQuantity: r.new_quantity == null ? null : Number(r.new_quantity),
    oldUnit: (r.old_quantity_unit as string | null) ?? null,
    newUnit: (r.new_quantity_unit as string | null) ?? null,
    oldSource: (r.old_quantity_source as string | null) ?? null,
    newSource: (r.new_quantity_source as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
  }));
}
