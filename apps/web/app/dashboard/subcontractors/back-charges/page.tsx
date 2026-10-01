"use client";

import { useCallback, useEffect, useState } from "react";
import { insertSubcontractBackCharge, listSubcontractBackCharges, listSubcontracts } from "@/lib/qs/qs-queries";
import { Loader2, Plus, AlertTriangle, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";

interface BackCharge {
  id: string;
  subcontract_id: string;
  charge_no: string;
  description: string;
  amount: number;
  category: string;
  status: string;
  raised_date: string;
  ncr_id?: string | null;
  ncrs?: { ncr_number?: string } | null;
}

export default function BackChargesPage() {
  const { selectedProjectId } = useProject();
  const [items, setItems] = useState<BackCharge[]>([]);
  const [subcontracts, setSubcontracts] = useState<{id:string,subcontract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    subcontract_id: "", charge_no: "", description: "",
    amount: "0", category: "defect_rectification",
  });

  const itemsQuery = useCallback(() => {
    let q = listSubcontractBackCharges();
    if (selectedProjectId) q = q.eq("subcontracts.project_id", selectedProjectId);
    return q;
  }, [selectedProjectId]);

  useEffect(() => {
    let sq = listSubcontracts();
    if (selectedProjectId) sq = sq.eq("project_id", selectedProjectId);
    sq.then(({ data }) => {
      if (data) setSubcontracts(data);
    });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as BackCharge[]);
      setLoading(false);
    });
  }, [selectedProjectId, itemsQuery]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await insertSubcontractBackCharge({
      subcontract_id: form.subcontract_id,
      charge_no: form.charge_no,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      category: form.category,
      raised_date: new Date().toISOString().split("T")[0],
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Back charge created");
    setShowForm(false);
    setForm({ subcontract_id: "", charge_no: "", description: "", amount: "0", category: "defect_rectification" });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as BackCharge[]);
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
          <h1 className="text-2xl font-semibold tracking-tight">Back Charges</h1>
          <p className="text-sm text-muted-foreground">Deductions against subcontractor payments</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Back Charge
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total Charges</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">${items.reduce((s, i) => s + Number(i.amount), 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Amount</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.filter((i) => i.status === "disputed").length}</p>
              <p className="text-xs text-muted-foreground">Disputed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Subcontract *</label>
                <select value={form.subcontract_id} onChange={(e) => setForm({ ...form, subcontract_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select subcontract...</option>
                  {subcontracts.map((s) => (<option key={s.id} value={s.id}>{s.subcontract_no}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Charge No *</label>
                <input value={form.charge_no} onChange={(e) => setForm({ ...form, charge_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="defect_rectification">Defect Rectification</option>
                  <option value="rework">Rework</option>
                  <option value="damage">Damage</option>
                  <option value="extra_service">Extra Service</option>
                  <option value="penalty">Penalty</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Amount</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.subcontract_id || !form.charge_no.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No back charges recorded
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((bc) => (
            <Card key={bc.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                  bc.status === "deducted" ? "bg-red-50 text-red-600" :
                  bc.status === "accepted" ? "bg-emerald-50 text-emerald-600" :
                  bc.status === "disputed" ? "bg-amber-50 text-amber-600" : "bg-gray-50 text-gray-600"
                )}>{bc.status.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{bc.charge_no}</p>
                    {bc.ncrs?.ncr_number && (
                      <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                        From {bc.ncrs.ncr_number}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{bc.description} · {bc.category.replace(/_/g, " ")}</p>
                </div>
                <p className="text-sm font-semibold text-red-600">-${Number(bc.amount).toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
