"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  getAdvanceRecoveryBalance,
  getAdvanceRecoveryLedger,
} from "@/lib/qs-service";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props { projectId: string; projectName?: string }

// Unlike retention, advance recovery has no release/approval workflow — entries
// are posted automatically when an IPC is certified (see updateClaimStatus in
// qs-service.ts), so this is a read-only register, not a form + ledger.
export function AdvanceRecoveryRegister({ projectId }: Props) {
  const [ledger, setLedger] = useState<Awaited<ReturnType<typeof getAdvanceRecoveryLedger>>>([]);
  const [balance, setBalance] = useState({ given: 0, recovered: 0, balance: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, b] = await Promise.all([
        getAdvanceRecoveryLedger(projectId),
        getAdvanceRecoveryBalance(projectId),
      ]);
      setLedger(l);
      setBalance(b);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load advance recovery ledger"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Advance Given</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800">${fmt(balance.given)}</p>
          <p className="mt-1 text-xs text-slate-400">Contract value × advance %</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Recovered to Date</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">${fmt(balance.recovered)}</p>
          <p className="mt-1 text-xs text-slate-400">Deducted from certified IPCs</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-red-400">Outstanding Balance</p>
          <p className="mt-1 text-2xl font-semibold text-red-700">${fmt(balance.balance)}</p>
          <p className="mt-1 text-xs text-red-400">Still to be recovered</p>
        </div>
      </div>

      <p className="text-sm text-slate-500">{ledger.length} recovery entr{ledger.length !== 1 ? "ies" : "y"}</p>

      {/* Ledger table */}
      {ledger.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <Wallet className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No advance recovery entries yet. Entries appear automatically when an IPC with a recovery amount is certified.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">IPC Ref</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 text-slate-500">{entry.created_at.slice(0, 10)}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">
                    {entry.claim_number != null ? `IPC #${entry.claim_number}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{entry.notes ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold text-red-600">-${fmt(entry.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={3} className="px-3 py-3 font-bold text-slate-700">Outstanding Balance</td>
                <td className="px-3 py-3 text-right font-bold text-red-600">${fmt(balance.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
