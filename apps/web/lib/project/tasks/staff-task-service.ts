import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff and reviewer task actions. Each one calls a database function that checks the actor,
 * the current state and the workflow rules and writes history, audit and alerts in one transaction.
 * Errors carry the database's message so the UI can show why an action was refused.
 */

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function startTask(supabase: SupabaseClient, taskId: string) {
  return rpc<{ status: string }>(supabase, "task_transition", { p_task: taskId, p_to: "in_progress" });
}

export function pauseTask(supabase: SupabaseClient, taskId: string, note?: string) {
  return rpc<{ status: string }>(supabase, "task_transition", { p_task: taskId, p_to: "paused", p_note: note ?? null });
}

export function submitTaskForReview(supabase: SupabaseClient, taskId: string, note?: string) {
  return rpc<{ status: string }>(supabase, "task_transition", { p_task: taskId, p_to: "submitted", p_note: note ?? null });
}

export function completeTask(supabase: SupabaseClient, taskId: string, note?: string) {
  return rpc<{ status: string }>(supabase, "task_transition", { p_task: taskId, p_to: "completed", p_note: note ?? null });
}

export interface ProgressUpdate {
  /** 0–100, the scale used by wbs_tasks.progress. */
  progress: number;
  hours?: number | null;
  remainingHours?: number | null;
  comment?: string;
  /** YYYY-MM-DD; defaults to today on the server. */
  workDate?: string;
  evidenceUrl?: string;
}

export function recordProgress(supabase: SupabaseClient, taskId: string, u: ProgressUpdate) {
  return rpc<{ progress: number }>(supabase, "record_task_progress", {
    p_task: taskId,
    p_progress: u.progress,
    p_hours: u.hours ?? null,
    p_remaining_hours: u.remainingHours ?? null,
    p_comment: u.comment ?? null,
    ...(u.workDate ? { p_work_date: u.workDate } : {}),
    p_evidence_url: u.evidenceUrl ?? null,
  });
}

export function reviewTask(
  supabase: SupabaseClient,
  taskId: string,
  decision: "approved" | "returned",
  opts: { comments?: string; corrections?: string } = {},
) {
  return rpc<{ status: string }>(supabase, "review_task", {
    p_task: taskId,
    p_decision: decision,
    p_comments: opts.comments ?? null,
    p_corrections: opts.corrections ?? null,
  });
}

export async function addTaskComment(supabase: SupabaseClient, taskId: string, authorId: string, body: string) {
  const text = body.trim();
  if (!text) throw new Error("Write a comment first.");
  const { error } = await supabase.from("task_comments").insert({ wbs_task_id: taskId, author_id: authorId, body: text });
  if (error) throw new Error(error.message);
}

export interface BlockerInput {
  title: string;
  description?: string;
  category?: string;
  impact?: string;
  requiredAction?: string;
  expectedResolutionDate?: string;
  responsibleDepartmentId?: string | null;
  linkedTaskId?: string | null;
}

export async function reportBlocker(supabase: SupabaseClient, taskId: string, reporterId: string, b: BlockerInput) {
  if (!b.title.trim()) throw new Error("Give the blocker a title.");
  const { error } = await supabase.from("task_blockers").insert({
    wbs_task_id: taskId,
    reported_by: reporterId,
    title: b.title.trim(),
    description: b.description?.trim() || null,
    category: b.category || null,
    impact: b.impact?.trim() || null,
    required_action: b.requiredAction?.trim() || null,
    expected_resolution_date: b.expectedResolutionDate || null,
    responsible_department_id: b.responsibleDepartmentId ?? null,
    linked_task_id: b.linkedTaskId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function resolveBlocker(supabase: SupabaseClient, blockerId: string, resolverId: string, comment: string) {
  if (comment.trim().length < 3) throw new Error("Describe how the blocker was resolved.");
  const { error } = await supabase
    .from("task_blockers")
    .update({ status: "resolved", resolution_comment: comment.trim(), resolved_by: resolverId, resolved_at: new Date().toISOString() })
    .eq("id", blockerId);
  if (error) throw new Error(error.message);
}

export async function escalateBlocker(supabase: SupabaseClient, blockerId: string) {
  const { error } = await supabase.from("task_blockers").update({ status: "escalated" }).eq("id", blockerId);
  if (error) throw new Error(error.message);
}

export interface DeliverableInput {
  name: string;
  description?: string;
  isRequired?: boolean;
  dueDate?: string;
  externalUrl?: string;
  documentRevisionId?: string | null;
}

export async function addDeliverable(supabase: SupabaseClient, taskId: string, userId: string, d: DeliverableInput) {
  if (!d.name.trim()) throw new Error("Give the deliverable a name.");
  const { error } = await supabase.from("task_deliverables").insert({
    wbs_task_id: taskId,
    name: d.name.trim(),
    description: d.description?.trim() || null,
    is_required: d.isRequired ?? true,
    due_date: d.dueDate || null,
    external_url: d.externalUrl?.trim() || null,
    document_revision_id: d.documentRevisionId ?? null,
    contributor_id: userId,
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}

/** Mark a deliverable as handed in (with an optional link / document reference). */
export async function submitDeliverable(
  supabase: SupabaseClient,
  deliverableId: string,
  ref: { externalUrl?: string; documentRevisionId?: string | null; revision?: string },
) {
  if (!ref.externalUrl?.trim() && !ref.documentRevisionId) {
    throw new Error("Add a link or a Document Control reference as evidence.");
  }
  const { error } = await supabase
    .from("task_deliverables")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      external_url: ref.externalUrl?.trim() || null,
      document_revision_id: ref.documentRevisionId ?? null,
      revision: ref.revision?.trim() || null,
    })
    .eq("id", deliverableId);
  if (error) throw new Error(error.message);
}

export interface TaskDetailData {
  deliverables: Record<string, unknown>[];
  blockers: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  progress: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
}

export async function loadTaskDetail(supabase: SupabaseClient, taskId: string): Promise<TaskDetailData> {
  const [d, b, c, p, r, s] = await Promise.all([
    supabase.from("task_deliverables").select("*").eq("wbs_task_id", taskId).order("sort_order").order("created_at"),
    supabase.from("task_blockers").select("*").eq("wbs_task_id", taskId).order("reported_at", { ascending: false }),
    supabase.from("task_comments").select("*").eq("wbs_task_id", taskId).order("created_at"),
    supabase.from("task_progress_history").select("*").eq("wbs_task_id", taskId).order("created_at", { ascending: false }).limit(20),
    supabase.from("task_reviews").select("*").eq("wbs_task_id", taskId).order("decided_at", { ascending: false }),
    supabase.from("task_submissions").select("*").eq("wbs_task_id", taskId).order("round", { ascending: false }),
  ]);
  for (const res of [d, b, c, p, r, s]) if (res.error) throw new Error(res.error.message);
  return {
    deliverables: d.data ?? [],
    blockers: b.data ?? [],
    comments: c.data ?? [],
    progress: p.data ?? [],
    reviews: r.data ?? [],
    submissions: s.data ?? [],
  };
}
