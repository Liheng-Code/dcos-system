// BOQ mapping integrity (doc 35 Phase B): data access. Reconciliation facts come from plan_boq_mapping_facts (one
// call, no .in() lists); the rules are in reconcile.ts. Reviews are decided through plan_decide_boq_change.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inChunks } from "../activity-library/in-chunks";
import { reconcile, type MappingFact, type ReconciledLine, type ReconciliationSummary } from "./reconcile";

type Db = SupabaseClient;

export async function loadReconciliation(db: Db, projectId: string): Promise<{ lines: ReconciledLine[]; summary: ReconciliationSummary }> {
  const { data, error } = await db.rpc("plan_boq_mapping_facts", { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return reconcile((data ?? []) as MappingFact[]);
}

export type ChangeReviewStatus = "open" | "applied" | "kept" | "reverted";

export interface BoqChangeReview {
  id: string;
  boq_source: "qs_boq" | "tender_boq";
  boq_item_id: string;
  item_ref: string | null;
  description: string | null;
  unit: string | null;
  change_kind: "quantity" | "removed";
  old_quantity: number | null;
  new_quantity: number | null;
  task_ids: string[];
  link_count: number;
  status: ChangeReviewStatus;
  raised_at: string;
  updated_at: string;
  decided_at: string | null;
  decision_note: string | null;
  decision_result: { programme_tasks?: number; direct_tasks?: number; locked_tasks?: number; links_to_update_in_generate?: number } | null;
}

const num = (v: unknown) => (v == null ? null : Number(v));

export async function listChangeReviews(db: Db, projectId: string, status: "open" | "closed"): Promise<BoqChangeReview[]> {
  let q = db.from("plan_boq_change_reviews")
    .select("id, boq_source, boq_item_id, item_ref, description, unit, change_kind, old_quantity, new_quantity, task_ids, link_count, status, raised_at, updated_at, decided_at, decision_note, decision_result")
    .eq("project_id", projectId);
  q = status === "open" ? q.eq("status", "open").order("updated_at", { ascending: false }) : q.neq("status", "open").order("decided_at", { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as BoqChangeReview),
    old_quantity: num(r.old_quantity), new_quantity: num(r.new_quantity),
    task_ids: (r.task_ids as string[] | null) ?? [], link_count: Number(r.link_count) || 0,
  }));
}

export async function countOpenChangeReviews(db: Db, projectId: string): Promise<number> {
  const { count, error } = await db.from("plan_boq_change_reviews").select("id", { count: "exact", head: true })
    .eq("project_id", projectId).eq("status", "open");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export interface ChangeDecisionResult { programme_tasks: number; direct_tasks: number; locked_tasks: number; links_to_update_in_generate: number }

/** apply: the new quantity goes to the mapped tasks; keep: the plan stays (reason required). */
export async function decideChangeReview(db: Db, reviewId: string, decision: "apply" | "keep", note?: string): Promise<ChangeDecisionResult> {
  const { data, error } = await db.rpc("plan_decide_boq_change", { p_review_id: reviewId, p_decision: decision, p_note: note ?? null });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    programme_tasks: Number(d.programme_tasks) || 0, direct_tasks: Number(d.direct_tasks) || 0, locked_tasks: Number(d.locked_tasks) || 0,
    links_to_update_in_generate: Number(d.links_to_update_in_generate) || 0,
  };
}

/** "code name" of tasks and WBS nodes, for the review and history lists. */
export async function taskLabels(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const rows = await inChunks<{ id: string; task_code: string | null; task_name: string | null }>([...new Set(ids)], (part) =>
    db.from("wbs_tasks").select("id, task_code, task_name").in("id", part));
  return new Map(rows.map((t) => [t.id, [t.task_code, t.task_name].filter(Boolean).join(" ")]));
}

export async function nodeLabels(db: Db, ids: readonly string[]): Promise<Map<string, string>> {
  const rows = await inChunks<{ id: string; wbs_code: string | null; wbs_name: string | null }>([...new Set(ids)], (part) =>
    db.from("wbs_nodes").select("id, wbs_code, wbs_name").in("id", part));
  return new Map(rows.map((n) => [n.id, [n.wbs_code, n.wbs_name].filter(Boolean).join(" ")]));
}

export interface MappingHistoryRow {
  id: string;
  mapping: "programme" | "link";
  action: "insert" | "update" | "delete";
  boq_source: string | null;
  boq_item_id: string | null;
  task_id: string | null;
  wbs_node_id: string | null;
  metric_code: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}

export async function listMappingHistory(db: Db, projectId: string, opts: { boqItemId?: string; limit?: number } = {}): Promise<MappingHistoryRow[]> {
  let q = db.from("plan_boq_mapping_history")
    .select("id, mapping, action, boq_source, boq_item_id, task_id, wbs_node_id, metric_code, old_values, new_values, changed_by, changed_at")
    .eq("project_id", projectId);
  if (opts.boqItemId) q = q.eq("boq_item_id", opts.boqItemId);
  const { data, error } = await q.order("changed_at", { ascending: false }).limit(opts.limit ?? 300);
  if (error) throw new Error(error.message);
  return (data ?? []) as MappingHistoryRow[];
}
