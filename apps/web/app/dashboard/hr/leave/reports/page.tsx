"use client";

import { useEffect, useState } from "react";
import { listLeaveBalancesByFiscalYear } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReportRow {
  employee_name: string;
  employee_id_code: string;
  department: string;
  leave_type: string;
  allocated: number;
  used: number;
  remaining: number;
  carried_over: number;
}

interface RelatedDepartment {
  name?: string | null;
}

interface RelatedProfile {
  full_name?: string | null;
  employee_id?: string | null;
  departments?: RelatedDepartment | RelatedDepartment[] | null;
}

interface RelatedLeaveType {
  leave_name?: string | null;
}

interface LeaveBalanceReportRecord {
  allocated_days: number | null;
  used_days: number | null;
  remaining_days: number | null;
  carried_over_days: number | null;
  profiles: RelatedProfile | RelatedProfile[] | null;
  leave_types: RelatedLeaveType | RelatedLeaveType[] | null;
}

function firstRelated<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default function LeaveReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listLeaveBalancesByFiscalYear(currentYear)
        .then(({ data }) => {
          const mappedRows = ((data || []) as LeaveBalanceReportRecord[])
            .map((r) => {
              const profile = firstRelated(r.profiles);
              const department = firstRelated(profile?.departments);
              const leaveType = firstRelated(r.leave_types);

              return {
                employee_name: profile?.full_name || "-",
                employee_id_code: profile?.employee_id || "-",
                department: department?.name || "-",
                leave_type: leaveType?.leave_name || "-",
                allocated: r.allocated_days ?? 0,
                used: r.used_days ?? 0,
                remaining: r.remaining_days ?? 0,
                carried_over: r.carried_over_days ?? 0,
              };
            })
            .sort((a, b) => a.employee_name.localeCompare(b.employee_name));

          setRows(mappedRows);
          setLoading(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentYear]);

  const byType = rows.reduce<Record<string, { used: number; allocated: number; count: number }>>((acc, r) => {
    if (!acc[r.leave_type]) acc[r.leave_type] = { used: 0, allocated: 0, count: 0 };
    acc[r.leave_type].used += r.used;
    acc[r.leave_type].allocated += r.allocated;
    acc[r.leave_type].count += 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="leave-page-header flex items-center gap-3">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Leave Reports</h2>
          <p className="text-muted-foreground">Organisation-wide leave utilisation - {currentYear}</p>
        </div>
      </div>

      {!loading && Object.keys(byType).length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(byType).map(([type, stats]) => (
            <Card key={type}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{type}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold">{stats.used}</p>
                    <p className="text-xs text-muted-foreground">days used of {stats.allocated} allocated</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{stats.count} employees</p>
                    <p>{stats.allocated > 0 ? Math.round((stats.used / stats.allocated) * 100) : 0}% utilised</p>
                  </div>
                </div>
                {stats.allocated > 0 && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min((stats.used / stats.allocated) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading report data...</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No leave balance data for {currentYear}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Employee</th>
                    <th className="px-4 py-3 text-left font-medium">Department</th>
                    <th className="px-4 py-3 text-left font-medium">Leave Type</th>
                    <th className="px-4 py-3 text-center font-medium">Allocated</th>
                    <th className="px-4 py-3 text-center font-medium">Carried Over</th>
                    <th className="px-4 py-3 text-center font-medium">Used</th>
                    <th className="px-4 py-3 text-center font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.employee_id_code}-${r.leave_type}-${i}`} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.employee_name}</p>
                        <p className="text-xs text-muted-foreground">{r.employee_id_code}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.department}</td>
                      <td className="px-4 py-3">{r.leave_type}</td>
                      <td className="px-4 py-3 text-center">{r.allocated}</td>
                      <td className="px-4 py-3 text-center text-blue-600">{r.carried_over || 0}</td>
                      <td className="px-4 py-3 text-center">{r.used}</td>
                      <td className={`px-4 py-3 text-center font-medium ${r.remaining <= 0 ? "text-red-600" : "text-green-600"}`}>
                        {r.remaining}
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
