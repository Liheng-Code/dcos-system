import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { employee_id, project_id, wbs_node_id, task_id, department, ot_type, category, start_time, end_time, hours, reason, remarks } = body;

  if (!employee_id || !ot_type || !start_time || !end_time || !hours || !reason) {
    return NextResponse.json({ error: "employee_id, ot_type, start_time, end_time, hours, and reason are required" }, { status: 400 });
  }

  if (new Date(end_time) <= new Date(start_time)) {
    return NextResponse.json({ error: "end_time must be after start_time" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.from("overtime_requests").insert({
    employee_id,
    project_id: project_id || null,
    wbs_node_id: wbs_node_id || null,
    task_id: task_id || null,
    department: department || null,
    ot_type,
    category: category || "planned",
    start_time,
    end_time,
    hours,
    reason,
    remarks: remarks || null,
    status: "draft",
  }).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: data.id,
    action: "created",
    performed_by: user.id,
    details: { employee_id, ot_type, hours },
  });

  return NextResponse.json(data, { status: 201 });
}

export async function GET(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const employee_id = searchParams.get("employee_id");
  const project_id = searchParams.get("project_id");
  const ot_type = searchParams.get("ot_type");
  const date_from = searchParams.get("date_from");
  const date_to = searchParams.get("date_to");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const supabase = createAdminClient();

  let query = supabase
    .from("overtime_requests")
    .select(`
      *,
      employee:profiles!overtime_requests_employee_id_fkey(full_name, employee_id, avatar_url),
      project:projects(project_code, project_name)
    `)
    .order("created_at", { ascending: false });

  if (status) {
    const statuses = status.split(",");
    query = query.in("status", statuses);
  }
  if (employee_id) query = query.eq("employee_id", employee_id);
  if (project_id) query = query.eq("project_id", project_id);
  if (ot_type) query = query.eq("ot_type", ot_type);
  if (date_from) query = query.gte("start_time", date_from);
  if (date_to) query = query.lte("start_time", date_to);

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("overtime_requests")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({ data, total: count ?? 0, page, limit });
}
