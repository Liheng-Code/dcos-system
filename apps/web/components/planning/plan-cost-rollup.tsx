"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { listWbsNodesByProjectIdOrderedByFullPath, listWbsTasksByProjectIdWithPlanTaskWork } from "@/lib/planning/planning-queries";
import { useProject } from "@/components/dashboard/project-context";
import { ChartWrapper } from "@/components/reports/charts/chart-wrapper";
import { LEGEND_STYLE, TICK, TOOLTIP_STYLE } from "@/components/planning/planning-dashboard-charts";
import { getWbsCostRollup, type WbsCostRollupRow } from "@/lib/planning/cost-service";
import { getProjectCalendarRow } from "@/lib/planning/productivity-service";
import { buildWorkCalendar } from "@/lib/planning/work-calendar";
import { phaseCostByWeek, type PhasableTask } from "@/lib/planning/cost-phasing";
import { cn } from "@/lib/utils";

interface NodeRow {
  id: string;
  wbs_code: string;
  wbs_name: string;
  full_path: string;
  node_type: string;
}

function money(n: number): string {
  const rounded = Math.round(n); // round the signed value first — negating before rounding would shift .5 ties the wrong way
  return rounded < 0 ? `-$${Math.abs(rounded).toLocaleString()}` : `$${rounded.toLocaleString()}`;
}

export function PlanCostRollup() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [rollup, setRollup] = useState<Map<string, WbsCostRollupRow>>(new Map());
  const [weekly, setWeekly] = useState<ReturnType<typeof phaseCostByWeek>>([]);

  const load = useCallback(async () => {
    if (!selectedProjectId) { setNodes([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [nodesRes, rollupRows, tasksRes, calRow] = await Promise.all([
        listWbsNodesByProjectIdOrderedByFullPath(selectedProjectId),
        getWbsCostRollup(selectedProjectId),
        listWbsTasksByProjectIdWithPlanTaskWork(selectedProjectId, "id, start_date, end_date, is_milestone, plan_task_work(planned_cost)"),
        getProjectCalendarRow(selectedProjectId),
      ]);
      if (nodesRes.error) throw new Error(nodesRes.error.message);
      if (tasksRes.error) throw new Error(tasksRes.error.message);
      setNodes((nodesRes.data ?? []) as NodeRow[]);
      setRollup(new Map(rollupRows.map((r) => [r.wbsNodeId, r])));

      const cal = buildWorkCalendar(calRow.calendar, calRow.exceptions);
      const phasable: PhasableTask[] = (tasksRes.data ?? []).map((t) => {
        const w = t.plan_task_work as unknown as { planned_cost: number | null } | { planned_cost: number | null }[] | null;
        const plannedCost = Array.isArray(w) ? (w[0]?.planned_cost ?? null) : (w?.planned_cost ?? null);
        return { startDate: t.start_date as string | null, endDate: t.end_date as string | null, isMilestone: !!t.is_milestone, plannedCost };
      });
      setWeekly(phaseCostByWeek(phasable, cal));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const root = nodes.filter((n) => n.full_path && !n.full_path.includes(" / "));
    let plannedCost = 0, boqValue = 0, priced = 0, total = 0;
    for (const n of root) {
      const r = rollup.get(n.id);
      if (!r) continue;
      plannedCost += r.plannedCost; boqValue += r.boqValue; priced += r.pricedTasks; total += r.totalTasks;
    }
    return { plannedCost, boqValue, variance: plannedCost - boqValue, priced, total };
  }, [nodes, rollup]);

  const rows = useMemo(
    () => [...nodes]
      .sort((a, b) => a.full_path.localeCompare(b.full_path, undefined, { numeric: true }))
      .map((n) => ({ node: n, depth: (n.full_path.match(/ \/ /g) ?? []).length, r: rollup.get(n.id) })),
    [nodes, rollup],
  );

  if (projectLoading || loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <p className="py-10 text-center text-sm text-muted-foreground">Select a project from the sidebar to see its cost rollup.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Planned resource cost</p>
          <p className="text-xl font-bold tabular-nums">{money(totals.plannedCost)}</p>
          <p className="text-[10px] text-muted-foreground">{totals.priced} of {totals.total} tasks priced</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">BOQ value (mapped tasks)</p>
          <p className="text-xl font-bold tabular-nums">{money(totals.boqValue)}</p>
        </div>
        <div className={cn("rounded-lg border bg-card p-3 sm:col-span-2", totals.variance !== 0 && totals.boqValue > 0 ? "border-amber-500/40" : "border-border")}>
          <p className="text-[11px] text-muted-foreground">Variance (planned resource cost − BOQ value)</p>
          <p className={cn("text-xl font-bold tabular-nums", totals.variance < 0 ? "text-emerald-400" : totals.variance > 0 ? "text-amber-400" : "")}>
            {totals.variance >= 0 ? "+" : ""}{money(totals.variance)}
          </p>
          <p className="text-[10px] text-muted-foreground">Only tasks linked to a BOQ line (Planning ▸ Productivity ▸ BOQ Mapping) count toward this.</p>
        </div>
      </div>

      <ChartWrapper
        title="Cost-loaded S-curve & cash flow"
        description="Planned cost spread evenly across each priced task's scheduled working days, bucketed by week. Bars = that week's outflow, line = cumulative."
        loading={false}
        error={null}
        empty={weekly.length === 0}
        emptyMessage="No priced, dated tasks yet — enter a quantity + norm on Task Work"
        height={320}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={weekly} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="weekStart" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={Math.max(0, Math.floor(weekly.length / 12) - 1)} />
            <YAxis yAxisId="l" tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => money(Number(v))} />
            <YAxis yAxisId="r" orientation="right" tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v) => money(Number(v))} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [money(Number(v)), String(name)]} />
            <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
            <Bar yAxisId="l" dataKey="cost" name="Weekly cost" fill="var(--chart-1)" radius={[2, 2, 0, 0]} maxBarSize={18} />
            <Line yAxisId="r" type="monotone" dataKey="cumulative" name="Cumulative" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartWrapper>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-2 py-2 font-medium">WBS node</th>
              <th className="px-2 py-2 text-right font-medium">Planned cost</th>
              <th className="px-2 py-2 text-right font-medium" title="Tasks with a resolvable planned cost, of all tasks in this node or below">Priced</th>
              <th className="px-2 py-2 text-right font-medium">BOQ value</th>
              <th className="px-2 py-2 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth, r }) => (
              <tr key={node.id} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5" style={{ paddingLeft: `${8 + depth * 16}px` }}>
                  <span className="font-medium">{node.wbs_code}</span> <span className="text-muted-foreground">{node.wbs_name}</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r && r.plannedCost > 0 ? money(r.plannedCost) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{r ? `${r.pricedTasks}/${r.totalTasks}` : "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{r && r.boqValue > 0 ? money(r.boqValue) : <span className="text-muted-foreground">—</span>}</td>
                <td className={cn("px-2 py-1.5 text-right tabular-nums", r && r.boqValue > 0 && (r.variance < 0 ? "text-emerald-400" : r.variance > 0 ? "text-amber-400" : ""))}>
                  {r && r.boqValue > 0 ? `${r.variance >= 0 ? "+" : ""}${money(r.variance)}` : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">This project has no WBS nodes yet.</p>}
      </div>
    </div>
  );
}
