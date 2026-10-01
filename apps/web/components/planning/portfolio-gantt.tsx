"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, GanttChartSquare, AlertTriangle, TrendingUp, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROW_HEIGHT, HEADER_H } from "./gantt-types";
import { daysBetweenDates, toX, getZoomDayWidth } from "./gantt-utils";
import type { ScheduleLevel } from "./gantt-types";
import { GanttHeader } from "./gantt-header";
import { GanttMilestone } from "./gantt-milestone";
import { getPortfolioSchedule } from "@/lib/planning/planning-queries";

interface PortfolioProject {
  project_id: string;
  project_code: string;
  project_name: string;
  project_status: string;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  task_count: number;
  delayed_count: number;
  milestone_count: number;
  total_budget: number;
  total_actual: number;
  spi: number | null;
  cpi: number | null;
}

interface PortfolioGanttProps {
  scheduleLevel: ScheduleLevel;
}

export function PortfolioGantt({ scheduleLevel }: PortfolioGanttProps) {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    getPortfolioSchedule()
      .then(({ data, error }) => {
        if (error) {
          setFetchError(error.message || "Failed to load portfolio data — run `supabase migration up` to apply the schedule levels migration.");
        } else {
          setProjects((data || []) as PortfolioProject[]);
        }
        setLoading(false);
      });
  }, [supabase]);

  const dateRange = useMemo(() => {
    const allDates = projects.flatMap((p) => [p.start_date, p.end_date].filter(Boolean) as string[]);
    if (!allDates.length) return { min: new Date(), max: new Date() };
    const min = new Date(Math.min(...allDates.map((d) => new Date(d).getTime())));
    const max = new Date(Math.max(...allDates.map((d) => new Date(d).getTime())));
    return { min, max };
  }, [projects]);

  const totalDays = daysBetweenDates(dateRange.min, dateRange.max);
  const dayW = getZoomDayWidth("month");
  const chartW = totalDays * dayW;

  const totalBudget = projects.reduce((s, p) => s + p.total_budget, 0);
  const totalActual = projects.reduce((s, p) => s + p.total_actual, 0);
  const avgSpi = projects.filter((p) => p.spi !== null).length
    ? projects.reduce((s, p) => s + (p.spi ?? 0), 0) / projects.filter((p) => p.spi !== null).length
    : null;
  const avgCpi = projects.filter((p) => p.cpi !== null).length
    ? projects.reduce((s, p) => s + (p.cpi ?? 0), 0) / projects.filter((p) => p.cpi !== null).length
    : null;
  const totalDelayed = projects.reduce((s, p) => s + p.delayed_count, 0);
  const totalTasks = projects.reduce((s, p) => s + p.task_count, 0);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <AlertTriangle className="mb-2 h-8 w-8 text-amber-500" />
        <p className="text-xs text-amber-600">{fetchError}</p>
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <GanttChartSquare className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-xs">No active projects for portfolio view</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3">
      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3 px-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GanttChartSquare className="h-3.5 w-3.5" />
            Active Projects
          </div>
          <div className="mt-1 text-2xl font-bold">{projects.length}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" />
            Delayed Tasks
          </div>
          <div className={cn("mt-1 text-2xl font-bold", totalDelayed > 0 ? "text-red-600" : "text-green-600")}>
            {totalDelayed}/{totalTasks}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Avg SPI
          </div>
          <div className={cn("mt-1 text-2xl font-bold", avgSpi !== null && avgSpi >= 1 ? "text-green-600" : "text-amber-600")}>
            {avgSpi !== null ? avgSpi.toFixed(2) : "-"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            Avg CPI
          </div>
          <div className={cn("mt-1 text-2xl font-bold", avgCpi !== null && avgCpi >= 1 ? "text-green-600" : "text-amber-600")}>
            {avgCpi !== null ? avgCpi.toFixed(2) : "-"}
          </div>
        </div>
      </div>

      {/* Portfolio Gantt */}
      <div className="flex flex-1 overflow-hidden px-4 pb-3">
        {/* Project list (left) */}
        <div className="shrink-0 overflow-y-auto border border-border rounded-l-lg bg-card" style={{ width: 300 }}>
          <div
            className="sticky top-0 z-10 bg-muted/50 border-b border-border px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ height: HEADER_H }}
          >
            Project
          </div>
          {projects.map((p) => (
            <div
              key={p.project_id}
              className="flex flex-col justify-center border-b border-border/30 px-3 hover:bg-muted/10 transition-colors"
              style={{ height: ROW_HEIGHT }}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  p.delayed_count > 0 ? "bg-red-500" : p.progress < 50 ? "bg-amber-500" : "bg-green-500",
                )} />
                <span className="text-xs font-semibold">{p.project_name}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[9px] text-muted-foreground">{p.project_code}</span>
                <span className={cn(
                  "text-[9px] font-medium",
                  p.spi !== null && p.spi < 0.9 ? "text-red-600" : p.spi !== null && p.spi < 1 ? "text-amber-600" : "text-green-600",
                )}>
                  SPI: {p.spi?.toFixed(2) ?? "-"}
                </span>
                <span className={cn(
                  "text-[9px] font-medium",
                  p.cpi !== null && p.cpi < 0.9 ? "text-red-600" : p.cpi !== null && p.cpi < 1 ? "text-amber-600" : "text-green-600",
                )}>
                  CPI: {p.cpi?.toFixed(2) ?? "-"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline (right) */}
        <div className="flex-1 overflow-auto border border-l-0 border-border rounded-r-lg bg-card">
          <div className="min-w-fit">
            <GanttHeader
              zoom="month"
              rangeMin={dateRange.min}
              rangeMax={dateRange.max}
              totalDays={totalDays}
            />
            <div className="relative" style={{ width: chartW }}>
              {projects.map((p) => {
                const es = p.start_date || dateRange.min.toISOString().slice(0, 10);
                const ef = p.end_date || dateRange.max.toISOString().slice(0, 10);
                const x = toX(es, dateRange.min, dayW);
                const w = Math.max(dayW, daysBetweenDates(new Date(es), new Date(ef)) * dayW);

                return (
                  <div
                    key={p.project_id}
                    className="relative border-b border-border/30 hover:bg-muted/10 transition-colors"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 h-5 rounded-full shadow-sm",
                        p.delayed_count > 0 ? "bg-red-400" : p.progress < 50 ? "bg-amber-400" : "bg-green-500",
                      )}
                      style={{ left: x, width: w, minWidth: dayW }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-white/20"
                        style={{ width: `${p.progress}%`, minWidth: p.progress > 0 ? 4 : 0 }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-white leading-none truncate">
                        {p.progress}% · {p.task_count} tasks
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
