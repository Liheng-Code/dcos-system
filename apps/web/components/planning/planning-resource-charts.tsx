"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { ChartWrapper } from "@/components/reports/charts/chart-wrapper";
import { cn } from "@/lib/utils";
import {
  aggregateByType,
  getResourceAllocation,
  listResources,
  type AllocationRow,
  type PlanResource,
} from "@/lib/planning/resource-service";
import { loadLevellingContext, runLevelling } from "@/lib/planning/levelling-service";
import { buildLevellingProfile, type LevellingProfile } from "@/lib/planning/levelling-profile";
import {
  DAY, LEGEND_STYLE, TICK, TOOLTIP_STYLE, fromUtc, toUtc, weekStart,
} from "@/components/planning/planning-dashboard-charts";

const TYPE_LABEL: Record<string, string> = {
  labor: "Manpower",
  equipment: "Equipment",
  material: "Material",
  subcontractor: "Subcontractor",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 2026-09-14 → "Sep 26" (axis ticks span years, so the year matters). */
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
/** 2026-09-14 → "14 Sep 2026". */
const fullDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

/** Safety cap on the weeks drawn (6 years) so a bad date can't build a huge axis. */
const MAX_WEEKS = 312;

export interface ProjectSpan {
  start: string;
  end: string;
}

/**
 * Every Monday from the project's first week to its last, widened to include any
 * demand date that falls outside the task span (assignments never should, but the
 * chart must not drop data if they do).
 */
function projectWeeks(range: ProjectSpan | null | undefined, demandDates: string[]): string[] {
  let lo = range?.start ?? null;
  let hi = range?.end ?? null;
  for (const d of demandDates) {
    if (!lo || d < lo) lo = d;
    if (!hi || d > hi) hi = d;
  }
  if (!lo || !hi) return [];
  const first = toUtc(weekStart(lo));
  const last = toUtc(weekStart(hi));
  const weeks: string[] = [];
  for (let ms = first; ms <= last && weeks.length < MAX_WEEKS; ms += 7 * DAY) weeks.push(fromUtc(ms));
  return weeks;
}

/** One tick per month (the first week of it), thinned so ~14 labels fit however long the project is. */
function monthTicks(weeks: string[]): string[] {
  const firsts = weeks.filter((w, i) => i === 0 || w.slice(0, 7) !== weeks[i - 1].slice(0, 7));
  const step = Math.max(1, Math.ceil(firsts.length / 14));
  return firsts.filter((_, i) => i % step === 0);
}

/** Weekly peak of a daily series, keyed by the Monday of each week. */
function weeklyPeak(daily: { date: string; value: number }[]): Map<string, number> {
  const peaks = new Map<string, number>();
  for (const d of daily) {
    const wk = weekStart(d.date);
    if (d.value > (peaks.get(wk) ?? 0)) peaks.set(wk, d.value);
  }
  return peaks;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Allocation RPC values are percent: 100% = one full resource (one person / one machine). */
const toUnits = (pct: number) => round2(pct / 100);

interface CommonProps {
  projectId: string;
  /** Project data date — drawn as the "Today" marker, same "as of" the KPI tiles use. */
  asOf: string;
  /** Project start → finish. The chart covers every week in between. */
  range?: ProjectSpan | null;
  className?: string;
}

/** Shared X axis: week-commencing dates on the axis data, month/year labels on the ticks. */
function weekAxis(ticks: string[]) {
  return (
    <XAxis
      dataKey="week"
      ticks={ticks}
      interval={0}
      tick={TICK}
      tickLine={false}
      axisLine={{ stroke: "var(--border)" }}
      tickFormatter={monthYear}
    />
  );
}

/** Dashed marker at the data-date week when it lies inside the drawn range. */
function todayMarker(weeks: string[], asOf: string) {
  const wk = weekStart(asOf);
  if (!weeks.includes(wk)) return null;
  return (
    <ReferenceLine
      x={wk}
      stroke="var(--muted-foreground)"
      strokeDasharray="2 3"
      label={{ value: "Today", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
    />
  );
}

// ── Manpower histogram ───────────────────────────────────────────────────────
export function ManpowerHistogramCard({ projectId, asOf, range, className }: CommonProps) {
  const [allocation, setAllocation] = useState<AllocationRow[]>([]);
  const [resources, setResources] = useState<PlanResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flag the fetch as in flight before it starts
    setLoading(true);
    setError(null);
    Promise.all([getResourceAllocation(projectId), listResources(projectId)])
      .then(([alloc, res]) => {
        if (cancelled) return;
        setAllocation(alloc);
        setResources(res);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load resource data"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, retry]);

  const points = useMemo(() => aggregateByType(allocation, resources), [allocation, resources]);
  const types = useMemo(
    () => [...new Set(points.filter((p) => p.demand > 0).map((p) => p.resource_type))].sort(),
    [points],
  );
  const type = picked && types.includes(picked as never) ? picked : types.includes("labor") ? "labor" : types[0];

  const { rows, weeks, ticks, capacity, peak, hasAny } = useMemo(() => {
    const mine = points.filter((p) => p.resource_type === type);
    const peaks = weeklyPeak(mine.map((p) => ({ date: p.work_date, value: p.demand })));
    const weeks = projectWeeks(range, mine.map((p) => p.work_date));
    const capacity = toUnits(mine[0]?.capacity ?? 0);
    const rows = weeks.map((wk) => ({ week: wk, demand: toUnits(peaks.get(wk) ?? 0) }));
    const peak = rows.reduce((m, r) => Math.max(m, r.demand), 0);
    return { rows, weeks, ticks: monthTicks(weeks), capacity, peak, hasAny: peak > 0 };
  }, [points, type, range]);

  const barColor = (demand: number) =>
    capacity > 0 && demand > capacity ? "#ef4444" : capacity > 0 && demand > capacity * 0.85 ? "#f59e0b" : "var(--chart-1)";

  return (
    <ChartWrapper
      title="Manpower Histogram"
      description={
        hasAny
          ? `Weekly peak ${(TYPE_LABEL[type] ?? type).toLowerCase()} demand vs available · peak ${peak}${capacity > 0 ? ` of ${capacity}` : ""} · ${weeks.length} weeks, project start to finish`
          : "Weekly peak resource demand vs available capacity"
      }
      loading={loading}
      error={error}
      onRetry={() => setRetry((n) => n + 1)}
      empty={!hasAny}
      emptyMessage="No resources assigned to tasks yet — assign resources in Resource Loading"
      height={340}
      className={className}
    >
      <div className="w-full">
        {types.length > 1 && (
          <div className="flex justify-end gap-1 px-3 pt-1">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPicked(t)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                  t === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {TYPE_LABEL[t] ?? t}
              </button>
            ))}
          </div>
        )}
        <ResponsiveContainer width="100%" height={types.length > 1 ? 310 : 340}>
          <BarChart data={rows} margin={{ top: 16, right: 12, left: -8, bottom: 0 }} barCategoryGap="12%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            {weekAxis(ticks)}
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
            <Tooltip
              {...TOOLTIP_STYLE}
              labelFormatter={(wk) => `Week of ${fullDate(String(wk))}`}
              formatter={(v) => [`${v} (100% = 1 unit)`, "Peak demand"]}
            />
            {capacity > 0 && (
              <ReferenceLine
                y={capacity}
                stroke="var(--muted-foreground)"
                strokeDasharray="5 4"
                label={{ value: `Available ${capacity}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            )}
            {todayMarker(weeks, asOf)}
            <Bar dataKey="demand" name="Peak demand" radius={[2, 2, 0, 0]} maxBarSize={18}>
              {rows.map((r, i) => <Cell key={i} fill={barColor(r.demand)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartWrapper>
  );
}

// ── Resource levelling diagram (preview — nothing is written) ────────────────
interface LevellingSummary {
  profile: LevellingProfile;
  shifts: number;
  residual: number;
  /** The engine hit its pass limit with float still available (rather than running out of float). */
  stoppedAtLimit: boolean;
}

export function LevellingDiagramCard({ projectId, asOf, range, className }: CommonProps) {
  const [summary, setSummary] = useState<LevellingSummary | null>(null);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flag the fetch as in flight before it starts
    setLoading(true);
    setError(null);
    loadLevellingContext(projectId)
      .then((ctx) => {
        if (cancelled) return;
        if (ctx.levelTasks.length === 0) {
          setEmpty(true);
          setSummary(null);
          return;
        }
        const result = runLevelling(ctx);
        setEmpty(false);
        setSummary({
          profile: buildLevellingProfile(ctx.levelTasks, ctx.cal, ctx.capacities, result),
          shifts: result.assignments.length,
          residual: result.residual.length,
          stoppedAtLimit: result.stoppedAtLimit,
        });
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to run levelling preview"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, retry]);

  const { rows, weeks, ticks } = useMemo(() => {
    if (!summary) return { rows: [], weeks: [] as string[], ticks: [] as string[] };
    const before = weeklyPeak(summary.profile.daily.map((d) => ({ date: d.date, value: d.before })));
    const after = weeklyPeak(summary.profile.daily.map((d) => ({ date: d.date, value: d.after })));
    const weeks = projectWeeks(range, summary.profile.daily.map((d) => d.date));
    const rows = weeks.map((wk) => ({
      week: wk,
      before: round2(before.get(wk) ?? 0),
      after: round2(after.get(wk) ?? 0),
    }));
    return { rows, weeks, ticks: monthTicks(weeks) };
  }, [summary, range]);

  // The levelling engine already works in units (see levelling-service), not percent.
  const capacity = summary ? round2(summary.profile.capacity) : 0;

  return (
    <ChartWrapper
      title="Resource Levelling"
      description={
        summary
          ? `${summary.shifts} start shift${summary.shifts === 1 ? "" : "s"} within float · over-allocated resource-days ${summary.profile.overDaysBefore} → ${summary.profile.overDaysAfter}${summary.residual > 0 ? ` · ${summary.residual} unresolved (${summary.stoppedAtLimit ? "pass limit reached" : "float exhausted"})` : ""} · total demand across all trades, ${weeks.length} weeks, project start to finish · preview only`
          : "Demand before vs after levelling within float (preview only)"
      }
      loading={loading}
      error={error}
      onRetry={() => setRetry((n) => n + 1)}
      empty={empty || (!loading && !error && !summary)}
      emptyMessage="No resource-assigned tasks to level — assign resources in Resource Loading"
      height={360}
      className={className}
    >
      <div className="w-full">
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={rows} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            {weekAxis(ticks)}
            <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
            <Tooltip {...TOOLTIP_STYLE} labelFormatter={(wk) => `Week of ${fullDate(String(wk))}`} />
            <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
            {capacity > 0 && (
              <ReferenceLine
                y={capacity}
                stroke="#ef4444"
                strokeDasharray="5 4"
                label={{ value: `Capacity ${capacity}`, position: "insideTopRight", fill: "#ef4444", fontSize: 11 }}
              />
            )}
            {todayMarker(weeks, asOf)}
            <Area type="stepAfter" dataKey="before" name="Before levelling" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" fill="#f59e0b" fillOpacity={0.18} dot={false} />
            <Line type="stepAfter" dataKey="after" name="After levelling" stroke="#22c55e" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="px-3 pb-2 text-right text-[11px] text-muted-foreground">
          Apply the shifts in{" "}
          <Link href="/dashboard/planning/resource-loading" className="font-medium text-primary hover:underline">
            Resource Loading
          </Link>
        </p>
      </div>
    </ChartWrapper>
  );
}
