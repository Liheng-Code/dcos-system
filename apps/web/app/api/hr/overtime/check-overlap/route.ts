import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startTime = searchParams.get("start_time");
  const endTime = searchParams.get("end_time");
  const employeeId = searchParams.get("employee_id");
  const excludeId = searchParams.get("exclude_id");

  if (!startTime || !endTime) {
    return NextResponse.json({ error: "start_time and end_time are required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const actualEmployeeId = employeeId || user.id;

  const activeStatuses = ["submitted", "approved", "in_progress", "completed", "verified", "paid"];

  let query = supabase
    .from("overtime_requests")
    .select("id, start_time, end_time, hours, ot_type, status")
    .eq("employee_id", actualEmployeeId)
    .in("status", activeStatuses)
    .lt("start_time", endTime)
    .gt("end_time", startTime);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ overlaps: data || [], count: data?.length || 0 });
}
