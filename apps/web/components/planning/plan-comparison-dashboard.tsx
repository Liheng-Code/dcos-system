"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Settings2, TrendingDown, TrendingUp } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  compareSchedules,
  listComparisonSources,
  type ComparisonSourceOption,
  type MultiCompareRow,
} from "@/lib/planning/schedule-comparison-service";
import { PlanManageSchedulesDialog } from "./plan-manage-schedules-dialog";

const SLOT_KEYS = ["A", "B", "C"] as const;
type SlotKey = (typeof SLOT_KEYS)[number];
const SLOT_LABELS: Record<SlotKey, string> = { A: "Compare A", B: "Compare B", C: "Compare C (optional)" };
const EMPTY_SNAPSHOT: MultiCompareRow["values"][string] = { start: null, end: null, cost: null };

function formatCost(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** Whole-day difference between two YYYY-MM-DD dates (UTC-pinned, no DST drift). */
function diffDays(fromISO: string, toISO: string): number {
  return Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86_400_000);
}

function VarianceBadge({ value, unit }: { value: number | null; unit: "d" | "cost" }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const cls = value > 0 ? "text-red-600" : value < 0 ? "text-green-600" : "";
  return (
    <span className={cn("inline-flex items-center gap-0.5", cls)}>
      <Icon className="h-3 w-3" />
      {value > 0 ? "+" : ""}
      {unit === "d" ? `${value}d` : formatCost(value)}
    </span>
  );
}

export function PlanComparisonDashboard() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [sourceOptions, setSourceOptions] = useState<ComparisonSourceOption[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [selection, setSelection] = useState<Record<SlotKey, string | null>>({ A: null, B: null, C: null });
  const [rows, setRows] = useState<MultiCompareRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const optionByKey = useMemo(() => new Map(sourceOptions.map((o) => [o.key, o])), [sourceOptions]);
  const activeSlots = SLOT_KEYS.filter((k) => selection[k]);

  function loadSources() {
    if (!selectedProjectId) return;
    setLoadingSources(true);
    listComparisonSources(selectedProjectId)
      .then((opts) => {
        setSourceOptions(opts);
        setSelection((prev) => {
          if (prev.A || prev.B) return prev; // preserve the user's own pick across reloads
          const activeBaseline = opts.find((o) => o.source.kind === "baseline" && o.label.endsWith("(active)"));
          return { A: activeBaseline?.key ?? opts[0]?.key ?? null, B: "live", C: null };
        });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingSources(false));
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    loadSources();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!selectedProjectId || activeSlots.length < 2) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    compareSchedules(
      selectedProjectId,
      activeSlots.map((slot) => ({ key: slot, source: optionByKey.get(selection[slot]!)!.source })),
    )
      .then((r) => !cancelled && setRows(r))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoadingRows(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, selection.A, selection.B, selection.C, optionByKey]);

  const enriched = useMemo(() => {
    if (activeSlots.length < 2) return [];
    const firstKey = activeSlots[0];
    const lastKey = activeSlots[activeSlots.length - 1];
    // `rows` can briefly lag one render behind a just-changed slot selection
    // (the refetch is async) — fall back to empty rather than crash on a key
    // the in-flight `rows` snapshot doesn't have yet.
    return rows.map((r) => {
      const first = r.values[firstKey] ?? EMPTY_SNAPSHOT;
      const last = r.values[lastKey] ?? EMPTY_SNAPSHOT;
      const finishVarianceDays = first.end && last.end ? diffDays(first.end, last.end) : null;
      const startVarianceDays = first.start && last.start ? diffDays(first.start, last.start) : null;
      const costVariance = first.cost != null && last.cost != null ? last.cost - first.cost : null;
      return { ...r, finishVarianceDays, startVarianceDays, costVariance };
    });
  }, [rows, activeSlots]);

  const stats = useMemo(() => {
    const total = enriched.length;
    const delayed = enriched.filter((r) => (r.finishVarianceDays ?? 0) > 0).length;
    const ahead = enriched.filter((r) => (r.finishVarianceDays ?? 0) < 0).length;
    const onTime = total - delayed - ahead;
    const withVariance = enriched.filter((r) => r.finishVarianceDays !== null);
    const avgVariance = withVariance.length
      ? Math.round(withVariance.reduce((s, r) => s + (r.finishVarianceDays ?? 0), 0) / withVariance.length)
      : 0;
    const costRows = enriched.filter((r) => r.costVariance !== null);
    const totalCostVariance = costRows.reduce((s, r) => s + (r.costVariance ?? 0), 0);
    return { total, delayed, ahead, onTime, avgVariance, totalCostVariance, costRowCount: costRows.length };
  }, [enriched]);

  if (projectLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!selectedProjectId) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Select a project to view schedule comparison.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schedule picker */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3">
        {SLOT_KEYS.map((slot) => (
          <label key={slot} className="text-xs">
            <span className="mb-1 block font-semibold text-muted-foreground">{SLOT_LABELS[slot]}</span>
            <select
              value={selection[slot] ?? ""}
              onChange={(e) => setSelection((p) => ({ ...p, [slot]: e.target.value || null }))}
              disabled={loadingSources}
              className="w-56 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            >
              {slot === "C" && <option value="">— None —</option>}
              {slot !== "C" && !selection[slot] && <option value="">— Select —</option>}
              {sourceOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button
          type="button"
          onClick={() => setManageOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted/40"
        >
          <Settings2 className="h-3.5 w-3.5" /> Manage Schedules
        </button>
      </div>

      {activeSlots.length < 2 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Pick at least two schedules above to compare.
        </div>
      ) : loadingRows ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPI cards — computed as the last picked schedule vs. the first */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Tasks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{stats.onTime}</p>
                <p className="text-xs text-muted-foreground">On Time</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{stats.delayed}</p>
                <p className="text-xs text-muted-foreground">Delayed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{stats.avgVariance}</p>
                <p className="text-xs text-muted-foreground">Avg Variance (days)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p
                  className={cn(
                    "text-2xl font-bold",
                    stats.totalCostVariance > 0 ? "text-red-600" : stats.totalCostVariance < 0 ? "text-green-600" : "",
                  )}
                >
                  {stats.totalCostVariance > 0 ? "+" : ""}
                  {formatCost(stats.totalCostVariance)}
                </p>
                <p className="text-xs text-muted-foreground">Cost Variance ({stats.costRowCount} priced)</p>
              </CardContent>
            </Card>
          </div>

          {/* Overlay table */}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">
                    Task
                  </th>
                  <th rowSpan={2} className="px-3 py-2 text-left font-medium align-bottom">
                    Discipline
                  </th>
                  {activeSlots.map((slot) => (
                    <th key={slot} colSpan={2} className="border-l px-3 py-1.5 text-center font-medium">
                      {optionByKey.get(selection[slot]!)?.label ?? slot}
                    </th>
                  ))}
                  <th rowSpan={2} className="border-l px-3 py-2 text-center font-medium align-bottom">
                    Finish Var
                    <div className="font-normal text-[10px] text-muted-foreground">
                      last vs. first
                    </div>
                  </th>
                  <th rowSpan={2} className="px-3 py-2 text-center font-medium align-bottom">
                    Cost Var
                  </th>
                </tr>
                <tr className="border-b bg-muted/50">
                  {activeSlots.map((slot) => (
                    <Fragment key={slot}>
                      <th className="border-l px-3 py-1.5 text-center text-[11px] font-normal text-muted-foreground">
                        Start
                      </th>
                      <th className="px-3 py-1.5 text-center text-[11px] font-normal text-muted-foreground">
                        Finish
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map((r) => (
                  <tr key={r.task_id} className={cn("border-b last:border-0", (r.finishVarianceDays ?? 0) > 0 && "bg-red-50")}>
                    <td className="px-3 py-2 font-medium">
                      {r.task_code}
                      <span className="ml-1 text-muted-foreground">{r.task_name}</span>
                    </td>
                    <td className="px-3 py-2">{r.discipline || "—"}</td>
                    {activeSlots.map((slot) => {
                      const v = r.values[slot] ?? EMPTY_SNAPSHOT;
                      return (
                        <Fragment key={slot}>
                          <td className="border-l px-3 py-2 text-center text-muted-foreground">
                            {v.start ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{v.end ?? "—"}</td>
                        </Fragment>
                      );
                    })}
                    <td className="border-l px-3 py-2 text-center">
                      <VarianceBadge value={r.finishVarianceDays} unit="d" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <VarianceBadge value={r.costVariance} unit="cost" />
                    </td>
                  </tr>
                ))}
                {!enriched.length && (
                  <tr>
                    <td colSpan={4 + activeSlots.length * 2} className="py-4 text-center text-sm text-muted-foreground">
                      No tasks with data in the selected schedules.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {manageOpen && (
        <PlanManageSchedulesDialog
          projectId={selectedProjectId}
          onClose={() => setManageOpen(false)}
          onChanged={loadSources}
        />
      )}
    </div>
  );
}
