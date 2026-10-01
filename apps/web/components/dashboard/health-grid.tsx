"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/dashboard/chart-card";
import { captureProgressSnapshot } from "@/lib/planning/schedule-service";
import { currency, percent, ratio } from "@/lib/evm-service";
import type { ProjectCostAnalytics } from "@/lib/evm-service";
import type { HealthMetrics } from "@/components/dashboard/project-health-strip";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface HealthGridProps {
  projectId?: string;
  scurveData: { date: string; Planned: number; Actual: number }[];
  loading: boolean;
  metrics: HealthMetrics;
  costAnalytics: ProjectCostAnalytics | null;
  onRefresh?: () => void;
}

const DONUT_COLORS: Record<string, string> = {
  Completed: "#10b981",
  Active: "#3b82f6",
  "Not started": "#9ca3af",
};

export function HealthGrid({ projectId, scurveData, loading, metrics, costAnalytics, onRefresh }: HealthGridProps) {
  const [capturing, setCapturing] = useState(false);

  const donutData = [
    { name: "Completed", value: metrics.complete },
    { name: "Active", value: metrics.active },
    { name: "Not started", value: metrics.notStarted },
  ].filter((d) => d.value > 0);

  const latest = scurveData[scurveData.length - 1];
  const variance = latest ? latest.Actual - latest.Planned : null;
  const evm = costAnalytics?.evm ?? null;
  const burn = costAnalytics && costAnalytics.budget > 0
    ? (costAnalytics.actual / costAnalytics.budget) * 100
    : 0;

  async function handleCapture() {
    if (!projectId) return;
    setCapturing(true);
    try {
      await captureProgressSnapshot(projectId);
      toast.success("Progress snapshot captured");
      onRefresh?.();
    } catch {
      toast.error("Failed to capture snapshot");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <ChartCard
        title="S-Curve"
        description="Planned vs actual progress"
        gradient="from-blue-500 to-indigo-600"
        loading={loading}
        empty={scurveData.length === 0}
        emptyText="No snapshots yet — capture the first one"
        action={
          <div className="flex items-center gap-2">
            {variance != null && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  variance < 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                )}
              >
                {variance >= 0 ? "+" : ""}
                {variance.toFixed(1)} pts
              </span>
            )}
            {projectId && (
              <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={handleCapture} disabled={capturing}>
                {capturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                Capture
              </Button>
            )}
          </div>
        }
      >
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={scurveData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip formatter={(value) => [`${value}%`]} />
              <ReferenceLine y={100} stroke="#cbd5e1" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="Planned"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
              <Line type="monotone" dataKey="Actual" stroke="#2563eb" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Task Status"
        description={`${metrics.total} tasks on this project`}
        gradient="from-indigo-500 to-violet-600"
        loading={loading}
        empty={metrics.total === 0}
        emptyText="No tasks linked yet"
      >
        <div className="relative h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                innerRadius={48}
                outerRadius={70}
                paddingAngle={2}
                strokeWidth={0}
              >
                {donutData.map((entry) => (
                  <Cell key={entry.name} fill={DONUT_COLORS[entry.name] ?? "#cbd5e1"} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} tasks`]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums">{metrics.complete}</span>
            <span className="text-[10px] text-muted-foreground">completed</span>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
          {donutData.map((d) => (
            <span key={d.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: DONUT_COLORS[d.name] }} />
              {d.name}
            </span>
          ))}
        </div>
      </ChartCard>

      <ChartCard
        title="EVM / Cost"
        description="Earned value health"
        gradient="from-emerald-500 to-teal-600"
        loading={loading}
        empty={!costAnalytics || !evm}
        emptyText="Cost analytics unavailable"
      >
        {evm && costAnalytics && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="CPI" value={ratio(evm.cpi)} tone={tone(evm.cpi)} />
              <MiniStat label="SPI" value={ratio(evm.spi)} tone={tone(evm.spi)} />
              <MiniStat label="EAC" value={currency(evm.eac)} />
              <MiniStat label="VAC" value={currency(evm.vac)} tone={tone(evm.vac, false)} />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Budget burn</span>
                <span className="tabular-nums">
                  {percent(Math.min(100, burn))} · {currency(costAnalytics.actual)} of {currency(costAnalytics.budget)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", burn >= 95 ? "bg-red-500" : burn >= 70 ? "bg-amber-500" : "bg-emerald-500")}
                  style={{ width: `${Math.min(100, burn)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function tone(value: number | null | undefined, lowerIsBad = true) {
  if (value == null || !Number.isFinite(value)) return "text-muted-foreground";
  const bad = lowerIsBad ? value < 0.95 : value < 0;
  return bad ? "text-red-600" : "text-foreground";
}

function MiniStat({ label, value, tone: t = "text-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-bold tabular-nums leading-none", t)}>{value}</p>
    </div>
  );
}
