"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Plus, RefreshCw, Settings, Trash2, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { captureProgressSnapshot, type ProgressSnapshotRow } from "@/lib/planning/schedule-service";
import { currency, getCostSnapshots, percent } from "@/lib/evm-service";
import {
  type QsCostBaselineEntry,
  deleteCostBaselineEntry,
  getCostBaseline,
  upsertCostBaselineEntries,
} from "@/lib/qs/qs-service";
import { cn } from "@/lib/utils";

interface Props { projectId: string }

const pad = { l: 60, r: 22, t: 18, b: 38 };
const width = 720;
const height = 300;
const plotW = width - pad.l - pad.r;
const plotH = height - pad.t - pad.b;

function x(dateMs: number, minMs: number, rangeMs: number) {
  return pad.l + ((dateMs - minMs) / rangeMs) * plotW;
}

function y(value: number, maxValue: number) {
  return pad.t + plotH - (value / Math.max(maxValue, 1)) * plotH;
}

function path(points: [number, number][]) {
  return points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

type PlotPoint = { dateMs: number; value: number };

function CostCurve({
  snapshots,
  baseline,
}: {
  snapshots: ProgressSnapshotRow[];
  baseline: QsCostBaselineEntry[];
}) {
  const actualPoints: PlotPoint[] = snapshots
    .filter((s) => s.snapshot_date && s.actual_cost != null)
    .map((s) => ({ dateMs: new Date(s.snapshot_date).getTime(), value: Number(s.actual_cost) }));

  const plannedPoints: PlotPoint[] = baseline.map((b) => ({
    dateMs: new Date(b.period_date).getTime(),
    value:  Number(b.cumulative_planned),
  }));

  const allPoints = [...actualPoints, ...plannedPoints];
  if (allPoints.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
        <TrendingUp className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-xs text-slate-400">
          {actualPoints.length < 2 && plannedPoints.length < 2
            ? "Capture snapshots and/or configure a planned baseline to draw the S-curve."
            : actualPoints.length < 2
            ? "Capture at least 2 snapshots to draw the actual cost curve."
            : "Add at least 2 baseline entries to draw the planned curve."}
        </p>
      </div>
    );
  }

  const allDates = allPoints.map((p) => p.dateMs);
  const minMs    = Math.min(...allDates);
  const maxMs    = Math.max(...allDates);
  const rangeMs  = maxMs - minMs || 1;
  const maxCost  = Math.max(...allPoints.map((p) => p.value), 1);
  const grid     = [0, 0.25, 0.5, 0.75, 1].map((r) => maxCost * r);

  const actualPts  = actualPoints.map((p) => [x(p.dateMs, minMs, rangeMs), y(p.value, maxCost)] as [number, number]);
  const plannedPts = plannedPoints.map((p) => [x(p.dateMs, minMs, rangeMs), y(p.value, maxCost)] as [number, number]);

  const allTickDates = [...new Set([
    ...actualPoints.map((p) => p.dateMs),
    ...plannedPoints.map((p) => p.dateMs),
  ])].sort((a, b) => a - b);
  const ticks = allTickDates.length <= 6
    ? allTickDates
    : allTickDates.filter((_, i) => i % Math.ceil(allTickDates.length / 5) === 0 || i === allTickDates.length - 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded-xl border border-slate-200 bg-white">
      {grid.map((v) => (
        <g key={v}>
          <line x1={pad.l} y1={y(v, maxCost)} x2={pad.l + plotW} y2={y(v, maxCost)} stroke="#e2e8f0" />
          <text x={pad.l - 8} y={y(v, maxCost)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="#94a3b8">
            {currency(v)}
          </text>
        </g>
      ))}
      {ticks.map((ms) => (
        <text key={ms} x={x(ms, minMs, rangeMs)} y={height - pad.b + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">
          {fmtDate(new Date(ms).toISOString())}
        </text>
      ))}

      {plannedPts.length >= 2 && (
        <polyline points={path(plannedPts)} fill="none" stroke="#6366f1" strokeWidth="1.8" strokeDasharray="6 3" />
      )}
      {actualPts.length >= 2 && (
        <polyline points={path(actualPts)} fill="none" stroke="#0f766e" strokeWidth="2.2" />
      )}
      {plannedPts.map(([px, py], i) => <circle key={`p-${i}`} cx={px} cy={py} r="2.5" fill="#6366f1" />)}
      {actualPts.map(([px, py], i) => <circle key={`a-${i}`} cx={px} cy={py} r="3" fill="#0f766e" />)}

      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + plotH} stroke="#cbd5e1" />
      <line x1={pad.l} y1={pad.t + plotH} x2={pad.l + plotW} y2={pad.t + plotH} stroke="#cbd5e1" />

      <g transform={`translate(${pad.l + 8}, ${pad.t + 8})`}>
        <line x1="0" y1="5" x2="18" y2="5" stroke="#0f766e" strokeWidth="2.2" />
        <text x="24" y="9" fontSize="9" fill="#0f766e">Actual Cost</text>
        {plannedPts.length >= 2 && (
          <>
            <line x1="100" y1="5" x2="118" y2="5" stroke="#6366f1" strokeWidth="1.8" strokeDasharray="6 3" />
            <text x="124" y="9" fontSize="9" fill="#6366f1">Planned Baseline</text>
          </>
        )}
      </g>
    </svg>
  );
}

export function CostScurve({ projectId }: Props) {
  const [snapshots, setSnapshots]       = useState<ProgressSnapshotRow[]>([]);
  const [baseline, setBaseline]         = useState<QsCostBaselineEntry[]>([]);
  const [loading, setLoading]           = useState(true);
  const [capturing, setCapturing]       = useState(false);
  const [showConfig, setShowConfig]     = useState(false);
  const [newEntries, setNewEntries]     = useState<{ period_date: string; planned_cost: string }[]>([
    { period_date: new Date().toISOString().slice(0, 7) + "-01", planned_cost: "" },
  ]);
  const [saving, setSaving]             = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snaps, base] = await Promise.all([
        getCostSnapshots(projectId),
        getCostBaseline(projectId),
      ]);
      setSnapshots(snaps);
      setBaseline(base);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load cost S-curve");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function capture() {
    setCapturing(true);
    try {
      await captureProgressSnapshot(projectId);
      toast.success("Cost snapshot captured");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to capture snapshot");
    } finally {
      setCapturing(false);
    }
  }

  async function saveBaseline() {
    const valid = newEntries.filter((e) => e.period_date && parseFloat(e.planned_cost) > 0);
    if (valid.length === 0) { toast.error("Enter at least one period with a positive amount."); return; }
    setSaving(true);
    try {
      await upsertCostBaselineEntries(
        projectId,
        valid.map((e) => ({ period_date: e.period_date, planned_cost: parseFloat(e.planned_cost) })),
      );
      toast.success("Planned baseline saved");
      setShowConfig(false);
      setNewEntries([{ period_date: new Date().toISOString().slice(0, 7) + "-01", planned_cost: "" }]);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save baseline");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEntry(id: string) {
    try {
      await deleteCostBaselineEntry(id);
      await load();
      toast.success("Entry removed");
    } catch (e: any) { toast.error(e.message); }
  }

  const latest   = snapshots[snapshots.length - 1];
  const variance = useMemo(() => {
    if (!latest) return null;
    return Number(latest.planned_cost ?? 0) - Number(latest.actual_cost ?? 0);
  }, [latest]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Cost S-Curve</h2>
          <p className="text-sm text-slate-500">
            {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} · {baseline.length} planned period{baseline.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfig(true)} className="gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Configure Baseline
          </Button>
          <Button variant="outline" size="icon" disabled={loading} onClick={load}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" disabled={capturing} onClick={capture}>
            {capturing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Camera className="mr-1.5 h-3.5 w-3.5" />}
            Capture Today
          </Button>
        </div>
      </div>

      {latest && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xl font-semibold text-slate-900">{currency(latest.planned_cost)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Planned (Snapshot)</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xl font-semibold text-slate-900">{currency(latest.actual_cost)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Actual Cost</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={cn("text-xl font-semibold", (variance ?? 0) >= 0 ? "text-emerald-700" : "text-red-700")}>
              {currency(variance)}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Cost Variance</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xl font-semibold text-slate-900">{percent(latest.actual_progress)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Actual Progress</div>
          </div>
        </div>
      )}

      <CostCurve snapshots={snapshots} baseline={baseline} />

      {/* Baseline configure panel */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfig(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Configure Planned Baseline</h2>
              <button onClick={() => setShowConfig(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <p className="text-xs text-slate-500">
                Enter monthly planned cumulative spend. These form the planned S-curve baseline.
              </p>

              {/* Existing entries */}
              {baseline.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Saved Entries</p>
                  {baseline.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                      <span className="text-slate-600">{b.period_date}</span>
                      <span className="font-semibold text-indigo-600">${Number(b.cumulative_planned).toLocaleString()}</span>
                      <button onClick={() => void handleDeleteEntry(b.id)} className="rounded p-1 text-slate-300 hover:text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* New entries form */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Add / Update Entries</p>
                {newEntries.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="date"
                      value={entry.period_date}
                      onChange={(e) => setNewEntries((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], period_date: e.target.value };
                        return next;
                      })}
                      className="w-36 rounded-lg border border-border bg-background px-2 py-2 text-xs outline-none focus:border-primary"
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={entry.planned_cost}
                      onChange={(e) => setNewEntries((prev) => {
                        const next = [...prev];
                        next[i] = { ...next[i], planned_cost: e.target.value };
                        return next;
                      })}
                      placeholder="Period spend"
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-xs outline-none focus:border-primary"
                    />
                    {newEntries.length > 1 && (
                      <button
                        onClick={() => setNewEntries((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded p-1.5 text-slate-300 hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setNewEntries((prev) => [
                    ...prev,
                    { period_date: new Date().toISOString().slice(0, 7) + "-01", planned_cost: "" },
                  ])}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> Add month
                </button>
              </div>
            </div>

            <div className="flex gap-2 border-t px-6 py-4">
              <Button onClick={saveBaseline} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save Baseline
              </Button>
              <Button variant="outline" onClick={() => setShowConfig(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
