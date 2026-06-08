"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, AlertTriangle, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [notice, setNotice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    supabase.from("contractual_notices").select("*, contract_register(contract_no, title)").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) { router.push("/dashboard/contracts/notices"); return; }
      setNotice(data);
      setForm({ ...data, deadline_date: data.deadline_date?.slice(0, 10) || "", served_date: data.served_date?.slice(0, 10) || "", response_date: data.response_date?.slice(0, 10) || "" });
      setLoading(false);
    });
  }, [id, supabase, router]);

  function daysUntil(d: string) {
    const diff = new Date(d).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from("contractual_notices").update({
      notice_no: form.notice_no, notice_type: form.notice_type, title: form.title,
      description: form.description, trigger_event: form.trigger_event || null,
      contract_clause: form.contract_clause || null, days_from_event: parseInt(form.days_from_event) || 0,
      deadline_date: form.deadline_date, served_date: form.served_date || null,
      served_to: form.served_to || null, response_date: form.response_date || null,
      response_summary: form.response_summary || null, status: form.status,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Notice updated");
    setEditMode(false);
    supabase.from("contractual_notices").select("*, contract_register(contract_no, title)").eq("id", id).single().then(({ data }) => {
      if (data) { setNotice(data); setForm({ ...data, deadline_date: data.deadline_date?.slice(0, 10) || "", served_date: data.served_date?.slice(0, 10) || "", response_date: data.response_date?.slice(0, 10) || "" }); }
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this notice?")) return;
    setDeleting(true);
    const { error } = await supabase.from("contractual_notices").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    toast.success("Notice deleted");
    router.push("/dashboard/contracts/notices");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!notice) return null;

  const n = notice;
  const remaining = daysUntil(n.deadline_date);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{n.notice_no}</h1>
          <p className="text-sm text-muted-foreground">{n.title} · {n.contract_register?.contract_no}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={editMode ? "default" : "outline"} size="sm" onClick={() => setEditMode(!editMode)}>
            <Save className="mr-1 h-4 w-4" /> {editMode ? "Cancel" : "Edit"}
          </Button>
          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4 text-center">
          <AlertTriangle className={cn("mx-auto h-5 w-5 mb-1", remaining < 0 ? "text-red-500" : remaining <= 7 ? "text-amber-500" : "text-blue-500")} />
          <p className={cn("text-lg font-bold", remaining < 0 ? "text-red-600" : remaining <= 7 ? "text-amber-600" : "")}>
            {remaining < 0 ? `${Math.abs(remaining)}d` : `${remaining}d`}
          </p>
          <p className="text-xs text-muted-foreground">{remaining < 0 ? "Overdue" : "Remaining"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold capitalize">{n.notice_type.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">Type</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold capitalize">{n.status}</p>
          <p className="text-xs text-muted-foreground">Status</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Clock className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold">{n.deadline_date}</p>
          <p className="text-xs text-muted-foreground">Deadline</p>
        </CardContent></Card>
      </div>

      {editMode ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Contract</label><p className="text-sm pt-1">{n.contract_register?.contract_no} — {n.contract_register?.title}</p></div>
              <div className="space-y-1"><label className="text-xs font-medium">Notice No</label><input value={form.notice_no} onChange={e => setForm({...form, notice_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Type</label><select value={form.notice_type} onChange={e => setForm({...form, notice_type: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="notice_of_claim">Notice of Claim</option><option value="notice_of_delay">Notice of Delay</option>
                <option value="notice_of_additional_cost">Notice of Additional Cost</option><option value="extension_of_time">Extension of Time</option>
                <option value="force_majeure">Force Majeure</option><option value="default">Default</option><option value="termination">Termination</option>
              </select></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Trigger Event</label><input value={form.trigger_event} onChange={e => setForm({...form, trigger_event: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Contract Clause</label><input value={form.contract_clause} onChange={e => setForm({...form, contract_clause: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Days from Event</label><input type="number" value={form.days_from_event} onChange={e => setForm({...form, days_from_event: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Deadline Date</label><input type="date" value={form.deadline_date} onChange={e => setForm({...form, deadline_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Served Date</label><input type="date" value={form.served_date} onChange={e => setForm({...form, served_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Served To</label><input value={form.served_to} onChange={e => setForm({...form, served_to: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Response Date</label><input type="date" value={form.response_date} onChange={e => setForm({...form, response_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Response Summary</label><textarea value={form.response_summary || ""} onChange={e => setForm({...form, response_summary: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Status</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="pending">Pending</option><option value="served">Served</option><option value="acknowledged">Acknowledged</option>
                <option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="time_barred">Time-Barred</option><option value="closed">Closed</option>
              </select></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-muted-foreground">Contract</dt><dd className="font-medium">{n.contract_register?.contract_no} — {n.contract_register?.title}</dd></div>
              <div><dt className="text-muted-foreground">Type</dt><dd className="font-medium capitalize">{n.notice_type.replace(/_/g, " ")}</dd></div>
              <div><dt className="text-muted-foreground">Title</dt><dd className="font-medium">{n.title}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium capitalize">{n.status}</dd></div>
              {n.trigger_event && <div><dt className="text-muted-foreground">Trigger Event</dt><dd className="font-medium">{n.trigger_event}</dd></div>}
              {n.contract_clause && <div><dt className="text-muted-foreground">Contract Clause</dt><dd className="font-medium">{n.contract_clause}</dd></div>}
              {n.days_from_event != null && <div><dt className="text-muted-foreground">Days from Event</dt><dd className="font-medium">{n.days_from_event}</dd></div>}
              <div><dt className="text-muted-foreground">Deadline</dt><dd className="font-medium">{n.deadline_date} ({remaining < 0 ? `${Math.abs(remaining)}d overdue` : `${remaining}d remaining`})</dd></div>
              {n.served_date && <div><dt className="text-muted-foreground">Served</dt><dd className="font-medium">{n.served_date}{n.served_to ? ` to ${n.served_to}` : ""}</dd></div>}
              {n.response_date && <div><dt className="text-muted-foreground">Response</dt><dd className="font-medium">{n.response_date}</dd></div>}
              {n.response_summary && <div className="col-span-2"><dt className="text-muted-foreground">Response Summary</dt><dd className="font-medium">{n.response_summary}</dd></div>}
              <div className="col-span-2"><dt className="text-muted-foreground">Description</dt><dd className="font-medium">{n.description}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
