"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Loader2, ReceiptText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WbsEvmPanel } from "@/components/wbs/wbs-evm-panel";
import { type WbsTaskRecord } from "@/components/wbs/wbs-types";
import { currency, getWbsNodeCostBreakdown, toNumber } from "@/lib/evm-service";
import { getWbsCommercialSummary, getWbsBudgetRollup, type CommercialSummary } from "@/lib/qs/public";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
  wbsNodeId: string;
  tasks: WbsTaskRecord[];
  nodeBudget?: number | null;
  nodeActual?: number | null;
}

interface BoqItem {
  id: string;
  description: string;
  unit: string | null;
  quantity: number | string | null;
  unit_rate: number | string | null;
  total_amount: number | string | null;
  qs_boq_sections?: { title: string } | { title: string }[] | null;
}

interface Transaction {
  id: string;
  boq_item_id: string | null;
  transaction_type: string;
  cost_category: string;
  description: string;
  total_cost: number | string | null;
  cost_date: string | null;
  vendor_name: string | null;
  payment_status: string;
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";
}

function sectionTitle(item: BoqItem): string {
  const section = item.qs_boq_sections;
  if (Array.isArray(section)) return section[0]?.title ?? "Unsectioned";
  return section?.title ?? "Unsectioned";
}

export function WbsCostTab({ projectId, wbsNodeId, tasks, nodeBudget, nodeActual }: Props) {
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [commercialSummary, setCommercialSummary] = useState<CommercialSummary | null>(null);
  const [rollup, setRollup] = useState<{ rollupBudget: number; rollupActual: number; nodeCount: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, summary, roll] = await Promise.all([
        getWbsNodeCostBreakdown(projectId, wbsNodeId),
        getWbsCommercialSummary(projectId, wbsNodeId),
        getWbsBudgetRollup(projectId, wbsNodeId),
      ]);
      setBoqItems(data.boqItems as unknown as BoqItem[]);
      setTransactions(data.transactions as Transaction[]);
      setCommercialSummary(summary);
      setRollup(roll);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load WBS cost data");
    } finally {
      setLoading(false);
    }
  }, [projectId, wbsNodeId]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  const totals = useMemo(() => {
    const boqBudget = boqItems.reduce((sum, item) => sum + toNumber(item.total_amount), 0);
    const taskBudget = tasks.reduce((sum, task) => sum + toNumber(task.budget_cost), 0);
    const txActual = transactions.reduce((sum, tx) => sum + toNumber(tx.total_cost), 0);
    const taskActual = tasks.reduce((sum, task) => sum + toNumber(task.actual_cost), 0);
    const budget = commercialSummary?.budget || boqBudget || taskBudget || toNumber(nodeBudget);
    const actual = commercialSummary?.actual || txActual || taskActual || toNumber(nodeActual);
    const committed = commercialSummary?.committed ?? 0;
    const forecast = commercialSummary?.forecast || Math.max(budget, actual, committed);
    return {
      budget,
      committed,
      actual,
      forecast,
      variance: budget - forecast,
      spentPct: budget > 0 ? (actual / budget) * 100 : 0,
    };
  }, [boqItems, commercialSummary, nodeActual, nodeBudget, tasks, transactions]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CircleDollarSign className="h-4 w-4" />
            WBS Cost Summary
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-lg font-semibold text-slate-900">{currency(totals.budget)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Budget</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-lg font-semibold text-slate-900">{currency(totals.committed)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Committed</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-lg font-semibold text-slate-900">{currency(totals.actual)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Actual</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-lg font-semibold text-slate-900">{currency(totals.forecast)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Forecast</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className={cn("text-lg font-semibold", totals.variance >= 0 ? "text-emerald-700" : "text-red-700")}>{currency(totals.variance)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Variance</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-lg font-semibold text-slate-900">{totals.spentPct.toFixed(1)}%</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div className={cn("h-full", totals.spentPct > 100 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(totals.spentPct, 100)}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Rollup (incl. children) */}
      {rollup && rollup.nodeCount > 1 && (
        <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-700">
            <CircleDollarSign className="h-4 w-4" />
            Budget Rollup (incl. {rollup.nodeCount} nodes)
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="text-lg font-semibold text-indigo-900">{currency(rollup.rollupBudget)}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-indigo-400">Total Budget</div>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="text-lg font-semibold text-indigo-900">{currency(rollup.rollupActual)}</div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-indigo-400">Total Actual</div>
            </div>
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className={cn("text-lg font-semibold", rollup.rollupBudget - rollup.rollupActual >= 0 ? "text-emerald-700" : "text-red-700")}>
                {currency(rollup.rollupBudget - rollup.rollupActual)}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-indigo-400">Variance</div>
            </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="h-4 w-4" />
          BOQ Allocations
        </div>
        {boqItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
            No BOQ items are allocated to this WBS node.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                </tr>
              </thead>
              <tbody>
                {boqItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{item.description}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{sectionTitle(item)} · {item.unit ?? "-"}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{toNumber(item.quantity).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{currency(toNumber(item.unit_rate))}</td>
                    <td className="px-3 py-2 text-right font-semibold">{currency(toNumber(item.total_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="h-4 w-4" />
          Actual Cost Transactions
        </div>
        {transactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
            No actual cost transactions are posted to this WBS node yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-center">Category</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 text-slate-500">{fmtDate(tx.cost_date)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{tx.description}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{tx.vendor_name ?? tx.transaction_type} · {tx.payment_status}</div>
                    </td>
                    <td className="px-3 py-2 text-center capitalize text-slate-500">{tx.cost_category}</td>
                    <td className="px-3 py-2 text-right font-semibold">{currency(toNumber(tx.total_cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
          <CircleDollarSign className="h-4 w-4" />
          Earned Value Management
        </div>
        <WbsEvmPanel tasks={tasks} />
      </section>
    </div>
  );
}
