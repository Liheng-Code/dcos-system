import type { SupabaseClient } from "@supabase/supabase-js";
import type { WbsTaskAlertType } from "@/components/wbs/wbs-types";

let warnedMissingTaskAlertsTable = false;

interface CreateTaskAlertInput {
  projectId: string;
  taskId: string;
  actorId: string | null;
  actorName?: string | null;
  recipientId: string | null | undefined;
  sourceKey?: string | null;
  alertType: WbsTaskAlertType;
  title: string;
  body?: string | null;
  taskCode: string;
  taskName: string;
  metadata?: Record<string, unknown>;
}

export async function createTaskAlert(
  supabase: SupabaseClient,
  input: CreateTaskAlertInput,
) {
  if (!input.recipientId || input.recipientId === input.actorId) return;

  const payload = {
    project_id: input.projectId,
    wbs_task_id: input.taskId,
    actor_id: input.actorId,
    actor_name: input.actorName ?? null,
    recipient_id: input.recipientId,
    source_key: input.sourceKey ?? null,
    alert_type: input.alertType,
    title: input.title,
    body: input.body ?? null,
    task_code: input.taskCode,
    task_name: input.taskName,
    metadata: input.metadata ?? {},
  };

  const { error } = await supabase.from("task_alerts").insert(payload);

  if (error) {
    if (error.code === "23505") {
      return;
    }

    const missingTable =
      error.message.includes("Could not find the table 'public.task_alerts' in the schema cache") ||
      error.message.toLowerCase().includes("schema cache");

    if (missingTable) {
      if (!warnedMissingTaskAlertsTable) {
        warnedMissingTaskAlertsTable = true;
        console.warn("Task alerts table is not available yet. Skipping alert creation until the migration is applied.");
      }
      return;
    }

    console.error("Task alert insert failed:", error.message);
  }
}
