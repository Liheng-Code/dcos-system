"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, CreditCard, DollarSign, FileText, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProgressClaimList } from "@/components/qs/progress-claim-list";
import { RetentionRegister } from "@/components/qs/retention-register";
import { getQsPaymentVouchers, type QsPaymentVoucher } from "@/lib/qs-service";

const SUB_TABS = [
  { id: "claims",   label: "Progress Claims", icon: FileText },
  { id: "subipcs",  label: "Sub-IPCs",         icon: DollarSign },
  { id: "retention", label: "Retention",        icon: Shield },
  { id: "payments", label: "Payments",          icon: CreditCard },
] as const;

type SubTab = (typeof SUB_TABS)[number]["id"];

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CLS: Record<QsPaymentVoucher["status"], string> = {
  draft:     "bg-slate-100 text-slate-600",
  submitted: "bg-blue-100 text-blue-700",
  approved:  "bg-amber-100 text-amber-700",
  paid:      "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

interface SubIpc {
  id: string; subcontract_id: string; ipc_no: string;
  period_start: string; period_end: string;
  claimed_amount: number; certified_amount: number;
  retention_deducted: number; net_payable: number; status: string;
}

interface Props {
  projectId: string;
  projectName?: string;
}

function SubIpcList({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<SubIpc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("subcontract_ipcs")
      .select("id, subcontract_id, ipc_no, period_start, period_end, claimed_amount, certified_amount, retention_deducted, net_payable, status")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setItems(data as SubIpc[]);
        setLoading(false);
      });
  }, [supabase]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
        <DollarSign className="mb-2 h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-400">No subcontractor IPCs found</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
            <th className="px-3 py-2 text-left">IPC No.</th>
            <th className="px-3 py-2 text-left">Period</th>
            <th className="px-3 py-2 text-right">Claimed</th>
            <th className="px-3 py-2 text-right">Certified</th>
            <th className="px-3 py-2 text-right">Retention</th>
            <th className="px-3 py-2 text-right">Net Payable</th>
            <th className="px-3 py-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((ipc) => (
            <tr key={ipc.id} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-3 py-2 font-mono text-slate-700">{ipc.ipc_no}</td>
              <td className="px-3 py-2 text-slate-500">{ipc.period_start} → {ipc.period_end}</td>
              <td className="px-3 py-2 text-right text-slate-600">${fmt(ipc.claimed_amount)}</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700">${fmt(ipc.certified_amount)}</td>
              <td className="px-3 py-2 text-right text-red-600">${fmt(ipc.retention_deducted)}</td>
              <td className="px-3 py-2 text-right font-semibold text-emerald-700">${fmt(ipc.net_payable)}</td>
              <td className="px-3 py-2 text-center">
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                  ipc.status === "certified" ? "bg-emerald-100 text-emerald-700" :
                  ipc.status === "paid" ? "bg-blue-100 text-blue-700" :
                  "bg-amber-100 text-amber-700"
                )}>{ipc.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentVoucherList({ projectId }: { projectId: string }) {
  const [vouchers, setVouchers] = useState<QsPaymentVoucher[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQsPaymentVouchers(projectId);
      setVouchers(data);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const totalPaid = vouchers.filter((v) => v.status === "paid").reduce((s, v) => s + v.amount, 0);
  const totalAll  = vouchers.reduce((s, v) => s + v.amount, 0);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Vouchers</p>
          <p className="mt-1 text-2xl font-semibold text-slate-800">{vouchers.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-emerald-500">Total Paid</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">${fmt(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Total Certified</p>
          <p className="mt-1 text-2xl font-semibold text-slate-700">${fmt(totalAll)}</p>
        </div>
      </div>

      {vouchers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
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
                  <td className="px-3 py-2 text-right font-semibold text-emerald-700">${fmt(v.amount)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_CLS[v.status])}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">{v.paid_at ? v.paid_at.slice(0, 10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MergedClaimsView({ projectId, projectName }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("claims");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              subTab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-800",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "claims"    && <ProgressClaimList projectId={projectId} projectName={projectName} />}
      {subTab === "subipcs"   && <SubIpcList projectId={projectId} />}
      {subTab === "retention" && <RetentionRegister projectId={projectId} projectName={projectName} />}
      {subTab === "payments"  && <PaymentVoucherList projectId={projectId} />}
    </div>
  );
}
