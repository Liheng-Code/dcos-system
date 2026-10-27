"use client";

// Cost loading and the BOQ-based manpower histogram (doc 24 phase 3). Data: lib/planning/boq-programme/loading-service.ts
// (read-only RPCs), shaping: loading-view.ts.

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartWrapper } from "@/components/report-kit/charts/chart-wrapper";
import { LEGEND_STYLE, TICK, TOOLTIP_STYLE } from "@/components/planning/planning-dashboard-charts";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  getCostLoading, getManpowerHistogram,
  type CostLoading, type HistogramGroup, type LoadingBasis, type LoadingPeriod, type ManpowerHistogram, type ResourceKind,
} from "@/lib/planning/boq-programme/loading-service";
import { costLoadingRows, histogramRows, marginCheck, OTHER_KEY } from "@/lib/planning/boq-programme/loading-view";

const COLORS = ["#2563eb", "#059669", "#d97706", "#e11d48", "#7c3aed", "#0891b2", "#65a30d", "#db2777"];
const OTHER_COLOR = "#94a3b8";
const colorOf = (key: string, i: number) => (key === OTHER_KEY ? OTHER_COLOR : COLORS[i % COLORS.length]);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (iso: string, period: LoadingPeriod) =>
  period === "month" ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}` : `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const money = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Could not load the data");

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            o.value === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const PERIODS: { value: LoadingPeriod; label: string }[] = [{ value: "week", label: "Week" }, { value: "month", label: "Month" }];
const BASES: { value: LoadingBasis; label: string }[] = [{ value: "current", label: "Current" }, { value: "baseline", label: "Baseline" }];

/** Loads `fetcher` whenever `key` changes; state is only set in the async callbacks. */
function useRpc<T>(key: string | null, fetcher: () => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetcher()
      .then((data) => { if (!cancelled) setState({ key, data, error: null }); })
      .catch((e) => { if (!cancelled) setState({ key, data: null, error: errorText(e) }); });
    return () => { cancelled = true; };
    // fetcher closes over the same inputs that make up `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retry]);
  const loading = !!key && state.key !== key;
  return { data: loading ? null : state.data, error: loading ? null : state.error, loading, retry: () => { setState((s) => ({ ...s, key: null })); setRetry((n) => n + 1); } };
}

// ── Cost loading ────────────────────────────────────────────────────────────────────────────────
export function CostLoadingCard({ projectId, className }: { projectId: string | null; className?: string }) {
  const [period, setPeriod] = useState<LoadingPeriod>("month");
  const [basis, setBasis] = useState<LoadingBasis>("current");
  const { data, error, loading, retry } = useRpc<CostLoading>(
    projectId ? `${projectId}|${period}|${basis}` : null,
    () => getCostLoading(createClient(), projectId as string, period, basis),
  );
  const shaped = useMemo(() => (data ? costLoadingRows(data) : null), [data]);
  const margin = useMemo(() => (data ? marginCheck(data) : null), [data]);
  const hasAny = !!data && data.periods.length > 0 && Number(data.meta.scheduled_budget) !== 0;

  return (
    <ChartWrapper
      title="Cost Loading"
      description={
        hasAny
          ? `Planned value per ${period} by CSI division, spread over each activity's working days · scheduled ${money(Number(data!.meta.scheduled_budget))} of ${money(Number(data!.meta.total_budget))}`
          : "Activity budgets (BOQ value) spread over their working days"
      }
      loading={loading}
      error={error}
      onRetry={retry}
      empty={!loading && !error && !hasAny}
      emptyMessage={
        data && Number(data.meta.total_budget) !== 0
          ? `${data.meta.unscheduled_tasks} activities carry a budget but have no ${basis === "baseline" ? "baseline " : ""}dates yet. Schedule the programme first.`
          : "No activity carries a budget yet. Generate the programme from the BOQ (Planning › Generate from BOQ)."
      }
      height={380}
      className={className}
    >
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 pt-1">
          <Toggle value={basis} options={BASES} onChange={setBasis} />
          <Toggle value={period} options={PERIODS} onChange={setPeriod} />
        </div>
        {shaped && (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={shaped.rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="period" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => periodLabel(String(v), period)} minTickGap={16} />
              <YAxis yAxisId="v" tick={TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
              <Tooltip
                {...TOOLTIP_STYLE}
                labelFormatter={(v) => `${period === "month" ? "Month" : "Week"} of ${periodLabel(String(v), period)}`}
                formatter={(v, name) => [name === "Cumulative" ? `${v}%` : money(Number(v)), name]}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              {shaped.series.map((s, i) => (
                <Bar key={s.key} yAxisId="v" dataKey={s.key} name={s.label} stackId="cost" fill={colorOf(s.key, i)} maxBarSize={28} />
              ))}
              <Line yAxisId="pct" dataKey="cumulativePct" name="Cumulative" stroke="var(--foreground)" strokeWidth={2} dot={false} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        {data && (Number(data.meta.unscheduled_budget) !== 0 || margin) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            {Number(data.meta.unscheduled_budget) !== 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                {money(Number(data.meta.unscheduled_budget))} on {data.meta.unscheduled_tasks} activities without dates is not shown
              </span>
            )}
            {margin && (
              <span>
                Labour cost {money(margin.labourCost)}{data.margin.currency ? ` ${data.margin.currency}` : ""} = {margin.ratioPct}% of BOQ value
                {margin.pricedPct < 100 ? ` (rates found for ${margin.pricedPct}% of labour hours)` : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </ChartWrapper>
  );
}

// ── Manpower histogram (BOQ hours) ───────────────────────────────────────────────────────────────
const KINDS: { value: ResourceKind; label: string }[] = [{ value: "labor", label: "Manpower" }, { value: "equipment", label: "Equipment" }];
const GROUPS: { value: HistogramGroup; label: string }[] = [
  { value: "trade", label: "Trade" }, { value: "resource", label: "Resource" }, { value: "division", label: "Division" },
];
const MEASURES: { value: "headcount" | "hours"; label: string }[] = [{ value: "headcount", label: "Headcount" }, { value: "hours", label: "Hours" }];

export function BoqManpowerHistogramCard({ projectId, className, defaultPeriod = "week" }: { projectId: string | null; className?: string; defaultPeriod?: LoadingPeriod }) {
  const [period, setPeriod] = useState<LoadingPeriod>(defaultPeriod);
  const [group, setGroup] = useState<HistogramGroup>("trade");
  const [kind, setKind] = useState<ResourceKind>("labor");
  const [measure, setMeasure] = useState<"headcount" | "hours">("headcount");
  const { data, error, loading, retry } = useRpc<ManpowerHistogram>(
    projectId ? `${projectId}|${period}|${group}` : null,
    () => getManpowerHistogram(createClient(), projectId as string, period, group),
  );
  const shaped = useMemo(() => (data ? histogramRows(data, kind, measure) : null), [data, kind, measure]);
  const kindHours = data ? Number(kind === "labor" ? data.meta.labour_hours : data.meta.equipment_hours) : 0;
  const hasAny = !!shaped && shaped.peak > 0;
  const unit = measure === "headcount" ? (kind === "labor" ? "workers" : "units") : "hours";

  return (
    <ChartWrapper
      title="Manpower Histogram (BOQ)"
      description={
        hasAny
          ? `Average ${unit} per ${period} by ${group}, from BOQ man-hours spread over working days · ${money(kindHours)} ${kind === "labor" ? "man" : "machine"}-hours · peak ${shaped!.peak} ${unit}`
          : "Man-hours from the BOQ-driven programme spread over each activity's working days"
      }
      loading={loading}
      error={error}
      onRetry={retry}
      empty={!loading && !error && !hasAny}
      emptyMessage={
        data && Number(data.meta.unscheduled_hours) > 0
          ? "The activities with BOQ hours have no dates yet. Schedule the programme first."
          : "No BOQ man-hours yet. Generate the programme from the BOQ (Planning › Generate from BOQ)."
      }
      height={400}
      className={className}
    >
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 pt-1">
          <Toggle value={kind} options={KINDS} onChange={setKind} />
          <Toggle value={group} options={GROUPS} onChange={setGroup} />
          <Toggle value={measure} options={MEASURES} onChange={setMeasure} />
          <Toggle value={period} options={PERIODS} onChange={setPeriod} />
        </div>
        {shaped && (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={shaped.rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="period" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => periodLabel(String(v), period)} minTickGap={16} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
              <Tooltip
                {...TOOLTIP_STYLE}
                labelFormatter={(v) => `${period === "month" ? "Month" : "Week"} of ${periodLabel(String(v), period)}`}
                formatter={(v, name) => [`${v} ${unit}`, name]}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              {shaped.series.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="mp" fill={colorOf(s.key, i)} maxBarSize={24} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
        {data && Number(data.meta.unscheduled_hours) > 0 && hasAny && (
          <div className="border-t border-border px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {money(Number(data.meta.unscheduled_hours))} hours on activities without dates are not shown
          </div>
        )}
      </div>
    </ChartWrapper>
  );
}

/** True when the project has BOQ-based resource hours (plan_task_resource_hours); null while checking. */
export function useHasBoqHours(projectId: string | null): boolean | null {
  const { data, loading } = useRpc<boolean>(projectId ? `boq-hours|${projectId}` : null, async () => {
    const { count, error } = await createClient()
      .from("plan_task_resource_hours")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId as string);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  });
  if (!projectId) return false;
  return loading ? null : data ?? false;
}
