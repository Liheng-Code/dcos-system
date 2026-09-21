"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
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
import {
  DWL_SOURCE_TYPES,
  dwlDisplayResourceDescription,
  dwlEffectiveUnitCost,
  type DwlResource,
  type DwlSourceType,
  type DwlSupplier,
} from "@/components/qs/dwl-types";

const NEW_SUPPLIER_VALUE = "__new__";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass null to let the user pick the material inside the dialog (the
   *  "Record New Price" entry point from the Price History Records tab,
   *  which has no material pre-selected). When a real id is passed, the
   *  in-dialog picker is skipped — unchanged behavior for existing callers. */
  resourceId: string | null;
  resourceCode?: string;
  resourceUnit?: string;
  tenantId: string;
  userId: string | null;
  /** true when the current user may submit prices for approval (qs_price_approval.submit). */
  canSubmit: boolean;
  /** true when the current user may record an approved price directly (qs_libraries.can_create). */
  canRecordDirect: boolean;
  onSaved: () => void;
}

const EMPTY = {
  mode: "submit" as "submit" | "direct",
  supplier_id: "",
  new_supplier_name: "",
  source_type: "quotation" as DwlSourceType,
  currency: "USD",
  valid_from: todayIso(),
  quote_valid_until: "",
  quantity: "",
  unit_price: "",
  discount: "0",
  delivery_cost: "0",
  handling_cost: "0",
  other_charges: "0",
  tax_amount: "0",
  payment_terms: "",
  delivery_terms: "",
  lead_time_days: "",
  location: "Phnom Penh",
  source_document: "",
  quotation_ref: "",
  quotation_date: "",
  project_code: "",
  notes: "",
};

export function DwlMaterialPriceDialog({
  open, onOpenChange, resourceId, resourceCode, resourceUnit,
  tenantId, userId, canSubmit, canRecordDirect, onSaved,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [suppliers, setSuppliers] = useState<DwlSupplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });

  // Only used when resourceId is null (no material pre-selected by the
  // caller) — an in-dialog "Material Master" picker, same search+list
  // pattern already used for materials in dwl-recipe-line-form-dialog.tsx.
  const [pickedResource, setPickedResource] = useState<{ id: string; code: string; unit: string; description: string } | null>(null);
  const [materials, setMaterials] = useState<DwlResource[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({ ...EMPTY, mode: canSubmit ? "submit" : "direct" });
    setPickedResource(null);
    setMaterialSearch("");
    supabase
      .from("dwl_suppliers")
      .select("id, tenant_id, name, contact, rating, is_active")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setSuppliers((data ?? []) as DwlSupplier[]));
    if (resourceId == null) {
      setLoadingMaterials(true);
      supabase
        .from("dwl_resources")
        .select("id, tenant_id, code, category, description, unit, spec_reference, is_active, created_by, created_at, updated_at")
        .eq("is_active", true)
        .eq("category", "material")
        .order("code")
        .then(({ data, error }) => {
          if (!error && data) setMaterials(data as DwlResource[]);
          setLoadingMaterials(false);
        });
    }
  }, [open, supabase, canSubmit, resourceId]);

  const filteredMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    const pool = q
      ? materials.filter((m) => m.code.toLowerCase().includes(q) || m.description.toLowerCase().includes(q))
      : materials;
    return pool.slice(0, 50);
  }, [materials, materialSearch]);

  const effectiveResourceId = resourceId ?? pickedResource?.id ?? null;
  const effectiveResourceCode = resourceId ? (resourceCode ?? "") : (pickedResource?.code ?? "");
  const effectiveResourceUnit = resourceId ? (resourceUnit ?? "") : (pickedResource?.unit ?? "");

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const effective = useMemo(
    () =>
      dwlEffectiveUnitCost({
        unit_price: num(form.unit_price),
        discount: num(form.discount),
        delivery_cost: num(form.delivery_cost),
        handling_cost: num(form.handling_cost),
        other_charges: num(form.other_charges),
        tax_amount: num(form.tax_amount),
      }),
    [form],
  );

  async function resolveSupplierId(): Promise<string | null> {
    if (!form.supplier_id) return null;
    if (form.supplier_id !== NEW_SUPPLIER_VALUE) return form.supplier_id;
    const { data, error } = await supabase
      .from("dwl_suppliers")
      .insert({ tenant_id: tenantId, name: form.new_supplier_name.trim(), created_by: userId })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to create supplier");
    return data.id as string;
  }

  async function handleSave() {
    if (!effectiveResourceId) { toast.error("Pick a material first"); return; }
    if (!tenantId) { toast.error("No tenant assigned to your profile"); return; }
    if (!form.unit_price || num(form.unit_price) < 0) { toast.error("Enter a valid basic unit price"); return; }
    if (!form.valid_from) { toast.error("Effective date is required"); return; }
    if (form.source_type === "quotation" && !form.quote_valid_until) {
      toast.error("Quotations must carry a quote-valid-until date"); return;
    }
    if (form.supplier_id === NEW_SUPPLIER_VALUE && !form.new_supplier_name.trim()) {
      toast.error("Enter the new supplier's name"); return;
    }
    if (!/basis[:\s]/i.test(form.notes)) {
      toast.error('Notes must include a "Basis:" clause (where the price came from)'); return;
    }

    setSaving(true);
    try {
      const supplierId = await resolveSupplierId();
      const common = {
        tenant_id: tenantId,
        resource_id: effectiveResourceId,
        supplier_id: supplierId,
        unit_price: num(form.unit_price),
        discount: num(form.discount),
        delivery_cost: num(form.delivery_cost),
        handling_cost: num(form.handling_cost),
        other_charges: num(form.other_charges),
        tax_amount: num(form.tax_amount),
        quantity: form.quantity ? num(form.quantity) : null,
        currency: form.currency.trim().toUpperCase(),
        valid_from: form.valid_from,
        quote_valid_until: form.quote_valid_until || null,
        source_type: form.source_type,
        location: form.location.trim() || null,
        payment_terms: form.payment_terms.trim() || null,
        delivery_terms: form.delivery_terms.trim() || null,
        lead_time_days: form.lead_time_days ? num(form.lead_time_days) : null,
        source_document: form.source_document.trim() || null,
        quotation_ref: form.quotation_ref.trim() || null,
        quotation_date: form.quotation_date || null,
        project_code: form.project_code.trim() || null,
        notes: form.notes.trim(),
        created_by: userId,
      };

      if (form.mode === "direct") {
        const { error } = await supabase
          .from("dwl_resource_prices")
          .insert({ ...common, price_status: "approved" });
        if (error) throw new Error(error.message);
        toast.success(`Price recorded for ${effectiveResourceCode}`);
      } else {
        const { data, error } = await supabase
          .from("dwl_price_submissions")
          .insert({ ...common, status: "draft" })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "Failed to create submission");
        const { error: subErr } = await supabase.rpc("dwl_submit_price_submission", {
          p_submission_id: data.id,
        });
        if (subErr) throw new Error(subErr.message);
        toast.success("Price submitted for approval");
      }

      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save price");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{resourceId ? `Record Price — ${effectiveResourceCode}` : "Record Commercial Price Benchmark"}</DialogTitle>
          <DialogDescription>
            Prices are append-only. Effective cost = basic − discount + delivery + handling + other + tax.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {resourceId == null && (
            <div className="space-y-1">
              <Label>Material Master *</Label>
              {pickedResource ? (
                <div className="flex flex-col gap-1 rounded-lg border border-input px-2.5 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-medium">{pickedResource.code}</span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-blue-600 hover:underline"
                      onClick={() => setPickedResource(null)}
                    >
                      Change
                    </button>
                  </div>
                  <p className="whitespace-normal break-words">
                    {dwlDisplayResourceDescription(pickedResource.description)} <span className="text-muted-foreground">({pickedResource.unit})</span>
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={materialSearch}
                      onChange={(e) => setMaterialSearch(e.target.value)}
                      placeholder={loadingMaterials ? "Loading materials…" : `Search ${materials.length} materials by code or description…`}
                      className="pl-8"
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-input">
                    {filteredMaterials.length === 0 ? (
                      <p className="p-3 text-center text-xs text-muted-foreground">No matching materials</p>
                    ) : (
                      filteredMaterials.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => setPickedResource({ id: m.id, code: m.code, unit: m.unit, description: m.description })}
                          className="flex w-full flex-col gap-0.5 border-b border-border/50 px-2.5 py-2 text-left text-xs last:border-0 hover:bg-accent"
                        >
                          <span className="font-mono font-medium">{m.code}</span>
                          <span className="whitespace-normal break-words text-muted-foreground">{dwlDisplayResourceDescription(m.description)}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* mode */}
          <div className="flex gap-4 rounded-lg border border-border p-2 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={form.mode === "submit"} disabled={!canSubmit}
                onChange={() => set("mode", "submit")} />
              Submit for approval
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" name="mode" checked={form.mode === "direct"} disabled={!canRecordDirect}
                onChange={() => set("mode", "direct")} />
              Record directly (approved)
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Source Type *</Label>
              <select value={form.source_type}
                onChange={(e) => set("source_type", e.target.value as DwlSourceType)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                {DWL_SOURCE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Supplier</Label>
              <select value={form.supplier_id} onChange={(e) => set("supplier_id", e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                <option value="">— None —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value={NEW_SUPPLIER_VALUE}>+ Add new supplier…</option>
              </select>
            </div>
          </div>

          {form.supplier_id === NEW_SUPPLIER_VALUE && (
            <div className="space-y-1">
              <Label>New Supplier Name *</Label>
              <Input value={form.new_supplier_name} onChange={(e) => set("new_supplier_name", e.target.value)} />
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Basic Unit Price * <span className="text-muted-foreground">/{effectiveResourceUnit}</span></Label>
              <Input inputMode="decimal" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Currency *</Label>
              <Input maxLength={3} value={form.currency} onChange={(e) => set("currency", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Quantity</Label>
              <Input inputMode="decimal" value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Lead Time (days)</Label>
              <Input inputMode="numeric" value={form.lead_time_days} onChange={(e) => set("lead_time_days", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label>Discount</Label>
              <Input inputMode="decimal" value={form.discount} onChange={(e) => set("discount", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Delivery</Label>
              <Input inputMode="decimal" value={form.delivery_cost} onChange={(e) => set("delivery_cost", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Handling</Label>
              <Input inputMode="decimal" value={form.handling_cost} onChange={(e) => set("handling_cost", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Other</Label>
              <Input inputMode="decimal" value={form.other_charges} onChange={(e) => set("other_charges", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Tax</Label>
              <Input inputMode="decimal" value={form.tax_amount} onChange={(e) => set("tax_amount", e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            Effective Unit Cost:{" "}
            <span className="font-mono font-semibold">
              {form.currency.toUpperCase()} {effective.toFixed(4)}
            </span>{" "}
            <span className="text-muted-foreground">/{effectiveResourceUnit}</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Effective Date *</Label>
              <Input type="date" value={form.valid_from} onChange={(e) => set("valid_from", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Quote Valid Until</Label>
              <Input type="date" value={form.quote_valid_until} onChange={(e) => set("quote_valid_until", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Quotation Date</Label>
              <Input type="date" value={form.quotation_date} onChange={(e) => set("quotation_date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Quotation Ref</Label>
              <Input value={form.quotation_ref} onChange={(e) => set("quotation_ref", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Project Code</Label>
              <Input value={form.project_code} onChange={(e) => set("project_code", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Payment Terms</Label>
              <Input value={form.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Delivery Terms</Label>
              <Input value={form.delivery_terms} onChange={(e) => set("delivery_terms", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Source Document</Label>
              <Input value={form.source_document} onChange={(e) => set("source_document", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes * <span className="font-normal text-muted-foreground">(must include a &quot;Basis:&quot; clause)</span></Label>
            <Input value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Basis: quotation QT-2026-011 (2026-08-14) item 1." />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving || !effectiveResourceId || (!canSubmit && !canRecordDirect)}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {form.mode === "direct" ? "Record Price" : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
