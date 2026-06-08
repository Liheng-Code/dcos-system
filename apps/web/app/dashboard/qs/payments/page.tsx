"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CreditCard, Loader2 } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { cn } from "@/lib/utils";
import { type QsPaymentVoucher, getQsPaymentVouchers } from "@/lib/qs-service";
import { toast } from "sonner";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CLS: Record<QsPaymentVoucher["status"], string> = {
  draft:     "bg-slate-100 text-slate-600",
  submitted: "bg-blue-100 text-blue-700",
  approved:  "bg-amber-100 text-amber-700",
  paid:      "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function QsPaymentsPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const { selectedProjectId: projectId } = useProject();
  const [vouchers, setVouchers] = useState<QsPaymentVoucher[]>([]);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  const load = useCallback(async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    try {
      const data = await getQsPaymentVouchers(pid);
      setVouchers(data);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (projectId) void load(projectId); }, [projectId, load]);

  const totalPaid = vouchers.filter((v) => v.status === "paid").reduce((s, v) => s + v.amount, 0);
  const totalAll  = vouchers.reduce((s, v) => s + v.amount, 0);

  if (checking) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <CreditCard className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Payment Vouchers</h1>
            <p className="text-sm text-muted-foreground">Receipt vouchers generated from certified IPCs</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {!projectId ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">Select a project from the top bar.</div>
        ) : loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <div className="space-y-4">
            {/* KPI summary */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Vouchers</p>
                <p className="mt-1 text-2xl font-semibold text-slate-800">{vouchers.length}</p>
                <p className="mt-1 text-xs text-slate-400">All IPC-linked receipts</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-emerald-500">Total Paid</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-700">${fmt(totalPaid)}</p>
                <p className="mt-1 text-xs text-emerald-400">Confirmed payments received</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Certified</p>
                <p className="mt-1 text-2xl font-semibold text-slate-700">${fmt(totalAll)}</p>
                <p className="mt-1 text-xs text-slate-400">Sum of all voucher amounts</p>
              </div>
            </div>

            {/* Voucher table */}
            {vouchers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
                <CreditCard className="mb-3 h-9 w-9 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">No payment vouchers yet</p>
                <p className="mt-1 text-xs text-slate-400">Vouchers are created automatically when an IPC is marked as Paid.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="px-3 py-2 text-left">Voucher No.</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">IPC Ref</th>
                      <th className="px-3 py-2 text-left">Payee</th>
                      <th className="px-3 py-2 text-center">Type</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-left">Paid Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map((v) => (
                      <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-mono text-slate-700">{v.voucher_no}</td>
                        <td className="px-3 py-2 text-slate-500">{v.voucher_date}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {v.claim_number != null ? `IPC #${v.claim_number}` : (v.reference ?? "—")}
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-2 text-slate-600">{v.payee_name}</td>
                        <td className="px-3 py-2 text-center capitalize text-slate-500">{v.type}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">${fmt(v.amount)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_CLS[v.status])}>
                            {v.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {v.paid_at ? v.paid_at.slice(0, 10) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
