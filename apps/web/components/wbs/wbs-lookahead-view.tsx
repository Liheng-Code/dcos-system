"use client";

import { useMemo, useState } from "react";
import { CalendarRange, RefreshCw, AlertTriangle, Clock, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { useSheetData } from "@/components/planning/use-sheet-data";
import { WbsLookaheadTimeline } from "./wbs-lookahead-timeline";

const WEEKS_OPTIONS = [2, 4, 6] as const;
type WeekOption = (typeof WEEKS_OPTIONS)[number];

/** Statuses that no longer belong in a forward-looking window. */
const EXCLUDED_STATUSES = new Set(["closed", "completed", "cancelled"]);

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WbsLookaheadView() {
  const { selectedProjectId, selectedProject } = useProject();
  const [weeks, setWeeks] = useState<WeekOption>(4);
  const data = useSheetData(selectedProjectId);

  const windowStart = data.dataDate ?? new Date().toISOString().slice(0, 10);
  const windowEnd = useMemo(() => addDaysIso(windowStart, weeks * 7), [windowStart, weeks]);

  // Mirrors the old get_lookahead_tasks() RPC filter, computed client-side
  // over the same task set the Planning ▸ Gantt Chart uses.
  const filtered = useMemo(() => {
    return data.tasks
      .filter((t) => {
        if (!t.start_date) return false;
        if (t.start_date < windowStart || t.start_date > windowEnd) return false;
        if (EXCLUDED_STATUSES.has(t.status)) return false;
        return true;
      })
      .sort((a, b) => {
        const byStart = (a.start_date ?? "").localeCompare(b.start_date ?? "");
        if (byStart !== 0) return byStart;
        return a.task_code.localeCompare(b.task_code);
      });
  }, [data.tasks, windowStart, windowEnd]);

  const delayedOrBlockedCount = filtered.filter(
    (t) => t.delay_status === "delayed" || t.delay_status === "blocked",
  ).length;
  const unassignedCount = filtered.filter((t) => !t.owner_name).length;

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CalendarRange className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Look-ahead Planner</h1>
            <p className="text-sm text-muted-foreground">Upcoming tasks within the next {weeks} weeks</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Week toggle */}
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
            {WEEKS_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setWeeks(w)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  weeks === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {w}W
              </button>
            ))}
          </div>

          <Button variant="outline" size="icon" disabled={data.loading} onClick={() => data.reload()}>
            <RefreshCw className={cn("h-4 w-4", data.loading && "animate-spin")} />
          </Button>

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Print header (visible only on print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Look-ahead Plan — {weeks}-Week</h1>
        <p className="text-sm text-slate-500">
          {selectedProject?.project_name} · Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      {!data.loading && filtered.length === 0 && selectedProjectId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center print:hidden">
          <CalendarRange className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No upcoming tasks in the next {weeks} weeks</p>
          <p className="mt-1 text-xs text-slate-400">Tasks need a start date set to appear here.</p>
        </div>
      )}

      {/* Gantt-bar timeline (screen only — not meaningful on paper) */}
      {filtered.length > 0 && (
        <div className="print:hidden">
          <WbsLookaheadTimeline tasks={filtered} float={data.float} />
        </div>
      )}

      {/* Print-only flat task table */}
      {filtered.length > 0 && (
        <div className="hidden print:block">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1">Code</th>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Discipline</th>
                <th className="px-2 py-1">Owner</th>
                <th className="px-2 py-1">Start</th>
                <th className="px-2 py-1">Finish</th>
                <th className="px-2 py-1">Progress</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Delay</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="px-2 py-1 font-mono">{t.task_code}</td>
                  <td className="px-2 py-1">{t.task_name}</td>
                  <td className="px-2 py-1">{t.discipline ?? "—"}</td>
                  <td className="px-2 py-1">{t.owner_name ?? "Unassigned"}</td>
                  <td className="px-2 py-1">{formatShort(t.start_date)}</td>
                  <td className="px-2 py-1">{formatShort(t.end_date)}</td>
                  <td className="px-2 py-1">{t.progress}%</td>
                  <td className="px-2 py-1">{t.status.replace(/_/g, " ")}</td>
                  <td className="px-2 py-1">{(t.delay_status ?? "on_track").replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary footer */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 print:mt-4">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <strong className="text-slate-700">{filtered.length}</strong> tasks in the next {weeks} weeks
          </span>
          {delayedOrBlockedCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <strong>{delayedOrBlockedCount}</strong> delayed / blocked
            </span>
          )}
          <span>
            <strong className="text-slate-700">{unassignedCount}</strong> unassigned
          </span>
        </div>
      )}
    </div>
  );
}
