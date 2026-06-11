import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("overtime_requests")
    .select(`
      *,
      employee:profiles!overtime_requests_employee_id_fkey(full_name, employee_id, avatar_url, department, job_title),
      project:projects(project_code, project_name),
      wbs_node:wbs_nodes(wbs_code, wbs_name),
      task:wbs_tasks(task_code, task_name),
      approvals:overtime_approvals(
        id, approver_level, label, status, remarks, decided_at,
        approver:profiles!overtime_approvals_approver_id_fkey(full_name, avatar_url)
      ),
      attachments:overtime_attachments(id, file_name, file_size, content_type, created_at),
      audit_log:overtime_audit_log(
        id, action, performed_by, details, created_at,
        performer:profiles!overtime_audit_log_performed_by_fkey(full_name)
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("overtime_requests")
    .select("status, employee_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (existing.status !== "draft" && existing.status !== "needs_revision") {
    return NextResponse.json({ error: "Only draft or needs_revision requests can be edited" }, { status: 400 });
  }

  const allowedFields = [
    "project_id", "wbs_node_id", "task_id", "department",
    "ot_type", "category", "start_time", "end_time",
    "hours", "reason", "remarks",
  ];

  const updates: Record<string, any> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (updates.start_time && updates.end_time && new Date(updates.end_time) <= new Date(updates.start_time)) {
    return NextResponse.json({ error: "end_time must be after start_time" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("overtime_requests")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "edited",
    performed_by: user.id,
    details: { updated_fields: Object.keys(updates) },
  });

  return NextResponse.json(data);
}
