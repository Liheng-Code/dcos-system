"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, MessageSquare, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";

export default function CorrespondencePage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [items, setItems] = useState<any[]>([]);
  const [contracts, setContracts] = useState<{id:string,contract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    contract_id: "", correspondence_no: "", direction: "incoming",
    subject: "", body: "", from_party: "", to_party: "",
    correspondence_date: new Date().toISOString().split("T")[0],
    category: "formal_letter",
  });

  const itemsQuery = useCallback(() => {
    let q = supabase.from("contract_correspondence").select("*, contract_register!inner(project_id)").order("correspondence_date", { ascending: false });
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
    const { error } = await supabase.from("contract_correspondence").insert({
      contract_id: form.contract_id,
      correspondence_no: form.correspondence_no,
      direction: form.direction,
      subject: form.subject,
      body: form.body || null,
      from_party: form.from_party,
      to_party: form.to_party,
      correspondence_date: form.correspondence_date,
      category: form.category,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Correspondence logged");
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
          <h1 className="text-2xl font-semibold tracking-tight">Contract Correspondence</h1>
          <p className="text-sm text-muted-foreground">Formal correspondence log</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Log Correspondence
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
                <label className="text-xs font-medium">Ref No *</label>
                <input value={form.correspondence_no} onChange={(e) => setForm({ ...form, correspondence_no: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Direction</label>
                <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="incoming">Incoming</option>
                  <option value="outgoing">Outgoing</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="formal_letter">Formal Letter</option>
                  <option value="email">Email</option>
                  <option value="minutes_of_meeting">Minutes of Meeting</option>
                  <option value="site_instruction">Site Instruction</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">From</label>
                <input value={form.from_party} onChange={(e) => setForm({ ...form, from_party: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">To</label>
                <input value={form.to_party} onChange={(e) => setForm({ ...form, to_party: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Date</label>
                <input type="date" value={form.correspondence_date} onChange={(e) => setForm({ ...form, correspondence_date: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Subject *</label>
                <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Body</label>
                <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.contract_id || !form.correspondence_no.trim() || !form.subject.trim() || !form.from_party.trim() || !form.to_party.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">No correspondence logged</div>
      ) : (
        <div className="space-y-2">
          {items.map((corr) => (
            <Card key={corr.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <Link href={`/dashboard/contracts/correspondence/${corr.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    corr.direction === "incoming" ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                  )}><MessageSquare className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{corr.correspondence_no}</p>
                    <p className="text-xs text-muted-foreground truncate">{corr.subject}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{corr.from_party} → {corr.to_party}</p>
                  <p className="text-xs text-muted-foreground">{corr.correspondence_date}</p>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </Link>
                <button onClick={async () => {
                  if (!confirm("Delete this correspondence?")) return;
                  setDeletingId(corr.id);
                  const { error } = await supabase.from("contract_correspondence").delete().eq("id", corr.id);
                  if (error) { toast.error(error.message); setDeletingId(null); return; }
                  toast.success("Correspondence deleted");
                  setItems(items.filter((i: any) => i.id !== corr.id));
                  setDeletingId(null);
                }} className="text-muted-foreground hover:text-red-600" disabled={deletingId === corr.id}>
                  {deletingId === corr.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
