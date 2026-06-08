"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, FileText, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Variation {
  id: string; subcontract_id: string;
  variation_no: string; description: string;
  type: string; amount: number;
  status: string; approved_date: string | null;
  schedule_impact_days: number | null;
}

export default function VariationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Variation[]>([]);
  const [subcontracts, setSubcontracts] = useState<{id:string,subcontract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    subcontract_id: "", variation_no: "", description: "",
    type: "addition", amount: "0", schedule_impact_days: "0",
  });

  useEffect(() => {
    supabase.from("subcontracts").select("id,subcontract_no").then(({ data }) => {
      if (data) setSubcontracts(data);
    });
    supabase.from("subcontract_variations").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as Variation[]);
      setLoading(false);
    });
  }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("subcontract_variations").insert({
      subcontract_id: form.subcontract_id,
      variation_no: form.variation_no,
      description: form.description,
      type: form.type,
      amount: parseFloat(form.amount) || 0,
      schedule_impact_days: parseInt(form.schedule_impact_days) || 0,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Variation created");
    setShowForm(false);
    setForm({ subcontract_id: "", variation_no: "", description: "", type: "addition", amount: "0", schedule_impact_days: "0" });
    supabase.from("subcontract_variations").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as Variation[]);
    });
    setSaving(false);
  }

  async function handleStatusUpdate(id: string, status: string) {
    const update: Record<string, string> = { status };
    if (status === "approved") update.approved_date = new Date().toISOString().split("T")[0];
    const { error } = await supabase.from("subcontract_variations").update(update).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Variation ${status}`);
    supabase.from("subcontract_variations").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as Variation[]);
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const netChange = items
    .filter(v => v.status === "approved" || v.status === "implemented")
    .reduce((s, v) => s + (v.type === "addition" ? Number(v.amount) : -Number(v.amount)), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subcontract Variations</h1>
          <p className="text-sm text-muted-foreground">Variation orders, additions, deductions, and omissions</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Variation
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              {netChange >= 0 ? <CheckCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <p className={cn("text-2xl font-bold", netChange >= 0 ? "text-emerald-600" : "text-red-600")}>
                {netChange >= 0 ? "+" : ""}{netChange.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Net Change</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.filter(v => v.status !== "approved" && v.status !== "implemented" && v.status !== "rejected").length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 text-gray-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.reduce((s, v) => s + (v.schedule_impact_days || 0), 0)}</p>
              <p className="text-xs text-muted-foreground">Schedule Impact (days)</p>
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
                <select value={form.subcontract_id} onChange={(e) => setForm({...form, subcontract_id: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select subcontract...</option>
                  {subcontracts.map((s) => (<option key={s.id} value={s.id}>{s.subcontract_no}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Variation No *</label>
                <input value={form.variation_no} onChange={(e) => setForm({...form, variation_no: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.type} onChange={(e) => setForm({...form, type: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="addition">Addition</option>
                  <option value="deduction">Deduction</option>
                  <option value="omission">Omission</option>
                  <option value="change_of_method">Change of Method</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Amount</label>
                <input type="number" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Schedule Impact (days)</label>
                <input type="number" value={form.schedule_impact_days} onChange={(e) => setForm({...form, schedule_impact_days: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description *</label>
                <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.subcontract_id || !form.variation_no.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No variations yet
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((v) => (
            <Card key={v.id}>
              <CardContent className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                    v.type === "addition" ? "bg-emerald-50 text-emerald-600" :
                    v.type === "deduction" ? "bg-red-50 text-red-600" :
                    v.type === "omission" ? "bg-amber-50 text-amber-600" :
                    "bg-blue-50 text-blue-600"
                  )}>{v.type === "addition" ? "+" : v.type === "deduction" ? "−" : "△"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{v.variation_no}</p>
                    <p className="text-xs text-muted-foreground truncate">{v.description} · {v.type.replace(/_/g, " ")}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-semibold", v.type === "addition" ? "text-emerald-600" : "text-red-600")}>
                      {v.type === "addition" ? "+" : "−"}{Number(v.amount).toLocaleString()}
                    </p>
                    {v.schedule_impact_days ? <p className="text-xs text-muted-foreground">{v.schedule_impact_days} days</p> : null}
                  </div>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    v.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                    v.status === "implemented" ? "bg-blue-50 text-blue-700" :
                    v.status === "rejected" ? "bg-red-50 text-red-700" :
                    v.status === "submitted" ? "bg-amber-50 text-amber-700" :
                    "bg-gray-50 text-gray-700"
                  )}>{v.status}</span>
                </div>
                <div className="flex gap-1">
                  {v.status === "draft" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(v.id, "submitted")}>Submit</Button>
                  )}
                  {v.status === "submitted" && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => handleStatusUpdate(v.id, "approved")}>Approve</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => handleStatusUpdate(v.id, "rejected")}>Reject</Button>
                    </>
                  )}
                  {v.status === "approved" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(v.id, "implemented")}>Implement</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
