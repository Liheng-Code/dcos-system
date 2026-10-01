"use client";

import { useEffect, useState } from "react";
import { listProfiles } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Users } from "lucide-react";
import { subDays, format } from "date-fns";

interface WorkforceStats {
  total: number;
  active: number;
  newJoiners: number;
  resigned: number;
  departments: { name: string; count: number }[];
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<WorkforceStats>({
    total: 0,
    active: 0,
    newJoiners: 0,
    resigned: 0,
    departments: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const thirtyDaysAgo = subDays(new Date(), 30).toISOString().split("T")[0];

    // Fetch workforce statistics
    listProfiles("status, department, join_date")
      .then(({ data }) => {
        if (data) {
          const stats: WorkforceStats = {
            total: data.length,
            active: data.filter((p) => p.status === "active").length,
            newJoiners: data.filter((p) => p.join_date && p.join_date >= thirtyDaysAgo).length,
            resigned: data.filter((p) => p.status === "resigned").length,
            departments: [],
          };

          // Count by department
          const deptCounts: Record<string, number> = {};
          data.forEach((p) => {
            const dept = p.department || "Unassigned";
            deptCounts[dept] = (deptCounts[dept] || 0) + 1;
          });

          stats.departments = Object.entries(deptCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);

          setStats(stats);
        }
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">HR Analytics</h2>
        <p className="text-muted-foreground">Workforce metrics and insights</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Employees</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New Joiners (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.newJoiners}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resigned (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.resigned}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Headcount by Department</CardTitle>
            <CardDescription>Current distribution of staff</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Loading data...</p>
              </div>
            ) : stats.departments.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-muted-foreground">No department data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stats.departments.map((dept) => (
                  <div key={dept.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{dept.name}</span>
                      <span className="text-muted-foreground">{dept.count}</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${(dept.count / stats.total) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Key Metrics</CardTitle>
            <CardDescription>Summary statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Active Rate</p>
                <p className="text-2xl font-bold">
                  {stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : "—"}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Turnover (30d)</p>
                <p className="text-2xl font-bold">
                  {stats.total > 0 ? ((stats.resigned / stats.total) * 100).toFixed(1) : "—"}%
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">New Joiners (30d)</p>
                <p className="text-2xl font-bold">{stats.newJoiners}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance Overview</CardTitle>
          <CardDescription>Monthly attendance statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-muted/50 p-8 text-center">
            <BarChart className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-muted-foreground">Attendance charts available soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
