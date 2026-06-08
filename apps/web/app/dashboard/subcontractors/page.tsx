"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, FileText, AlertTriangle, DollarSign, Eye } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Subcontract {
  id: string;
  subcontract_no: string;
  scope_of_work: string | null;
  contract_type: string;
  contract_value: number;
  currency: string;
  retention_pct: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  vendor_id: string | null;
}

export default function SubcontractorsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Subcontract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<{id:string,name:string}[]>([]);

  const [form, setForm] = useState({
    project_id: "", subcontract_no: "", scope_of_work: "",
    contract_type: "lump_sum", contract_value: "0", currency: "USD",
    retention_pct: "5.00", start_date: "", end_date: "",
  });

  useEffect(() => {
    supabase.from("projects").select("id,name").then(({ data }) => {
      if (data) setProjects(data);
    });
    supabase.from("subcontracts").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as Subcontract[]);
      setLoading(false);
    });
  }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("subcontracts").insert({
      project_id: form.project_id,
      subcontract_no: form.subcontract_no,
      scope_of_work: form.scope_of_work || null,
      contract_type: form.contract_type,
      contract_value: parseFloat(form.contract_value) || 0,
      currency: form.currency,
      retention_pct: parseFloat(form.retention_pct) || 5,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Subcontract created");
    setShowForm(false);
    setForm({ project_id: "", subcontract_no: "", scope_of_work: "", contract_type: "lump_sum", contract_value: "0", currency: "USD", retention_pct: "5.00", start_date: "", end_date: "" });
    supabase.from("subcontracts").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as Subcontract[]);
    });
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subcontractor Management</h1>
          <p className="text-sm text-muted-foreground">Manage subcontracts, sub-IPCs, and back charges</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Subcontract
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total Subcontracts</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {items.reduce((s, i) => s + Number(i.contract_value), 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">Total Contract Value</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.filter((i) => i.status === "active" || i.status === "awarded").length}</p>
              <p className="text-xs text-muted-foreground">Active Contracts</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Project *</label>
                <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                  <option value="">Select project...</option>
                  {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Subcontract No *</label>
                <input value={form.subcontract_no} onChange={(e) => setForm({ ...form, subcontract_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Contract Type</label>
                <select value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                  <option value="lump_sum">Lump Sum</option>
                  <option value="remeasurement">Re-measurement</option>
                  <option value="cost_plus">Cost Plus</option>
                  <option value="schedule_of_rates">Schedule of Rates</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Scope of Work</label>
                <textarea value={form.scope_of_work} onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Contract Value</label>
                <input type="number" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Retention %</label>
                <input type="number" step="0.01" value={form.retention_pct} onChange={(e) => setForm({ ...form, retention_pct: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Start Date</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">End Date</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.project_id || !form.subcontract_no.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No subcontracts yet
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                  s.status === "active" ? "bg-emerald-50 text-emerald-600" :
                  s.status === "awarded" ? "bg-blue-50 text-blue-600" :
                  s.status === "completed" ? "bg-gray-50 text-gray-600" : "bg-amber-50 text-amber-600"
                )}>{s.status.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{s.subcontract_no}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.scope_of_work || "—"} · {s.contract_type.replace(/_/g, " ")}</p>
                </div>
                <p className="text-sm font-semibold">{s.currency} {Number(s.contract_value).toLocaleString()}</p>
                <Link href={`/dashboard/subcontractors/${s.id}`}>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
