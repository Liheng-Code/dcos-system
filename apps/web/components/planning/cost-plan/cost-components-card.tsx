"use client";

// Cost by component (doc 35 C3; PRD FR-074): labour, material, equipment and subcontract cost per period, spread over
// each activity's working days, and the activities that cost the most against their budget (BOQ value).
// Data: plan_cost_components. Unpriced resources are counted, never guessed.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartWrapper } from "@/components/report-kit/charts/chart-wrapper";
import { LEGEND_STYLE, TICK, TOOLTIP_STYLE } from "@/components/planning/planning-dashboard-charts";
import { BASES, compact, money, periodLabel, PERIODS, Toggle, useRpc } from "@/components/planning/boq-programme/loading-charts";
import { createClient } from "@/lib/supabase/client";
import type { LoadingBasis, LoadingPeriod } from "@/lib/planning/boq-programme/loading-service";
import { COST_KIND_LABEL, COST_KINDS, getCostComponents, type CostComponents } from "@/lib/planning/cost-plan/cost-plan-service";

export const KIND_COLOR = { labor: "#2563eb", material: "#d97706", equipment: "#059669", subcontract: "#7c3aed" } as const;

export function CostComponentsCard({ projectId, className }: { projectId: string | null; className?: string }) {
  const [period, setPeriod] = useState<LoadingPeriod>("month");
  const [basis, setBasis] = useState<LoadingBasis>("current");
  const { data, error, loading, retry } = useRpc<CostComponents>(
    projectId ? `cc|${projectId}|${period}|${basis}` : null,
    () => getCostComponents(createClient(), projectId as string, period, basis),
  );
  const total = Number(data?.meta.total_cost ?? 0);
  const rows = useMemo(
    () => (data?.periods ?? []).map((p) => ({ ...p, cumulativePct: total > 0 ? Math.round((Number(p.cumulative) / total) * 1000) / 10 : 0 })),
    [data, total],
  );
  const kinds = useMemo(() => new Map((data?.kinds ?? []).map((k) => [k.kind, k])), [data]);
  const shown = COST_KINDS.filter((k) => Number(kinds.get(k)?.cost ?? 0) !== 0);
  const cur = data?.meta.currency ? ` ${data.meta.currency}` : "";
  const boq = Number(data?.meta.boq_value ?? 0);
  const unpricedHours = (data?.kinds ?? []).reduce((s, k) => s + Number(k.unpriced_hours), 0);

  return (
    <ChartWrapper
      title="Cost by Component"
      description={
        total > 0
          ? `Labour, material, equipment and subcontract cost per ${period} · ${money(total)}${cur}${boq > 0 ? ` = ${Math.round((total / boq) * 1000) / 10}% of the BOQ value ${money(boq)}` : ""}`
          : "Activity cost from the QS work items' resources, spread over each activity's working days"
      }
      loading={loading}
      error={error}
      onRetry={retry}
      empty={!loading && !error && total === 0}
      emptyMessage={
        data && data.meta.unpriced_lines > 0
          ? `${data.meta.unpriced_lines} resource lines found, none priced. Price them in QS › Cost Library or give the project resource a rate.`
          : "No activity has BOQ resources yet. Generate the programme from the BOQ (Planning › Generate from BOQ)."
      }
      height={420}
      className={className}
    >
      <div className="w-full">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-1 text-xs">
          {COST_KINDS.map((k) => {
            const row = kinds.get(k);
            if (!row) return null;
            return (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLOR[k] }} />
                {COST_KIND_LABEL[k]} <span className="font-semibold tabular-nums">{money(Number(row.cost))}</span>
                {total > 0 && <span className="text-muted-foreground">({Math.round((Number(row.cost) / total) * 100)}%)</span>}
              </span>
            );
          })}
          <span className="ml-auto flex gap-2">
            <Toggle value={basis} options={BASES} onChange={setBasis} />
            <Toggle value={period} options={PERIODS} onChange={setPeriod} />
          </span>
        </div>
        <ResponsiveContainer width="100%" height={290}>
          <ComposedChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="period" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => periodLabel(String(v), period)} minTickGap={16} />
            <YAxis yAxisId="v" tick={TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
            <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={40} />
            <Tooltip
              {...TOOLTIP_STYLE}
              labelFormatter={(v) => `${period === "month" ? "Month" : "Week"} of ${periodLabel(String(v), period)}`}
              formatter={(v, name) => [name === "Cumulative" ? `${v}%` : `${money(Number(v))}${cur}`, name]}
            />
            <Legend wrapperStyle={LEGEND_STYLE} />
            {shown.map((k) => (
              <Bar key={k} yAxisId="v" dataKey={k} name={COST_KIND_LABEL[k]} stackId="cost" fill={KIND_COLOR[k]} maxBarSize={28} />
            ))}
            <Line yAxisId="pct" dataKey="cumulativePct" name="Cumulative" stroke="var(--foreground)" strokeWidth={2} dot={false} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
        {data && (data.meta.unpriced_lines > 0 || Number(data.meta.scheduled_cost) < total || Number(data.meta.hours_counted_once) > 0) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {data.meta.unpriced_lines > 0 && (
              <span>
                {data.meta.unpriced_lines} resource lines have no rate{unpricedHours > 0 ? ` (${money(unpricedHours)} labour / plant hours)` : ""}: the cost above leaves them out. Price them in QS › Cost Library.
              </span>
            )}
            {Number(data.meta.hours_counted_once) > 0 && (
              <span>
                {money(Number(data.meta.hours_counted_once))} hours on {data.meta.tasks_counted_once} activities come from BOQ lines counted more than once; the cost counts each line once.{" "}
                <Link href="/dashboard/planning/boq-check" className="underline">Fix the mapping</Link>
              </span>
            )}
            {Number(data.meta.scheduled_cost) < total && <span>{money(total - Number(data.meta.scheduled_cost))}{cur} on activities without dates is not in the chart.</span>}
          </div>
        )}
      </div>
    </ChartWrapper>
  );
}

/** The activities with the highest cost, with their components and budget. */
export function CostByActivityTable({ projectId }: { projectId: string | null }) {
  const { data, loading } = useRpc<CostComponents>(
    projectId ? `cc|${projectId}|month|current` : null,
    () => getCostComponents(createClient(), projectId as string, "month", "current"),
  );
  const [showAll, setShowAll] = useState(false);
  if (loading || !data || data.tasks.length === 0) return null;
  const list = showAll ? data.tasks : data.tasks.slice(0, 15);
  const cur = data.meta.currency ? ` (${data.meta.currency})` : "";
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Cost by activity</h3>
          <p className="text-xs text-muted-foreground">Cost against budget (BOQ value) per activity, highest cost first</p>
        </div>
        <span className="text-xs text-muted-foreground">{data.tasks.length} activities</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left font-medium">Activity</th>
              {COST_KINDS.map((k) => <th key={k} className="px-3 py-1.5 text-right font-medium">{COST_KIND_LABEL[k]}</th>)}
              <th className="px-3 py-1.5 text-right font-medium">Cost{cur}</th>
              <th className="px-3 py-1.5 text-right font-medium">Budget</th>
              <th className="px-3 py-1.5 text-right font-medium">Cost / budget</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const ratio = Number(t.budget) > 0 ? Math.round((Number(t.total) / Number(t.budget)) * 100) : null;
              return (
                <tr key={t.task_id} className="border-t border-border/60">
                  <td className="max-w-[320px] truncate px-3 py-1" title={`${t.code} ${t.name}`}>
                    <span className="font-mono text-muted-foreground">{t.code}</span> {t.name}
                    {t.unpriced > 0 && <span className="ml-1 text-amber-600" title={`${t.unpriced} resource lines without a rate`}>· {t.unpriced} unpriced</span>}
                  </td>
                  {COST_KINDS.map((k) => <td key={k} className="px-3 py-1 text-right tabular-nums text-muted-foreground">{Number(t[k]) ? money(Number(t[k])) : "–"}</td>)}
                  <td className="px-3 py-1 text-right font-medium tabular-nums">{money(Number(t.total))}</td>
                  <td className="px-3 py-1 text-right tabular-nums">{Number(t.budget) ? money(Number(t.budget)) : "–"}</td>
                  <td className={`px-3 py-1 text-right tabular-nums ${ratio != null && ratio > 100 ? "font-semibold text-red-600" : ""}`}>{ratio != null ? `${ratio}%` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.tasks.length > 15 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t border-border px-3 py-2 text-xs font-medium text-primary hover:bg-muted/40">
          {showAll ? "Show the top 15" : `Show all ${data.tasks.length}`}
        </button>
      )}
    </section>
  );
}
