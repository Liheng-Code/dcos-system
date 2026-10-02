import type { SupabaseClient } from "@supabase/supabase-js";
import { createTaskAlert } from "@/lib/task-alerts";

export interface AssignableTask {
  id: string;
  project_id: string;
  wbs_node_id: string;
  owner_id: string | null;
  owner_name: string | null;
  start_date: string | null;
  end_date: string | null;
}

/**
 * Core DB-writing logic behind assigning a task to a real profile — shared by the
 * Tasks module (wbs-task-edit-sheet) and Planning's resource-assignment mirror.
 * No UI side effects; callers own toasts/loading state and decide how to surface errors.
 */
export async function assignTaskToProfile(
  supabase: SupabaseClient,
  task: AssignableTask,
  profile: { id: string; full_name: string | null },
  actor: { id: string | null; name: string | null },
  dates?: { start: string | null; end: string | null },
): Promise<void> {
  const newOwnerName = profile.full_name ?? null;
  const newOwnerId = profile.id;
  const newStart = dates ? dates.start : task.start_date;
  const newFinish = dates ? dates.end : task.end_date;

  const isNewAssignment = (task.owner_id ?? null) !== newOwnerId;

  const updatePayload: Record<string, unknown> = {
    owner_name: newOwnerName,
    owner_id: newOwnerId,
    start_date: newStart,
    end_date: newFinish,
    ...(isNewAssignment && { status: "assigned" }),
  };

  // Try to include assignee_id — falls back gracefully if the column doesn't exist yet
  if (isNewAssignment && actor.id) {
    const { error: assigneeErr } = await supabase
      .from("wbs_tasks")
      .update({ ...updatePayload, assignee_id: actor.id })
      .eq("id", task.id);
    if (assigneeErr?.message?.includes("assignee_id")) {
      const { error } = await supabase.from("wbs_tasks").update(updatePayload).eq("id", task.id);
      if (error) throw new Error(error.message);
    } else if (assigneeErr) {
      throw new Error(assigneeErr.message);
    }
  } else {
    const { error } = await supabase.from("wbs_tasks").update(updatePayload).eq("id", task.id);
    if (error) throw new Error(error.message);
  }

  const auditEntries: { action: string; field_name: string; old_value: string; new_value: string }[] = [];
  if ((task.owner_name ?? null) !== newOwnerName) {
    auditEntries.push({ action: "Assignee Changed", field_name: "owner_name", old_value: task.owner_name ?? "", new_value: newOwnerName ?? "" });
  }
  if ((task.start_date ?? null) !== newStart) {
    auditEntries.push({ action: "Plan Start Changed", field_name: "start_date", old_value: task.start_date ?? "", new_value: newStart ?? "" });
  }
  if ((task.end_date ?? null) !== newFinish) {
    auditEntries.push({ action: "Plan Finish Changed", field_name: "end_date", old_value: task.end_date ?? "", new_value: newFinish ?? "" });
  }

  const ownerIdChanged = (task.owner_id ?? null) !== newOwnerId;
  let taskMeta: { task_code: string; task_name: string } | null = null;
  if (ownerIdChanged) {
    const { data, error } = await supabase
      .from("wbs_tasks")
      .select("task_code, task_name")
      .eq("id", task.id)
      .single();
    if (error) throw new Error(error.message);
    taskMeta = data as { task_code: string; task_name: string };
  }

  for (const entry of auditEntries) {
    const { data, error } = await supabase
      .from("wbs_audit_log")
      .insert({
        wbs_task_id: task.id,
        wbs_node_id: task.wbs_node_id,
        project_id: task.project_id,
        user_id: actor.id,
        ...entry,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const auditId = data?.id ?? null;

    if (entry.action === "Assignee Changed" && ownerIdChanged && auditId && taskMeta) {
      await createTaskAlert(supabase, {
        projectId: task.project_id,
        taskId: task.id,
        actorId: actor.id,
        actorName: actor.name,
        recipientId: newOwnerId,
        sourceKey: auditId,
        alertType: task.owner_id ? "task_reassigned" : "task_assigned",
        title: task.owner_id ? "Task reassigned to you" : "Task assigned to you",
        body: "You have received this task assignment.",
        taskCode: taskMeta.task_code,
        taskName: taskMeta.task_name,
        metadata: { previous_owner_id: task.owner_id, previous_owner_name: task.owner_name },
      });
    }
  }
}
