"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, AlertCircle, TrendingUp, Users, Clock, Zap } from "lucide-react";
import { format, subDays } from "date-fns";

interface WorkforceDashboardStats {
  total_employees: number;
  active_employees: number;
  attendance_today: number;
  absent_today: number;
  on_leave_today: number;
  unallocated_resources: number;
  total_ot_hours: number;
  avg_utilization: number;
  expiring_certificates: number;
  pending_approvals: number;
}

interface ExpiringCertificate {
  id: string;
  certification_name: string;
  expiry_date: string;
  profiles: {
    full_name: string;
    employee_id: string;
  };
}

interface ResourceUtilization {
  employee_id: string;
  full_name: string;
  allocation_percent: number;
}

export default function WorkforceDashboard() {
  const [stats, setStats] = useState<WorkforceDashboardStats>({
    total_employees: 0,
    active_employees: 0,
    attendance_today: 0,
    absent_today: 0,
    on_leave_today: 0,
    unallocated_resources: 0,
    total_ot_hours: 0,
    avg_utilization: 0,
    expiring_certificates: 0,
    pending_approvals: 0,
  });

  const [expiringCerts, setExpiringCerts] = useState<ExpiringCertificate[]>([]);
  const [resourceUtilization, setResourceUtilization] = useState<ResourceUtilization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const today = format(new Date(), "yyyy-MM-dd");
    const thirtyDaysFromNow = format(subDays(new Date(), -30), "yyyy-MM-dd");

    // Fetch workforce statistics
    Promise.all([
      // Total and active employees
      supabase.from("profiles").select("id, status"),
      // Today's attendance
      supabase
        .from("attendance_records")
        .select("attendance_type")
        .eq("attendance_date", today),
      // Timesheets for OT calculation
      supabase.from("timesheets").select("total_ot_hours"),
      // Leave requests
      supabase.from("leave_requests").select("status").eq("status", "submitted"),
      // Expiring certificates
      supabase
        .from("training_certificates")
        .select(
          `id, certification_name, expiry_date, profiles(full_name, employee_id)`
        )
        .lte("expiry_date", thirtyDaysFromNow)
        .gte("expiry_date", today),
      // Resource allocations
      supabase
        .from("employee_project_assignments")
        .select(
          `allocation_percent, profiles(id, full_name)`
        ),
    ]).then(([empRes, attRes, otRes, leaveRes, certRes, resourceRes]) => {
      // Calculate employee stats
      if (empRes.data) {
        const total = empRes.data.length;
        const active = empRes.data.filter((e) => e.status === "active").length;
        setStats((prev) => ({
          ...prev,
          total_employees: total,
          active_employees: active,
        }));
      }

      // Calculate attendance stats
      if (attRes.data) {
        const present = attRes.data.filter((a) => a.attendance_type === "PRESENT").length;
        const absent = attRes.data.filter((a) => a.attendance_type === "ABSENT").length;
        const onLeave = attRes.data.filter((a) => a.attendance_type === "LEAVE").length;
        setStats((prev) => ({
          ...prev,
          attendance_today: present,
          absent_today: absent,
          on_leave_today: onLeave,
        }));
      }

      // Calculate OT hours
      if (otRes.data) {
        const totalOT = otRes.data.reduce((sum, ts) => sum + (ts.total_ot_hours || 0), 0);
        setStats((prev) => ({
          ...prev,
          total_ot_hours: parseFloat(totalOT.toFixed(2)),
        }));
      }

      // Count pending approvals
      if (leaveRes.data) {
        setStats((prev) => ({
          ...prev,
          pending_approvals: leaveRes.data.length,
        }));
      }

      // Expiring certificates
      if (certRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setExpiringCerts(certRes.data as any);
        setStats((prev) => ({
          ...prev,
          expiring_certificates: certRes.data.length,
        }));
      }

      // Resource utilization
      if (resourceRes.data && resourceRes.data.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const utilization = resourceRes.data.map((r: any) => ({
          employee_id: Array.isArray(r.profiles) ? r.profiles[0]?.id : r.profiles?.id,
          full_name: Array.isArray(r.profiles) ? r.profiles[0]?.full_name : r.profiles?.full_name,
          allocation_percent: r.allocation_percent || 0,
        }));

        const unallocated = utilization.filter((u) => u.allocation_percent === 0).length;
        const avg = utilization.length > 0
          ? utilization.reduce((sum, u) => sum + u.allocation_percent, 0) / utilization.length
          : 0;

        setResourceUtilization(utilization.slice(0, 10));
        setStats((prev) => ({
          ...prev,
          unallocated_resources: unallocated,
          avg_utilization: parseFloat(avg.toFixed(1)),
        }));
      }

      setLoading(false);
    });
  }, []);

  const handlePayrollExport = async () => {
    const supabase = createClient();

    // Fetch all required data
    const [timesheets, attendance, leaves] = await Promise.all([
      supabase
        .from("timesheets")
        .select(
          `id, week_start_date, total_hours, total_ot_hours, employee_id, profiles(full_name, employee_id)`
        )
        .order("week_start_date", { ascending: false }),
      supabase
        .from("attendance_records")
        .select(`attendance_date, attendance_type, employee_id, profiles(full_name)`)
        .order("attendance_date", { ascending: false }),
      supabase
        .from("leave_requests")
        .select(
          `start_date, end_date, days_requested, status, employee_id, leave_types(leave_name), profiles(full_name)`
        )
        .eq("status", "approved"),
    ]);

    // Consolidate into payroll package
    const payrollData = {
      export_date: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
      timesheets: timesheets.data || [],
      attendance: attendance.data || [],
      approved_leaves: leaves.data || [],
    };

    // Generate CSV
    let csv = "PAYROLL EXPORT REPORT\n";
    csv += `Export Date: ${payrollData.export_date}\n\n`;

    csv += "=== TIMESHEETS ===\n";
    csv += "Employee,Week Start,Total Hours,OT Hours\n";
    payrollData.timesheets.forEach((ts: any) => {
      csv += `${ts.profiles?.full_name || "N/A"},${ts.week_start_date},${ts.total_hours},${ts.total_ot_hours}\n`;
    });

    csv += "\n=== ATTENDANCE SUMMARY ===\n";
    csv += "Employee,Date,Type\n";
    payrollData.attendance.slice(0, 100).forEach((att: any) => {
      csv += `${att.profiles?.full_name || "N/A"},${att.attendance_date},${att.attendance_type}\n`;
    });

    csv += "\n=== APPROVED LEAVES ===\n";
    csv += "Employee,Start Date,End Date,Days,Leave Type\n";
    payrollData.approved_leaves.forEach((leave: any) => {
      csv += `${leave.profiles?.full_name || "N/A"},${leave.start_date},${leave.end_date},${leave.days_requested},${leave.leave_types?.leave_name || "N/A"}\n`;
    });

    // Download CSV
    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/csv;charset=utf-8," + encodeURIComponent(csv)
    );
    element.setAttribute("download", `payroll_export_${format(new Date(), "yyyy-MM-dd")}.csv`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Workforce Dashboard</h2>
          <p className="text-muted-foreground">Real-time HR analytics and insights</p>
        </div>
        <Button onClick={handlePayrollExport} className="gap-2">
          <Download className="h-4 w-4" /> Export Payroll
        </Button>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_employees}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.active_employees} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Attendance Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.attendance_today}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.absent_today} absent, {stats.on_leave_today} on leave
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resource Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.avg_utilization}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.unallocated_resources} unallocated
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overtime Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_ot_hours}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.pending_approvals} pending approvals
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Expiring Certificates Alert */}
        <Card className={stats.expiring_certificates > 0 ? "border-amber-200 bg-amber-50/30" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Expiring Certificates
            </CardTitle>
            <CardDescription>Within next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : expiringCerts.length === 0 ? (
              <p className="text-green-600 text-sm font-medium">✓ All certificates valid</p>
            ) : (
              <div className="space-y-2">
                {expiringCerts.map((cert) => (
                  <div key={cert.id} className="flex items-center justify-between p-2 text-sm border-l-2 border-amber-400 bg-white rounded">
                    <div>
                      <p className="font-medium">{cert.profiles.full_name}</p>
                      <p className="text-xs text-muted-foreground">{cert.certification_name}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {format(new Date(cert.expiry_date), "dd MMM")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Resource Allocations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Allocations
            </CardTitle>
            <CardDescription>Highest utilization rates</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : resourceUtilization.length === 0 ? (
              <p className="text-muted-foreground text-sm">No allocation data</p>
            ) : (
              <div className="space-y-2">
                {resourceUtilization.sort((a, b) => b.allocation_percent - a.allocation_percent)
                  .slice(0, 5)
                  .map((resource) => (
                    <div key={resource.employee_id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{resource.full_name}</span>
                        <span className="text-muted-foreground">{resource.allocation_percent}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${Math.min(resource.allocation_percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common HR operations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <Button variant="outline" className="justify-start">
              <Users className="mr-2 h-4 w-4" /> View Employees
            </Button>
            <Button variant="outline" className="justify-start">
              <Clock className="mr-2 h-4 w-4" /> Review Attendance
            </Button>
            <Button variant="outline" className="justify-start">
              <Zap className="mr-2 h-4 w-4" /> Manage Skills
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
