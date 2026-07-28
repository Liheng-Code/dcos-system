"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, FileSignature, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    supabase.from("contract_register").select("*, projects(name)").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) { router.push("/dashboard/contracts/register"); return; }
      setContract(data);
      setForm({ ...data, start_date: data.start_date?.slice(0, 10) || "", end_date: data.end_date?.slice(0, 10) || "", signed_date: data.signed_date?.slice(0, 10) || "", termination_date: data.termination_date?.slice(0, 10) || "" });
      setLoading(false);
    });
  }, [id, supabase, router]);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from("contract_register").update({
      contract_no: form.contract_no, title: form.title, party_name: form.party_name,
      party_contact: form.party_contact || null, contract_type: form.contract_type,
      contract_value: parseFloat(form.contract_value) || 0, currency: form.currency,
      status: form.status, start_date: form.start_date || null, end_date: form.end_date || null,
      signed_date: form.signed_date || null, termination_date: form.termination_date || null,
      governing_law: form.governing_law || null, dispute_resolution: form.dispute_resolution || null,
      payment_terms: form.payment_terms || null,
      notes: form.notes || null, updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Contract updated");
    setEditMode(false);
    supabase.from("contract_register").select("*, projects(name)").eq("id", id).single().then(({ data }) => {
      if (data) { setContract(data); setForm({ ...data, start_date: data.start_date?.slice(0, 10) || "", end_date: data.end_date?.slice(0, 10) || "", signed_date: data.signed_date?.slice(0, 10) || "", termination_date: data.termination_date?.slice(0, 10) || "" }); }
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this contract and all related records?")) return;
    setDeleting(true);
    const { error } = await supabase.from("contract_register").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    toast.success("Contract deleted");
    router.push("/dashboard/contracts/register");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!contract) return null;

  const c = contract;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.contract_no}</h1>
          <p className="text-sm text-muted-foreground">{c.title}</p>
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
          <FileSignature className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold">{c.currency} {Number(c.contract_value).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Contract Value</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold capitalize">{c.status}</p>
          <p className="text-xs text-muted-foreground">Status</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold capitalize">{c.contract_type.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">Type</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold">{c.party_name}</p>
          <p className="text-xs text-muted-foreground">Party</p>
        </CardContent></Card>
      </div>

      {editMode ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Contract No</label><input value={form.contract_no} onChange={e => setForm({...form, contract_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Party Name</label><input value={form.party_name} onChange={e => setForm({...form, party_name: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Party Contact</label><input value={form.party_contact} onChange={e => setForm({...form, party_contact: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Type</label><select value={form.contract_type} onChange={e => setForm({...form, contract_type: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="head_contract">Head Contract</option><option value="subcontract">Subcontract</option><option value="consultant">Consultant</option><option value="supplier">Supplier</option><option value="other">Other</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Status</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="draft">Draft</option><option value="active">Active</option><option value="completed">Completed</option><option value="terminated">Terminated</option><option value="expired">Expired</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Value</label><input type="number" value={form.contract_value} onChange={e => setForm({...form, contract_value: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Currency</label><input value={form.currency} onChange={e => setForm({...form, currency: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Start Date</label><input type="date" value={form.start_date} onChange={e => setForm({...form, start_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">End Date</label><input type="date" value={form.end_date} onChange={e => setForm({...form, end_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Signed Date</label><input type="date" value={form.signed_date} onChange={e => setForm({...form, signed_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Termination Date</label><input type="date" value={form.termination_date} onChange={e => setForm({...form, termination_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Governing Law</label><input value={form.governing_law} onChange={e => setForm({...form, governing_law: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Dispute Resolution</label><input value={form.dispute_resolution} onChange={e => setForm({...form, dispute_resolution: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Payment Terms</label><textarea value={form.payment_terms || ""} onChange={e => setForm({...form, payment_terms: e.target.value})} placeholder="e.g. Net 30 days from certification, retention 5%, advance 10% recovered pro-rata" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Notes</label><textarea value={form.notes || ""} onChange={e => setForm({...form, notes: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
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
              <div><dt className="text-muted-foreground">Project</dt><dd className="font-medium">{c.projects?.project_name || "—"}</dd></div>
              <div><dt className="text-muted-foreground">Contract No</dt><dd className="font-medium">{c.contract_no}</dd></div>
              <div><dt className="text-muted-foreground">Title</dt><dd className="font-medium">{c.title}</dd></div>
              <div><dt className="text-muted-foreground">Party</dt><dd className="font-medium">{c.party_name}{c.party_contact ? ` · ${c.party_contact}` : ""}</dd></div>
              <div><dt className="text-muted-foreground">Type</dt><dd className="font-medium capitalize">{c.contract_type.replace(/_/g, " ")}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium capitalize">{c.status}</dd></div>
              <div><dt className="text-muted-foreground">Value</dt><dd className="font-medium">{c.currency} {Number(c.contract_value).toLocaleString()}</dd></div>
              <div><dt className="text-muted-foreground">Period</dt><dd className="font-medium">{c.start_date || "—"} → {c.end_date || "—"}</dd></div>
              {c.signed_date && <div><dt className="text-muted-foreground">Signed</dt><dd className="font-medium">{c.signed_date}</dd></div>}
              {c.termination_date && <div><dt className="text-muted-foreground">Terminated</dt><dd className="font-medium">{c.termination_date}</dd></div>}
              {c.governing_law && <div className="col-span-2"><dt className="text-muted-foreground">Governing Law</dt><dd className="font-medium">{c.governing_law}</dd></div>}
              {c.dispute_resolution && <div className="col-span-2"><dt className="text-muted-foreground">Dispute Resolution</dt><dd className="font-medium">{c.dispute_resolution}</dd></div>}
              {c.payment_terms && <div className="col-span-2"><dt className="text-muted-foreground">Payment Terms</dt><dd className="font-medium whitespace-pre-wrap">{c.payment_terms}</dd></div>}
              {c.notes && <div className="col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="font-medium">{c.notes}</dd></div>}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
