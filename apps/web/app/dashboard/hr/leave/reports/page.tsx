"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";

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

export default function LeaveReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("leave_balances")
      .select(`
        allocated_days, used_days, remaining_days, carried_over_days,
        profiles(full_name, employee_id, departments(name)),
        leave_types(leave_name)
      `)
      .eq("fiscal_year", currentYear)
      .order("profiles(full_name)")
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRows((data || []).map((r: any) => ({
          employee_name: (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.full_name || "—",
          employee_id_code: (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.employee_id || "—",
          department: (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.departments?.[0]?.name || (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles)?.departments?.name || "—",
          leave_type: (Array.isArray(r.leave_types) ? r.leave_types[0] : r.leave_types)?.leave_name || "—",
          allocated: r.allocated_days,
          used: r.used_days,
          remaining: r.remaining_days,
          carried_over: r.carried_over_days,
        })));
        setLoading(false);
      });
  }, []);

  // Summary totals per leave type
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
        <BarChart2 className="h-6 w-6 text-muted-foreground" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Reports</h2>
          <p className="text-muted-foreground">Organisation-wide leave utilisation — {currentYear}</p>
        </div>
      </div>

      {/* Summary cards */}
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
                  <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
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

      {/* Detail table */}
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
                    <th className="text-left py-3 px-4 font-medium">Employee</th>
                    <th className="text-left py-3 px-4 font-medium">Department</th>
                    <th className="text-left py-3 px-4 font-medium">Leave Type</th>
                    <th className="text-center py-3 px-4 font-medium">Allocated</th>
                    <th className="text-center py-3 px-4 font-medium">Carried Over</th>
                    <th className="text-center py-3 px-4 font-medium">Used</th>
                    <th className="text-center py-3 px-4 font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border hover:bg-muted/30">
                      <td className="py-3 px-4">
                        <p className="font-medium">{r.employee_name}</p>
                        <p className="text-xs text-muted-foreground">{r.employee_id_code}</p>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{r.department}</td>
                      <td className="py-3 px-4">{r.leave_type}</td>
                      <td className="py-3 px-4 text-center">{r.allocated}</td>
                      <td className="py-3 px-4 text-center text-blue-600">{r.carried_over || 0}</td>
                      <td className="py-3 px-4 text-center">{r.used}</td>
                      <td className={`py-3 px-4 text-center font-medium ${r.remaining <= 0 ? "text-red-600" : "text-green-600"}`}>
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
