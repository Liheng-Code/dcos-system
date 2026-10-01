"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, GitCompare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type QsBudgetRevision,
  approveBudgetRevision,
  getBudgetRevisions,
} from "@/lib/qs/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props { projectId: string }

export function BudgetRevisions({ projectId }: Props) {
  const { can } = useQsPermissions();

  const [revisions, setRevisions] = useState<QsBudgetRevision[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<"all" | "pending" | "approved">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getBudgetRevisions(projectId);
      setRevisions(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleApprove(id: string) {
    try {
      await approveBudgetRevision(id);
      await load();
      toast.success("Budget revision approved");
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const pending  = revisions.filter((r) => !r.approved_at);
  const approved = revisions.filter((r) =>  r.approved_at);
  const filtered =
    filter === "pending"  ? pending  :
    filter === "approved" ? approved :
    revisions;

  return (
    <div className="space-y-4">
      {/* Header + KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Revisions</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800">{revisions.length}</p>
          <p className="mt-1 text-xs text-slate-400">All BOQ item revisions</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-amber-500">Pending Approval</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{pending.length}</p>
          <p className="mt-1 text-xs text-amber-400">Awaiting QS Manager sign-off</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-emerald-500">Approved</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{approved.length}</p>
          <p className="mt-1 text-xs text-emerald-400">Effective budget amendments</p>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(["all", "pending", "approved"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              filter === f
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <GitCompare className="mb-3 h-9 w-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">
            {filter === "pending" ? "No pending budget revisions" : "No revisions found"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Budget revisions are created when a locked BOQ item is amended.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left">BOQ Item</th>
                <th className="px-3 py-2 text-center">Prev Qty</th>
                <th className="px-3 py-2 text-center">New Qty</th>
                <th className="px-3 py-2 text-right">Prev Total</th>
                <th className="px-3 py-2 text-right">New Total</th>
                <th className="px-3 py-2 text-right">Impact</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Revised</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="w-20 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rev) => {
                const impact = (Number(rev.new_total ?? 0)) - (Number(rev.prev_total ?? 0));
                return (
                  <tr key={rev.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="max-w-[180px] truncate px-3 py-2 font-medium text-slate-700">
                      {(rev.qs_boq_items as any)?.description ?? "—"}
                      <span className="ml-1 text-[10px] text-slate-400">
                        {(rev.qs_boq_items as any)?.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{fmt(Number(rev.prev_quantity))}</td>
                    <td className="px-3 py-2 text-center font-medium text-slate-700">{fmt(Number(rev.new_quantity))}</td>
                    <td className="px-3 py-2 text-right text-slate-500">${fmt(Number(rev.prev_total))}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">${fmt(Number(rev.new_total))}</td>
                    <td className={cn(
                      "px-3 py-2 text-right font-semibold",
                      impact >= 0 ? "text-emerald-600" : "text-red-600",
                    )}>
                      {impact >= 0 ? "+" : ""}${fmt(impact)}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-slate-500">{rev.reason ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-400">{rev.revised_at.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-center">
                      {rev.approved_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          <Clock className="h-3 w-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!rev.approved_at && can("boq", "approve") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => void handleApprove(rev.id)}
                        >
                          Approve
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
