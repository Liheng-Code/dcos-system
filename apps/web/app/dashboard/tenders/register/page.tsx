"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, FileSearch, Eye } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function TenderRegisterPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    tender_no: "", title: "", description: "", tender_type: "selective",
    budget_range: "", currency: "USD", issue_date: "", submission_deadline: "",
    tender_days: "30", procurement_method: "limited_bid", estimated_value: "",
  });

  useEffect(() => {
    supabase.from("tender_register").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data);
      setLoading(false);
    });
  }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const days = parseInt(form.tender_days) || 30;
    const { error } = await supabase.from("tender_register").insert({
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
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Tender created");
    setShowForm(false);
    supabase.from("tender_register").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data);
    });
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tender Register</h1>
          <p className="text-sm text-muted-foreground">Manage tenders from issuance to award</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Tender
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
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
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.tender_no.trim() || !form.title.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
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
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
