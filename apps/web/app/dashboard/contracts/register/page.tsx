"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, FileSignature, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";

export default function ContractRegisterPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [items, setItems] = useState<any[]>([]);
  const [projects, setProjects] = useState<{id:string,name:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    project_id: "", contract_no: "", contract_type: "head_contract",
    title: "", party_name: "", contract_value: "0", currency: "USD",
    start_date: "", end_date: "",
  });

  const itemsQuery = useCallback(() => {
    let q = supabase.from("contract_register").select("*").order("created_at", { ascending: false });
    if (selectedProjectId) q = q.eq("project_id", selectedProjectId);
    return q;
  }, [supabase, selectedProjectId]);

  useEffect(() => {
    supabase.from("projects").select("id,name:project_name").then(({ data }) => {
      if (data) setProjects(data);
    });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data);
      setLoading(false);
    });
  }, [supabase, itemsQuery]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("contract_register").insert({
      project_id: form.project_id,
      contract_no: form.contract_no,
      contract_type: form.contract_type,
      title: form.title,
      party_name: form.party_name,
      contract_value: parseFloat(form.contract_value) || 0,
      currency: form.currency,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Contract created");
    setShowForm(false);
    setForm({ project_id: "", contract_no: "", contract_type: "head_contract", title: "", party_name: "", contract_value: "0", currency: "USD", start_date: "", end_date: "" });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data);
    });
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contract Register</h1>
          <p className="text-sm text-muted-foreground">Master register of all contracts</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Contract
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Project *</label>
                <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select project...</option>
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Contract No *</label>
                <input value={form.contract_no} onChange={(e) => setForm({ ...form, contract_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="head_contract">Head Contract</option>
                  <option value="subcontract">Subcontract</option>
                  <option value="consultant">Consultant</option>
                  <option value="supplier">Supplier</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Party Name *</label>
                <input value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Value</label>
                <input type="number" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Currency</label>
                <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Start Date</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">End Date</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.project_id || !form.contract_no.trim() || !form.title.trim() || !form.party_name.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">No contracts registered</div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <Link href={`/dashboard/contracts/register/${c.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                    c.status === "active" ? "bg-emerald-50 text-emerald-600" :
                    c.status === "completed" ? "bg-gray-50 text-gray-600" : "bg-amber-50 text-amber-600"
                  )}>{c.status.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{c.contract_no} — {c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.party_name} · {c.contract_type.replace(/_/g, " ")}</p>
                  </div>
                  <p className="text-sm font-semibold">{c.currency} {Number(c.contract_value).toLocaleString()}</p>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </Link>
                <button onClick={async () => {
                  if (!confirm("Delete this contract?")) return;
                  setDeletingId(c.id);
                  const { error } = await supabase.from("contract_register").delete().eq("id", c.id);
                  if (error) { toast.error(error.message); setDeletingId(null); return; }
                  toast.success("Contract deleted");
                  setItems(items.filter((i: any) => i.id !== c.id));
                  setDeletingId(null);
                }} className="text-muted-foreground hover:text-red-600" disabled={deletingId === c.id}>
                  {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
