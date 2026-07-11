"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, FileSearch, Eye, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function TenderRegisterPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const emptyForm = {
    tender_no: "", title: "", description: "", tender_type: "selective",
    budget_range: "", currency: "USD", issue_date: "", submission_deadline: "",
    tender_days: "30", procurement_method: "limited_bid", estimated_value: "",
  };
  const [form, setForm] = useState(emptyForm);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(t: any) {
    setEditingId(t.id);
    setForm({
      tender_no: t.tender_no ?? "",
      title: t.title ?? "",
      description: t.description ?? "",
      tender_type: t.tender_type ?? "selective",
      budget_range: t.budget_range != null ? String(t.budget_range) : "",
      currency: t.currency ?? "USD",
      issue_date: t.issue_date ?? "",
      submission_deadline: t.submission_deadline ? String(t.submission_deadline).slice(0, 16) : "",
      tender_days: t.tender_days != null ? String(t.tender_days) : "30",
      procurement_method: t.procurement_method ?? "limited_bid",
      estimated_value: t.estimated_value != null ? String(t.estimated_value) : "",
    });
    setShowForm(true);
  }

  useEffect(() => {
    supabase.from("tender_register").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data);
      setLoading(false);
    });
  }, [supabase]);

  async function handleSave() {
    setSaving(true);
    const days = parseInt(form.tender_days) || 30;
    const payload = {
      tender_no: form.tender_no,
      title: form.title,
      description: form.description || null,
      tender_type: form.tender_type,
      budget_range: parseFloat(form.budget_range) || null,
      currency: form.currency,
      issue_date: form.issue_date || null,
      submission_deadline: form.submission_deadline || null,
      tender_days: days,
      procurement_method: form.procurement_method,
      estimated_value: parseFloat(form.estimated_value) || null,
    };
    const { error } = editingId
      ? await supabase.from("tender_register").update(payload).eq("id", editingId)
      : await supabase.from("tender_register").insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success(editingId ? "Tender updated" : "Tender created");
    setShowForm(false);
    setEditingId(null);
    supabase.from("tender_register").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data);
    });
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tender? This cannot be undone.")) return;
    setDeletingId(id);
    const { error } = await supabase.from("tender_register").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Tender deleted");
    setItems((prev) => prev.filter((t) => t.id !== id));
    setDeletingId(null);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tender Register</h1>
          <p className="text-sm text-muted-foreground">Manage tenders from issuance to award</p>
        </div>
        <Button onClick={() => (showForm ? setShowForm(false) : openCreate())} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Tender
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">{editingId ? "Edit Tender" : "New Tender"}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Tender No *</label>
                <input value={form.tender_no} onChange={(e) => setForm({ ...form, tender_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.tender_type} onChange={(e) => setForm({ ...form, tender_type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="open">Open</option>
                  <option value="selective">Selective</option>
                  <option value="negotiated">Negotiated</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Budget Range</label>
                <input type="number" value={form.budget_range} onChange={(e) => setForm({ ...form, budget_range: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Currency</label>
                <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Issue Date</label>
                <input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Submission Deadline</label>
                <input type="datetime-local" value={form.submission_deadline} onChange={(e) => setForm({ ...form, submission_deadline: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Tender Days</label>
                <input type="number" value={form.tender_days} onChange={(e) => setForm({ ...form, tender_days: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Procurement Method</label>
                <select value={form.procurement_method} onChange={(e) => setForm({ ...form, procurement_method: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="public_bid">Public Bid</option>
                  <option value="limited_bid">Limited Bid</option>
                  <option value="direct_negotiation">Direct Negotiation</option>
                  <option value="framework">Framework</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.tender_no.trim() || !form.title.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{editingId ? "Update" : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">No tenders created</div>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                  t.status === "awarded" ? "bg-emerald-50 text-emerald-600" :
                  t.status === "cancelled" ? "bg-red-50 text-red-600" :
                  t.status === "draft" ? "bg-gray-50 text-gray-600" : "bg-blue-50 text-blue-600"
                )}>{t.status.slice(0, 3).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t.tender_no} — {t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.tender_type} · {t.procurement_method?.replace(/_/g, " ") || "—"}</p>
                </div>
                <p className="text-xs text-muted-foreground">{t.issue_date || "—"}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="View tender cost estimation"
                    onClick={() => router.push(`/dashboard/tenders/cost-estimation?tender=${t.id}`)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Edit tender"
                    onClick={() => openEdit(t)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete tender"
                    disabled={deletingId === t.id}
                    onClick={() => handleDelete(t.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    {deletingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
