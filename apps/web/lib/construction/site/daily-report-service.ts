// Service layer for Site Daily Reports and Planning Activity Integration (Phase 1)
// Connects site diary execution records to WBS activities, progress review, and productivity logs.

import { createClient } from "@/lib/supabase/client";

export type DailyReportStatus = "draft" | "submitted" | "verified_by_pm" | "closed";

export type ActivityExecutionStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "hindered"
  | "stopped";

export type DelayCategory =
  | "weather"
  | "material"
  | "labor"
  | "subcontractor"
  | "rfi_design"
  | "client"
  | "safety"
  | "other";

export type ActivitySyncStatus = "draft" | "synced" | "pending_approval" | "approved" | "rejected";

export interface StepProgressItem {
  step_id: string;
  step_no: number;
  step_name: string;
  progress: number;
  weight: number;
  is_completed?: boolean;
}

export interface SiteDailyReport {
  id: string;
  project_id: string;
  report_date: string;
  weather_conditions: string | null;
  temperature_low: number | null;
  temperature_high: number | null;
  site_conditions: string | null;
  work_summary: string | null;
  issues_encountered: string | null;
  planned_next_day: string | null;
  status: DailyReportStatus;
  submitted_at: string | null;
  submitted_by: string | null;
  verified_at: string | null;
  verified_by: string | null;
  activities_count: number;
  total_manpower_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined for list view
  author_name?: string | null;
}

export interface DailyReportActivity {
  id: string;
  daily_report_id: string;
  project_id: string;
  task_id: string;
  activity_status: ActivityExecutionStatus;
  progress_before: number;
  progress_today: number;
  actual_start_date: string | null;
  actual_finish_date: string | null;
  step_progress: StepProgressItem[];
  trade_code: string | null;
  headcount: number | null;
  hours_normal: number;
  hours_ot: number;
  quantity_done: number | null;
  quantity_unit: string | null;
  work_description: string | null;
  has_delay: boolean;
  delay_reason: string | null;
  delay_hours_lost: number;
  delay_category: DelayCategory | null;
  progress_review_id: string | null;
  productivity_log_id: string | null;
  delay_event_id: string | null;
  sync_status: ActivitySyncStatus;
  sync_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined from wbs_tasks
  task_code?: string;
  task_name?: string;
  discipline?: string;
}

export interface DailyReportActivityInput {
  id?: string;
  task_id: string;
  activity_status?: ActivityExecutionStatus;
  progress_before?: number;
  progress_today: number;
  actual_start_date?: string | null;
  actual_finish_date?: string | null;
  step_progress?: StepProgressItem[];
  trade_code?: string | null;
  headcount?: number | null;
  hours_normal?: number;
  hours_ot?: number;
  quantity_done?: number | null;
  quantity_unit?: string | null;
  work_description?: string | null;
  has_delay?: boolean;
  delay_reason?: string | null;
  delay_hours_lost?: number;
  delay_category?: DelayCategory | null;
}

export interface PlanningContextActivity {
  task_id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  status: string;
  current_progress: number;
  start_date: string | null;
  end_date: string | null;
  actual_start_date: string | null;
  actual_finish_date: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  norm_id: string | null;
  norm_code: string | null;
  suggested_trade: string | null;
  steps_count: number;
  steps_json: Array<{
    id: string;
    step_no: number;
    step_name: string;
    weight: number;
    progress: number;
    start_date: string | null;
    end_date: string | null;
  }>;
}

export interface TaskSiteDiaryHistory {
  daily_report_id: string;
  report_date: string;
  activity_status: string;
  progress_before: number;
  progress_today: number;
  quantity_done: number | null;
  quantity_unit: string | null;
  trade_code: string | null;
  headcount: number | null;
  hours_total: number;
  work_description: string | null;
  has_delay: boolean;
  delay_reason: string | null;
  delay_hours_lost: number;
  weather_conditions: string | null;
  author_id: string | null;
  created_at: string;
}

export interface SyncDailyReportResult {
  success: boolean;
  total_activities: number;
  activities_direct_synced: number;
  activities_pending_review: number;
  productivity_logs_recorded: number;
  delays_logged: number;
  errors: number;
}

/** Lists site daily reports for a project. */
export async function listDailyReports(projectId: string): Promise<SiteDailyReport[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_daily_reports")
    .select("*")
    .eq("project_id", projectId)
    .order("report_date", { ascending: false })
    .limit(300);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Fetch author display names safely
  const authorIds = Array.from(
    new Set(data.map((r) => r.created_by).filter((id): id is string => Boolean(id)))
  );

  const profileMap = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", authorIds);

    (profiles || []).forEach((p) => {
      if (p.id && p.display_name) profileMap.set(p.id, p.display_name);
    });
  }

  return data.map((row) => ({
    ...row,
    author_name: row.created_by ? profileMap.get(row.created_by) ?? null : null,
  })) as SiteDailyReport[];
}

/** Fetches a single daily report by ID. */
export async function getDailyReport(reportId: string): Promise<SiteDailyReport | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_daily_reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(error.message);
  }

  if (!data) return null;

  let authorName: string | null = null;
  if (data.created_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", data.created_by)
      .maybeSingle();

    authorName = profile?.display_name ?? null;
  }

  return {
    ...data,
    author_name: authorName,
  } as SiteDailyReport;
}

/** Creates a new site daily report header. */
export async function createDailyReport(
  projectId: string,
  payload: {
    report_date: string;
    weather_conditions?: string | null;
    temperature_low?: number | null;
    temperature_high?: number | null;
    site_conditions?: string | null;
    work_summary?: string | null;
    issues_encountered?: string | null;
    planned_next_day?: string | null;
  }
): Promise<SiteDailyReport> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("site_daily_reports")
    .insert([
      {
        ...payload,
        project_id: projectId,
        created_by: authData.user?.id ?? null,
        status: "draft",
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SiteDailyReport;
}

/** Updates a site daily report. */
export async function updateDailyReport(
  reportId: string,
  payload: Partial<SiteDailyReport>
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("site_daily_reports")
    .update(payload)
    .eq("id", reportId);

  if (error) throw new Error(error.message);
}

/** Deletes a daily report and all child activities. */
export async function deleteDailyReport(reportId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("site_daily_reports")
    .delete()
    .eq("id", reportId);

  if (error) throw new Error(error.message);
}

/** Lists activity items associated with a daily report. */
export async function listDailyReportActivities(
  dailyReportId: string
): Promise<DailyReportActivity[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_daily_report_activities")
    .select("*, wbs_tasks(task_code, task_name, discipline)")
    .eq("daily_report_id", dailyReportId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => {
    const task = row.wbs_tasks as { task_code?: string; task_name?: string; discipline?: string } | null;
    return {
      ...row,
      task_code: task?.task_code,
      task_name: task?.task_name,
      discipline: task?.discipline,
      step_progress: Array.isArray(row.step_progress) ? row.step_progress : [],
    } as DailyReportActivity;
  });
}

/** Upserts activity lines for a daily report. */
export async function saveDailyReportActivities(
  dailyReportId: string,
  projectId: string,
  activities: DailyReportActivityInput[]
): Promise<void> {
  const supabase = createClient();

  if (activities.length === 0) return;

  const rows = activities.map((act) => ({
    ...(act.id ? { id: act.id } : {}),
    daily_report_id: dailyReportId,
    project_id: projectId,
    task_id: act.task_id,
    activity_status: act.activity_status ?? "in_progress",
    progress_before: act.progress_before ?? 0,
    progress_today: act.progress_today,
    actual_start_date: act.actual_start_date ?? null,
    actual_finish_date: act.actual_finish_date ?? null,
    step_progress: act.step_progress ?? [],
    trade_code: act.trade_code ?? null,
    headcount: act.headcount ?? null,
    hours_normal: act.hours_normal ?? 0,
    hours_ot: act.hours_ot ?? 0,
    quantity_done: act.quantity_done ?? null,
    quantity_unit: act.quantity_unit ?? null,
    work_description: act.work_description ?? null,
    has_delay: act.has_delay ?? false,
    delay_reason: act.delay_reason ?? null,
    delay_hours_lost: act.delay_hours_lost ?? 0,
    delay_category: act.delay_category ?? null,
  }));

  const { error } = await supabase
    .from("site_daily_report_activities")
    .upsert(rows, { onConflict: "daily_report_id,task_id" });

  if (error) throw new Error(error.message);
}

/** Deletes a single activity line from a report. */
export async function deleteDailyReportActivity(activityId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("site_daily_report_activities")
    .delete()
    .eq("id", activityId);

  if (error) throw new Error(error.message);
}

/** Submits the daily report and synchronizes its activities to the Planning engine. */
export async function syncDailyReportToPlanning(
  dailyReportId: string
): Promise<SyncDailyReportResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("sync_daily_report_to_planning", {
    p_daily_report_id: dailyReportId,
  });

  if (error) throw new Error(error.message);
  return data as SyncDailyReportResult;
}

/** Fetches planning activities active or scheduled on a specific project date. */
export async function getDailyReportPlanningContext(
  projectId: string,
  date?: string
): Promise<PlanningContextActivity[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_daily_report_planning_context", {
    p_project_id: projectId,
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });

  if (error) throw new Error(error.message);
  return (data || []) as PlanningContextActivity[];
}

/** Fetches site diary history and field progress for a specific planning task. */
export async function getTaskSiteDiaryHistory(taskId: string): Promise<TaskSiteDiaryHistory[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_task_site_diary_history", {
    p_task_id: taskId,
  });

  if (error) throw new Error(error.message);
  return (data || []) as TaskSiteDiaryHistory[];
}
