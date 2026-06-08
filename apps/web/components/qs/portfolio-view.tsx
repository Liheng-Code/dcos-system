"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  currency,
  getProjectCostAnalytics,
  percent,
  ratio,
  type ProjectCostAnalytics,
} from "@/lib/evm-service";

function variancePct(project: ProjectCostAnalytics) {
  return project.budget > 0 ? ((project.budget - project.actual) / project.budget) * 100 : 0;
}

export function PortfolioView() {
  const [projects, setProjects] = useState<ProjectCostAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await getProjectCostAnalytics());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load portfolio view");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const totals = useMemo(() => {
    const budget = projects.reduce((sum, project) => sum + project.budget, 0);
    const actual = projects.reduce((sum, project) => sum + project.actual, 0);
    const eac = projects.reduce((sum, project) => sum + (project.evm?.eac ?? project.budget), 0);
    const over = projects.filter((project) => project.actual > project.budget && project.budget > 0).length;
    const atRisk = projects.filter((project) => (project.evm?.cpi ?? 1) < 0.95 || (project.evm?.spi ?? 1) < 0.95).length;
    return { budget, actual, variance: budget - actual, eac, over, atRisk };
  }, [projects]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Portfolio Cost View</h2>
          <p className="text-sm text-slate-500">Executive summary across active project budgets, actuals, and EVM forecasts.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Projects", projects.length.toLocaleString(), "text-slate-900"],
          ["Portfolio Value", currency(totals.budget), "text-slate-900"],
          ["Spent To Date", currency(totals.actual), "text-slate-900"],
          ["Variance", currency(totals.variance), totals.variance >= 0 ? "text-emerald-700" : "text-red-700"],
          ["Forecast EAC", currency(totals.eac), totals.eac <= totals.budget ? "text-emerald-700" : "text-red-700"],
          ["At Risk", totals.atRisk.toLocaleString(), totals.atRisk === 0 ? "text-emerald-700" : "text-red-700"],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={cn("text-xl font-semibold tabular-nums", color)}>{value}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {totals.atRisk > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <div className="text-sm font-semibold text-slate-900">{totals.atRisk} project{totals.atRisk === 1 ? "" : "s"} below EVM control threshold</div>
            <div className="mt-1 text-xs text-slate-600">Projects with CPI or SPI below 0.95 should be reviewed for cost or schedule recovery actions.</div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-right">Budget</th>
              <th className="px-3 py-2 text-right">Actual</th>
              <th className="px-3 py-2 text-right">Variance</th>
              <th className="px-3 py-2 text-right">Progress</th>
              <th className="px-3 py-2 text-right">CPI</th>
              <th className="px-3 py-2 text-right">SPI</th>
              <th className="px-3 py-2 text-right">EAC</th>
              <th className="px-3 py-2 text-center">Health</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const variance = project.budget - project.actual;
              const cpi = project.evm?.cpi ?? null;
              const spi = project.evm?.spi ?? null;
              const risk = (cpi ?? 1) < 0.95 || (spi ?? 1) < 0.95 || variance < 0;
              return (
                <tr key={project.projectId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-slate-800">{project.projectName}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-400">{project.projectCode ?? project.projectStatus}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{currency(project.budget)}</td>
                  <td className="px-3 py-2 text-right">{currency(project.actual)}</td>
                  <td className={cn("px-3 py-2 text-right font-semibold", variance >= 0 ? "text-emerald-700" : "text-red-700")}>
                    {currency(variance)} <span className="text-[10px] font-normal text-slate-400">({percent(variancePct(project))})</span>
                  </td>
                  <td className="px-3 py-2 text-right">{percent(project.progress)}</td>
                  <td className={cn("px-3 py-2 text-right", cpi != null && cpi < 1 && "text-red-700")}>{ratio(cpi)}</td>
                  <td className={cn("px-3 py-2 text-right", spi != null && spi < 1 && "text-red-700")}>{ratio(spi)}</td>
                  <td className="px-3 py-2 text-right">{currency(project.evm?.eac)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium",
                      risk ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700",
                    )}>
                      {risk ? "At risk" : "On track"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {projects.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">No projects found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
