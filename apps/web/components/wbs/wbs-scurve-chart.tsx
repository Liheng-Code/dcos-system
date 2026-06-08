"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  captureProgressSnapshot,
  getProgressSnapshots,
  type ProgressSnapshotRow,
} from "@/lib/schedule-service";
import { TrendingUp, Camera, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ProgressChart } from "@/components/reports/charts/progress-chart";
import { useProject } from "@/components/dashboard/project-context";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Page component ─────────────────────────────────────────────────────────────

export function WbsScurveChart() {
  const { selectedProjectId } = useProject();
  const [snapshots, setSnapshots] = useState<ProgressSnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      setSnapshots(await getProgressSnapshots(selectedProjectId));
    } catch (e: any) {
      setError(e.message ?? "Failed to load snapshots");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCapture() {
    if (!selectedProjectId) return;
    setCapturing(true);
    try {
      await captureProgressSnapshot(selectedProjectId);
      toast.success("Snapshot captured");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to capture snapshot");
    } finally {
      setCapturing(false);
    }
  }

  const chartData = useMemo(() => {
    return snapshots
      .filter((s) => s.snapshot_date)
      .map((s) => ({
        date: fmtDate(s.snapshot_date),
        planned: s.planned_progress ?? 0,
        actual: s.actual_progress ?? 0,
      }));
  }, [snapshots]);

  const chartSeries = useMemo(() => [
    { dataKey: "planned", name: "Planned", color: "#94a3b8", strokeDasharray: "5 3" as const },
    { dataKey: "actual", name: "Actual", color: "#0f172a" },
  ], []);

  // Latest snapshot stats
  const latest = snapshots[snapshots.length - 1];

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">S-Curve</h1>
            <p className="text-sm text-muted-foreground">
              {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""} recorded
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" disabled={loading} onClick={load}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>

          <Button
            size="sm"
            disabled={capturing || !selectedProjectId}
            onClick={handleCapture}
            className="gap-1.5"
          >
            {capturing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Camera className="h-3.5 w-3.5" />}
            Capture Today
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Latest snapshot KPI strip */}
      {latest && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Latest Actual", value: `${latest.actual_progress ?? 0}%`, color: "text-slate-900" },
            { label: "Latest Planned", value: `${latest.planned_progress ?? 0}%`, color: "text-slate-500" },
            {
              label: "Progress Variance",
              value: `${((latest.actual_progress ?? 0) - (latest.planned_progress ?? 0)).toFixed(1)}%`,
              color: (latest.actual_progress ?? 0) >= (latest.planned_progress ?? 0) ? "text-emerald-600" : "text-red-600",
            },
            { label: "Snapshot Date", value: fmtDate(latest.snapshot_date), color: "text-blue-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
              <div className={`text-lg font-bold ${color}`}>{value}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* S-Curve chart */}
      <ProgressChart
        data={chartData}
        series={chartSeries}
        xKey="date"
        loading={loading}
        empty={chartData.length < 2}
        error={error}
        onRetry={() => load()}
        height={300}
      />

      {/* Snapshot history table */}
      {snapshots.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-center">Planned %</th>
                <th className="px-3 py-2 text-center">Actual %</th>
                <th className="px-3 py-2 text-center">Variance</th>
                <th className="px-3 py-2 text-right">Planned Cost</th>
                <th className="px-3 py-2 text-right">Actual Cost</th>
              </tr>
            </thead>
            <tbody>
              {[...snapshots].reverse().map((s) => {
                const v = ((s.actual_progress ?? 0) - (s.planned_progress ?? 0));
                return (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-medium text-slate-700">{fmtDate(s.snapshot_date)}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{s.planned_progress?.toFixed(1) ?? "—"}%</td>
                    <td className="px-3 py-2 text-center font-semibold">{s.actual_progress?.toFixed(1) ?? "—"}%</td>
                    <td className={`px-3 py-2 text-center font-semibold ${v >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {v >= 0 ? "+" : ""}{v.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right text-slate-500">
                      {s.planned_cost != null ? `$${s.planned_cost.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.actual_cost != null ? `$${s.actual_cost.toLocaleString()}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
