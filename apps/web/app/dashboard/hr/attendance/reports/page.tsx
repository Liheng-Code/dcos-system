"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

interface ReportRow {
  employee_id: string;
  full_name: string;
  department: string | null;
  present: number;
  late: number;
  absent: number;
  leave: number;
  wfh: number;
  site_work: number;
  total_hours: number;
  attendance_rate: number;
}

interface DailyTrend {
  date: string;
  present: number;
  late: number;
  absent: number;
}

function getMonthRange(year: number, month: number) {
  const first = new Date(year, month, 1).toISOString().split("T")[0];
  const last = new Date(year, month + 1, 0).toISOString().split("T")[0];
  return { first, last };
}

export default function AttendanceReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [department, setDepartment] = useState("all");
  const [departments, setDepartments] = useState<string[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [trend, setTrend] = useState<DailyTrend[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadDepartments(); }, []);
  useEffect(() => { loadReport(); }, [year, month, department]);

  async function loadDepartments() {
    const supabase = createClient();
    const { data } = await supabase.from("profiles").select("department").eq("status", "active").not("department", "is", null);
    const unique = [...new Set((data ?? []).map(d => d.department as string))].sort();
    setDepartments(unique);
  }

  async function loadReport() {
    setLoading(true);
    const supabase = createClient();
    const { first, last } = getMonthRange(year, month);

    // Get profiles
    let query = supabase.from("profiles").select("id, full_name, department").eq("status", "active");
    if (department !== "all") query = query.eq("department", department);
    const { data: profiles } = await query.order("full_name");

    if (!profiles || profiles.length === 0) { setRows([]); setTrend([]); setLoading(false); return; }

    const ids = profiles.map(p => p.id);

    // Get attendance records for the month
    const { data: records } = await supabase
      .from("attendance_records")
      .select("employee_id, attendance_date, attendance_type, hours_worked")
      .in("employee_id", ids)
      .gte("attendance_date", first)
      .lte("attendance_date", last);

    // Aggregate per employee
    const reportRows: ReportRow[] = profiles.map(p => {
      const empRecords = (records ?? []).filter(r => r.employee_id === p.id);
      const count = (type: string) => empRecords.filter(r => r.attendance_type === type).length;
      const present = count("PRESENT");
      const late = count("LATE");
      const absent = count("ABSENT");
      const leave = count("LEAVE");
      const wfh = count("WFH");
      const site_work = count("SITE_WORK");
      const total_hours = empRecords.reduce((acc, r) => acc + (r.hours_worked ?? 0), 0);
      const workingDays = new Date(year, month + 1, 0).getDate();
      const attendance_rate = workingDays > 0 ? Math.round(((present + late + wfh + site_work) / workingDays) * 100) : 0;
      return { employee_id: p.id, full_name: p.full_name, department: p.department, present, late, absent, leave, wfh, site_work, total_hours: Math.round(total_hours * 10) / 10, attendance_rate };
    });

    setRows(reportRows);

    // Daily trend
    const dateMap: Record<string, DailyTrend> = {};
    (records ?? []).forEach(r => {
      if (!dateMap[r.attendance_date]) dateMap[r.attendance_date] = { date: r.attendance_date, present: 0, late: 0, absent: 0 };
      if (r.attendance_type === "PRESENT" || r.attendance_type === "WFH" || r.attendance_type === "SITE_WORK") dateMap[r.attendance_date].present++;
      else if (r.attendance_type === "LATE") dateMap[r.attendance_date].late++;
      else if (r.attendance_type === "ABSENT") dateMap[r.attendance_date].absent++;
    });
    setTrend(Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)));
    setLoading(false);
  }

  function exportCSV() {
    const headers = ["Employee", "Department", "Present", "Late", "Absent", "Leave", "WFH", "Site Work", "Hours", "Rate %"];
    const csvRows = [
      headers.join(","),
      ...rows.map(r => [
        `"${r.full_name}"`, `"${r.department ?? ""}"`,
        r.present, r.late, r.absent, r.leave, r.wfh, r.site_work, r.total_hours, r.attendance_rate
      ].join(","))
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${year}_${String(month + 1).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = [now.getFullYear(), now.getFullYear() - 1];

  const summaryPresent = rows.reduce((s, r) => s + r.present, 0);
  const summaryLate = rows.reduce((s, r) => s + r.late, 0);
  const summaryAbsent = rows.reduce((s, r) => s + r.absent, 0);
  const avgRate = rows.length ? Math.round(rows.reduce((s, r) => s + r.attendance_rate, 0) / rows.length) : 0;

  // Simple bar chart using divs
  const maxTrendTotal = Math.max(...trend.map(t => t.present + t.late + t.absent), 1);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Attendance Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Monthly summary and trends</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={(v: string | null) => v && setYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={(v: string | null) => v != null && setMonth(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{monthNames.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={department} onValueChange={(v: string | null) => v != null && setDepartment(v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All departments" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={loadReport}><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={rows.length === 0}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Present Days", value: summaryPresent, color: "text-green-600" },
          { label: "Late Days",    value: summaryLate,    color: "text-orange-500" },
          { label: "Absent Days",  value: summaryAbsent,  color: "text-red-500" },
          { label: "Avg Rate",     value: `${avgRate}%`,  color: "text-blue-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily trend chart */}
      {trend.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Daily Attendance Trend</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-24 overflow-x-auto">
              {trend.map(t => {
                const total = t.present + t.late + t.absent;
                const pct = (v: number) => `${Math.round((v / maxTrendTotal) * 100)}%`;
                return (
                  <div key={t.date} className="flex flex-col items-center gap-0.5 flex-shrink-0 w-6" title={`${t.date}: P${t.present} L${t.late} A${t.absent}`}>
                    <div className="w-full flex flex-col justify-end" style={{ height: "80px" }}>
                      <div className="w-full bg-red-400 rounded-t-sm" style={{ height: pct(t.absent) }} />
                      <div className="w-full bg-orange-400" style={{ height: pct(t.late) }} />
                      <div className="w-full bg-green-500 rounded-b-sm" style={{ height: pct(t.present) }} />
                    </div>
                    <span className="text-xs text-muted-foreground" style={{ fontSize: "9px" }}>
                      {new Date(t.date + "T12:00:00").getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500 inline-block" />Present</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400 inline-block" />Late</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400 inline-block" />Absent</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Employee Summary — {monthNames[month]} {year}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data for this period</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Employee</th>
                    <th className="text-center py-2 px-2 font-medium">Present</th>
                    <th className="text-center py-2 px-2 font-medium">Late</th>
                    <th className="text-center py-2 px-2 font-medium">Absent</th>
                    <th className="text-center py-2 px-2 font-medium">Leave</th>
                    <th className="text-center py-2 px-2 font-medium">Hours</th>
                    <th className="text-center py-2 pl-2 font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map(r => (
                    <tr key={r.employee_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{r.full_name}</p>
                        {r.department && <p className="text-xs text-muted-foreground">{r.department}</p>}
                      </td>
                      <td className="text-center py-2 px-2 text-green-600 font-medium">{r.present}</td>
                      <td className="text-center py-2 px-2 text-orange-500">{r.late}</td>
                      <td className="text-center py-2 px-2 text-red-500">{r.absent}</td>
                      <td className="text-center py-2 px-2 text-blue-500">{r.leave}</td>
                      <td className="text-center py-2 px-2">{r.total_hours}h</td>
                      <td className="text-center py-2 pl-2">
                        <Badge variant={r.attendance_rate >= 90 ? "default" : r.attendance_rate >= 75 ? "secondary" : "destructive"} className="text-xs">
                          {r.attendance_rate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
