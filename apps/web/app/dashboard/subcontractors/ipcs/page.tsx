"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, DollarSign, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SubIpc {
  id: string;
  subcontract_id: string;
  ipc_no: string;
  period_start: string;
  period_end: string;
  claimed_amount: number;
  certified_amount: number;
  retention_deducted: number;
  advance_recovery_deducted: number;
  back_charges_deducted: number;
  net_payable: number;
  status: string;
}

export default function SubIpcListPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<SubIpc[]>([]);
  const [subcontracts, setSubcontracts] = useState<{id:string,subcontract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    subcontract_id: "", ipc_no: "", period_start: "", period_end: "",
    claimed_amount: "0", certified_amount: "0", retention_deducted: "0",
    advance_recovery_deducted: "0", back_charges_deducted: "0",
  });

  useEffect(() => {
    supabase.from("subcontracts").select("id,subcontract_no").then(({ data }) => {
      if (data) setSubcontracts(data);
    });
    supabase.from("subcontract_ipcs").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as SubIpc[]);
      setLoading(false);
    });
  }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("subcontract_ipcs").insert({
      subcontract_id: form.subcontract_id,
      ipc_no: form.ipc_no,
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
    setForm({ subcontract_id: "", ipc_no: "", period_start: "", period_end: "", claimed_amount: "0", certified_amount: "0", retention_deducted: "0", advance_recovery_deducted: "0", back_charges_deducted: "0" });
    supabase.from("subcontract_ipcs").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as SubIpc[]);
    });
    setSaving(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subcontractor IPCs</h1>
          <p className="text-sm text-muted-foreground">Interim payment certificates for subcontractors</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Sub-IPC
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Subcontract *</label>
                <select value={form.subcontract_id} onChange={(e) => setForm({ ...form, subcontract_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                  <option value="">Select subcontract...</option>
                  {subcontracts.map((s) => (<option key={s.id} value={s.id}>{s.subcontract_no}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">IPC No *</label>
                <input value={form.ipc_no} onChange={(e) => setForm({ ...form, ipc_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Status</label>
                <input value="draft" disabled className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Period Start</label>
                <input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Period End</label>
                <input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Claimed Amount</label>
                <input type="number" value={form.claimed_amount} onChange={(e) => setForm({ ...form, claimed_amount: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Certified Amount</label>
                <input type="number" value={form.certified_amount} onChange={(e) => setForm({ ...form, certified_amount: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Retention Deducted</label>
                <input type="number" value={form.retention_deducted} onChange={(e) => setForm({ ...form, retention_deducted: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Back Charges</label>
                <input type="number" value={form.back_charges_deducted} onChange={(e) => setForm({ ...form, back_charges_deducted: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.subcontract_id || !form.ipc_no.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No sub-IPCs yet
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((ipc) => (
            <Card key={ipc.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                  ipc.status === "certified" ? "bg-emerald-50 text-emerald-600" :
                  ipc.status === "paid" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                )}>{ipc.status.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{ipc.ipc_no}</p>
                  <p className="text-xs text-muted-foreground">{ipc.period_start} → {ipc.period_end}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">${Number(ipc.net_payable).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Claimed: ${Number(ipc.claimed_amount).toLocaleString()}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
