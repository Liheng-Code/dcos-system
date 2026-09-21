"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CreditCard, DollarSign, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressClaimList } from "@/components/qs/progress-claim-list";
import { RetentionRegister } from "@/components/qs/retention-register";
import { AdvanceRecoveryRegister } from "@/components/qs/advance-recovery-register";
import { getQsPaymentVouchers, type QsPaymentVoucher } from "@/lib/qs-service";

const SUB_TAB_IDS = ["claims", "subipcs", "retention", "advance", "payments"] as const;
type SubTab = (typeof SUB_TAB_IDS)[number];

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
  retention_deducted: number; advance_recovery_deducted: number; back_charges_deducted: number;
  net_payable: number; status: string;
  subcontracts: { subcontract_no: string } | null;
}

interface Props {
  projectId: string;
  projectName?: string;
}

const SUB_IPC_COLUMNS =
  "id, subcontract_id, ipc_no, period_start, period_end, claimed_amount, certified_amount, retention_deducted, advance_recovery_deducted, back_charges_deducted, net_payable, status, subcontracts!inner(project_id, subcontract_no)";

const EMPTY_SUB_IPC_FORM = {
  subcontract_id: "", ipc_no: "", period_start: "", period_end: "",
  claimed_amount: "0", certified_amount: "0", retention_deducted: "0",
  advance_recovery_deducted: "0", back_charges_deducted: "0",
};

const SUB_IPC_AMOUNT_FIELDS: { key: keyof typeof EMPTY_SUB_IPC_FORM; label: string }[] = [
  { key: "claimed_amount", label: "Claimed Amount" },
  { key: "certified_amount", label: "Certified Amount" },
  { key: "retention_deducted", label: "Retention Deducted" },
  { key: "advance_recovery_deducted", label: "Advance Recovery" },
  { key: "back_charges_deducted", label: "Back Charges" },
];

function SubIpcList({ projectId }: { projectId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<SubIpc[]>([]);
  const [subcontracts, setSubcontracts] = useState<{ id: string; subcontract_no: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_SUB_IPC_FORM);
  const setField = (key: keyof typeof EMPTY_SUB_IPC_FORM, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const itemsQuery = useCallback(
    () =>
      supabase
        .from("subcontract_ipcs")
        .select(SUB_IPC_COLUMNS)
        .eq("subcontracts.project_id", projectId)
        .order("created_at", { ascending: false }),
    [supabase, projectId],
  );

  useEffect(() => {
    supabase
      .from("subcontracts")
      .select("id,subcontract_no")
      .eq("project_id", projectId)
      .then(({ data }) => {
        if (data) setSubcontracts(data);
      });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as unknown as SubIpc[]);
      setLoading(false);
    });
  }, [supabase, projectId, itemsQuery]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("subcontract_ipcs").insert({
      subcontract_id: form.subcontract_id,
      ipc_no: form.ipc_no.trim(),
      period_start: form.period_start,
      period_end: form.period_end,
      claimed_amount: parseFloat(form.claimed_amount) || 0,
      certified_amount: parseFloat(form.certified_amount) || 0,
      retention_deducted: parseFloat(form.retention_deducted) || 0,
      advance_recovery_deducted: parseFloat(form.advance_recovery_deducted) || 0,
      back_charges_deducted: parseFloat(form.back_charges_deducted) || 0,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Sub-IPC created");
    setShowForm(false);
    setForm(EMPTY_SUB_IPC_FORM);
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as unknown as SubIpc[]);
    });
    setSaving(false);
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} sub-IPC{items.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" /> New Sub-IPC
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Subcontract *</label>
                <select value={form.subcontract_id} onChange={(e) => setField("subcontract_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select subcontract...</option>
                  {subcontracts.map((s) => (<option key={s.id} value={s.id}>{s.subcontract_no}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">IPC No *</label>
                <input value={form.ipc_no} onChange={(e) => setField("ipc_no", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Status</label>
                <input value="draft" disabled className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Period Start *</label>
                <input type="date" value={form.period_start} onChange={(e) => setField("period_start", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Period End *</label>
                <input type="date" value={form.period_end} onChange={(e) => setField("period_end", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              {SUB_IPC_AMOUNT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-xs font-medium">{f.label}</label>
                  <input type="number" value={form[f.key]} onChange={(e) => setField(f.key, e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Net payable is calculated: certified − retention − advance recovery − back charges.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={saving || !form.subcontract_id || !form.ipc_no.trim() || !form.period_start || !form.period_end}
              >
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <DollarSign className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No subcontractor IPCs found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2 text-left">IPC No.</th>
                <th className="px-3 py-2 text-left">Subcontract</th>
                <th className="px-3 py-2 text-left">Period</th>
                <th className="px-3 py-2 text-right">Claimed</th>
                <th className="px-3 py-2 text-right">Certified</th>
                <th className="px-3 py-2 text-right">Retention</th>
                <th className="px-3 py-2 text-right">Advance</th>
                <th className="px-3 py-2 text-right">Back Charges</th>
                <th className="px-3 py-2 text-right">Net Payable</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ipc) => (
                <tr key={ipc.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 font-mono text-slate-700">{ipc.ipc_no}</td>
                  <td className="px-3 py-2 text-slate-500">{ipc.subcontracts?.subcontract_no ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{ipc.period_start} → {ipc.period_end}</td>
                  <td className="px-3 py-2 text-right text-slate-600">${fmt(ipc.claimed_amount)}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">${fmt(ipc.certified_amount)}</td>
                  <td className="px-3 py-2 text-right text-red-600">${fmt(ipc.retention_deducted)}</td>
                  <td className="px-3 py-2 text-right text-red-600">${fmt(ipc.advance_recovery_deducted)}</td>
                  <td className="px-3 py-2 text-right text-red-600">${fmt(ipc.back_charges_deducted)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-700">${fmt(ipc.net_payable)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                      ipc.status === "certified" ? "bg-emerald-100 text-emerald-700" :
                      ipc.status === "paid" ? "bg-blue-100 text-blue-700" :
                      ipc.status === "disputed" ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                    )}>{ipc.status}</span>
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
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as SubTab | null;
  const subTab: SubTab = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "claims";

  return (
    <div className="space-y-4">
      {subTab === "claims"    && <ProgressClaimList projectId={projectId} projectName={projectName} />}
      {subTab === "subipcs"   && <SubIpcList projectId={projectId} />}
      {subTab === "retention" && <RetentionRegister projectId={projectId} projectName={projectName} />}
      {subTab === "advance"   && <AdvanceRecoveryRegister projectId={projectId} projectName={projectName} />}
      {subTab === "payments"  && <PaymentVoucherList projectId={projectId} />}
    </div>
  );
}
