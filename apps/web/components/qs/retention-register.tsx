"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Printer, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type QsRetentionEntry,
  type RetentionTrigger,
  approveRetentionRelease,
  createRetentionRelease,
  getRetentionBalance,
  getRetentionLedger,
} from "@/lib/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { printRetentionStatement } from "@/lib/print-service";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TRIGGERS: { value: RetentionTrigger; label: string }[] = [
  { value: "practical_completion", label: "Practical Completion" },
  { value: "dlp_completion",       label: "DLP Completion"       },
  { value: "other",                label: "Other"                },
];

const BLANK = { amount: "", release_trigger: "practical_completion" as RetentionTrigger, expected_release_date: "", notes: "" };

interface Props { projectId: string; projectName?: string }

export function RetentionRegister({ projectId, projectName = projectId }: Props) {
  const { can } = useQsPermissions();

  const [ledger, setLedger]   = useState<QsRetentionEntry[]>([]);
  const [balance, setBalance] = useState({ deducted: 0, released: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState(BLANK);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, b] = await Promise.all([
        getRetentionLedger(projectId),
        getRetentionBalance(projectId),
      ]);
      setLedger(l);
      setBalance(b);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load retention ledger"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function handleRelease() {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Amount is required."); return; }
    if (amount > balance.balance) { toast.error("Release amount exceeds retention balance."); return; }
    setSaving(true);
    try {
      const entry = await createRetentionRelease({
        project_id:      projectId,
        amount,
        release_trigger: form.release_trigger,
        expected_release_date: form.expected_release_date || null,
        notes:           form.notes || null,
      });
      setLedger((p) => [entry, ...p]);
      setForm(BLANK);
      setShowForm(false);
      toast.success("Retention release submitted for approval");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to submit retention release"); }
    finally { setSaving(false); }
  }

  async function handleApprove(id: string) {
    try {
      await approveRetentionRelease(id);
      await load();
      toast.success("Retention release approved");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to approve retention release"); }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Deducted</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800">${fmt(balance.deducted)}</p>
          <p className="mt-1 text-xs text-slate-400">From certified IPCs</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Released</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">${fmt(balance.released)}</p>
          <p className="mt-1 text-xs text-slate-400">Practical completion + DLP</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-red-400">Outstanding Balance</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">${fmt(balance.balance)}</p>
          <p className="mt-1 text-xs text-red-400">Held, not yet released</p>
        </div>
      </div>

      {/* Record release */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{ledger.length} ledger entr{ledger.length !== 1 ? "ies" : "y"}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => printRetentionStatement(ledger, balance, projectName)} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" /> Print Statement
          </Button>
          {can("retention", "submit") && (
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              disabled={balance.balance <= 0}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Record Release
            </Button>
          )}
        </div>
      </div>

      {/* Release form slide-in */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold">Record Retention Release</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Outstanding balance: <span className="font-bold">${fmt(balance.balance)}</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Release Amount *</label>
                <input type="number" min="0" step="any"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Release Trigger</label>
                <div className="flex gap-2">
                  {TRIGGERS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setForm((p) => ({ ...p, release_trigger: t.value }))}
                      className={cn(
                        "flex-1 rounded-lg border py-2 text-xs font-medium transition-colors",
                        form.release_trigger === t.value
                          ? "border-primary bg-primary text-white"
                          : "border-slate-200 text-slate-500 hover:border-slate-400",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Expected Release Date</label>
                <input type="date"
                  value={form.expected_release_date}
                  onChange={(e) => setForm((p) => ({ ...p, expected_release_date: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Notes</label>
                <textarea rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Reference certificate number, agreement details…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-200 px-6 py-4">
              <Button onClick={handleRelease} disabled={saving || !form.amount} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Record Release
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger table */}
      {ledger.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <Shield className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No retention entries yet. Deductions appear automatically when IPCs are certified.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-center">Type</th>
                <th className="px-3 py-2 text-left">IPC Ref</th>
                <th className="px-3 py-2 text-left">Trigger / Notes</th>
                <th className="px-3 py-2 text-center">Approval</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-500">{entry.created_at.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize",
                      entry.transaction_type === "deduction"
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700",
                    )}>
                      {entry.transaction_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">
                    {(entry.qs_progress_claims as { claim_number?: number } | null | undefined)?.claim_number
                      ? `IPC #${(entry.qs_progress_claims as { claim_number?: number }).claim_number}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {entry.release_trigger
                      ? TRIGGERS.find((t) => t.value === entry.release_trigger)?.label
                      : entry.notes ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {entry.transaction_type === "release" ? (
                      entry.approval_status === "pending" ? (
                        can("retention", "approve") ? (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void handleApprove(entry.id)}>
                            Approve
                          </Button>
                        ) : (
                          <span className="text-[10px] text-slate-400">Pending approval</span>
                        )
                      ) : (
                        <span className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                          entry.approval_status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700",
                        )}>
                          {entry.approval_status ?? "approved"}
                        </span>
                      )
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className={cn(
                    "px-3 py-2 text-right font-semibold",
                    entry.transaction_type === "deduction" ? "text-red-600" : "text-emerald-600",
                  )}>
                    {entry.transaction_type === "deduction" ? "-" : "+"}${fmt(Number(entry.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={5} className="px-3 py-3 font-bold text-slate-700">Outstanding Balance</td>
                <td className={cn("px-3 py-3 text-right font-bold", balance.balance > 0 ? "text-red-600" : "text-emerald-600")}>
                  ${fmt(balance.balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
