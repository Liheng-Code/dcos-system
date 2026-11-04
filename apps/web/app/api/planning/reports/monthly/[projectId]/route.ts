import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { dispatchScheduleAlert } from "@/lib/notifications/dispatch";
import { generateReport, ReportError } from "@/lib/planning/reports/report-filing";

/**
 * Completion Plan 2.8 / doc 35 M: generates the monthly progress report queued by advance_data_date() whenever the
 * data date crosses into a new month. Built and filed like every Planning report (lib/planning/reports/report-filing.ts):
 * read as the caller, PDF + HTML under a new file name, a new Document Control revision of MTH-<yyyy-mm>, and a
 * snapshot in plan_report_snapshots. Then dispatches `monthly_report_ready`.
 */

export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const userDb = await createUserClient();
  const { data: { user } } = await userDb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));
  const jobId = (body?.jobId as string | undefined) ?? null;

  // the caller must be able to see the project's programme before any job is touched
  const { error: accessError } = await userDb.rpc("plan_report_basis", { p_project_id: projectId });
  if (accessError) return NextResponse.json({ error: accessError.message }, { status: accessError.code === "42501" ? 403 : 500 });

  let job: { id: string; data_date: string } | null = null;
  if (jobId) {
    const { data } = await admin.from("plan_report_jobs").select("id, data_date").eq("id", jobId).eq("project_id", projectId).maybeSingle();
    job = data;
  }
  if (!job) {
    const { data } = await admin.from("plan_report_jobs").select("id, data_date").eq("project_id", projectId).eq("status", "queued")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    job = data;
  }
  if (!job) return NextResponse.json({ error: "No queued report job found for this project" }, { status: 404 });

  await admin.from("plan_report_jobs").update({ status: "running" }).eq("id", job.id);
  try {
    const r = await generateReport({ userDb, adminDb: admin, projectId, userId: user.id, type: "monthly" });
    const { data: snap } = await admin.from("plan_report_snapshots").select("document_id").eq("id", r.id).single();
    await admin.from("plan_report_jobs").update({ status: "done", document_id: (snap as { document_id: string | null } | null)?.document_id ?? null }).eq("id", job.id);

    const [{ data: members }, { data: project }] = await Promise.all([
      admin.from("project_members").select("user_id, role_code").eq("project_id", projectId),
      admin.from("projects").select("project_manager_id").eq("id", projectId).maybeSingle(),
    ]);
    const PLANNER_ROLE_CODES = ["L0", "L1", "L2", "L3", "L4", "PE"];
    let recipientIds = (members ?? []).filter((m) => m.role_code && PLANNER_ROLE_CODES.includes(m.role_code)).map((m) => m.user_id as string);
    if (recipientIds.length === 0 && project?.project_manager_id) recipientIds = [project.project_manager_id as string];

    await dispatchScheduleAlert(admin, {
      projectId,
      recipientIds,
      alertType: "monthly_report_ready",
      title: `Monthly report ready — ${r.period_label}`,
      body: `The ${r.period_label} progress report has been generated and filed in Document Control (${r.document_number}, revision ${r.document_revision}).`,
      sourceKey: `schedule:${projectId}:monthly_report:${r.period_label}:${r.document_revision}`,
      actorId: user.id,
    });
    return NextResponse.json(r);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("plan_report_jobs").update({ status: "failed", error: message }).eq("id", job.id);
    return NextResponse.json({ error: message }, { status: e instanceof ReportError ? e.status : 500 });
  }
}
