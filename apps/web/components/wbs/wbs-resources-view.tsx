"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, Users, DollarSign, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { type WbsTaskRecord, type WbsNodeData } from "@/components/wbs/wbs-types";

interface WbsResourcesViewProps {
  tasks: WbsTaskRecord[];
  node: WbsNodeData;
}

export function WbsResourcesView({ tasks, node }: WbsResourcesViewProps) {
  const disciplineStats = useMemo(() => {
    const map = new Map<string, { count: number; hours: number; cost: number; progress: number }>();
    for (const t of tasks) {
      const disc = t.discipline ?? "Unassigned";
      const existing = map.get(disc) ?? { count: 0, hours: 0, cost: 0, progress: 0 };
      existing.count++;
      existing.hours += t.planned_hours ?? 0;
      existing.cost += t.budget_cost ?? 0;
      existing.progress += t.progress;
      map.set(disc, existing);
    }
    const entries = Array.from(map.entries());
    for (const [, v] of entries) {
      v.progress = Math.round(v.progress / v.count);
    }
    return entries.sort((a, b) => b[1].count - a[1].count);
  }, [tasks]);

  const totalBudget = useMemo(() => tasks.reduce((s, t) => s + (t.budget_cost ?? 0), 0), [tasks]);
  const totalActual = useMemo(() => tasks.reduce((s, t) => s + (t.actual_cost ?? 0), 0), [tasks]);
  const totalPlannedHours = useMemo(() => tasks.reduce((s, t) => s + (t.planned_hours ?? 0), 0), [tasks]);
  const totalActualHours = useMemo(() => tasks.reduce((s, t) => s + (t.actual_hours ?? 0), 0), [tasks]);

  if (disciplineStats.length === 0 && totalBudget === 0 && totalPlannedHours === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <BarChart3 className="h-8 w-8 mb-2" />
        <p className="text-xs">No resource data for this node</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <DollarSign className="h-3 w-3" /> Budget vs Actual
            </div>
            <div className="mt-1 text-sm font-bold">
              ${(totalActual || totalBudget) ? totalActual.toLocaleString() : "—"}
              {totalBudget > 0 && <span className="text-[10px] font-normal text-slate-400 ml-1">/ ${totalBudget.toLocaleString()}</span>}
            </div>
            {totalBudget > 0 && (
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    totalActual / totalBudget > 0.9 ? "bg-red-500" : totalActual / totalBudget > 0.7 ? "bg-amber-500" : "bg-emerald-500",
                  )}
                  style={{ width: `${Math.min(100, (totalActual / totalBudget) * 100)}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Clock className="h-3 w-3" /> Hours
            </div>
            <div className="mt-1 text-sm font-bold">
              {totalActualHours}h
              {totalPlannedHours > 0 && <span className="text-[10px] font-normal text-slate-400 ml-1">/ {totalPlannedHours}h planned</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <Users className="h-3 w-3" /> Resource Count
            </div>
            <div className="mt-1 text-sm font-bold">
              {tasks.filter((t) => t.owner_name).length}
              <span className="text-[10px] font-normal text-slate-400 ml-1">assigned / {tasks.length} total</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Discipline breakdown */}
      {disciplineStats.length > 0 && (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <h3 className="mb-2 text-xs font-semibold">Discipline Breakdown</h3>
            <div className="space-y-2">
              {disciplineStats.map(([discipline, stats]) => (
                <div key={discipline} className="rounded-lg bg-slate-50 p-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{discipline}</span>
                    <span className="text-[10px] text-slate-500">{stats.count} tasks · {stats.hours}h</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-slate-900" style={{ width: `${stats.progress}%` }} />
                    </div>
                    <span className="text-[10px] w-8 text-right">{stats.progress}%</span>
                  </div>
                  {stats.cost > 0 && (
                    <div className="mt-1 text-[10px] text-slate-500">Budget: ${stats.cost.toLocaleString()}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Node cost comparison */}
      {(node.budget_cost || node.actual_cost) && (
        <Card className="rounded-xl border-slate-200 shadow-sm">
          <CardContent className="p-3">
            <h3 className="mb-2 text-xs font-semibold">Node Cost Summary</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-500">Budget Cost (node)</span>
                <span className="font-semibold">{node.budget_cost != null ? `$${node.budget_cost.toLocaleString()}` : "—"}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-500">Actual Cost (node)</span>
                <span className="font-semibold">{node.actual_cost != null ? `$${node.actual_cost.toLocaleString()}` : "—"}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-500">Planned Hours (node)</span>
                <span className="font-semibold">{node.planned_hours != null ? `${node.planned_hours}h` : "—"}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-500">Actual Hours (node)</span>
                <span className="font-semibold">{node.actual_hours != null ? `${node.actual_hours}h` : "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
