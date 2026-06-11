import { NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function GET() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    pendingCount,
    approvedCount,
    todayOT,
    monthlyOT,
    byDepartment,
    recentRequests,
  ] = await Promise.all([
    supabase.from("overtime_requests").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("overtime_requests").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabase
      .from("overtime_requests")
      .select("hours")
      .gte("start_time", todayStart)
      .in("status", ["approved", "in_progress", "completed", "verified", "paid"]),
    supabase
      .from("overtime_requests")
      .select("hours")
      .gte("start_time", monthStart)
      .lte("start_time", monthEnd)
      .in("status", ["approved", "completed", "verified", "paid"]),
    supabase
      .from("overtime_requests")
      .select("department, hours")
      .in("status", ["approved", "completed", "verified", "paid"]),
    supabase
      .from("overtime_requests")
      .select(`
        id, employee_id, ot_type, hours, status, created_at,
        employee:profiles!overtime_requests_employee_id_fkey(full_name, employee_id)
      `)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const todayHours = todayOT.data?.reduce((sum: number, r: any) => sum + (r.hours || 0), 0) ?? 0;
  const monthlyHours = monthlyOT.data?.reduce((sum: number, r: any) => sum + (r.hours || 0), 0) ?? 0;

  const deptMap: Record<string, number> = {};
  byDepartment.data?.forEach((r: any) => {
    if (r.department) deptMap[r.department] = (deptMap[r.department] || 0) + (r.hours || 0);
  });

  return NextResponse.json({
    pending: pendingCount.count ?? 0,
    approved: approvedCount.count ?? 0,
    today_hours: todayHours,
    monthly_hours: monthlyHours,
    by_department: deptMap,
    recent: recentRequests.data ?? [],
  });
}
