"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, AlertTriangle, Clock, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NoticesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<any[]>([]);
  const [contracts, setContracts] = useState<{id:string,contract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    contract_id: "", notice_no: "", notice_type: "notice_of_claim",
    title: "", description: "", contract_clause: "", days_from_event: "0",
    deadline_date: "", trigger_event: "",
  });

  useEffect(() => {
    supabase.from("contract_register").select("id,contract_no").then(({ data }) => {
      if (data) setContracts(data);
    });
    supabase.from("contractual_notices").select("*").order("deadline_date", { ascending: true }).then(({ data }) => {
      if (data) setItems(data);
      setLoading(false);
    });
  }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const days = parseInt(form.days_from_event) || 0;
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);
    const { error } = await supabase.from("contractual_notices").insert({
      contract_id: form.contract_id,
      notice_no: form.notice_no,
      notice_type: form.notice_type,
      title: form.title,
      description: form.description,
      contract_clause: form.contract_clause || null,
      trigger_event: form.trigger_event || null,
      days_from_event: days,
      deadline_date: form.deadline_date || deadline.toISOString().split("T")[0],
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Notice created");
    setShowForm(false);
    setForm({ contract_id: "", notice_no: "", notice_type: "notice_of_claim", title: "", description: "", contract_clause: "", days_from_event: "0", deadline_date: "", trigger_event: "" });
    supabase.from("contractual_notices").select("*").order("deadline_date", { ascending: true }).then(({ data }) => {
      if (data) setItems(data);
    });
    setSaving(false);
  }

  function daysUntil(d: string) {
    const diff = new Date(d).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contractual Notices</h1>
          <p className="text-sm text-muted-foreground">Time-barred notices with deadline tracking</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> New Notice
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
                <label className="text-xs font-medium">Notice No *</label>
                <input value={form.notice_no} onChange={(e) => setForm({ ...form, notice_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.notice_type} onChange={(e) => setForm({ ...form, notice_type: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="notice_of_claim">Notice of Claim</option>
                  <option value="notice_of_delay">Notice of Delay</option>
                  <option value="notice_of_additional_cost">Notice of Additional Cost</option>
                  <option value="extension_of_time">Extension of Time</option>
                  <option value="force_majeure">Force Majeure</option>
                  <option value="default">Default</option>
                  <option value="termination">Termination</option>
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
                <label className="text-xs font-medium">Days from Event</label>
                <input type="number" value={form.days_from_event} onChange={(e) => setForm({ ...form, days_from_event: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Deadline Date *</label>
                <input type="date" value={form.deadline_date} onChange={(e) => setForm({ ...form, deadline_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.contract_id || !form.notice_no.trim() || !form.title.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">No notices recorded</div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const remaining = daysUntil(n.deadline_date);
            return (
              <Card key={n.id}>
                <CardContent className="flex items-center gap-4 p-3">
                  <Link href={`/dashboard/contracts/notices/${n.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                      remaining < 0 ? "bg-red-50 text-red-600" :
                      remaining <= 7 ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                    )}>
                      {remaining < 0 ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{n.notice_no} — {n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.notice_type.replace(/_/g, " ")} · Clause {n.contract_clause || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-semibold", remaining < 0 ? "text-red-600" : remaining <= 7 ? "text-amber-600" : "")}>
                        {remaining < 0 ? `${Math.abs(remaining)}d overdue` : `${remaining}d remaining`}
                      </p>
                      <p className="text-xs text-muted-foreground">{n.status}</p>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </Link>
                  <button onClick={async () => {
                    if (!confirm("Delete this notice?")) return;
                    setDeletingId(n.id);
                    const { error } = await supabase.from("contractual_notices").delete().eq("id", n.id);
                    if (error) { toast.error(error.message); setDeletingId(null); return; }
                    toast.success("Notice deleted");
                    setItems(items.filter((i: any) => i.id !== n.id));
                    setDeletingId(null);
                  }} className="text-muted-foreground hover:text-red-600" disabled={deletingId === n.id}>
                    {deletingId === n.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
