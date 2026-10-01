"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type QsBoqItem,
  type QsContingencyDrawdown,
  approveContingencyDrawdown,
  createContingencyDrawdown,
  getBoqItems,
  getContingencyBalance,
  getContingencyDrawdowns,
} from "@/lib/qs/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CLS = {
  pending:  "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
} as const;

const BLANK = { amount: "", boq_item_id: "", reason: "" };

interface Props { projectId: string }

export function ContingencyRegister({ projectId }: Props) {
  const { can } = useQsPermissions();

  const [balance, setBalance]     = useState({ contingencyBudget: 0, approved: 0, pending: 0, balance: 0 });
  const [drawdowns, setDrawdowns] = useState<QsContingencyDrawdown[]>([]);
  const [boqItems, setBoqItems]   = useState<QsBoqItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(BLANK);
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bal, draws, items] = await Promise.all([
        getContingencyBalance(projectId),
        getContingencyDrawdowns(projectId),
        getBoqItems(projectId),
      ]);
      setBalance(bal);
      setDrawdowns(draws);
      setBoqItems(items.filter((i) => Number(i.contingency_pct) > 0));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Amount is required."); return; }
    if (!form.reason.trim()) { toast.error("Reason is required."); return; }
    setSaving(true);
    try {
      await createContingencyDrawdown({
        project_id:  projectId,
        boq_item_id: form.boq_item_id || null,
        amount,
        reason:      form.reason.trim(),
      });
      setForm(BLANK);
      setShowForm(false);
      await load();
      toast.success("Drawdown request submitted");
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleDecision(id: string, status: "approved" | "rejected") {
    try {
      await approveContingencyDrawdown(id, status);
      await load();
      toast.success(`Drawdown ${status}`);
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const usedPct = balance.contingencyBudget > 0
    ? Math.min((balance.approved / balance.contingencyBudget) * 100, 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Contingency Budget</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800">${fmt(balance.contingencyBudget)}</p>
          <p className="mt-1 text-xs text-slate-400">Sum of item contingencies</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-emerald-500">Approved Drawdowns</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">${fmt(balance.approved)}</p>
          <p className="mt-1 text-xs text-emerald-400">{usedPct.toFixed(1)}% of budget used</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-amber-500">Pending Drawdowns</p>
          <p className="mt-1 text-2xl font-semibold text-amber-700">${fmt(balance.pending)}</p>
          <p className="mt-1 text-xs text-amber-400">Awaiting approval</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-red-400">Remaining Balance</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">${fmt(balance.balance)}</p>
          <p className="mt-1 text-xs text-red-400">Available contingency</p>
        </div>
      </div>

      {/* Usage bar */}
      <div>
        <div className="mb-1 flex justify-between text-[10px] text-slate-400">
          <span>Contingency utilisation</span>
          <span>{usedPct.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn("h-full rounded-full transition-all", usedPct > 80 ? "bg-red-500" : "bg-emerald-500")}
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      {/* Header + action */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{drawdowns.length} drawdown request{drawdowns.length !== 1 ? "s" : ""}</p>
        {can("costs", "can_create") && (
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Request Drawdown
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold">Request Contingency Drawdown</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Available balance: <span className="font-bold">${fmt(balance.balance)}</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Amount *</label>
                <input type="number" min="0" step="any"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">BOQ Item (optional)</label>
                <select
                  value={form.boq_item_id}
                  onChange={(e) => setForm((p) => ({ ...p, boq_item_id: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">— General contingency —</option>
                  {boqItems.map((i) => (
                    <option key={i.id} value={i.id}>{i.description}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Reason *</label>
                <textarea rows={4}
                  value={form.reason}
                  onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Describe why this contingency drawdown is required…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex gap-2 border-t px-6 py-4">
              <Button onClick={handleCreate} disabled={saving || !form.amount || !form.reason} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Submit Request
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Drawdown table */}
      {drawdowns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <Shield className="mb-3 h-9 w-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No drawdown requests yet</p>
          <p className="mt-1 text-xs text-slate-400">Use contingency only when unforeseen costs arise.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">BOQ Item</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {drawdowns.map((d) => (
                <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-500">{d.created_at.slice(0, 10)}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-slate-700">{d.reason}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-slate-400">
                    {(d.qs_boq_items as any)?.description ?? "General"}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-700">${fmt(Number(d.amount))}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_CLS[d.status])}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {d.status === "pending" && can("boq", "approve") && (
                      <div className="flex justify-center gap-1">
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-emerald-700 hover:bg-emerald-50"
                          onClick={() => void handleDecision(d.id, "approved")}>Approve</Button>
                        <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-red-700 hover:bg-red-50"
                          onClick={() => void handleDecision(d.id, "rejected")}>Reject</Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
