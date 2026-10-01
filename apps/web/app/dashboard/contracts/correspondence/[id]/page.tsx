"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { deleteContractCorrespondenceById, getContractCorrespondenceById, updateContractCorrespondenceById } from "@/lib/qs/qs-queries";
import { Loader2, Save, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function CorrespondenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [corr, setCorr] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    getContractCorrespondenceById(id).then(({ data, error }) => {
      if (error || !data) { router.push("/dashboard/contracts/correspondence"); return; }
      setCorr(data);
      setForm({ ...data, correspondence_date: data.correspondence_date?.slice(0, 10) || "" });
      setLoading(false);
    });
  }, [id, router]);

  async function handleSave() {
    setSaving(true);
    const { error } = await updateContractCorrespondenceById({
      correspondence_no: form.correspondence_no, direction: form.direction,
      subject: form.subject, body: form.body || null,
      correspondence_date: form.correspondence_date,
      from_party: form.from_party, to_party: form.to_party,
      category: form.category,
    }, id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Correspondence updated");
    setEditMode(false);
    getContractCorrespondenceById(id).then(({ data }) => {
      if (data) { setCorr(data); setForm({ ...data, correspondence_date: data.correspondence_date?.slice(0, 10) || "" }); }
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this correspondence?")) return;
    setDeleting(true);
    const { error } = await deleteContractCorrespondenceById(id);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    toast.success("Correspondence deleted");
    router.push("/dashboard/contracts/correspondence");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!corr) return null;

  const c = corr;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.correspondence_no}</h1>
          <p className="text-sm text-muted-foreground">{c.subject}</p>
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
          <MessageSquare className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold capitalize">{c.direction}</p>
          <p className="text-xs text-muted-foreground">Direction</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold capitalize">{c.category?.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">Category</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold">{c.from_party}</p>
          <p className="text-xs text-muted-foreground">From</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold">{c.to_party}</p>
          <p className="text-xs text-muted-foreground">To</p>
        </CardContent></Card>
      </div>

      {editMode ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Contract</label><p className="text-sm pt-1">{c.contract_register?.contract_no} — {c.contract_register?.title}</p></div>
              <div className="space-y-1"><label className="text-xs font-medium">Ref No</label><input value={form.correspondence_no} onChange={e => setForm({...form, correspondence_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Direction</label><select value={form.direction} onChange={e => setForm({...form, direction: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="incoming">Incoming</option><option value="outgoing">Outgoing</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Category</label><select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="formal_letter">Formal Letter</option><option value="email">Email</option>
                <option value="minutes_of_meeting">Minutes of Meeting</option><option value="site_instruction">Site Instruction</option><option value="other">Other</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Date</label><input type="date" value={form.correspondence_date} onChange={e => setForm({...form, correspondence_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">From</label><input value={form.from_party} onChange={e => setForm({...form, from_party: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">To</label><input value={form.to_party} onChange={e => setForm({...form, to_party: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Subject</label><input value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Body</label><textarea value={form.body || ""} onChange={e => setForm({...form, body: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
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
              <div><dt className="text-muted-foreground">Contract</dt><dd className="font-medium">{c.contract_register?.contract_no} — {c.contract_register?.title}</dd></div>
              <div><dt className="text-muted-foreground">Direction</dt><dd className="font-medium capitalize">{c.direction}</dd></div>
              <div><dt className="text-muted-foreground">Ref No</dt><dd className="font-medium">{c.correspondence_no}</dd></div>
              <div><dt className="text-muted-foreground">Category</dt><dd className="font-medium capitalize">{c.category?.replace(/_/g, " ")}</dd></div>
              <div><dt className="text-muted-foreground">Date</dt><dd className="font-medium">{c.correspondence_date}</dd></div>
              <div><dt className="text-muted-foreground">From / To</dt><dd className="font-medium">{c.from_party} → {c.to_party}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Subject</dt><dd className="font-medium">{c.subject}</dd></div>
              {c.body && <div className="col-span-2"><dt className="text-muted-foreground">Body</dt><dd className="font-medium whitespace-pre-wrap">{c.body}</dd></div>}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
