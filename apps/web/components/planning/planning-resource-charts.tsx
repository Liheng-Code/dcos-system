"use client";

import { useMemo, useState } from "react";
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
import { buildCostLevellingProfile, type CostLevelTask } from "@/lib/planning/cost-levelling-profile";
import { listPlannedCosts } from "@/lib/planning/cost-service";
import {
  DAY, LEGEND_STYLE, TICK, TOOLTIP_STYLE, fromUtc, toUtc, weekStart,
} from "@/components/planning/planning-dashboard-charts";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

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
  /** Bump (from the Dashboard's single Refresh button) to reload — otherwise this
   *  card restores its last-fetched result from cache instead of re-fetching. */
  refreshToken?: number;
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
interface ManpowerData {
  allocation: AllocationRow[];
  resources: PlanResource[];
}

export function ManpowerHistogramCard({ projectId, asOf, range, className, refreshToken = 0 }: CommonProps) {
  const [retry, setRetry] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const { data, loading, error } = useCachedFetch<ManpowerData>(
    projectId ? `dcos.planning.dashboard.manpower.${projectId}` : null,
    async () => {
      const [allocation, resources] = await Promise.all([getResourceAllocation(projectId), listResources(projectId)]);
      return { allocation, resources };
    },
    `${refreshToken}:${retry}`,
  );
  const points = useMemo(
    () => aggregateByType(data?.allocation ?? [], data?.resources ?? []),
    [data],
  );
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

interface LevellingResult {
  empty: boolean;
  summary: LevellingSummary | null;
}

export function LevellingDiagramCard({ projectId, asOf, range, className, refreshToken = 0 }: CommonProps) {
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useCachedFetch<LevellingResult>(
    projectId ? `dcos.planning.dashboard.levelling.${projectId}` : null,
    async () => {
      const ctx = await loadLevellingContext(projectId);
      if (ctx.levelTasks.length === 0) return { empty: true, summary: null };
      const result = runLevelling(ctx);
      return {
        empty: false,
        summary: {
          profile: buildLevellingProfile(ctx.levelTasks, ctx.cal, ctx.capacities, result),
          shifts: result.assignments.length,
          residual: result.residual.length,
          stoppedAtLimit: result.stoppedAtLimit,
        },
      };
    },
    `${refreshToken}:${retry}`,
  );
  const empty = data?.empty ?? false;
  const summary = data?.summary ?? null;

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

// ── Cost levelling diagram (preview — nothing is written; the companion to the manpower one above) ─
function money(n: number): string {
  const rounded = Math.round(n); // round the signed value first — negating before rounding would shift .5 ties the wrong way (see plan-cost-rollup.tsx)
  return rounded < 0 ? `-$${Math.abs(rounded).toLocaleString()}` : `$${rounded.toLocaleString()}`;
}

/** Range-independent: the raw weekly points plus the run summary. `range` is applied afterward in a
 *  `useMemo`, same split as the other cards in this file, so a `range` change alone (without projectId/retry)
 *  still recomputes the drawn axis without needing to re-fetch or re-run the leveller. */
interface CostLevellingSummary {
  points: ReturnType<typeof buildCostLevellingProfile>;
  shifts: number;
}

interface CostLevellingResult {
  empty: boolean;
  summary: CostLevellingSummary | null;
}

export function CostLevellingDiagramCard({ projectId, asOf, range, className, refreshToken = 0 }: CommonProps) {
  const [retry, setRetry] = useState(0);
  const { data, loading, error } = useCachedFetch<CostLevellingResult>(
    projectId ? `dcos.planning.dashboard.cost-levelling.${projectId}` : null,
    async () => {
      const [ctx, costs] = await Promise.all([loadLevellingContext(projectId), listPlannedCosts(projectId)]);
      const costTasks: CostLevelTask[] = ctx.levelTasks.map((t) => ({
        id: t.id,
        durationWd: t.durationWd,
        earliestStart: t.earliestStart,
        plannedCost: costs.get(t.id) ?? null,
      }));
      if (costTasks.every((t) => !(t.plannedCost && t.plannedCost > 0))) return { empty: true, summary: null };
      const result = runLevelling(ctx);
      const points = buildCostLevellingProfile(costTasks, ctx.cal, result.starts);
      return { empty: false, summary: { points, shifts: result.assignments.length } };
    },
    `${refreshToken}:${retry}`,
  );
  const empty = data?.empty ?? false;
  const summary = data?.summary ?? null;

  const { rows, ticks, totalAfter } = useMemo(() => {
    if (!summary) return { rows: [] as { week: string; before: number; after: number; cumulativeBefore: number; cumulativeAfter: number }[], ticks: [] as string[], totalAfter: 0 };
    const weeks = projectWeeks(range, summary.points.map((p) => p.weekStart));
    const byWeek = new Map(summary.points.map((p) => [p.weekStart, p]));
    // Cumulative must keep running even across weeks this diagram doesn't itself have a point for
    // (the axis is padded to the project span; a week before/after any cost still needs a cumulative value).
    let lastBefore = 0;
    let lastAfter = 0;
    const rows = weeks.map((wk) => {
      const p = byWeek.get(wk);
      if (p) { lastBefore = p.cumulativeBefore; lastAfter = p.cumulativeAfter; }
      return {
        week: wk,
        before: round2(p?.before ?? 0),
        after: round2(p?.after ?? 0),
        cumulativeBefore: round2(lastBefore),
        cumulativeAfter: round2(lastAfter),
      };
    });
    return { rows, ticks: monthTicks(weeks), totalAfter: lastAfter };
  }, [summary, range]);

  return (
    <ChartWrapper
      title="Cost Levelling"
      description={
        summary
          ? `Weekly cash flow before vs after the same ${summary.shifts} start shift${summary.shifts === 1 ? "" : "s"} — same total cost, ${money(totalAfter)}, redistributed by week · preview only`
          : "Weekly cash flow before vs after resource levelling (preview only)"
      }
      loading={loading}
      error={error}
      onRetry={() => setRetry((n) => n + 1)}
      empty={empty || (!loading && !error && !summary)}
      emptyMessage="No priced, resourced tasks to level — enter a quantity + norm on Task Work and assign resources in Resource Loading"
      height={340}
      className={className}
    >
      <div className="w-full">
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={rows} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            {weekAxis(ticks)}
            <YAxis yAxisId="l" tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => money(Number(v))} />
            <YAxis yAxisId="r" orientation="right" tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => money(Number(v))} />
            <Tooltip {...TOOLTIP_STYLE} labelFormatter={(wk) => `Week of ${fullDate(String(wk))}`} formatter={(v, name) => [money(Number(v)), String(name)]} />
            <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
            {todayMarker(rows.map((r) => r.week), asOf)}
            <Bar yAxisId="l" dataKey="before" name="Weekly cost before" fill="#f59e0b" fillOpacity={0.45} radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Bar yAxisId="l" dataKey="after" name="Weekly cost after" fill="var(--chart-1)" radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Line yAxisId="r" type="monotone" dataKey="cumulativeBefore" name="Cumulative before" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 3" dot={false} />
            <Line yAxisId="r" type="monotone" dataKey="cumulativeAfter" name="Cumulative after" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="px-3 pb-2 text-right text-[11px] text-muted-foreground">
          A task&apos;s own planned cost never changes by moving it — only which week it lands in does.
        </p>
      </div>
    </ChartWrapper>
  );
}
