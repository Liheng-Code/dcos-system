"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Users, Building2 } from "lucide-react";

interface AnalyticsData {
  by_department: Record<string, number>;
  by_project: { project: string; hours: number }[];
  by_employee: { name: string; employee_id: string; hours: number }[];
  monthly_trend: Record<string, number>;
  by_status: Record<string, number>;
}

export default function OTAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hr/overtime/analytics")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const maxDeptHours = data?.by_department ? Math.max(...Object.values(data.by_department), 1) : 1;
  const maxEmployeeHours = data?.by_employee ? Math.max(...data.by_employee.map((e) => e.hours), 1) : 1;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-6 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h1 className="text-2xl font-bold tracking-tight">OT Analytics</h1>
        <p className="text-muted-foreground">Overtime trends and breakdowns</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5" /> OT by Department
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.by_department && Object.keys(data.by_department).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(data.by_department)
                  .sort(([, a], [, b]) => b - a)
                  .map(([dept, hrs]) => (
                    <div key={dept} className="flex items-center justify-between">
                      <span className="text-sm font-medium w-32 truncate">{dept}</span>
                      <div className="flex flex-1 items-center gap-2 ml-2">
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(hrs / maxDeptHours) * 100}%` }} />
                        </div>
                        <span className="w-14 text-right text-sm text-muted-foreground">{hrs}h</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" /> Top Employees
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.by_employee && data.by_employee.length > 0 ? (
              <div className="space-y-3">
                {data.by_employee
                  .sort((a, b) => b.hours - a.hours)
                  .slice(0, 10)
                  .map((emp, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm font-medium w-40 truncate">{emp.name}</span>
                      <div className="flex flex-1 items-center gap-2 ml-2">
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${(emp.hours / maxEmployeeHours) * 100}%` }} />
                        </div>
                        <span className="w-14 text-right text-sm text-muted-foreground">{emp.hours}h</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" /> Monthly Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.monthly_trend && Object.keys(data.monthly_trend).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(data.monthly_trend)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([month, hrs]) => (
                    <div key={month} className="flex items-center justify-between">
                      <span className="text-sm font-medium w-24">{month}</span>
                      <div className="flex flex-1 items-center gap-2 ml-2">
                        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${(hrs / Math.max(...Object.values(data.monthly_trend), 1)) * 100}%` }} />
                        </div>
                        <span className="w-14 text-right text-sm text-muted-foreground">{hrs}h</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5" /> By Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.by_status && Object.keys(data.by_status).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(data.by_status).map(([status, hrs]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize w-28">{status.replace(/_/g, " ")}</span>
                    <div className="flex flex-1 items-center gap-2 ml-2">
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${(hrs / Math.max(...Object.values(data.by_status), 1)) * 100}%` }} />
                      </div>
                      <span className="w-14 text-right text-sm text-muted-foreground">{hrs}h</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
