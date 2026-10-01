"use client";

import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  HardHat,
  ShoppingCart,
  Hammer,
  ClipboardCheck,
  ShieldCheck,
  Layers,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { type DisciplineSummary } from "@/lib/reporting/insights-service";

interface Props {
  disciplines: DisciplineSummary[];
  previousDisciplines?: DisciplineSummary[];
  loading: boolean;
}

const DISCIPLINE_META: Record<string, { icon: React.ElementType; color: string }> = {
  Design:        { icon: HardHat,       color: "text-violet-600 bg-violet-50" },
  Procurement:   { icon: ShoppingCart,  color: "text-blue-600 bg-blue-50" },
  Construction:  { icon: Hammer,        color: "text-orange-600 bg-orange-50" },
  "QA/QC":       { icon: ClipboardCheck,color: "text-emerald-600 bg-emerald-50" },
  HSE:           { icon: ShieldCheck,   color: "text-red-600 bg-red-50" },
};

function disciplineMeta(name: string) {
  return DISCIPLINE_META[name] ?? { icon: Layers, color: "text-slate-600 bg-slate-100" };
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className="h-full rounded-full bg-primary transition-all duration-500"
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

export function ModuleOverviewCards({ disciplines, previousDisciplines, loading }: Props) {
  const prevMap = useMemo(() => {
    if (!previousDisciplines) return new Map<string, DisciplineSummary>();
    return new Map(previousDisciplines.map((d) => [d.discipline, d]));
  }, [previousDisciplines]);
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {disciplines.map((d) => {
        const meta = disciplineMeta(d.discipline);
        const Icon = meta.icon;
        const doneCount =
          (d.statusCounts["completed"] ?? 0) + (d.statusCounts["closed"] ?? 0);
        const donePct = d.totalTasks > 0 ? Math.round((doneCount / d.totalTasks) * 100) : 0;
        const hasVariance = d.totalBudget > 0;
        const overBudget = d.costVariancePct > 0;

        const prev = prevMap.get(d.discipline);
        const progTrend = prev
          ? d.avgProgress - prev.avgProgress
          : null;
        const overdueTrend = prev
          ? d.overdueCount - prev.overdueCount
          : null;
        const blockedTrend = prev
          ? d.blockedCount - prev.blockedCount
          : null;
        const doneTrend = prev
          ? donePct - (prev.totalTasks > 0
              ? Math.round((((prev.statusCounts["completed"] ?? 0) + (prev.statusCounts["closed"] ?? 0)) / prev.totalTasks) * 100)
              : 0)
          : null;

        return (
          <Card key={d.discipline} className="rounded-xl border-slate-200 shadow-sm">
            <CardContent className="p-4">
              {/* Header row */}
              <div className="mb-3 flex items-center gap-2.5">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", meta.color)}>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {React.createElement(Icon as any, { className: "h-4 w-4" })}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{d.discipline}</p>
                  <p className="text-xs text-muted-foreground">{d.totalTasks} task{d.totalTasks !== 1 ? "s" : ""}</p>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span className="inline-flex items-center gap-1 font-medium text-foreground">
                    {d.avgProgress}%
                    {progTrend !== null && progTrend !== 0 && (
                      progTrend > 0
                        ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                        : <TrendingDown className="h-3 w-3 text-red-500" />
                    )}
                  </span>
                </div>
                <ProgressBar value={d.avgProgress} />
              </div>

              {/* Badge row */}
              <div className="flex flex-wrap gap-1.5 text-[11px] font-medium">
                {d.overdueCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-700">
                    <Clock className="h-3 w-3" />
                    {d.overdueCount} overdue
                    {overdueTrend !== null && overdueTrend > 0 && (
                      <TrendingUp className="ml-0.5 h-3 w-3" />
                    )}
                    {overdueTrend !== null && overdueTrend < 0 && (
                      <TrendingDown className="ml-0.5 h-3 w-3" />
                    )}
                  </span>
                )}
                {(d.blockedCount > 0 || (blockedTrend !== null && blockedTrend > 0)) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    {d.blockedCount} blocked
                    {blockedTrend !== null && blockedTrend > 0 && (
                      <TrendingUp className="ml-0.5 h-3 w-3" />
                    )}
                    {blockedTrend !== null && blockedTrend < 0 && (
                      <TrendingDown className="ml-0.5 h-3 w-3" />
                    )}
                  </span>
                )}
                {doneCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    {donePct}% done
                    {doneTrend !== null && doneTrend > 0 && (
                      <TrendingUp className="ml-0.5 h-3 w-3" />
                    )}
                    {doneTrend !== null && doneTrend < 0 && (
                      <TrendingDown className="ml-0.5 h-3 w-3" />
                    )}
                  </span>
                )}
              </div>

              {/* Cost variance */}
              {hasVariance && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
                  <span className="text-muted-foreground">Cost variance</span>
                  <span className={cn(
                    "inline-flex items-center gap-0.5 font-semibold",
                    overBudget ? "text-red-600" : "text-emerald-600",
                  )}>
                    {overBudget
                      ? <TrendingUp className="h-3.5 w-3.5" />
                      : <TrendingDown className="h-3.5 w-3.5" />}
                    {overBudget ? "+" : ""}{d.costVariancePct}%
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
