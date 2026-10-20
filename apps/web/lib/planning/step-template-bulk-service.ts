// Bulk-assigns Activity Step Templates to a project's activities
// (Planning › Activity Step Templates › Apply to Activities).
//
// Each assigned activity gets the template's steps copied in (as assignTemplateToTask
// does for one activity) with their days and dates already spread over the activity's
// duration (see activity-step-spread.ts). Activities with progress recorded are never
// touched: replacing their steps would reset that progress.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_DAYS_CALENDAR, isDurationBasis, resolveActivityDuration, spreadSteps, type SpreadStep } from "./activity-step-spread";
import type { ActivityStepTemplateItem } from "./activity-steps-service";
import { loadProjectCalendar } from "./project-schedule";
import { engineDuration } from "./schedule-engine";
import { normaliseActivityName } from "./step-template-matching";

const PAGE = 1000;
const CHUNK = 200;

export interface StepActivityRow {
  id: string;
  task_code: string | null;
  task_name: string;
  wbs_code: string | null;
  wbs_name: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_days: number | null;
  duration_unit: string | null;
  is_milestone: boolean;
  progress: number;
  stepCount: number;
  stepTemplateId: string | null;
  stepsMaxProgress: number;
}

export type StepActivityStatus = "milestone" | "in_progress" | "has_steps" | "no_steps";

export function activityStatus(r: StepActivityRow): StepActivityStatus {
  if (r.is_milestone) return "milestone";
  if (Number(r.progress) > 0 || r.stepsMaxProgress > 0) return "in_progress";
  if (r.stepCount > 0) return "has_steps";
  return "no_steps";
}

async function paged<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await fetchPage(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/** Every activity of the project with its WBS element and current steps. */
export async function listActivitiesForSteps(supabase: SupabaseClient, projectId: string): Promise<StepActivityRow[]> {
  type TaskRow = {
    id: string; task_code: string | null; task_name: string; start_date: string | null; end_date: string | null;
    duration_days: number | null; duration_unit: string | null; is_milestone: boolean | null; progress: number | null;
    wbs_nodes: { wbs_code: string | null; wbs_name: string | null } | { wbs_code: string | null; wbs_name: string | null }[] | null;
  };
  type StepRow = { task_id: string; progress: number; source_template_id: string | null };

  const [tasks, steps] = await Promise.all([
    paged<TaskRow>((from, to) =>
      supabase
        .from("wbs_tasks")
        .select("id, task_code, task_name, start_date, end_date, duration_days, duration_unit, is_milestone, progress, wbs_nodes(wbs_code, wbs_name)")
        .eq("project_id", projectId)
        .order("task_code")
        .order("id")
        .range(from, to)),
    paged<StepRow>((from, to) =>
      supabase
        .from("wbs_task_steps")
        .select("task_id, progress, source_template_id, wbs_tasks!inner(project_id)")
        .eq("wbs_tasks.project_id", projectId)
        .order("id")
        .range(from, to)),
  ]);

  const byTask = new Map<string, { count: number; max: number; template: string | null }>();
  for (const s of steps) {
    const cur = byTask.get(s.task_id) ?? { count: 0, max: 0, template: null };
    cur.count++;
    cur.max = Math.max(cur.max, Number(s.progress) || 0);
    cur.template = cur.template ?? s.source_template_id;
    byTask.set(s.task_id, cur);
  }

  return tasks.map((t) => {
    const node = Array.isArray(t.wbs_nodes) ? t.wbs_nodes[0] : t.wbs_nodes;
    const st = byTask.get(t.id);
    return {
      id: t.id,
      task_code: t.task_code,
      task_name: t.task_name,
      wbs_code: node?.wbs_code ?? null,
      wbs_name: node?.wbs_name ?? null,
      start_date: t.start_date,
      end_date: t.end_date,
      duration_days: t.duration_days,
      duration_unit: t.duration_unit,
      is_milestone: !!t.is_milestone,
      progress: Number(t.progress) || 0,
      stepCount: st?.count ?? 0,
      stepTemplateId: st?.template ?? null,
      stepsMaxProgress: st?.max ?? 0,
    };
  });
}

// ── Remembered matches ───────────────────────────────────────────────────────

export async function listRememberedMatches(supabase: SupabaseClient): Promise<Map<string, string>> {
  const rows = await paged<{ name_key: string; template_id: string }>((from, to) =>
    supabase.from("activity_step_template_match").select("name_key, template_id").order("name_key").range(from, to));
  return new Map(rows.map((r) => [r.name_key, r.template_id]));
}

/** Remembers "activity name → template" so the next project gets the same suggestion. */
export async function rememberMatches(supabase: SupabaseClient, pairs: { activityName: string; templateId: string }[]): Promise<void> {
  const byKey = new Map<string, { name_key: string; template_id: string; example_name: string }>();
  for (const p of pairs) {
    const key = normaliseActivityName(p.activityName);
    if (key) byKey.set(key, { name_key: key, template_id: p.templateId, example_name: p.activityName });
  }
  const rows = [...byKey.values()];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("activity_step_template_match").upsert(rows.slice(i, i + CHUNK), { onConflict: "name_key" });
    if (error) throw new Error(error.message);
  }
}

// ── Bulk apply ───────────────────────────────────────────────────────────────

export interface BulkApplyResult {
  applied: number;
  steps: number;
  skipped: { taskId: string; reason: string }[];
}

export async function applyStepTemplatesBulk(
  supabase: SupabaseClient,
  projectId: string,
  activities: StepActivityRow[],
  assignments: { taskId: string; templateId: string }[],
  opts: { replace: boolean },
): Promise<BulkApplyResult> {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const skipped: BulkApplyResult["skipped"] = [];
  const todo: { activity: StepActivityRow; templateId: string }[] = [];
  for (const a of assignments) {
    const act = byId.get(a.taskId);
    if (!act) continue;
    const status = activityStatus(act);
    if (status === "milestone") skipped.push({ taskId: a.taskId, reason: "milestone" });
    else if (status === "in_progress") skipped.push({ taskId: a.taskId, reason: "progress recorded" });
    else if (status === "has_steps" && !opts.replace) skipped.push({ taskId: a.taskId, reason: "already has steps" });
    else todo.push({ activity: act, templateId: a.templateId });
  }
  if (todo.length === 0) return { applied: 0, steps: 0, skipped };

  const templateIds = [...new Set(todo.map((t) => t.templateId))];

  const [projectCal, itemsRes, work] = await Promise.all([
    loadProjectCalendar(projectId),
    supabase
      .from("activity_step_template_item")
      .select("id, template_id, step_no, step_name, weight, discipline, resource_crew, est_duration_days, duration_basis, duration_share_pct, inspection_hold_point, notes")
      .in("template_id", templateIds)
      .order("step_no"),
    paged<{ task_id: string; quantity: number | null; quantity_unit: string | null; duration_wd_derived: number | null }>((from, to) =>
      supabase
        .from("plan_task_work")
        .select("task_id, quantity, quantity_unit, duration_wd_derived")
        .eq("project_id", projectId)
        .order("task_id")
        .range(from, to)),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);

  const itemsByTemplate = new Map<string, ActivityStepTemplateItem[]>();
  for (const it of (itemsRes.data ?? []) as ActivityStepTemplateItem[]) {
    const list = itemsByTemplate.get(it.template_id) ?? [];
    list.push(it);
    itemsByTemplate.set(it.template_id, list);
  }
  const workByTask = new Map(work.map((w) => [w.task_id, w]));

  const rows: Record<string, unknown>[] = [];
  let applied = 0;
  const appliedIds: string[] = [];
  for (const { activity: a, templateId } of todo) {
    const items = itemsByTemplate.get(templateId) ?? [];
    if (items.length === 0) {
      skipped.push({ taskId: a.id, reason: "template has no steps" });
      continue;
    }
    const unit = a.duration_unit === "cd" ? "cd" : "wd";
    const cal = unit === "cd" ? ALL_DAYS_CALENDAR : projectCal;
    const scheduled = engineDuration(projectCal, {
      start: a.start_date, finish: a.end_date, isMilestone: a.is_milestone, durationDays: a.duration_days, unit,
    }).durationWd;
    const duration = resolveActivityDuration(scheduled, unit, workByTask.get(a.id) ?? null);

    const spreadInput: SpreadStep[] = items.map((it, i) => ({
      id: String(i),
      duration_basis: isDurationBasis(it.duration_basis) ? it.duration_basis : "scaled",
      duration_share_pct: it.duration_share_pct,
      est_duration_days: it.est_duration_days,
      progress: 0,
      start_date: null,
      end_date: null,
    }));
    const spread = new Map(spreadSteps(spreadInput, duration.days, a.start_date, cal).updates.map((u) => [u.id, u]));

    items.forEach((it, i) => {
      const u = spread.get(String(i));
      rows.push({
        task_id: a.id,
        source_template_id: templateId,
        step_no: it.step_no,
        step_name: it.step_name,
        weight: it.weight,
        progress: 0,
        discipline: it.discipline,
        resource_crew: it.resource_crew,
        duration_basis: spreadInput[i].duration_basis,
        duration_share_pct: it.duration_share_pct,
        est_duration_days: u?.est_duration_days ?? it.est_duration_days,
        start_date: u?.start_date ?? null,
        end_date: u?.end_date ?? null,
        inspection_hold_point: it.inspection_hold_point,
        notes: it.notes,
      });
    });
    applied++;
    appliedIds.push(a.id);
  }

  // Replace: clear the old steps of the activities being re-assigned (none of them has progress).
  const toClear = appliedIds.filter((id) => (byId.get(id)?.stepCount ?? 0) > 0);
  for (let i = 0; i < toClear.length; i += CHUNK) {
    const { error } = await supabase.from("wbs_task_steps").delete().in("task_id", toClear.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < rows.length; i += CHUNK * 2) {
    const { error } = await supabase.from("wbs_task_steps").insert(rows.slice(i, i + CHUNK * 2));
    if (error) throw new Error(error.message);
  }
  return { applied, steps: rows.length, skipped };
}
