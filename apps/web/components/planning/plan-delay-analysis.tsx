"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, GitBranch, Loader2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReportExport } from "@/components/reports/layout/report-export";
import { getDependencyLabel } from "@/components/planning/gantt-utils";
import {
  buildWorkCalendar,
  todayISO,
  type PlanCalendarRow,
  type PlanCalendarExceptionRow,
} from "@/lib/planning/work-calendar";
import {
  listComparisonSources,
  resolveSource,
  type ComparisonSourceOption,
} from "@/lib/planning/schedule-comparison-service";
import {
  analyzeDelays,
  traceCause,
  traceImpact,
  type CauseHop,
  type DelayAnalysis,
  type DelayTask,
} from "@/lib/planning/delay-analysis";

interface TaskRow {
  id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  status: string;
  delay_status: string;
  delay_reason: string | null;
  start_date: string | null;
  end_date: string | null;
  baseline_start_date: string | null;
  baseline_finish_date: string | null;
  progress: number | null;
  is_milestone: boolean | null;
  manually_scheduled: boolean | null;
  constraint_type: string | null;
  constraint_date: string | null;
  dependency_task_ids: string[] | null;
  dependency_types: string[] | null;
  dependency_lag_days: number[] | null;
  field_observation_notes: string | null;
}

interface DelayRegRow {
  id: string;
  wbs_task_id: string | null;
  delay_code: string;
  delay_type: string;
  impact_days: number | null;
  status: string;
}

const TASK_COLS =
  "id, task_code, task_name, discipline, status, delay_status, delay_reason, start_date, end_date, " +
  "baseline_start_date, baseline_finish_date, progress, is_milestone, manually_scheduled, " +
  "constraint_type, constraint_date, dependency_task_ids, dependency_types, dependency_lag_days, " +
  "field_observation_notes";

const DELAY_TYPE_COLOR: Record<string, string> = {
  excusable: "bg-blue-100 text-blue-700",
  non_excusable: "bg-red-100 text-red-700",
  compensable: "bg-green-100 text-green-700",
  non_compensable: "bg-gray-100 text-gray-700",
};

function slip(n: number): string {
  return `${n > 0 ? "+" : ""}${n}d`;
}
function slipClass(n: number): string {
  return n > 0 ? "text-red-600" : n < 0 ? "text-emerald-600" : "text-slate-500";
}

export function PlanDelayAnalysis() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [cal, setCal] = useState(buildWorkCalendar(null, []));
  const [projectStart, setProjectStart] = useState<string>(todayISO());
  const [regByTask, setRegByTask] = useState<Map<string, DelayRegRow[]>>(new Map());
  const [sourceOptions, setSourceOptions] = useState<ComparisonSourceOption[]>([]);
  const [sourceKey, setSourceKey] = useState(""); // "" = active baseline (inline columns)
  const [overrideMap, setOverrideMap] = useState<Map<
    string,
    { start: string | null; end: string | null }
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── Base data ──────────────────────────────────────────────────────────────
  async function load() {
    if (!selectedProjectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [taskRes, calRes, projRes, regRes] = await Promise.all([
        supabase.from("wbs_tasks").select(TASK_COLS).eq("project_id", selectedProjectId).limit(1000),
        supabase
          .from("plan_calendars")
          .select("id, name, monday, tuesday, wednesday, thursday, friday, saturday, sunday")
          .eq("project_id", selectedProjectId)
          .order("is_default", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("projects").select("data_date").eq("id", selectedProjectId).maybeSingle(),
        supabase
          .from("delay_register")
          .select("id, wbs_task_id, delay_code, delay_type, impact_days, status")
          .eq("project_id", selectedProjectId),
      ]);
      if (taskRes.error) throw new Error(taskRes.error.message);

      const calRow = (calRes.data ?? null) as PlanCalendarRow | null;
      let exceptions: PlanCalendarExceptionRow[] = [];
      if (calRow) {
        const exRes = await supabase
          .from("plan_calendar_exceptions")
          .select("exception_date, is_working")
          .eq("calendar_id", calRow.id);
        exceptions = (exRes.data ?? []) as PlanCalendarExceptionRow[];
      }
      setCal(buildWorkCalendar(calRow, exceptions));

      const taskRows = (taskRes.data ?? []) as unknown as TaskRow[];
      setRows(taskRows);

      const starts = taskRows.map((t) => t.start_date).filter((s): s is string => !!s).sort();
      setProjectStart((projRes.data?.data_date as string | null) ?? starts[0] ?? todayISO());

      const reg = new Map<string, DelayRegRow[]>();
      for (const r of (regRes.data ?? []) as DelayRegRow[]) {
        if (!r.wbs_task_id) continue;
        const list = reg.get(r.wbs_task_id);
        if (list) list.push(r);
        else reg.set(r.wbs_task_id, [r]);
      }
      setRegByTask(reg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load delay analysis");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void load();
    setSelectedId(null);
    setSourceKey("");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  // ── "Compare against" options + resolve ────────────────────────────────────
  useEffect(() => {
    if (!selectedProjectId) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setSourceOptions([]);
      return;
    }
    let cancelled = false;
    listComparisonSources(selectedProjectId)
      .then((opts) => {
        if (cancelled) return;
        const usable = opts.filter((o) => o.source.kind !== "live");
        setSourceOptions(usable);
        setSourceKey((prev) => (prev && usable.some((o) => o.key === prev) ? prev : ""));
      })
      .catch(() => {
        if (!cancelled) setSourceOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    const opt = sourceOptions.find((o) => o.key === sourceKey);
    if (!selectedProjectId || !opt) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setOverrideMap(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    resolveSource(selectedProjectId, opt.source)
      .then((m) => {
        if (!cancelled) setOverrideMap(m);
      })
      .catch((e) => {
        if (cancelled) return;
        setOverrideMap(null);
        toast.error(e instanceof Error ? e.message : "Failed to load comparison source");
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, sourceKey, sourceOptions]);

  const sourceLabel = sourceKey
    ? sourceOptions.find((o) => o.key === sourceKey)?.label ?? "comparison"
    : "Baseline (active)";

  // ── Analysis ──────────────────────────────────────────────────────────────
  const delayTasks = useMemo<DelayTask[]>(
    () =>
      rows.map((t) => {
        const ovr = overrideMap?.get(t.id);
        return {
          id: t.id,
          task_code: t.task_code,
          task_name: t.task_name,
          discipline: t.discipline,
          start_date: t.start_date,
          end_date: t.end_date,
          baseline_start: ovr ? ovr.start : t.baseline_start_date,
          baseline_finish: ovr ? ovr.end : t.baseline_finish_date,
          progress: t.progress ?? 0,
          is_milestone: t.is_milestone ?? false,
          manually_scheduled: t.manually_scheduled ?? false,
          constraint_type: t.constraint_type,
          constraint_date: t.constraint_date,
          dependency_task_ids: t.dependency_task_ids ?? [],
          dependency_types: t.dependency_types ?? [],
          dependency_lag_days: t.dependency_lag_days ?? [],
          delay_reason: t.delay_reason,
          field_observation_notes: t.field_observation_notes,
        };
      }),
    [rows, overrideMap],
  );

  const analysis = useMemo<DelayAnalysis>(
    () => analyzeDelays(delayTasks, cal, projectStart),
    [delayTasks, cal, projectStart],
  );

  const selectedRow = analysis.rows.find((r) => r.id === selectedId) ?? null;
  const cause: CauseHop[] =
    selectedRow && analysis.ctx ? traceCause(selectedRow.id, analysis.ctx) : [];
  const impact = selectedRow && analysis.ctx ? traceImpact(selectedRow.id, analysis.ctx) : [];
  const selectedTask = rows.find((t) => t.id === selectedId) ?? null;
  const rootHop = cause[0];

  async function logToRegister() {
    if (!selectedProjectId || !selectedRow) return;
    const description = `${selectedRow.task_code} ${selectedRow.task_name} — finish slipped ${slip(
      selectedRow.finishSlipWd,
    )} vs ${sourceLabel}`;
    const causeText = rootHop
      ? `Driven by ${rootHop.task_code} ${rootHop.task_name} — ${rootHop.rootReason ?? "delay"}`
      : null;
    const { error } = await supabase.from("delay_register").insert([
      {
        project_id: selectedProjectId,
        wbs_task_id: selectedRow.id,
        delay_code: "",
        description,
        cause: causeText,
        delay_type: "excusable",
        start_date: selectedRow.baselineFinish,
        finish_date: selectedRow.liveFinish,
        status: "open",
      },
    ]);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Logged to Delay Register — set the delay type & responsible party there");
    void load();
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (projectLoading || loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!selectedProjectId) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Select a project to analyse schedule delays.
      </div>
    );
  }

  const hasBaseline = delayTasks.some((t) => t.baseline_finish && t.end_date);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Compare against</span>
          <select
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value)}
            className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none"
          >
            <option value="">Baseline (active)</option>
            {sourceOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {resolving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <ReportExport
            data={analysis.rows.map((r) => ({
              task_code: r.task_code,
              task_name: r.task_name,
              discipline: r.discipline,
              finish_slip_days: r.finishSlipWd,
              total_float_days: r.totalFloatWd,
              on_critical_path: r.critical ? "Yes" : "No",
              downstream_impacted: r.impactedCount,
            }))}
            columns={[
              { key: "task_code", label: "Task Code" },
              { key: "task_name", label: "Task Name" },
              { key: "discipline", label: "Discipline" },
              { key: "finish_slip_days", label: "Finish Slip (d)" },
              { key: "total_float_days", label: "Total Float (d)" },
              { key: "on_critical_path", label: "On Critical Path" },
              { key: "downstream_impacted", label: "Downstream Impacted" },
            ]}
            filename="delay-analysis"
          />
        </div>
      </div>

      {!analysis.ok ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Analysis unavailable — the schedule has a dependency cycle.</p>
            <p className="text-xs">
              Cycle:{" "}
              {(analysis.cycle ?? [])
                .map((id) => rows.find((t) => t.id === id)?.task_code ?? id.slice(0, 8))
                .join(" → ")}
            </p>
          </div>
        </div>
      ) : !hasBaseline ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 py-16 text-center">
          <GitBranch className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No baseline to compare against</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            Set one in Planning ▸ Gantt Chart ▸ Project ▸ Set Baseline, then delayed activities and
            their cause chains appear here.
          </p>
        </div>
      ) : (
        <>
          {/* KPI band */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Delayed activities", value: String(analysis.rows.length), good: null as boolean | null },
              {
                label: "Critical delays",
                value: String(analysis.rows.filter((r) => r.critical).length),
                good: analysis.rows.some((r) => r.critical) ? false : null,
              },
              {
                label: "Project finish slip",
                value: slip(analysis.projectSlipWd),
                good: analysis.projectSlipWd <= 0,
              },
              {
                label: "Worst slip",
                value: slip(analysis.rows[0]?.finishSlipWd ?? 0),
                good: (analysis.rows[0]?.finishSlipWd ?? 0) <= 0,
              },
            ].map(({ label, value, good }) => (
              <Card key={label}>
                <CardContent className="p-3 text-center">
                  <p
                    className={cn(
                      "text-xl font-bold tabular-nums",
                      good === true ? "text-emerald-600" : good === false ? "text-red-600" : "text-slate-900",
                    )}
                  >
                    {value}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Delayed-activities table */}
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium">Activity</th>
                  <th className="px-3 py-2 font-medium">Discipline</th>
                  <th className="px-3 py-2 text-center font-medium">Finish slip</th>
                  <th className="px-3 py-2 text-center font-medium">Total float</th>
                  <th className="px-3 py-2 text-center font-medium">Critical</th>
                  <th className="px-3 py-2 text-center font-medium">Downstream</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((r) => {
                  const reg = regByTask.get(r.id) ?? [];
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                      className={cn(
                        "cursor-pointer border-b last:border-0 hover:bg-muted/30",
                        r.id === selectedId && "bg-primary/5",
                      )}
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium">{r.task_code}</span>
                        <span className="ml-1 text-muted-foreground">{r.task_name}</span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.discipline || "—"}</td>
                      <td className={cn("px-3 py-2 text-center font-semibold tabular-nums", slipClass(r.finishSlipWd))}>
                        {slip(r.finishSlipWd)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-center tabular-nums",
                          r.totalFloatWd <= 0 ? "font-semibold text-red-600" : "text-slate-500",
                        )}
                      >
                        {r.totalFloatWd}d
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.critical ? (
                          <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                            {r.becameCritical ? "now critical" : "critical"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums text-slate-600">{r.impactedCount}</td>
                      <td className="px-3 py-2">
                        {reg.length > 0 && (
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {reg.map((x) => x.delay_code).join(", ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {analysis.rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      No activities have slipped vs {sourceLabel}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Selected-activity analysis */}
          {selectedRow && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold">
                  {selectedRow.task_code} {selectedRow.task_name}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  finish slipped{" "}
                  <span className={cn("font-semibold", slipClass(selectedRow.finishSlipWd))}>
                    {slip(selectedRow.finishSlipWd)}
                  </span>{" "}
                  · float{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      selectedRow.totalFloatWd <= 0 ? "text-red-600" : "text-slate-700",
                    )}
                  >
                    {selectedRow.totalFloatWd}d
                  </span>
                  {selectedRow.floatConsumedWd > 0 && ` (consumed ${selectedRow.floatConsumedWd}d)`} ·{" "}
                  {selectedRow.critical
                    ? "on the critical path — pushes the project finish"
                    : "absorbed by float — no project-finish impact"}{" "}
                  · pushes{" "}
                  <span className="font-semibold">{selectedRow.impactedCount}</span> downstream
                  {selectedRow.impactedCount === 1 ? " activity" : " activities"}
                  {selectedRow.predCount > 0 &&
                    ` · ${selectedRow.predSlippedCount} of ${selectedRow.predCount} predecessors slipped`}
                </p>
              </div>

              {/* Cause chain */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Cause chain — root cause → this activity
                </p>
                <div className="space-y-1">
                  {cause.map((h, i) => (
                    <div
                      key={h.taskId}
                      className={cn(
                        "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2 py-1 text-xs",
                        h.isRoot ? "bg-amber-50" : "bg-slate-50",
                      )}
                      style={{ marginLeft: i * 14 }}
                    >
                      <span className="font-medium">{h.task_code}</span>
                      <span className="text-muted-foreground">{h.task_name}</span>
                      {h.linkType && (
                        <span className="rounded bg-slate-200 px-1 text-[10px] font-semibold text-slate-700">
                          {getDependencyLabel(h.linkType)}
                          {h.lag ? (h.lag > 0 ? ` +${h.lag}d` : ` ${h.lag}d`) : ""}
                        </span>
                      )}
                      <span className={cn("tabular-nums", slipClass(h.finishSlipWd))}>
                        slip {slip(h.finishSlipWd)}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="tabular-nums text-slate-500">float {h.totalFloatWd}d</span>
                      {h.isRoot && (
                        <span className="font-medium text-amber-700">
                          root cause — {h.rootReason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Downstream impact */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Downstream impact
                </p>
                {impact.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No downstream activities are driven later by this delay — its float absorbs it.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left">
                          <th className="px-3 py-1.5 font-medium">Activity</th>
                          <th className="px-3 py-1.5 font-medium">Discipline</th>
                          <th className="px-3 py-1.5 text-center font-medium">Pushed</th>
                          <th className="px-3 py-1.5 text-center font-medium">Now critical</th>
                        </tr>
                      </thead>
                      <tbody>
                        {impact.map((n) => (
                          <tr key={n.taskId} className="border-b last:border-0">
                            <td className="px-3 py-1.5" style={{ paddingLeft: 12 + (n.depth - 1) * 14 }}>
                              <span className="font-medium">{n.task_code}</span>
                              <span className="ml-1 text-muted-foreground">{n.task_name}</span>
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{n.discipline || "—"}</td>
                            <td className={cn("px-3 py-1.5 text-center font-semibold tabular-nums", slipClass(n.pushedWd))}>
                              {slip(n.pushedWd)}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              {n.nowCritical ? (
                                <span className="font-semibold text-red-600">yes</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Narrative + delay register */}
              {(selectedTask?.delay_reason || selectedTask?.field_observation_notes) && (
                <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {selectedTask?.delay_reason && (
                    <p>
                      <span className="font-medium text-slate-700">Delay reason:</span>{" "}
                      {selectedTask.delay_reason}
                    </p>
                  )}
                  {selectedTask?.field_observation_notes && (
                    <p className="mt-0.5">
                      <span className="font-medium text-slate-700">Field notes:</span>{" "}
                      {selectedTask.field_observation_notes}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {(regByTask.get(selectedRow.id) ?? []).map((r) => (
                  <Badge
                    key={r.id}
                    variant="outline"
                    className={cn("gap-1", DELAY_TYPE_COLOR[r.delay_type] ?? "bg-slate-100 text-slate-700")}
                  >
                    {r.delay_code}
                    {r.impact_days != null && ` · ${r.impact_days}d`}
                    {` · ${r.status}`}
                  </Badge>
                ))}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void logToRegister()}>
                  <Plus className="h-3.5 w-3.5" />
                  Log to Delay Register
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
