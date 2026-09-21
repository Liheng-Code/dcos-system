"use client";

import { useMemo, useState } from "react";
import { CalendarRange, AlertTriangle, Clock, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { useSheetData } from "@/components/planning/use-sheet-data";
import { WbsLookaheadTimeline } from "./wbs-lookahead-timeline";
import { WbsConstraintReadiness } from "./wbs-constraint-readiness";

const WEEKS_OPTIONS = [1, 2, 4, 6] as const;

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

function formatLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function WbsLookaheadView() {
  const { selectedProjectId, selectedProject } = useProject();
  const data = useSheetData(selectedProjectId);

  // null = not yet touched by the user — falls back to the project's data date
  // (or today) and a 4-week window, same default the old week-preset gave.
  const [rangeStartOverride, setRangeStartOverride] = useState<string | null>(null);
  const [rangeEndOverride, setRangeEndOverride] = useState<string | null>(null);

  const defaultStart = data.dataDate ?? new Date().toISOString().slice(0, 10);
  const windowStart = rangeStartOverride ?? defaultStart;
  const windowEnd = useMemo(
    () => rangeEndOverride ?? addDaysIso(windowStart, 4 * 7),
    [rangeEndOverride, windowStart],
  );

  // A user mid-edit of one field can briefly leave end < start — clamp for
  // filtering without clobbering what they're typing in the other field.
  const effectiveEnd = windowEnd < windowStart ? windowStart : windowEnd;

  // Mirrors the old get_lookahead_tasks() RPC filter, computed client-side
  // over the same task set the Planning ▸ Gantt Chart uses.
  const filtered = useMemo(() => {
    return data.tasks
      .filter((t) => {
        if (!t.start_date) return false;
        if (t.start_date < windowStart || t.start_date > effectiveEnd) return false;
        if (EXCLUDED_STATUSES.has(t.status)) return false;
        return true;
      })
      .sort((a, b) => {
        const byStart = (a.start_date ?? "").localeCompare(b.start_date ?? "");
        if (byStart !== 0) return byStart;
        return a.task_code.localeCompare(b.task_code);
      });
  }, [data.tasks, windowStart, effectiveEnd]);

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
            <p className="text-sm text-muted-foreground">
              Upcoming tasks from {formatLong(windowStart)} to {formatLong(effectiveEnd)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick presets — set the end date N weeks after the current start */}
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
            {WEEKS_OPTIONS.map((w) => {
              const presetEnd = addDaysIso(windowStart, w * 7);
              const active = presetEnd === effectiveEnd;
              return (
                <button
                  key={w}
                  onClick={() => setRangeEndOverride(presetEnd)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {w}W
                </button>
              );
            })}
          </div>

          {/* Date range — pick exactly the window you want to see */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            <span>From</span>
            <input
              type="date"
              value={windowStart}
              onChange={(e) => e.target.value && setRangeStartOverride(e.target.value)}
              className="rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring"
            />
            <span>To</span>
            <input
              type="date"
              value={effectiveEnd}
              onChange={(e) => e.target.value && setRangeEndOverride(e.target.value)}
              className="rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring"
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Print header (visible only on print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Look-ahead Plan — {formatLong(windowStart)} to {formatLong(effectiveEnd)}</h1>
        <p className="text-sm text-slate-500">
          {selectedProject?.project_name} · Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      {!data.loading && filtered.length === 0 && selectedProjectId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center print:hidden">
          <CalendarRange className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No upcoming tasks in this date range</p>
          <p className="mt-1 text-xs text-slate-400">Tasks need a start date set to appear here.</p>
        </div>
      )}

      {/* Gantt-bar timeline (screen only — not meaningful on paper) */}
      {filtered.length > 0 && (
        <div className="print:hidden">
          <WbsLookaheadTimeline tasks={filtered} float={data.float} />
        </div>
      )}

      {/* Constraint readiness (Completion Plan 1.8) — screen only */}
      {filtered.length > 0 && (
        <div className="print:hidden">
          <WbsConstraintReadiness tasks={filtered.map((t) => ({ id: t.id, task_code: t.task_code, task_name: t.task_name }))} />
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
            <strong className="text-slate-700">{filtered.length}</strong> tasks in this range
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
