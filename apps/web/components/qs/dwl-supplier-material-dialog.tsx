"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DwlSupplier } from "@/components/qs/dwl-types";

const NEW_SUPPLIER_VALUE = "__new__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: string;
  resourceCode: string;
  tenantId: string;
  userId: string | null;
  onSaved: () => void;
}

export function DwlSupplierMaterialDialog({
  open, onOpenChange, resourceId, resourceCode, tenantId, userId, onSaved,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [suppliers, setSuppliers] = useState<DwlSupplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplier_id: "",
    new_supplier_name: "",
    supplier_product_code: "",
    supplier_product_name: "",
    brand: "",
    manufacturer: "",
    specification: "",
    standard: "",
    package_size: "",
    moq: "",
    lead_time_days: "",
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({
      supplier_id: "", new_supplier_name: "", supplier_product_code: "", supplier_product_name: "",
      brand: "", manufacturer: "", specification: "", standard: "", package_size: "",
      moq: "", lead_time_days: "", is_active: true, notes: "",
    });
    supabase
      .from("dwl_suppliers")
      .select("id, tenant_id, name, contact, rating, is_active")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setSuppliers((data ?? []) as DwlSupplier[]));
  }, [open, supabase]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!tenantId) { toast.error("No tenant assigned to your profile"); return; }
    if (!form.supplier_id) { toast.error("Select a supplier"); return; }
    if (form.supplier_id === NEW_SUPPLIER_VALUE && !form.new_supplier_name.trim()) {
      toast.error("Enter the new supplier's name"); return;
    }

    setSaving(true);
    try {
      let supplierId = form.supplier_id;
      if (supplierId === NEW_SUPPLIER_VALUE) {
        const { data, error } = await supabase
          .from("dwl_suppliers")
          .insert({ tenant_id: tenantId, name: form.new_supplier_name.trim(), created_by: userId })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Failed to create supplier");
        supplierId = data.id as string;
      }

      const { error } = await supabase.from("dwl_supplier_materials").insert({
        tenant_id: tenantId,
        supplier_id: supplierId,
        resource_id: resourceId,
        supplier_product_code: form.supplier_product_code.trim() || null,
        supplier_product_name: form.supplier_product_name.trim() || null,
        brand: form.brand.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        specification: form.specification.trim() || null,
        standard: form.standard.trim() || null,
        package_size: form.package_size.trim() || null,
        moq: form.moq ? Number(form.moq) : null,
        lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
        created_by: userId,
      });
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message)) {
          throw new Error("This supplier is already linked to this material");
        }
        throw new Error(error.message);
      }

      toast.success("Supplier linked to material");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to link supplier");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Link Supplier — {resourceCode}</DialogTitle>
          <DialogDescription>
            Record that a supplier offers this material, with their product code and terms.
            One supplier can be linked once per material.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Supplier *</Label>
            <select
              value={form.supplier_id}
              onChange={(e) => set("supplier_id", e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">— Select —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value={NEW_SUPPLIER_VALUE}>+ Add new supplier…</option>
            </select>
          </div>

          {form.supplier_id === NEW_SUPPLIER_VALUE && (
            <div className="space-y-1">
              <Label>New Supplier Name *</Label>
              <Input value={form.new_supplier_name} onChange={(e) => set("new_supplier_name", e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Supplier Product Code</Label>
              <Input value={form.supplier_product_code} onChange={(e) => set("supplier_product_code", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Supplier Product Name</Label>
              <Input value={form.supplier_product_name} onChange={(e) => set("supplier_product_name", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Brand</Label>
              <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Manufacturer</Label>
              <Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Specification Ref</Label>
              <Input value={form.specification} onChange={(e) => set("specification", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Standard</Label>
              <Input value={form.standard} onChange={(e) => set("standard", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Package Size</Label>
              <Input value={form.package_size} onChange={(e) => set("package_size", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Min Order Qty</Label>
              <Input inputMode="decimal" value={form.moq} onChange={(e) => set("moq", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Lead Time (days)</Label>
              <Input inputMode="numeric" value={form.lead_time_days} onChange={(e) => set("lead_time_days", e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="sm_active" type="checkbox" className="size-4 rounded border-input"
              checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            <Label htmlFor="sm_active" className="font-normal">Active link</Label>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Link Supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
