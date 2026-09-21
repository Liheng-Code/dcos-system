"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, ScrollText, DollarSign, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";

export default function EmployerInstructionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [items, setItems] = useState<any[]>([]);
  const [contracts, setContracts] = useState<{id:string,contract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    contract_id: "", instruction_no: "", title: "", description: "",
    type: "direction", instruction_date: new Date().toISOString().split("T")[0],
    time_extension_days: "0", cost_impact: "0",
  });

  const itemsQuery = useCallback(() => {
    let q = supabase.from("contract_employer_instructions").select("*, contract_register!inner(project_id)").order("instruction_date", { ascending: false });
    if (selectedProjectId) q = q.eq("contract_register.project_id", selectedProjectId);
    return q;
  }, [supabase, selectedProjectId]);

  useEffect(() => {
    let cq = supabase.from("contract_register").select("id,contract_no");
    if (selectedProjectId) cq = cq.eq("project_id", selectedProjectId);
    cq.then(({ data }) => {
      if (data) setContracts(data);
    });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data);
      setLoading(false);
    });
  }, [supabase, selectedProjectId, itemsQuery]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("contract_employer_instructions").insert({
      contract_id: form.contract_id,
      instruction_no: form.instruction_no,
      title: form.title,
      description: form.description,
      type: form.type,
      instruction_date: form.instruction_date,
      time_extension_days: parseInt(form.time_extension_days) || 0,
      cost_impact: parseFloat(form.cost_impact) || 0,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Instruction recorded");
    setShowForm(false);
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
          <h1 className="text-2xl font-semibold tracking-tight">Employer's Instructions</h1>
          <p className="text-sm text-muted-foreground">Client directions, variations, and clarifications</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Instruction
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
                <label className="text-xs font-medium">Instruction No *</label>
                <input value={form.instruction_no} onChange={(e) => setForm({ ...form, instruction_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="direction">Direction</option>
                  <option value="variation">Variation</option>
                  <option value="clarification">Clarification</option>
                  <option value="approval">Approval</option>
                  <option value="rejection">Rejection</option>
                  <option value="information">For Information</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Instruction Date</label>
                <input type="date" value={form.instruction_date} onChange={(e) => setForm({ ...form, instruction_date: e.target.value })}
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
                <label className="text-xs font-medium">Time Extension (days)</label>
                <input type="number" value={form.time_extension_days} onChange={(e) => setForm({ ...form, time_extension_days: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Cost Impact ($)</label>
                <input type="number" value={form.cost_impact} onChange={(e) => setForm({ ...form, cost_impact: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.contract_id || !form.instruction_no.trim() || !form.title.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">No instructions recorded</div>
      ) : (
        <div className="space-y-2">
          {items.map((ei) => (
            <Card key={ei.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <Link href={`/dashboard/contracts/employer-instructions/${ei.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    ei.status === "complied" ? "bg-emerald-50 text-emerald-600" :
                    ei.status === "disputed" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                  )}><ScrollText className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{ei.instruction_no} — {ei.title}</p>
                    <p className="text-xs text-muted-foreground">{ei.type} · {ei.instruction_date} · Status: {ei.status}</p>
                  </div>
                  <div className="text-right text-xs">
                    {ei.time_extension_days > 0 && <p>+{ei.time_extension_days}d</p>}
                    {ei.cost_impact > 0 && <p className="font-semibold">${Number(ei.cost_impact).toLocaleString()}</p>}
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </Link>
                <button onClick={async () => {
                  if (!confirm("Delete this instruction?")) return;
                  setDeletingId(ei.id);
                  const { error } = await supabase.from("contract_employer_instructions").delete().eq("id", ei.id);
                  if (error) { toast.error(error.message); setDeletingId(null); return; }
                  toast.success("Instruction deleted");
                  setItems(items.filter((i: any) => i.id !== ei.id));
                  setDeletingId(null);
                }} className="text-muted-foreground hover:text-red-600" disabled={deletingId === ei.id}>
                  {deletingId === ei.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
