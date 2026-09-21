import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { dispatchScheduleAlert } from "@/lib/notifications/dispatch";
import {
  scheduleProject,
  depsFromArrays,
  type EngineTask,
} from "@/lib/planning/schedule-engine";
import {
  buildWorkCalendar,
  todayISO,
  workingDaysBetween,
  type PlanCalendarExceptionRow,
  type PlanCalendarRow,
} from "@/lib/planning/work-calendar";
import { computeScheduleKpis, type KpiTask } from "@/lib/planning/schedule-kpis";
import { buildMonthlyReportHtml, type DelaySummaryRow, type ScurvePoint } from "@/lib/planning/monthly-report-html";

/**
 * Completion Plan 2.8 — generates the monthly progress report queued by
 * advance_data_date() whenever the data date crosses into a new month. Ships
 * as HTML rather than PDF (no PDF-rendering library is installed in this
 * project and none may be added without a user-run `pnpm install` — see the
 * completion-plan decision log). Filed into Document Control as an 'MTH'
 * document + first revision, then dispatches `monthly_report_ready`.
 */

interface TaskRow {
  id: string;
  wbs_node_id: string;
  task_code: string;
  task_name: string;
  start_date: string | null;
  end_date: string | null;
  is_milestone: boolean | null;
  manually_scheduled: boolean | null;
  constraint_type: string | null;
  constraint_date: string | null;
  dependency_task_ids: string[] | null;
  dependency_types: string[] | null;
  dependency_lag_days: number[] | null;
  progress: number | null;
  status: string | null;
}

function toEngineTask(t: TaskRow, cal: ReturnType<typeof buildWorkCalendar>): EngineTask {
  let durationWd = 1;
  if (t.is_milestone) durationWd = 0;
  else if (t.start_date && t.end_date) durationWd = Math.max(1, workingDaysBetween(cal, t.start_date, t.end_date));
  return {
    id: t.id,
    start: t.start_date,
    finish: t.end_date,
    durationWd,
    manuallyScheduled: t.manually_scheduled ?? false,
    constraintType: t.constraint_type,
    constraintDate: t.constraint_date,
    deps: depsFromArrays(t.dependency_task_ids, t.dependency_types, t.dependency_lag_days),
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const supabase = createAdminClient();

  let jobId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    jobId = (body?.jobId as string | undefined) ?? null;
  } catch {
    jobId = null;
  }

  // Resolve (or create) the job row this generation run reports against.
  let job: { id: string; data_date: string } | null = null;
  if (jobId) {
    const { data } = await supabase.from("plan_report_jobs").select("id, data_date").eq("id", jobId).maybeSingle();
    job = data;
  }
  if (!job) {
    const { data } = await supabase
      .from("plan_report_jobs")
      .select("id, data_date")
      .eq("project_id", projectId)
      .eq("status", "queued")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    job = data;
  }
  if (!job) return NextResponse.json({ error: "No queued report job found for this project" }, { status: 404 });

  await supabase.from("plan_report_jobs").update({ status: "running" }).eq("id", job.id);

  try {
    const [taskRes, projectRes, calRes, settingsRes, scurveRes, delayRes] = await Promise.all([
      supabase
        .from("wbs_tasks")
        .select(
          "id, wbs_node_id, task_code, task_name, start_date, end_date, is_milestone, manually_scheduled, constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days, progress, status",
        )
        .eq("project_id", projectId)
        .limit(1000),
      supabase.from("projects").select("project_code, project_name, data_date, end_date, project_manager_id").eq("id", projectId).maybeSingle(),
      supabase
        .from("plan_calendars")
        .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday")
        .eq("project_id", projectId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("plan_schedule_settings")
        .select("critical_float_threshold_days, near_critical_float_threshold_days")
        .eq("project_id", projectId)
        .maybeSingle(),
      supabase.rpc("get_scurve_series", { p_project_id: projectId }),
      supabase.from("delay_register").select("delay_type, lifecycle, impact_days").eq("project_id", projectId),
    ]);

    if (taskRes.error) throw new Error(taskRes.error.message);
    const tasks = (taskRes.data ?? []) as TaskRow[];

    const calRow = (calRes.data ?? null) as PlanCalendarRow | null;
    let exceptions: PlanCalendarExceptionRow[] = [];
    if (calRow) {
      const exRes = await supabase.from("plan_calendar_exceptions").select("exception_date, is_working").eq("calendar_id", calRow.id);
      exceptions = (exRes.data ?? []) as PlanCalendarExceptionRow[];
    }
    const cal = buildWorkCalendar(calRow, exceptions);

    const dataDate = job.data_date ?? projectRes.data?.data_date ?? todayISO();
    const contractEnd = projectRes.data?.end_date ?? null;
    const thresholds = settingsRes.data
      ? { critical: settingsRes.data.critical_float_threshold_days, nearCritical: settingsRes.data.near_critical_float_threshold_days }
      : { critical: 0, nearCritical: 5 };

    const kpiTasks: KpiTask[] = tasks.map((t) => ({ id: t.id, start_date: t.start_date, end_date: t.end_date, progress: t.progress ?? 0, status: t.status ?? "not_started" }));
    let floatMap = new Map();
    let dates = new Map();
    if (tasks.length > 0) {
      const result = scheduleProject(tasks.map((t) => toEngineTask(t, cal)), cal, dataDate, thresholds);
      if (result.ok) {
        floatMap = result.float;
        dates = result.dates;
      }
    }
    const kpis = computeScheduleKpis(kpiTasks, floatMap, dates, cal, dataDate, contractEnd, null);

    const scurve = (scurveRes.data ?? null) as { live?: { pct: number }; actual?: { date: string; pct: number; planned_pct: number }[] } | null;
    const scurveLivePct = scurve?.live?.pct ?? null;
    const scurveHistory: ScurvePoint[] = (scurve?.actual ?? []).slice(-6).map((p) => ({ date: p.date, pct: p.pct, planned_pct: p.planned_pct }));

    const delayRowsRaw = (delayRes.data ?? []) as { delay_type: string; lifecycle: string; impact_days: number | null }[];
    const delayMap = new Map<string, DelaySummaryRow>();
    for (const r of delayRowsRaw) {
      const key = `${r.delay_type}::${r.lifecycle}`;
      const existing = delayMap.get(key);
      if (existing) {
        existing.count++;
        existing.impact_days += r.impact_days ?? 0;
      } else {
        delayMap.set(key, { delay_type: r.delay_type, lifecycle: r.lifecycle, count: 1, impact_days: r.impact_days ?? 0 });
      }
    }

    const html = buildMonthlyReportHtml({
      projectCode: projectRes.data?.project_code ?? projectId,
      projectName: projectRes.data?.project_name ?? "Untitled Project",
      dataDate,
      contractEnd,
      kpis,
      delaySummary: [...delayMap.values()],
      scurveLivePct,
      scurveHistory,
      generatedAt: new Date().toISOString(),
    });

    const monthTag = dataDate.slice(0, 7); // yyyy-mm
    const bucketPath = `documents/${projectId}/reports/${monthTag}-progress.html`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(bucketPath, html, { contentType: "text/html", upsert: true });
    if (uploadError) throw new Error(uploadError.message);
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(bucketPath);

    const { data: docType } = await supabase.from("document_types").select("id").eq("code", "MTH").maybeSingle();
    if (!docType) throw new Error("Document type 'MTH' (Monthly Report) is not seeded");

    const docNumber = `MTH-${monthTag}`;
    const { data: existingDoc } = await supabase
      .from("documents")
      .select("id")
      .eq("project_id", projectId)
      .eq("document_number", docNumber)
      .maybeSingle();

    let documentId: string;
    if (existingDoc) {
      documentId = existingDoc.id as string;
      await supabase.from("documents").update({ status: "ifc", updated_at: new Date().toISOString() }).eq("id", documentId);
      await supabase.from("document_revisions").insert({
        document_id: documentId,
        revision_number: 1,
        file_url: urlData.publicUrl,
        file_name: `${monthTag}-progress.html`,
        uploaded_by: user.id,
        status: "ifc",
      });
    } else {
      const { data: newDoc, error: docError } = await supabase
        .from("documents")
        .insert({
          project_id: projectId,
          document_type_id: docType.id,
          document_number: docNumber,
          title: `Monthly Progress Report — ${monthTag}`,
          status: "ifc",
          current_revision: 1,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (docError) throw new Error(docError.message);
      documentId = newDoc.id as string;
      await supabase.from("document_revisions").insert({
        document_id: documentId,
        revision_number: 1,
        file_url: urlData.publicUrl,
        file_name: `${monthTag}-progress.html`,
        uploaded_by: user.id,
        status: "ifc",
      });
    }

    await supabase.from("plan_report_jobs").update({ status: "done", document_id: documentId }).eq("id", job.id);

    const membersRes = await supabase.from("project_members").select("user_id, role_code").eq("project_id", projectId);
    const PLANNER_ROLE_CODES = ["L0", "L1", "L2", "L3", "L4", "PE"];
    let recipientIds = (membersRes.data ?? [])
      .filter((m) => m.role_code && PLANNER_ROLE_CODES.includes(m.role_code))
      .map((m) => m.user_id as string);
    if (recipientIds.length === 0 && projectRes.data?.project_manager_id) recipientIds = [projectRes.data.project_manager_id];

    await dispatchScheduleAlert(supabase, {
      projectId,
      recipientIds,
      alertType: "monthly_report_ready",
      title: `Monthly report ready — ${monthTag}`,
      body: `The ${monthTag} progress report has been generated and filed in Document Control (${docNumber}).`,
      sourceKey: `schedule:${projectId}:monthly_report:${monthTag}`,
      actorId: user.id,
    });

    return NextResponse.json({ documentId, documentNumber: docNumber, url: urlData.publicUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("plan_report_jobs").update({ status: "failed", error: message }).eq("id", job.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
