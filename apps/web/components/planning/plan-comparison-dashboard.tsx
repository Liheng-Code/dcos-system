"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface VarianceRow {
  task_id: string; task_code: string; task_name: string; discipline: string | null;
  planned_start: string; planned_finish: string;
  baseline_start: string; baseline_finish: string;
  start_variance_days: number; finish_variance_days: number; is_delayed: boolean;
}

export function PlanComparisonDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<VarianceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedProjectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    supabase.rpc("get_schedule_variance", { p_project_id: selectedProjectId })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setRows((data || []) as VarianceRow[]);
        setLoading(false);
      });
  }, [supabase, selectedProjectId]);

  const stats = useMemo(() => {
    const total = rows.length;
    const delayed = rows.filter(r => r.is_delayed).length;
    const ahead = rows.filter(r => r.finish_variance_days < 0).length;
    const onTime = total - delayed - ahead;
    const avgVariance = total ? Math.round(rows.reduce((s, r) => s + r.finish_variance_days, 0) / total) : 0;
    return { total, delayed, ahead, onTime, avgVariance };
  }, [rows]);

  if (projectLoading || loading) return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Select a project to view schedule comparison.</div>;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Tasks</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.onTime}</p>
          <p className="text-xs text-muted-foreground">On Time</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{stats.delayed}</p>
          <p className="text-xs text-muted-foreground">Delayed</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{stats.avgVariance}</p>
          <p className="text-xs text-muted-foreground">Avg Variance (days)</p>
        </CardContent></Card>
      </div>

      {/* Variance Table */}
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-left font-medium">Task</th>
              <th className="px-3 py-2 text-left font-medium">Discipline</th>
              <th className="px-3 py-2 text-center font-medium">Baseline Start</th>
              <th className="px-3 py-2 text-center font-medium">Planned Start</th>
              <th className="px-3 py-2 text-center font-medium">Start Var</th>
              <th className="px-3 py-2 text-center font-medium">Baseline Finish</th>
              <th className="px-3 py-2 text-center font-medium">Planned Finish</th>
              <th className="px-3 py-2 text-center font-medium">Finish Var</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.task_id} className={cn("border-b last:border-0", r.is_delayed && "bg-red-50")}>
                <td className="px-3 py-2 font-medium">
                  {r.task_code}
                  <span className="text-muted-foreground ml-1">{r.task_name}</span>
                </td>
                <td className="px-3 py-2">{r.discipline || "—"}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{r.baseline_start?.slice(0, 10)}</td>
                <td className="px-3 py-2 text-center">{r.planned_start?.slice(0, 10)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={cn("inline-flex items-center gap-0.5", r.start_variance_days > 0 ? "text-red-600" : r.start_variance_days < 0 ? "text-green-600" : "")}>
                    {r.start_variance_days > 0 ? <TrendingUp className="h-3 w-3" /> : r.start_variance_days < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {r.start_variance_days > 0 ? "+" : ""}{r.start_variance_days}d
                  </span>
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">{r.baseline_finish?.slice(0, 10)}</td>
                <td className="px-3 py-2 text-center">{r.planned_finish?.slice(0, 10)}</td>
                <td className="px-3 py-2 text-center">
                  <span className={cn("inline-flex items-center gap-0.5", r.finish_variance_days > 0 ? "text-red-600" : r.finish_variance_days < 0 ? "text-green-600" : "")}>
                    {r.finish_variance_days > 0 ? <TrendingUp className="h-3 w-3" /> : r.finish_variance_days < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                    {r.finish_variance_days > 0 ? "+" : ""}{r.finish_variance_days}d
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="text-center py-4 text-sm text-muted-foreground">No tasks with baseline data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
