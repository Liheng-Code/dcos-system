"use client";

// Material histogram (doc 35 C2): material quantities per period from the BOQ programme (activity BOQ lines x the QS
// work item's consumption, with waste), spread over each activity's working days. One material at a time (units
// differ), or the cost of all materials. Data: plan_material_histogram.

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartWrapper } from "@/components/report-kit/charts/chart-wrapper";
import { TICK, TOOLTIP_STYLE } from "@/components/planning/planning-dashboard-charts";
import { BASES, compact, money, periodLabel, PERIODS, Toggle, useRpc } from "@/components/planning/boq-programme/loading-charts";
import { createClient } from "@/lib/supabase/client";
import type { LoadingBasis, LoadingPeriod } from "@/lib/planning/boq-programme/loading-service";
import { getMaterialHistogram, type MaterialHistogram } from "@/lib/planning/cost-plan/cost-plan-service";

const ALL = "__all__";
const qty = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n);

export function MaterialHistogramCard({ projectId, className }: { projectId: string | null; className?: string }) {
  const [period, setPeriod] = useState<LoadingPeriod>("month");
  const [basis, setBasis] = useState<LoadingBasis>("current");
  const [picked, setPicked] = useState<string>(ALL);
  const { data, error, loading, retry } = useRpc<MaterialHistogram>(
    projectId ? `mat|${projectId}|${period}|${basis}` : null,
    () => getMaterialHistogram(createClient(), projectId as string, period, basis),
  );

  const material = data?.materials.find((m) => m.resource_id === picked) ?? null;
  const rows = useMemo(() => {
    if (!data) return [];
    if (!material) return data.periods.map((p) => ({ period: p.period, value: Number(p.cost) }));
    const byPeriod = new Map(data.cells.filter((c) => c.resource_id === material.resource_id).map((c) => [c.period, Number(c.quantity)]));
    return data.periods.map((p) => ({ period: p.period, value: byPeriod.get(p.period) ?? 0 }));
  }, [data, material]);
  const peak = rows.reduce((m, r) => Math.max(m, r.value), 0);
  const currency = data?.meta.currency ? ` ${data.meta.currency}` : "";
  const unit = material ? material.unit ?? "" : currency.trim();

  return (
    <ChartWrapper
      title="Material Histogram (BOQ)"
      description={
        data && data.materials.length > 0
          ? material
            ? `${material.code} ${material.description}: ${qty(Number(material.quantity))} ${material.unit ?? ""} in total, peak ${qty(peak)} per ${period}`
            : `Cost of all ${data.meta.materials} materials per ${period} · ${money(Number(data.meta.material_cost))}${currency}${data.meta.unpriced_materials > 0 ? ` · ${data.meta.unpriced_materials} not priced in QS` : ""}`
          : "Material quantities from the activities' BOQ lines and the QS work items"
      }
      loading={loading}
      error={error}
      onRetry={retry}
      empty={!loading && !error && (!data || data.materials.length === 0)}
      emptyMessage="No materials yet. Materials come from Generate from BOQ: each activity's BOQ lines x the QS work item's materials."
      height={420}
      className={className}
    >
      <div className="w-full">
        <div className="flex flex-wrap items-center justify-end gap-2 px-3 pt-1">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="h-6 max-w-[260px] rounded-md border border-border bg-background px-1.5 text-[11px]"
            aria-label="Material"
          >
            <option value={ALL}>All materials (cost)</option>
            {data?.materials.map((m) => (
              <option key={m.resource_id} value={m.resource_id}>{m.code} {m.description} ({m.unit ?? "-"})</option>
            ))}
          </select>
          <Toggle value={basis} options={BASES} onChange={setBasis} />
          <Toggle value={period} options={PERIODS} onChange={setPeriod} />
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="period" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => periodLabel(String(v), period)} minTickGap={16} />
            <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
            <Tooltip
              {...TOOLTIP_STYLE}
              labelFormatter={(v) => `${period === "month" ? "Month" : "Week"} of ${periodLabel(String(v), period)}`}
              formatter={(v) => [`${material ? qty(Number(v)) : money(Number(v))} ${unit}`, material ? "Quantity" : "Material cost"]}
            />
            <Bar dataKey="value" fill="#d97706" maxBarSize={28} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {data && data.materials.length > 0 && (
          <div className="max-h-48 overflow-auto border-t border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Material</th>
                  <th className="px-3 py-1.5 text-right font-medium">Quantity</th>
                  <th className="px-3 py-1.5 text-right font-medium">Cost{currency}</th>
                </tr>
              </thead>
              <tbody>
                {data.materials.slice(0, 15).map((m) => (
                  <tr key={m.resource_id} className="cursor-pointer border-t border-border/60 hover:bg-muted/40" onClick={() => setPicked(m.resource_id)}>
                    <td className="px-3 py-1"><span className="font-mono text-muted-foreground">{m.code}</span> {m.description}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{qty(Number(m.quantity))} {m.unit}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{m.priced ? money(Number(m.cost)) : <span className="text-amber-600">not priced</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.materials.length > 15 && <p className="px-3 py-1 text-[11px] text-muted-foreground">Top 15 by cost of {data.materials.length}. Pick any material in the list above.</p>}
          </div>
        )}
      </div>
    </ChartWrapper>
  );
}
