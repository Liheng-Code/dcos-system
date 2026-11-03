// Doc 35 I1: data access for contract milestones (browser client; RLS: Schedule view to read, Baseline edit to add or
// change, Baseline approve to change an agreed date or delete). History is written by a trigger.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractMilestone, MilestoneTask } from "./contract-milestones";

type Db = SupabaseClient;

const COLS = "id, project_id, code, name, kind, contract_date, revised_date, revision_ref, task_id, ld_rate, ld_currency, ld_cap, clause_ref, notes, sort_order";
const TASK_COLS = "id, task_code, task_name, start_date, end_date, baseline_start_date, baseline_finish_date, actual_start_date, actual_finish_date, progress";

export async function listContractMilestones(db: Db, projectId: string): Promise<ContractMilestone[]> {
  const { data, error } = await db.from("plan_contract_milestones").select(COLS).eq("project_id", projectId)
    .order("sort_order").order("contract_date").order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractMilestone[];
}

/** The activities the milestones are linked to. */
export async function milestoneTasks(db: Db, ids: string[]): Promise<Map<string, MilestoneTask>> {
  if (!ids.length) return new Map();
  const { data, error } = await db.from("wbs_tasks").select(TASK_COLS).in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as MilestoneTask[]).map((t) => [t.id, t]));
}

export interface TaskOption { id: string; task_code: string | null; task_name: string | null; end_date: string | null; is_milestone: boolean | null }

/** Activities to link to, programme milestones first. */
export async function searchMilestoneTasks(db: Db, projectId: string, q: string): Promise<TaskOption[]> {
  let query = db.from("wbs_tasks").select("id, task_code, task_name, end_date, is_milestone").eq("project_id", projectId);
  const term = q.trim().replace(/[%,()]/g, " ");
  if (term) query = query.or(`task_code.ilike.%${term}%,task_name.ilike.%${term}%`);
  const { data, error } = await query.order("is_milestone", { ascending: false }).order("end_date", { ascending: true, nullsFirst: false }).limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskOption[];
}

export type MilestoneInput = Omit<ContractMilestone, "id" | "project_id">;

export async function saveContractMilestone(db: Db, projectId: string, id: string | null, input: MilestoneInput): Promise<void> {
  const row = {
    code: input.code.trim(), name: input.name.trim(), kind: input.kind, contract_date: input.contract_date,
    revised_date: input.revised_date, revision_ref: input.revision_ref?.trim() || null, task_id: input.task_id,
    ld_rate: input.ld_rate, ld_currency: input.ld_currency, ld_cap: input.ld_cap, clause_ref: input.clause_ref,
    notes: input.notes, sort_order: input.sort_order,
  };
  const { error } = id
    ? await db.from("plan_contract_milestones").update(row).eq("id", id)
    : await db.from("plan_contract_milestones").insert({ ...row, project_id: projectId });
  if (error) {
    if (error.code === "23505") throw new Error(`Code ${row.code} is already used in this project`);
    throw new Error(error.message);
  }
}

export async function deleteContractMilestone(db: Db, id: string): Promise<void> {
  const { data, error } = await db.from("plan_contract_milestones").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Deleting a contract milestone needs Baseline approve permission");
}

export interface MilestoneHistoryRow { id: string; field: string; old_value: string | null; new_value: string | null; changed_by: string | null; changed_at: string }

export async function milestoneHistory(db: Db, milestoneId: string): Promise<MilestoneHistoryRow[]> {
  const { data, error } = await db.from("plan_contract_milestone_history")
    .select("id, field, old_value, new_value, changed_by, changed_at").eq("milestone_id", milestoneId).order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MilestoneHistoryRow[];
}
