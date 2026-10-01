"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getScurveSeries, type ScurveSeries } from "@/lib/planning/schedule-service";
import { ProgressChart } from "@/components/reports/charts/progress-chart";
import { todayISO } from "@/components/planning/sheet-utils";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

interface PlanningScurveCardProps {
  projectId: string;
  /** Project data date — drives the "today" line so it agrees with the KPI tiles. */
  dataDate: string | null;
  /** Bump (e.g. from the Dashboard's single Refresh button, or after capturing a snapshot) to reload. */
  refreshKey?: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(iso: string): string {
  const [y, m] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${y.slice(2)}` : iso;
}

export function PlanningScurveCard({ projectId, dataDate, refreshKey = 0 }: PlanningScurveCardProps) {
  const [retry, setRetry] = useState(0);
  const { data: series, loading, error } = useCachedFetch<ScurveSeries>(
    projectId ? `dcos.planning.dashboard.scurve.${projectId}` : null,
    () => getScurveSeries(projectId),
    `${refreshKey}:${retry}`,
  );

  const todayX = dataDate ?? todayISO();

  const { rows, todayLabel } = useMemo(() => {
    if (!series) return { rows: [], todayLabel: undefined as string | undefined };
    const planned = new Map<string, number | null>();
    for (const p of series.planned) planned.set(p.date, p.pct);
    const actual = new Map<string, number | null>();
    for (const a of series.actual) actual.set(a.date, a.pct);
    if (series.live) actual.set(series.live.date, series.live.pct);

    // The reference line needs an x-value that exists in the data.
    const dates = [...new Set([...planned.keys(), ...actual.keys(), todayX])].sort();
    const rows = dates.map((d) => ({ date: d, planned: planned.get(d) ?? null, actual: actual.get(d) ?? null }));
    const live = series.live?.pct;
    return { rows, todayLabel: live != null ? `${live}%` : undefined };
  }, [series, todayX]);

  const hasCurve = !!series && (series.planned.length > 0 || series.actual.length > 0 || !!series.live);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">S-Curve — Planned vs Actual</h2>
          <p className="text-xs text-muted-foreground">Cumulative progress against the baseline plan</p>
        </div>
        <Link
          href="/dashboard/planning/scurve"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Full S-Curve &amp; EVM <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <ProgressChart
        data={rows}
        series={[
          { dataKey: "planned", name: "Planned", color: "var(--muted-foreground)", strokeDasharray: "5 3" },
          { dataKey: "actual", name: "Actual", color: "var(--chart-2)" },
        ]}
        xKey="date"
        loading={loading}
        error={error}
        onRetry={() => setRetry((n) => n + 1)}
        empty={!hasCurve}
        height={320}
        formatX={formatDate}
        formatY={(v) => `${v}%`}
        formatTooltip={(v) => `${v}%`}
        todayX={hasCurve ? todayX : undefined}
        todayLabel={todayLabel}
      />
      {!loading && !error && !hasCurve && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          No baseline or snapshots yet — set a baseline and capture a progress snapshot to start the curve.
        </p>
      )}
    </div>
  );
}
