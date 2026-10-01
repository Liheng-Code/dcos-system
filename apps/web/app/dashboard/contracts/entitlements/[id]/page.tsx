"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { deleteEntitlementRegisterById, getEntitlementRegisterById, updateEntitlementRegisterById } from "@/lib/qs/qs-queries";
import { Loader2, Save, Shield, Clock, DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function EntitlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ent, setEnt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    getEntitlementRegisterById(id).then(({ data, error }) => {
      if (error || !data) { router.push("/dashboard/contracts/entitlements"); return; }
      setEnt(data);
      setForm({ ...data });
      setLoading(false);
    });
  }, [id, router]);

  async function handleSave() {
    setSaving(true);
    const { error } = await updateEntitlementRegisterById({
      entitlement_no: form.entitlement_no, title: form.title, description: form.description,
      category: form.category, trigger_event: form.trigger_event || null,
      contract_clause: form.contract_clause || null,
      estimated_time_days: parseInt(form.estimated_time_days) || 0,
      estimated_cost: parseFloat(form.estimated_cost) || 0,
      approved_time_days: parseInt(form.approved_time_days) || 0,
      approved_cost: parseFloat(form.approved_cost) || 0,
      status: form.status, updated_at: new Date().toISOString(),
    }, id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Entitlement updated");
    setEditMode(false);
    getEntitlementRegisterById(id).then(({ data }) => {
      if (data) setEnt(data);
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this entitlement?")) return;
    setDeleting(true);
    const { error } = await deleteEntitlementRegisterById(id);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    toast.success("Entitlement deleted");
    router.push("/dashboard/contracts/entitlements");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!ent) return null;

  const e = ent;
  const timeApproved = e.approved_time_days > 0;
  const costApproved = e.approved_cost > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{e.entitlement_no}</h1>
          <p className="text-sm text-muted-foreground">{e.title} · {e.contract_register?.contract_no}</p>
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
          <Shield className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold capitalize">{e.category === "both" ? "Time & Cost" : e.category}</p>
          <p className="text-xs text-muted-foreground">Category</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold capitalize">{e.status.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">Status</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Clock className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold">{e.estimated_time_days}d{timeApproved ? ` → ${e.approved_time_days}d` : ""}</p>
          <p className="text-xs text-muted-foreground">Time (est{timeApproved ? " → appr" : ""})</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold">{Number(e.estimated_cost).toLocaleString()}{costApproved ? ` → ${Number(e.approved_cost).toLocaleString()}` : ""}</p>
          <p className="text-xs text-muted-foreground">Cost (est{timeApproved ? " → appr" : ""})</p>
        </CardContent></Card>
      </div>

      {editMode ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Contract</label><p className="text-sm pt-1">{e.contract_register?.contract_no} — {e.contract_register?.title}</p></div>
              <div className="space-y-1"><label className="text-xs font-medium">Entitlement No</label><input value={form.entitlement_no} onChange={e => setForm({...form, entitlement_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Category</label><select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="time">Time Only</option><option value="cost">Cost Only</option><option value="both">Time & Cost</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Status</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="identified">Identified</option><option value="assessed">Assessed</option><option value="submitted">Submitted</option>
                <option value="approved">Approved</option><option value="rejected">Rejected</option>
                <option value="partially_approved">Partially Approved</option><option value="closed">Closed</option>
              </select></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Trigger Event</label><input value={form.trigger_event} onChange={e => setForm({...form, trigger_event: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Contract Clause</label><input value={form.contract_clause} onChange={e => setForm({...form, contract_clause: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Est. Time (days)</label><input type="number" value={form.estimated_time_days} onChange={e => setForm({...form, estimated_time_days: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Est. Cost</label><input type="number" value={form.estimated_cost} onChange={e => setForm({...form, estimated_cost: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Approved Time (days)</label><input type="number" value={form.approved_time_days} onChange={e => setForm({...form, approved_time_days: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Approved Cost</label><input type="number" value={form.approved_cost} onChange={e => setForm({...form, approved_cost: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
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
              <div><dt className="text-muted-foreground">Contract</dt><dd className="font-medium">{e.contract_register?.contract_no} — {e.contract_register?.title}</dd></div>
              <div><dt className="text-muted-foreground">Category</dt><dd className="font-medium capitalize">{e.category === "both" ? "Time & Cost" : e.category}</dd></div>
              <div><dt className="text-muted-foreground">Title</dt><dd className="font-medium">{e.title}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium capitalize">{e.status.replace(/_/g, " ")}</dd></div>
              {e.trigger_event && <div><dt className="text-muted-foreground">Trigger Event</dt><dd className="font-medium">{e.trigger_event}</dd></div>}
              {e.contract_clause && <div><dt className="text-muted-foreground">Contract Clause</dt><dd className="font-medium">{e.contract_clause}</dd></div>}
              <div><dt className="text-muted-foreground">Est. Time</dt><dd className="font-medium">{e.estimated_time_days}d</dd></div>
              <div><dt className="text-muted-foreground">Est. Cost</dt><dd className="font-medium">{Number(e.estimated_cost).toLocaleString()}</dd></div>
              <div><dt className="text-muted-foreground">Approved Time</dt><dd className="font-medium">{e.approved_time_days > 0 ? `${e.approved_time_days}d` : "—"}</dd></div>
              <div><dt className="text-muted-foreground">Approved Cost</dt><dd className="font-medium">{e.approved_cost > 0 ? Number(e.approved_cost).toLocaleString() : "—"}</dd></div>
              {e.contractual_notices && <div className="col-span-2"><dt className="text-muted-foreground">Linked Notice</dt><dd className="font-medium">{e.contractual_notices.notice_no} — {e.contractual_notices.title}</dd></div>}
              <div className="col-span-2"><dt className="text-muted-foreground">Description</dt><dd className="font-medium">{e.description}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
