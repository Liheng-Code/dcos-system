import { NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function GET() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [byDepartment, byProject, byEmployee, monthlyTrend] = await Promise.all([
    supabase
      .from("overtime_requests")
      .select("department, hours")
      .in("status", ["approved", "completed", "verified", "paid"]),
    supabase
      .from("overtime_requests")
      .select("project_id, hours, project:projects(project_code, project_name)")
      .in("status", ["approved", "completed", "verified", "paid"])
      .not("project_id", "is", null),
    supabase
      .from("overtime_requests")
      .select("employee_id, hours, employee:profiles!overtime_requests_employee_id_fkey(full_name, employee_id)")
      .in("status", ["approved", "completed", "verified", "paid"]),
    supabase
      .from("overtime_requests")
      .select("start_time, hours, status")
      .in("status", ["approved", "completed", "verified", "paid"]),
  ]);

  const aggregate = (rows: any[] | null, groupKey: string): Record<string, number> => {
    const map: Record<string, number> = {};
    rows?.forEach((r: any) => {
      const key = typeof r[groupKey] === "object" ? JSON.stringify(r[groupKey]) : r[groupKey] || "Unknown";
      map[key] = (map[key] || 0) + (r.hours || 0);
    });
    return map;
  };

  const byMonth: Record<string, number> = {};
  monthlyTrend.data?.forEach((r: any) => {
    if (r.start_time) {
      const month = r.start_time.substring(0, 7);
      byMonth[month] = (byMonth[month] || 0) + (r.hours || 0);
    }
  });

  const byType: Record<string, number> = {};
  monthlyTrend.data?.forEach((r: any) => {
    byType[r.status] = (byType[r.status] || 0) + (r.hours || 0);
  });

  return NextResponse.json({
    by_department: aggregate(byDepartment.data, "department"),
    by_project: byProject.data?.map((r: any) => ({
      project: r.project?.project_name || r.project_id,
      hours: r.hours,
    })),
    by_employee: byEmployee.data?.map((r: any) => ({
      name: r.employee?.full_name || r.employee_id,
      employee_id: r.employee?.employee_id,
      hours: r.hours,
    })),
    monthly_trend: byMonth,
    by_status: byType,
  });
}
