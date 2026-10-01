"use client";

import { useState } from "react";
import { insertSupplier, updateSupplierById } from "@/lib/procurement/procurement-service";
import { X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Supplier {
  id: string;
  supplier_code: string;
  supplier_name: string;
  supplier_type: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  currency: string;
  payment_terms: string | null;
  status: string;
  notes: string | null;
}

interface SupplierFormProps {
  supplier: Supplier | null;
  onClose: () => void;
  onSave: () => void;
}

export function SupplierForm({ supplier, onClose, onSave }: SupplierFormProps) {
  const [form, setForm] = useState({
    supplier_code: supplier?.supplier_code ?? "",
    supplier_name: supplier?.supplier_name ?? "",
    supplier_type: supplier?.supplier_type ?? "",
    contact_person: supplier?.contact_person ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
    address: supplier?.address ?? "",
    tax_id: supplier?.tax_id ?? "",
    bank_name: supplier?.bank_name ?? "",
    bank_account: supplier?.bank_account ?? "",
    currency: supplier?.currency ?? "USD",
    payment_terms: supplier?.payment_terms ?? "",
    status: supplier?.status ?? "active",
    notes: supplier?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier_code.trim() || !form.supplier_name.trim()) {
      toast.error("Supplier code and name are required");
      return;
    }
    setSaving(true);

    if (supplier) {
      const { error } = await updateSupplierById(form, supplier.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Supplier updated");
    } else {
      const { error } = await insertSupplier(form);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Supplier created");
    }
    setSaving(false);
    onSave();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-background shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">{supplier ? "Edit Supplier" : "Add Supplier"}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Supplier Code *</Label>
                  <Input value={form.supplier_code} onChange={e => update("supplier_code", e.target.value)} placeholder="e.g. SUP-001" />
                </div>
                <div className="space-y-1.5">
                  <Label>Supplier Name *</Label>
                  <Input value={form.supplier_name} onChange={e => update("supplier_name", e.target.value)} placeholder="Company name" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Input value={form.supplier_type} onChange={e => update("supplier_type", e.target.value)} placeholder="e.g. Manufacturer, Distributor" />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Input value={form.currency} onChange={e => update("currency", e.target.value)} placeholder="USD" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Contact Person</Label>
                  <Input value={form.contact_person} onChange={e => update("contact_person", e.target.value)} placeholder="Full name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input value={form.email} onChange={e => update("email", e.target.value)} placeholder="email@supplier.com" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="Phone number" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tax ID</Label>
                  <Input value={form.tax_id} onChange={e => update("tax_id", e.target.value)} placeholder="Tax registration" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={form.address} onChange={e => update("address", e.target.value)} placeholder="Business address" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Bank Name</Label>
                  <Input value={form.bank_name} onChange={e => update("bank_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bank Account</Label>
                  <Input value={form.bank_account} onChange={e => update("bank_account", e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Input value={form.payment_terms} onChange={e => update("payment_terms", e.target.value)} placeholder="e.g. Net 30" />
              </div>

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => update("notes", e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.status} onChange={e => update("status", e.target.value)}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                  <option value="blacklisted">Blacklisted</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {supplier ? "Update Supplier" : "Create Supplier"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
