"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv, fmtCsvNum } from "@/lib/csv-export";
import { printBudgetReport } from "@/lib/print-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type BudgetSummary, getBudgetSummary } from "@/lib/qs-service";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function VariancePill({ pct }: { pct: number }) {
  const cls =
    Math.abs(pct) < 5
      ? "bg-emerald-100 text-emerald-700"
      : pct >= 0
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  const label = pct >= 0 ? `+${pct.toFixed(1)}% under` : `${pct.toFixed(1)}% over`;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", cls)}>
      {label}
    </span>
  );
}

interface Props { projectId: string; projectName?: string }

export function BudgetView({ projectId, projectName = projectId }: Props) {
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function exportCsv() {
    if (!summary) return;
    const rows: string[][] = [
      ["Section", "Item", "Unit", "Qty", "Unit Rate", "Budget", "Committed", "Actual", "Forecast", "Variance"],
    ];
    for (const sec of summary.sections) {
      rows.push([sec.title, "", "", "", "", fmtCsvNum(sec.budget), fmtCsvNum(sec.committed), fmtCsvNum(sec.actual), fmtCsvNum(sec.forecast), fmtCsvNum(sec.variance)]);
      for (const item of sec.items) {
        rows.push(["", item.description, item.unit, fmtCsvNum(item.quantity), fmtCsvNum(item.unit_rate), fmtCsvNum(item.total_amount), fmtCsvNum(item.committed), fmtCsvNum(item.actual), fmtCsvNum(item.forecast), fmtCsvNum(item.variance)]);
      }
    }
    rows.push(["TOTAL", "", "", "", "", fmtCsvNum(summary.totalBudget), fmtCsvNum(summary.totalCommitted), fmtCsvNum(summary.totalActual), fmtCsvNum(summary.totalForecast), fmtCsvNum(summary.variance)]);
    downloadCsv("budget-summary.csv", rows);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try { setSummary(await getBudgetSummary(projectId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load budget summary"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }
  if (!summary) return null;

  const toggle = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const spentPct = summary.totalBudget > 0
    ? ((summary.totalActual / summary.totalBudget) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      {/* Export / Print */}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
        <Button size="sm" variant="outline" onClick={() => printBudgetReport({
          totalBudget: summary.totalBudget,
          totalActual: summary.totalActual,
          totalForecast: summary.totalForecast,
          variance: summary.variance,
          sections: summary.sections.map((s) => ({
            title: s.title, budget: s.budget, actual: s.actual, forecast: s.forecast, variance: s.variance,
            items: s.items.map((i) => ({ description: i.description, unit: i.unit, quantity: i.quantity, unit_rate: i.unit_rate, total_amount: i.total_amount, actual: i.actual })),
          })),
        }, projectName)} className="gap-1.5">
          <Printer className="h-3.5 w-3.5" /> Print Report
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Budget</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">${fmt(summary.totalBudget)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Committed</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">${fmt(summary.totalCommitted)}</p>
          <p className="mt-1 text-[10px] text-slate-400">{summary.committedPct.toFixed(1)}% of budget</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Actual Cost</p>
          <p className="mt-1 text-xl font-semibold text-slate-800">${fmt(summary.totalActual)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Forecast / Spent</p>
          <p className={cn("mt-1 text-xl font-semibold", summary.variance >= 0 ? "text-emerald-600" : "text-red-600")}>
            ${fmt(summary.totalForecast)}
          </p>
          <p className="mt-1 text-xl font-semibold text-primary">{spentPct}%</p>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn("h-full rounded-full transition-all", parseFloat(spentPct) > 100 ? "bg-red-500" : "bg-emerald-500")}
              style={{ width: `${Math.min(parseFloat(spentPct), 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Cost Category Breakdown */}
      {summary.totalActual > 0 && (() => {
        const cats = summary.costByCategory;
        const total = summary.totalActual;
        const entries = [
          { key: "labor",       label: "Labor",       color: "bg-blue-500"   },
          { key: "material",    label: "Material",    color: "bg-emerald-500" },
          { key: "equipment",   label: "Equipment",   color: "bg-amber-500"  },
          { key: "subcontract", label: "Subcontract", color: "bg-purple-500" },
          { key: "other",       label: "Other",       color: "bg-slate-400"  },
        ] as const;
        return (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Actual Cost by Category
            </p>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {entries.map(({ key, color }) => {
                const pct = total > 0 ? (Number(cats[key]) / total) * 100 : 0;
                return pct > 0 ? (
                  <div key={key} className={cn(color)} style={{ width: `${pct}%` }} title={`${key}: ${pct.toFixed(1)}%`} />
                ) : null;
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {entries.map(({ key, label, color }) => {
                const amount = Number(cats[key]);
                const pct = total > 0 ? (amount / total) * 100 : 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color)} />
                    <div>
                      <p className="text-[10px] text-slate-500">{label}</p>
                      <p className="text-xs font-semibold text-slate-700">${fmt(amount)}</p>
                      <p className="text-[10px] text-slate-400">{pct.toFixed(1)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Section table */}
      {summary.sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-400">No BOQ data yet. Add sections and items in the BOQ builder.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left">Section / Item</th>
                <th className="px-3 py-2 text-right">Budget</th>
                <th className="px-3 py-2 text-right">Committed</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Forecast</th>
                <th className="px-3 py-2 text-right">Variance</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.sections.flatMap((sec) => {
                const isExp = expanded.has(sec.id);
                const rows = [
                  <tr
                    key={sec.id}
                    className="cursor-pointer border-t border-slate-200 bg-slate-50/80 hover:bg-slate-100/60"
                    onClick={() => toggle(sec.id)}
                  >
                    <td className="px-3 py-2.5 font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        {isExp
                          ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                          : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                        {sec.title}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-slate-700">${fmt(sec.budget)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">${fmt(sec.committed)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">${fmt(sec.actual)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">${fmt(sec.forecast)}</td>
                    <td className={cn("px-3 py-2.5 text-right font-medium", sec.variance >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {sec.variance >= 0 ? "+" : ""}{fmt(sec.variance)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {sec.budget > 0 ? <VariancePill pct={sec.variancePct} /> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>,
                ];
                if (isExp) {
                  sec.items.forEach((item, idx) => {
                    rows.push(
                      <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                        <td className="py-2 pl-10 pr-3 text-slate-600">
                          <span className="mr-2 text-slate-300">{idx + 1}.</span>
                          {item.description}
                          <span className="ml-2 text-slate-300">
                            ({Number(item.quantity).toLocaleString()} {item.unit} × ${fmt(Number(item.unit_rate))})
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600">${fmt(item.total_amount)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">${fmt(item.committed)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">${fmt(item.actual)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">${fmt(item.forecast)}</td>
                        <td className={cn("px-3 py-2 text-right", item.variance >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {item.variance >= 0 ? "+" : ""}{fmt(item.variance)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.actual === 0
                            ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">No cost</span>
                            : <VariancePill pct={item.total_amount > 0 ? ((item.total_amount - item.actual) / item.total_amount) * 100 : 0} />}
                        </td>
                      </tr>,
                    );
                  });
                }
                return rows;
              })}

              {/* Totals */}
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td className="px-3 py-3 font-bold text-slate-800">TOTAL</td>
                <td className="px-3 py-3 text-right font-bold text-slate-800">${fmt(summary.totalBudget)}</td>
                <td className="px-3 py-3 text-right font-bold text-slate-700">${fmt(summary.totalCommitted)}</td>
                <td className="px-3 py-3 text-right font-bold text-slate-700">${fmt(summary.totalActual)}</td>
                <td className="px-3 py-3 text-right font-bold text-slate-700">${fmt(summary.totalForecast)}</td>
                <td className={cn("px-3 py-3 text-right font-bold", summary.variance >= 0 ? "text-emerald-600" : "text-red-600")}>
                  {summary.variance >= 0 ? "+" : ""}{fmt(summary.variance)}
                </td>
                <td className="px-3 py-3 text-center">
                  {summary.totalBudget > 0 && <VariancePill pct={summary.variancePct} />}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
