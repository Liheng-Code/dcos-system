"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, BadgeCheck, BarChart3, CircleDollarSign,
  Loader2, RefreshCw, TrendingUp,
} from "lucide-react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BudgetView } from "@/components/qs/budget-view";
import { BudgetRevisions } from "@/components/qs/budget-revisions";
import { CostEntry } from "@/components/qs/cost-entry";
import {
  getBudgetSummary, getCostTransactions, getProgressClaims, getVariationOrders,
  type BudgetSummary, type QsCostTransaction, type QsProgressClaim, type QsVariationOrder,
} from "@/lib/qs-service";
import { cn } from "@/lib/utils";

const SUB_TABS = [
  { id: "overview", label: "Cost Dashboard" },
  { id: "variance", label: "Budget & Variance" },
  { id: "revisions", label: "Budget Revisions" },
  { id: "costs", label: "Cost Transactions" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["id"];
interface Props { projectId: string; projectName?: string }

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0,
}).format(value);

const shortDate = (value: string | null) => value
  ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  : "Not set";

function statusClass(status: string) {
  if (["approved", "certified", "paid", "implemented"].includes(status)) return "bg-emerald-50 text-emerald-700";
  if (["submitted", "client_reviewed"].includes(status)) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function MetricCard({ label, value, detail, icon: Icon, tone = "slate" }: {
  label: string; value: string; detail: string; icon: typeof TrendingUp; tone?: "slate" | "blue" | "emerald";
}) {
  const toneClass = tone === "emerald" ? "bg-emerald-50 text-emerald-600" : tone === "blue" ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium text-slate-500">{label}</p>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-md", toneClass)}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] text-slate-400">{detail}</p>
    </section>
  );
}

export function CostDashboard({ projectId, projectName }: Props) {
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [transactions, setTransactions] = useState<QsCostTransaction[]>([]);
  const [variations, setVariations] = useState<QsVariationOrder[]>([]);
  const [claims, setClaims] = useState<QsProgressClaim[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [budget, costs, vos, progressClaims] = await Promise.all([
        getBudgetSummary(projectId), getCostTransactions(projectId), getVariationOrders(projectId), getProgressClaims(projectId),
      ]);
      setSummary(budget); setTransactions(costs); setVariations(vos); setClaims(progressClaims);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load cost control data");
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const curve = useMemo(() => {
    const dated = transactions.filter((item) => item.cost_date).map((item) => ({ date: new Date(item.cost_date), amount: Number(item.total_cost) }));
    const certified = claims.filter((item) => item.certified_at || item.period_end).map((item) => ({
      date: new Date(item.certified_at ?? item.period_end), amount: Number(item.certified_amount ?? item.current_payment_due),
    }));
    const allDates = [...dated, ...certified].map((item) => item.date.getTime()).filter(Number.isFinite);
    const start = allDates.length ? new Date(Math.min(...allDates)) : new Date();
    const months = Array.from({ length: 8 }, (_, index) => new Date(start.getFullYear(), start.getMonth() + index, 1));
    const budget = summary?.totalBudget ?? 0;
    const totalCertified = certified.reduce((sum, item) => sum + item.amount, 0);
    const totalCost = dated.reduce((sum, item) => sum + item.amount, 0);
    return months.map((month, index) => {
      const cutoff = new Date(month.getFullYear(), month.getMonth() + 1, 0).getTime();
      const cost = dated.filter((item) => item.date.getTime() <= cutoff).reduce((sum, item) => sum + item.amount, 0);
      const revenue = certified.filter((item) => item.date.getTime() <= cutoff).reduce((sum, item) => sum + item.amount, 0);
      // A smooth baseline gives a useful planned S-curve even before a detailed schedule baseline is imported.
      const t = (index + 1) / months.length;
      const planned = Math.min(100, Math.round((3 * t * t - 2 * t * t * t) * 100));
      return {
        month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(month), planned,
        certified: totalCertified > 0 ? Math.min(100, Math.round((revenue / totalCertified) * 100)) : null,
        spent: totalCost > 0 ? Math.min(100, Math.round((cost / Math.max(budget, totalCost)) * 100)) : null,
      };
    });
  }, [claims, summary?.totalBudget, transactions]);

  const utilization = useMemo(() => (summary?.sections ?? []).slice(0, 5).map((section) => ({
    name: section.title, budget: section.budget, committed: section.committed,
    percentage: section.budget > 0 ? Math.round((section.committed / section.budget) * 100) : 0,
  })), [summary]);
  const approvedVariations = variations.filter((item) => ["approved", "implemented"].includes(item.status));
  const certifiedClaims = claims.filter((item) => ["certified", "paid"].includes(item.status));
  const contractSum = claims[0] ? Number(claims[0].original_contract_sum) : summary?.totalBudget ?? 0;
  const projectedMargin = contractSum - (summary?.totalForecast ?? 0);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!summary) return null;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl bg-slate-950 px-5 py-4 text-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/15 pb-4">
          <div>
            <div className="mb-1 flex items-center gap-2"><span className="rounded bg-blue-400/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-blue-200">LIVE</span><span className="font-mono text-[10px] text-slate-400">PROJECT COST CONTROL</span></div>
            <h2 className="text-base font-semibold">{projectName || "Selected Project"}</h2>
            <p className="mt-1 text-[11px] text-slate-400">A real-time view of project cost, certification, and budget exposure</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div><p className="font-mono text-[9px] uppercase tracking-wider text-sky-300/75">Budget baseline</p><p className="mt-1 text-sm font-semibold">{money(summary.totalBudget)}</p></div>
          <div><p className="font-mono text-[9px] uppercase tracking-wider text-sky-300/75">Committed cost</p><p className="mt-1 text-sm font-semibold">{money(summary.totalCommitted)}</p></div>
          <div><p className="font-mono text-[9px] uppercase tracking-wider text-sky-300/75">Actual cost</p><p className="mt-1 text-sm font-semibold">{money(summary.totalActual)}</p></div>
          <div><p className="font-mono text-[9px] uppercase tracking-wider text-sky-300/75">Contract sum</p><p className="mt-1 text-sm font-semibold text-emerald-400">{money(contractSum)}</p></div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Forecast at Completion" value={money(summary.totalForecast)} detail={`Budget baseline: ${money(summary.totalBudget)}`} icon={TrendingUp} tone="blue" />
        <MetricCard label="Committed Cost (POs)" value={money(summary.totalCommitted)} detail={`${summary.committedPct.toFixed(1)}% of budget`} icon={CircleDollarSign} tone="blue" />
        <MetricCard label="Certified Claims Sum" value={money(certifiedClaims.reduce((sum, item) => sum + Number(item.certified_amount ?? item.current_payment_due), 0))} detail={`${certifiedClaims.length} certified claim${certifiedClaims.length === 1 ? "" : "s"}`} icon={BadgeCheck} tone="emerald" />
        <MetricCard label="Projected Profit Margin" value={`${contractSum > 0 ? ((projectedMargin / contractSum) * 100).toFixed(1) : "0.0"}%`} detail={`Expected margin: ${money(projectedMargin)}`} icon={Activity} tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-800">Project Cash Flow Cumulative S-Curve</h3><span className="font-mono text-[10px] text-slate-400">CUMULATIVE (%)</span></div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e8edf3" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => value == null ? "No data" : `${value}%`} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
                <Line type="monotone" dataKey="planned" name="Planned Value S-Curve" stroke="#10b981" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="certified" name="Actual Value Certified" stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls />
                <Line type="monotone" dataKey="spent" name="Actual Cost Spent" stroke="#f59e0b" strokeWidth={2.5} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-800">WBS Budget Utilization Profile</h3><BarChart3 className="h-4 w-4 text-slate-400" /></div>
          {utilization.length === 0 ? <p className="py-12 text-center text-xs text-slate-400">Add BOQ sections to view utilization.</p> : <div className="space-y-4">
            {utilization.map((item) => <div key={item.name}>
              <div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="truncate font-medium text-slate-700">{item.name}</span><span className={cn(item.percentage > 100 ? "text-red-600" : "text-slate-500")}>{item.percentage}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", item.percentage > 100 ? "bg-red-500" : item.percentage > 85 ? "bg-amber-500" : "bg-slate-700")} style={{ width: `${Math.min(item.percentage, 100)}%` }} /></div>
              <div className="mt-1 flex justify-between font-mono text-[8px] text-slate-400"><span>Committed: {money(item.committed)}</span><span>Budget: {money(item.budget)}</span></div>
            </div>)}
          </div>}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-800">Variation Claims (VO Register)</h3><span className="font-mono text-[10px] text-slate-400">Approved: {money(approvedVariations.reduce((sum, item) => sum + Number(item.total_amount), 0))}</span></div>
          {variations.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">No variation orders have been raised.</p> : <div className="divide-y divide-slate-100">{variations.slice(0, 3).map((item) => <div key={item.id} className="flex gap-3 py-2.5"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-semibold text-slate-700">{item.vo_number}</span><span className={cn("rounded px-1.5 py-0.5 text-[8px] font-bold uppercase", statusClass(item.status))}>{item.status}</span></div><p className="mt-1 truncate text-[11px] text-slate-700">{item.title}</p><p className="mt-0.5 text-[9px] text-slate-400">Schedule impact: {item.schedule_impact_days} days</p></div><p className="pt-1 text-xs font-semibold text-slate-800">{money(Number(item.total_amount))}</p></div>)}</div>}
          <Link href="/dashboard/qs/variations" className="mt-3 block text-right text-[10px] font-medium text-primary hover:underline">View variation register →</Link>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-800">Interim Progress Claims</h3><span className="font-mono text-[10px] text-slate-400">Total claims: {claims.length}</span></div>
          {claims.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">No progress claims have been created.</p> : <div className="divide-y divide-slate-100">{claims.slice(0, 3).map((item) => <div key={item.id} className="flex gap-3 py-2.5"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-mono text-[10px] font-semibold text-slate-700">Claim #{item.claim_number}</span><span className={cn("rounded px-1.5 py-0.5 text-[8px] font-bold uppercase", statusClass(item.status))}>{item.status}</span></div><p className="mt-1 text-[9px] text-slate-400">Period ending: {shortDate(item.period_end)} · Retention: {money(Number(item.retention_amount))}</p></div><p className="pt-1 text-xs font-semibold text-slate-800">{money(Number(item.certified_amount ?? item.current_payment_due))}</p></div>)}</div>}
          <Link href="/dashboard/qs/claims" className="mt-3 block text-right text-[10px] font-medium text-primary hover:underline">View progress claims →</Link>
        </section>
      </div>
    </div>
  );
}

export function CostControl({ projectId, projectName }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  return (
    <div className="space-y-4">
      <div className="inline-flex max-w-full overflow-x-auto rounded-lg bg-slate-100 p-1">
        {SUB_TABS.map((tab) => <button key={tab.id} type="button" onClick={() => setSubTab(tab.id)} className={cn("shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors", subTab === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}>{tab.label}</button>)}
      </div>
      {subTab === "overview" && <CostDashboard projectId={projectId} projectName={projectName} />}
      {subTab === "variance" && <BudgetView projectId={projectId} projectName={projectName} />}
      {subTab === "revisions" && <BudgetRevisions projectId={projectId} />}
      {subTab === "costs" && <CostEntry projectId={projectId} />}
    </div>
  );
}
