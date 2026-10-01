"use client";

import { useEffect, useState } from "react";
import { createArInvoice, listClientOptions, listProjectOptions, updateArInvoice } from "@/lib/account/account-service";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface Project { id: string; project_name: string; project_code: string | null; }
interface Stakeholder { id: string; organization_name: string | null; contact_person: string | null; }
interface ArInvoice {
  id: string; project_id: string; client_id: string;
  invoice_no: string; invoice_date: string; due_date: string;
  amount: number; tax_amount: number; net_amount: number;
  description: string | null; status: string; notes: string | null;
}

export function ArInvoiceForm({ invoice: raw, onSaved, onCancel }: { invoice: ArInvoice | null; onSaved: () => void; onCancel: () => void }) {
  const isNew = !raw?.id;
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Stakeholder[]>([]);
  const [projectId, setProjectId] = useState(raw?.project_id ?? "");
  const [clientId, setClientId] = useState(raw?.client_id ?? "");
  const [invoiceNo, setInvoiceNo] = useState(raw?.invoice_no ?? "");
  const [invoiceDate, setInvoiceDate] = useState(raw?.invoice_date ?? "");
  const [dueDate, setDueDate] = useState(raw?.due_date ?? "");
  const [amount, setAmount] = useState(raw?.amount ?? 0);
  const [taxAmount, setTaxAmount] = useState(raw?.tax_amount ?? 0);
  const [description, setDescription] = useState(raw?.description ?? "");
  const [notes, setNotes] = useState(raw?.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      listProjectOptions(),
      listClientOptions(),
    ]).then(([pRes, sRes]) => {
      if (pRes.data) setProjects(pRes.data as Project[]);
      if (sRes.data) setClients(sRes.data as Stakeholder[]);
    });
    if (!raw?.invoice_date) setInvoiceDate(new Date().toISOString().slice(0, 10));
    if (!raw?.due_date) {
      const d = new Date(); d.setDate(d.getDate() + 30);
      setDueDate(d.toISOString().slice(0, 10));
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceNo.trim() || !clientId || !projectId) { toast.error("Invoice no, client, and project are required"); return; }
    setSaving(true);

    const payload: Record<string, unknown> = {
      project_id: projectId,
      client_id: clientId,
      invoice_no: invoiceNo.trim(),
      invoice_date: invoiceDate,
      due_date: dueDate,
      amount,
      tax_amount: taxAmount,
      description: description.trim() || null,
      notes: notes.trim() || null,
    };

    if (isNew) {
      const { error } = await createArInvoice(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("AR invoice created");
    } else {
      const { error } = await updateArInvoice(raw!.id, payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("AR invoice updated");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h2 className="text-lg font-semibold">{isNew ? "New AR Invoice" : "Edit AR Invoice"}</h2>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={clientId} onChange={e => setClientId(e.target.value)} required>
                  <option value="">Select client</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.organization_name ?? c.contact_person ?? c.id}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice No *</Label>
                <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="INV-001" required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Invoice Date</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Project *</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={projectId} onChange={e => setProjectId(e.target.value)} required>
                  <option value="">Select project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.project_name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Amount ($)</Label>
                <Input type="number" step="0.01" min="0" value={taxAmount} onChange={e => setTaxAmount(parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isNew ? "Create" : "Update"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
