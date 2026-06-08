"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Shield, Clock, DollarSign, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function EntitlementsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [contracts, setContracts] = useState<{id:string,contract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    contract_id: "", entitlement_no: "", title: "", description: "",
    category: "both", contract_clause: "", trigger_event: "",
    estimated_time_days: "0", estimated_cost: "0",
  });

  useEffect(() => {
    supabase.from("contract_register").select("id,contract_no").then(({ data }) => {
      if (data) setContracts(data);
    });
    supabase.from("entitlement_register").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data);
      setLoading(false);
    });
  }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("entitlement_register").insert({
      contract_id: form.contract_id,
      entitlement_no: form.entitlement_no,
      title: form.title,
      description: form.description,
      category: form.category,
      contract_clause: form.contract_clause || null,
      trigger_event: form.trigger_event || null,
      estimated_time_days: parseInt(form.estimated_time_days) || 0,
      estimated_cost: parseFloat(form.estimated_cost) || 0,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Entitlement recorded");
    setShowForm(false);
    setForm({ contract_id: "", entitlement_no: "", title: "", description: "", category: "both", contract_clause: "", trigger_event: "", estimated_time_days: "0", estimated_cost: "0" });
    supabase.from("entitlement_register").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data);
    });
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entitlement Register</h1>
          <p className="text-sm text-muted-foreground">Track time and cost entitlements</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Entitlement
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Contract *</label>
                <select value={form.contract_id} onChange={(e) => setForm({ ...form, contract_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select contract...</option>
                  {contracts.map((c) => (<option key={c.id} value={c.id}>{c.contract_no}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Entitlement No *</label>
                <input value={form.entitlement_no} onChange={(e) => setForm({ ...form, entitlement_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="time">Time Only</option>
                  <option value="cost">Cost Only</option>
                  <option value="both">Time & Cost</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Contract Clause</label>
                <input value={form.contract_clause} onChange={(e) => setForm({ ...form, contract_clause: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description *</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Trigger Event</label>
                <input value={form.trigger_event} onChange={(e) => setForm({ ...form, trigger_event: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Est. Time (days)</label>
                <input type="number" value={form.estimated_time_days} onChange={(e) => setForm({ ...form, estimated_time_days: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Est. Cost ($)</label>
                <input type="number" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.contract_id || !form.entitlement_no.trim() || !form.title.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">No entitlements recorded</div>
      ) : (
        <div className="space-y-2">
          {items.map((ent) => (
            <Card key={ent.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <Link href={`/dashboard/contracts/entitlements/${ent.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    ent.status === "approved" ? "bg-emerald-50 text-emerald-600" :
                    ent.status === "rejected" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                  )}><Shield className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{ent.entitlement_no} — {ent.title}</p>
                    <p className="text-xs text-muted-foreground">{ent.category} · Clause {ent.contract_clause || "—"} · {ent.status}</p>
                  </div>
                  <div className="text-right text-xs space-y-0.5">
                    {ent.estimated_time_days > 0 && <p className="flex items-center gap-1"><Clock className="h-3 w-3" /> {ent.estimated_time_days}d</p>}
                    {ent.estimated_cost > 0 && <p className="font-semibold">${Number(ent.estimated_cost).toLocaleString()}</p>}
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </Link>
                <button onClick={async () => {
                  if (!confirm("Delete this entitlement?")) return;
                  setDeletingId(ent.id);
                  const { error } = await supabase.from("entitlement_register").delete().eq("id", ent.id);
                  if (error) { toast.error(error.message); setDeletingId(null); return; }
                  toast.success("Entitlement deleted");
                  setItems(items.filter((i: any) => i.id !== ent.id));
                  setDeletingId(null);
                }} className="text-muted-foreground hover:text-red-600" disabled={deletingId === ent.id}>
                  {deletingId === ent.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
