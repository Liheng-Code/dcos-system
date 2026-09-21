"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, FileWarning, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";

interface PerfNotice {
  id: string; subcontract_id: string;
  notice_no: string; notice_type: string;
  subject: string; description: string;
  issued_date: string; response_due_date: string | null;
  response: string | null; status: string;
}

export default function PerformanceNoticesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [items, setItems] = useState<PerfNotice[]>([]);
  const [subcontracts, setSubcontracts] = useState<{id:string,subcontract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    subcontract_id: "", notice_no: "", notice_type: "warning",
    subject: "", description: "", issued_date: "", response_due_date: "",
  });

  const itemsQuery = useCallback(() => {
    let q = supabase.from("subcontract_performance_notices").select("*, subcontracts!inner(project_id)").order("created_at", { ascending: false });
    if (selectedProjectId) q = q.eq("subcontracts.project_id", selectedProjectId);
    return q;
  }, [supabase, selectedProjectId]);

  useEffect(() => {
    let sq = supabase.from("subcontracts").select("id,subcontract_no");
    if (selectedProjectId) sq = sq.eq("project_id", selectedProjectId);
    sq.then(({ data }) => {
      if (data) setSubcontracts(data);
    });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as PerfNotice[]);
      setLoading(false);
    });
  }, [supabase, selectedProjectId, itemsQuery]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("subcontract_performance_notices").insert({
      subcontract_id: form.subcontract_id,
      notice_no: form.notice_no,
      notice_type: form.notice_type,
      subject: form.subject,
      description: form.description,
      issued_date: form.issued_date || new Date().toISOString().split("T")[0],
      response_due_date: form.response_due_date || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Performance notice created");
    setShowForm(false);
    setForm({ subcontract_id: "", notice_no: "", notice_type: "warning", subject: "", description: "", issued_date: "", response_due_date: "" });
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as PerfNotice[]);
    });
    setSaving(false);
  }

  async function handleStatusUpdate(id: string, status: string) {
    const { error } = await supabase.from("subcontract_performance_notices").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Notice ${status}`);
    itemsQuery().then(({ data }) => {
      if (data) setItems(data as PerfNotice[]);
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Performance Notices</h1>
          <p className="text-sm text-muted-foreground">Warnings, defaults, non-conformance, and improvement notices</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Notice
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.filter(i => i.status === "issued" || i.status === "escalated").length}</p>
              <p className="text-xs text-muted-foreground">Open</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.filter(i => i.status === "closed").length}</p>
              <p className="text-xs text-muted-foreground">Closed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileWarning className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{items.filter(i => i.notice_type === "default" || i.notice_type === "termination").length}</p>
              <p className="text-xs text-muted-foreground">Serious</p>
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
                <label className="text-xs font-medium">Notice No *</label>
                <input value={form.notice_no} onChange={(e) => setForm({...form, notice_no: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Notice Type</label>
                <select value={form.notice_type} onChange={(e) => setForm({...form, notice_type: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="warning">Warning</option>
                  <option value="default">Default</option>
                  <option value="termination">Termination</option>
                  <option value="non_conformance">Non-Conformance</option>
                  <option value="improvement">Improvement</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Issued Date</label>
                <input type="date" value={form.issued_date} onChange={(e) => setForm({...form, issued_date: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Response Due Date</label>
                <input type="date" value={form.response_due_date} onChange={(e) => setForm({...form, response_due_date: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Subject *</label>
                <input value={form.subject} onChange={(e) => setForm({...form, subject: e.target.value})}
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
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.subcontract_id || !form.notice_no.trim() || !form.subject.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No performance notices yet
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((pn) => (
            <Card key={pn.id}>
              <CardContent className="flex flex-col gap-2 p-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                    pn.notice_type === "default" || pn.notice_type === "termination" ? "bg-red-50 text-red-600" :
                    pn.notice_type === "warning" ? "bg-amber-50 text-amber-600" :
                    "bg-blue-50 text-blue-600"
                  )}>{pn.notice_type === "non_conformance" ? "NC" : pn.notice_type.charAt(0).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{pn.notice_no}</p>
                    <p className="text-xs text-muted-foreground">{pn.subject} · {pn.notice_type.replace(/_/g, " ")}</p>
                  </div>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    pn.status === "closed" ? "bg-emerald-50 text-emerald-700" :
                    pn.status === "escalated" ? "bg-red-50 text-red-700" :
                    pn.status === "acknowledged" ? "bg-blue-50 text-blue-700" :
                    pn.status === "resolved" ? "bg-gray-50 text-gray-700" :
                    "bg-amber-50 text-amber-700"
                  )}>{pn.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">{pn.description}</p>
                <div className="flex gap-1">
                  {pn.status === "issued" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(pn.id, "acknowledged")}>Acknowledge</Button>
                  )}
                  {pn.status === "acknowledged" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(pn.id, "resolved")}>Resolve</Button>
                  )}
                  {pn.status === "resolved" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStatusUpdate(pn.id, "closed")}>Close</Button>
                  )}
                  {(pn.status === "issued" || pn.status === "acknowledged") && (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => handleStatusUpdate(pn.id, "escalated")}>Escalate</Button>
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
