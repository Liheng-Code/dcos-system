"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, ScrollText, DollarSign, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function EmployerInstructionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [instruction, setInstruction] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    supabase.from("contract_employer_instructions").select("*, contract_register(contract_no, title)").eq("id", id).single().then(({ data, error }) => {
      if (error || !data) { router.push("/dashboard/contracts/employer-instructions"); return; }
      setInstruction(data);
      setForm({ ...data, instruction_date: data.instruction_date?.slice(0, 10) || "", response_date: data.response_date?.slice(0, 10) || "" });
      setLoading(false);
    });
  }, [id, supabase, router]);

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase.from("contract_employer_instructions").update({
      instruction_no: form.instruction_no, title: form.title, description: form.description,
      type: form.type, instruction_date: form.instruction_date, response_date: form.response_date || null,
      time_extension_days: parseInt(form.time_extension_days) || 0,
      cost_impact: parseFloat(form.cost_impact) || 0, status: form.status,
      assigned_to: form.assigned_to || null, notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Instruction updated");
    setEditMode(false);
    supabase.from("contract_employer_instructions").select("*, contract_register(contract_no, title)").eq("id", id).single().then(({ data }) => {
      if (data) { setInstruction(data); setForm({ ...data, instruction_date: data.instruction_date?.slice(0, 10) || "", response_date: data.response_date?.slice(0, 10) || "" }); }
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this instruction?")) return;
    setDeleting(true);
    const { error } = await supabase.from("contract_employer_instructions").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeleting(false); return; }
    toast.success("Instruction deleted");
    router.push("/dashboard/contracts/employer-instructions");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!instruction) return null;

  const ei = instruction;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ei.instruction_no}</h1>
          <p className="text-sm text-muted-foreground">{ei.title} · {ei.contract_register?.contract_no}</p>
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
          <ScrollText className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold capitalize">{ei.type}</p>
          <p className="text-xs text-muted-foreground">Type</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold capitalize">{ei.status}</p>
          <p className="text-xs text-muted-foreground">Status</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-lg font-bold">{ei.time_extension_days}d</p>
          <p className="text-xs text-muted-foreground">Time Extension</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="mx-auto h-5 w-5 text-muted-foreground mb-1" />
          <p className="text-lg font-bold">{Number(ei.cost_impact).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Cost Impact</p>
        </CardContent></Card>
      </div>

      {editMode ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Contract</label><p className="text-sm pt-1">{ei.contract_register?.contract_no} — {ei.contract_register?.title}</p></div>
              <div className="space-y-1"><label className="text-xs font-medium">Instruction No</label><input value={form.instruction_no} onChange={e => setForm({...form, instruction_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Type</label><select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="direction">Direction</option><option value="variation">Variation</option><option value="clarification">Clarification</option>
                <option value="approval">Approval</option><option value="rejection">Rejection</option><option value="information">For Information</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Status</label><select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="received">Received</option><option value="acknowledged">Acknowledged</option><option value="in_progress">In Progress</option>
                <option value="complied">Complied</option><option value="closed">Closed</option><option value="disputed">Disputed</option>
              </select></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Title</label><input value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description</label><textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Instruction Date</label><input type="date" value={form.instruction_date} onChange={e => setForm({...form, instruction_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Response Date</label><input type="date" value={form.response_date} onChange={e => setForm({...form, response_date: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Time Extension (days)</label><input type="number" value={form.time_extension_days} onChange={e => setForm({...form, time_extension_days: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Cost Impact</label><input type="number" value={form.cost_impact} onChange={e => setForm({...form, cost_impact: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
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
              <div><dt className="text-muted-foreground">Contract</dt><dd className="font-medium">{ei.contract_register?.contract_no} — {ei.contract_register?.title}</dd></div>
              <div><dt className="text-muted-foreground">Type</dt><dd className="font-medium capitalize">{ei.type}</dd></div>
              <div><dt className="text-muted-foreground">Title</dt><dd className="font-medium">{ei.title}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium capitalize">{ei.status}</dd></div>
              <div><dt className="text-muted-foreground">Instruction Date</dt><dd className="font-medium">{ei.instruction_date}</dd></div>
              {ei.response_date && <div><dt className="text-muted-foreground">Response Date</dt><dd className="font-medium">{ei.response_date}</dd></div>}
              <div><dt className="text-muted-foreground">Time Extension</dt><dd className="font-medium">{ei.time_extension_days}d</dd></div>
              <div><dt className="text-muted-foreground">Cost Impact</dt><dd className="font-medium">{Number(ei.cost_impact).toLocaleString()}</dd></div>
              {ei.assigned_to && <div><dt className="text-muted-foreground">Assigned To</dt><dd className="font-medium">{ei.assigned_to}</dd></div>}
              {ei.notes && <div className="col-span-2"><dt className="text-muted-foreground">Notes</dt><dd className="font-medium">{ei.notes}</dd></div>}
              <div className="col-span-2"><dt className="text-muted-foreground">Description</dt><dd className="font-medium">{ei.description}</dd></div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
