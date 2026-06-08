"use client";

import { useEffect, useState, useCallback } from "react";
import { getLookaheadTasks, type LookaheadRow } from "@/lib/schedule-service";
import { CalendarRange, RefreshCw, AlertTriangle, Clock, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";

const WEEKS_OPTIONS = [2, 4, 6] as const;
type WeekOption = (typeof WEEKS_OPTIONS)[number];

function mondayOf(dateStr: string): Date {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d;
}

function formatWeekLabel(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `Week of ${monday.toLocaleDateString("en-US", opts)} – ${friday.toLocaleDateString("en-US", opts)}`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    open:        "bg-slate-100 text-slate-600",
    in_progress: "bg-blue-50 text-blue-700",
    paused:      "bg-amber-50 text-amber-700",
    blocked:     "bg-red-50 text-red-700",
    review:      "bg-violet-50 text-violet-700",
    submitted:   "bg-cyan-50 text-cyan-700",
    completed:   "bg-emerald-50 text-emerald-700",
    closed:      "bg-emerald-100 text-emerald-800",
    rejected:    "bg-rose-50 text-rose-700",
    cancelled:   "bg-slate-100 text-slate-400",
  };
  return map[status] ?? "bg-slate-100 text-slate-600";
}

function delayBadge(delay: string) {
  if (delay === "on_track") return null;
  const map: Record<string, string> = {
    risk:    "bg-amber-50 text-amber-700",
    delayed: "bg-red-50 text-red-700",
    blocked: "bg-rose-50 text-rose-800",
  };
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold", map[delay] ?? "bg-slate-100 text-slate-600")}>
      <AlertTriangle className="h-2.5 w-2.5" />
      {delay}
    </span>
  );
}

export function WbsLookaheadView() {
  const { selectedProjectId, selectedProject } = useProject();
  const [weeks, setWeeks] = useState<WeekOption>(4);
  const [tasks, setTasks] = useState<LookaheadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await getLookaheadTasks(selectedProjectId, weeks);
      setTasks(rows);
    } catch (e: any) {
      setError(e.message ?? "Failed to load look-ahead tasks");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, weeks]);

  useEffect(() => {
    void load();
  }, [load]);

  // Group tasks by week (Monday of their start_date)
  const groups = (() => {
    const map = new Map<string, { monday: Date; tasks: LookaheadRow[] }>();
    tasks.forEach((t) => {
      const monday = mondayOf(t.start_date);
      const key = monday.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { monday, tasks: [] });
      map.get(key)!.tasks.push(t);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  })();

  const today = new Date().toISOString().slice(0, 10);

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

          <Button variant="outline" size="icon" disabled={loading} onClick={load}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!loading && tasks.length === 0 && selectedProjectId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <CalendarRange className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No upcoming tasks in the next {weeks} weeks</p>
          <p className="mt-1 text-xs text-slate-400">Tasks need a start_date set to appear here.</p>
        </div>
      )}

      {/* Week groups */}
      {groups.map(({ monday, tasks: groupTasks }) => {
        const label = formatWeekLabel(monday);
        const hasOverdue = groupTasks.some((t) => t.delay_status === "delayed" || t.delay_status === "blocked");

        return (
          <section key={monday.toISOString()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                hasOverdue ? "text-red-700" : "text-slate-700",
              )}>
                {hasOverdue && <AlertTriangle className="h-4 w-4" />}
                {label}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-600">
                  {groupTasks.length} task{groupTasks.length !== 1 ? "s" : ""}
                </span>
              </h2>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Task</th>
                    <th className="px-3 py-2 text-left">Discipline</th>
                    <th className="px-3 py-2 text-left">Owner</th>
                    <th className="px-3 py-2 text-center">Start</th>
                    <th className="px-3 py-2 text-center">Finish</th>
                    <th className="px-3 py-2 text-center">Progress</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-center">Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {groupTasks.map((t) => {
                    const isStartingToday = t.start_date === today;
                    const isOverdue = t.delay_status === "delayed" || t.delay_status === "blocked";

                    return (
                      <tr
                        key={t.task_id}
                        className={cn(
                          "border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/50",
                          isOverdue && "bg-red-50/30",
                          isStartingToday && "bg-blue-50/40",
                        )}
                      >
                        <td className="px-3 py-2 font-mono font-medium text-slate-700">{t.task_code}</td>
                        <td className="px-3 py-2 font-medium text-slate-800 max-w-[180px] truncate">{t.task_name}</td>
                        <td className="px-3 py-2 text-slate-500">{t.discipline ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-600">{t.owner_name ?? <span className="text-slate-300">Unassigned</span>}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={isStartingToday ? "font-semibold text-blue-700" : ""}>
                            {new Date(t.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-slate-600">
                          {new Date(t.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${t.progress}%` }} />
                            </div>
                            <span className="tabular-nums text-slate-600">{t.progress}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", statusBadge(t.status))}>
                            {t.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {delayBadge(t.delay_status) ?? <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {/* Summary footer */}
      {tasks.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 print:mt-4">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <strong className="text-slate-700">{tasks.length}</strong> tasks in the next {weeks} weeks
          </span>
          {tasks.filter((t) => t.delay_status === "delayed" || t.delay_status === "blocked").length > 0 && (
            <span className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <strong>{tasks.filter((t) => t.delay_status === "delayed" || t.delay_status === "blocked").length}</strong> delayed / blocked
            </span>
          )}
          <span>
            <strong className="text-slate-700">{tasks.filter((t) => !t.owner_name).length}</strong> unassigned
          </span>
        </div>
      )}
    </div>
  );
}
