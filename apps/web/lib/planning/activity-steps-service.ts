import type { SupabaseClient } from "@supabase/supabase-js";

export interface ActivityStepTemplate {
  id: string;
  group_name: string;
  template_name: string;
  description: string | null;
  is_active: boolean;
}

export interface ActivityStepTemplateItem {
  id: string;
  template_id: string;
  step_no: number;
  step_name: string;
  weight: number;
  discipline: string | null;
  resource_crew: string | null;
  est_duration_days: number | null;
  inspection_hold_point: boolean;
  notes: string | null;
}

export interface WbsTaskStep {
  id: string;
  task_id: string;
  source_template_id: string | null;
  step_no: number;
  step_name: string;
  weight: number;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  discipline: string | null;
  resource_crew: string | null;
  est_duration_days: number | null;
  inspection_hold_point: boolean;
  notes: string | null;
}

/** Draft shape for editing — no id yet, used for both template items and task steps. */
export interface StepDraft {
  step_no: number;
  step_name: string;
  weight: number;
  discipline?: string | null;
  resource_crew?: string | null;
  est_duration_days?: number | null;
  inspection_hold_point?: boolean;
  notes: string | null;
}

export function totalWeight(steps: { weight: number }[]): number {
  return steps.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
}

/** Weighted-average % complete across steps — mirrors the DB trigger's own formula exactly. */
export function weightedProgress(steps: { weight: number; progress: number }[]): number {
  const total = totalWeight(steps);
  if (total <= 0) return 0;
  const weighted = steps.reduce((sum, s) => sum + (Number(s.progress) || 0) * (Number(s.weight) || 0), 0);
  return Math.round((weighted / total) * 100) / 100;
}

/** True when a step has a date set outside the parent activity's own start/finish window. */
export function stepDateOutOfRange(
  step: { start_date: string | null; end_date: string | null },
  taskStart: string | null,
  taskEnd: string | null,
): boolean {
  if (step.start_date && taskStart && step.start_date < taskStart) return true;
  if (step.start_date && taskEnd && step.start_date > taskEnd) return true;
  if (step.end_date && taskStart && step.end_date < taskStart) return true;
  if (step.end_date && taskEnd && step.end_date > taskEnd) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Template library (company-wide master data)
// ---------------------------------------------------------------------------

export async function listActivityStepTemplates(supabase: SupabaseClient): Promise<ActivityStepTemplate[]> {
  const { data, error } = await supabase
    .from("activity_step_template_master")
    .select("id, group_name, template_name, description, is_active")
    .order("group_name", { ascending: true })
    .order("template_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActivityStepTemplate[];
}

export async function listTemplateItems(supabase: SupabaseClient, templateId: string): Promise<ActivityStepTemplateItem[]> {
  const { data, error } = await supabase
    .from("activity_step_template_item")
    .select("id, template_id, step_no, step_name, weight, discipline, resource_crew, est_duration_days, inspection_hold_point, notes")
    .eq("template_id", templateId)
    .order("step_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActivityStepTemplateItem[];
}

export async function saveTemplate(
  supabase: SupabaseClient,
  template: { id?: string; group_name: string; template_name: string; description: string | null; is_active: boolean },
  items: StepDraft[],
): Promise<string> {
  let templateId = template.id;
  if (templateId) {
    const { error } = await supabase
      .from("activity_step_template_master")
      .update({
        group_name: template.group_name,
        template_name: template.template_name,
        description: template.description,
        is_active: template.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("activity_step_template_master")
      .insert({
        group_name: template.group_name,
        template_name: template.template_name,
        description: template.description,
        is_active: template.is_active,
      })
      .select("id")
      .single();
    if (error) throw error;
    templateId = data.id as string;
  }

  // Replace the whole item list — templates are small (a handful of steps),
  // so delete-and-reinsert is simpler and safer than diffing.
  const { error: delError } = await supabase.from("activity_step_template_item").delete().eq("template_id", templateId);
  if (delError) throw delError;
  if (items.length > 0) {
    const { error: insError } = await supabase.from("activity_step_template_item").insert(
      items.map((it) => ({
        template_id: templateId,
        step_no: it.step_no,
        step_name: it.step_name,
        weight: it.weight,
        discipline: it.discipline ?? null,
        resource_crew: it.resource_crew ?? null,
        est_duration_days: it.est_duration_days ?? null,
        inspection_hold_point: it.inspection_hold_point ?? false,
        notes: it.notes,
      })),
    );
    if (insError) throw insError;
  }
  return templateId;
}

export async function deleteTemplate(supabase: SupabaseClient, templateId: string): Promise<void> {
  const { error } = await supabase.from("activity_step_template_master").delete().eq("id", templateId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Per-task steps (independently editable once assigned)
// ---------------------------------------------------------------------------

export async function listTaskSteps(supabase: SupabaseClient, taskId: string): Promise<WbsTaskStep[]> {
  const { data, error } = await supabase
    .from("wbs_task_steps")
    .select("id, task_id, source_template_id, step_no, step_name, weight, progress, start_date, end_date, discipline, resource_crew, est_duration_days, inspection_hold_point, notes")
    .eq("task_id", taskId)
    .order("step_no", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WbsTaskStep[];
}

/** Copies a template's steps onto a task, replacing any steps already there. */
export async function assignTemplateToTask(supabase: SupabaseClient, taskId: string, templateId: string): Promise<void> {
  const items = await listTemplateItems(supabase, templateId);
  const { error: delError } = await supabase.from("wbs_task_steps").delete().eq("task_id", taskId);
  if (delError) throw delError;
  if (items.length === 0) return;
  const { error } = await supabase.from("wbs_task_steps").insert(
    items.map((it) => ({
      task_id: taskId,
      source_template_id: templateId,
      step_no: it.step_no,
      step_name: it.step_name,
      weight: it.weight,
      progress: 0,
      discipline: it.discipline,
      resource_crew: it.resource_crew,
      est_duration_days: it.est_duration_days,
      inspection_hold_point: it.inspection_hold_point,
      notes: it.notes,
    })),
  );
  if (error) throw error;
}

export async function clearTaskSteps(supabase: SupabaseClient, taskId: string): Promise<void> {
  const { error } = await supabase.from("wbs_task_steps").delete().eq("task_id", taskId);
  if (error) throw error;
}

export async function upsertTaskStep(
  supabase: SupabaseClient,
  taskId: string,
  step: Partial<WbsTaskStep> & { step_no: number; step_name: string },
): Promise<void> {
  const payload = {
    task_id: taskId,
    step_no: step.step_no,
    step_name: step.step_name,
    weight: step.weight ?? 0,
    progress: step.progress ?? 0,
    start_date: step.start_date ?? null,
    end_date: step.end_date ?? null,
    discipline: step.discipline ?? null,
    resource_crew: step.resource_crew ?? null,
    est_duration_days: step.est_duration_days ?? null,
    inspection_hold_point: step.inspection_hold_point ?? false,
    notes: step.notes ?? null,
  };
  if (step.id) {
    const { error } = await supabase.from("wbs_task_steps").update(payload).eq("id", step.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("wbs_task_steps").insert(payload);
    if (error) throw error;
  }
}

export async function deleteTaskStep(supabase: SupabaseClient, stepId: string): Promise<void> {
  const { error } = await supabase.from("wbs_task_steps").delete().eq("id", stepId);
  if (error) throw error;
}
