"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  currency,
  getProjectCostAnalytics,
  percent,
  ratio,
  type ProjectCostAnalytics,
} from "@/lib/evm-service";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

function Kpi({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "bad" | "warn" }) {
  const toneClass = {
    neutral: "text-slate-900",
    good: "text-emerald-700",
    bad: "text-red-700",
    warn: "text-amber-700",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={cn("text-xl font-semibold tabular-nums", toneClass)}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

export function EvmDashboard({ projectId }: Props) {
  const [project, setProject] = useState<ProjectCostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [row] = await getProjectCostAnalytics(projectId);
      setProject(row ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load EVM dashboard");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const trend = useMemo(() => {
    if (!project?.evm) return null;
    if ((project.evm.cpi ?? 1) < 0.95 || (project.evm.spi ?? 1) < 0.95) return "risk";
    if ((project.evm.cpi ?? 0) >= 1 && (project.evm.spi ?? 0) >= 1) return "good";
    return "watch";
  }, [project]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  if (!project || !project.evm) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
        Add BOQ budget, cost transactions, and task progress to calculate project EVM.
      </div>
    );
  }

  const { evm } = project;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Earned Value Dashboard</h2>
          <p className="text-sm text-slate-500">
            {project.projectCode ? `[${project.projectCode}] ` : ""}{project.projectName}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className={cn(
        "flex items-start gap-3 rounded-xl border p-4",
        trend === "good" && "border-emerald-200 bg-emerald-50",
        trend === "watch" && "border-amber-200 bg-amber-50",
        trend === "risk" && "border-red-200 bg-red-50",
      )}>
        {trend === "good" ? <TrendingUp className="mt-0.5 h-5 w-5 text-emerald-700" /> : trend === "risk" ? <TrendingDown className="mt-0.5 h-5 w-5 text-red-700" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />}
        <div>
          <div className="text-sm font-semibold text-slate-900">
            {trend === "good" ? "Project is performing within EVM targets" : trend === "risk" ? "Cost or schedule performance needs action" : "Project is close to control thresholds"}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            CPI {ratio(evm.cpi)} and SPI {ratio(evm.spi)} are calculated from BOQ budget, actual costs, and baseline task progress.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="BAC" value={currency(evm.bac)} />
        <Kpi label="Earned Value" value={currency(evm.ev)} />
        <Kpi label="Planned Value" value={currency(evm.pv)} />
        <Kpi label="Actual Cost" value={currency(evm.ac)} />
        <Kpi label="CPI" value={ratio(evm.cpi)} tone={evm.cpi != null && evm.cpi >= 1 ? "good" : "bad"} />
        <Kpi label="SPI" value={ratio(evm.spi)} tone={evm.spi != null && evm.spi >= 1 ? "good" : "bad"} />
        <Kpi label="Cost Variance" value={currency(evm.cv)} tone={evm.cv >= 0 ? "good" : "bad"} />
        <Kpi label="Schedule Variance" value={currency(evm.sv)} tone={evm.sv >= 0 ? "good" : "bad"} />
        <Kpi label="EAC Forecast" value={currency(evm.eac)} tone={evm.eac != null && evm.eac <= evm.bac ? "good" : "bad"} />
        <Kpi label="VAC Forecast" value={currency(evm.vac)} tone={evm.vac != null && evm.vac >= 0 ? "good" : "bad"} />
        <Kpi label="TCPI" value={ratio(evm.tcpi)} tone={evm.tcpi != null && evm.tcpi <= 1 ? "good" : "warn"} />
        <Kpi label="Physical Progress" value={percent(project.progress)} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 text-left">Metric</th>
              <th className="px-3 py-2 text-right">Formula</th>
              <th className="px-3 py-2 text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["CPI", "EV / AC", ratio(evm.cpi)],
              ["SPI", "EV / PV", ratio(evm.spi)],
              ["EAC", "BAC / CPI", currency(evm.eac)],
              ["VAC", "BAC - EAC", currency(evm.vac)],
              ["TCPI", "(BAC - EV) / (BAC - AC)", ratio(evm.tcpi)],
            ].map(([metric, formula, result]) => (
              <tr key={metric} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-semibold text-slate-800">{metric}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-500">{formula}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800">{result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Activity className="h-3.5 w-3.5" />
        {project.tasks} tasks tracked, {project.delayedTasks} delayed or blocked.
      </div>
    </div>
  );
}
