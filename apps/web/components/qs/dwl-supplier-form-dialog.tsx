"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
  DWL_PRICE_COMPETITIVENESS,
  DWL_SUPPLIER_TYPES,
  type DwlSupplierRow,
  type DwlVendorKind,
} from "@/components/qs/dwl-types";

// Supplier Code is deliberately free text, not a locked/parsed identifier —
// see 20260910000003_dwl_supplier_profiles_and_materials.sql's own note
// ("NOT spine-unique — see DCOS-DS-12-012 §9 Q5"), unlike the Material
// Master's locked MAT-<GROUP>-NNN code. The Sparkle button just suggests
// the next flat SUP-NNNN number; typing over it is fine.
const supplierFormSchema = z.object({
  supplier_code: z.string().trim().min(1, "Supplier code is required"),
  supplier_type: z.string().optional(),
  name: z.string().trim().min(2, "Company registered name is required"),
  contact_person: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  payment_terms: z.string().trim().optional(),
  delivery_terms: z.string().trim().optional(),
  lead_time_days: z.string().trim().optional(),
  price_competitiveness: z.string().optional(),
  overall_rating: z.string().trim().optional(),
  reliability_rating: z.string().trim().optional(),
  is_active: z.enum(["active", "inactive"]),
  notes: z.string().trim().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

interface DwlSupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onSaved: () => void;
  editRow?: DwlSupplierRow | null;
  // "material_supplier" (default) renders the Supplier Master dialog;
  // "subcontractor" reuses the identical form body for the Subcontractor
  // Trade Rates Library's "New Subcontractor" dialog — same underlying
  // dwl_suppliers/dwl_supplier_profiles shape, only the code prefix,
  // labels, and stored vendor_kind differ. See
  // 20260910000034_dwl_subcon_rates_schema.sql.
  vendorKind?: DwlVendorKind;
}

const SELECT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const TEXTAREA_CLASS =
  "w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function ratingBand(v: number): "A" | "B" | "C" {
  if (v >= 4.5) return "A";
  if (v >= 3.5) return "B";
  return "C";
}

export function DwlSupplierFormDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  onSaved,
  editRow,
  vendorKind = "material_supplier",
}: DwlSupplierFormDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const isEdit = editRow !== null && editRow !== undefined;
  const isSubcon = vendorKind === "subcontractor";
  const codePrefix = isSubcon ? "SUB-" : "SUP-";
  const noun = isSubcon ? "Subcontractor" : "Supplier";
  const [suggesting, setSuggesting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      supplier_code: "",
      supplier_type: "Distributor",
      name: "",
      contact_person: "",
      phone: "",
      payment_terms: "",
      delivery_terms: "",
      lead_time_days: "",
      price_competitiveness: "",
      overall_rating: "",
      reliability_rating: "",
      is_active: "active",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editRow) {
      reset({
        supplier_code: editRow.supplier_code ?? "",
        supplier_type: editRow.supplier_type ?? "Distributor",
        name: editRow.name,
        contact_person: editRow.contact_person ?? "",
        phone: editRow.phone ?? "",
        payment_terms: editRow.payment_terms ?? "",
        delivery_terms: editRow.delivery_terms ?? "",
        lead_time_days: editRow.lead_time_days != null ? String(editRow.lead_time_days) : "",
        price_competitiveness: editRow.price_competitiveness ?? "",
        overall_rating: editRow.overall_rating != null ? String(editRow.overall_rating) : "",
        reliability_rating: editRow.reliability_rating ?? "",
        is_active: editRow.is_active ? "active" : "inactive",
        notes: editRow.notes ?? "",
      });
    } else {
      reset({
        supplier_code: codePrefix, supplier_type: "Distributor", name: "", contact_person: "", phone: "",
        payment_terms: "30 Days Net", delivery_terms: "", lead_time_days: "", price_competitiveness: "",
        overall_rating: "", reliability_rating: "", is_active: "active", notes: "",
      });
      void suggestNextCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editRow, reset]);

  async function suggestNextCode() {
    setSuggesting(true);
    const { data, error } = await supabase
      .from("dwl_supplier_profiles")
      .select("supplier_code")
      .eq("vendor_kind", vendorKind);
    setSuggesting(false);
    if (error) return;
    let max = 0;
    const re = new RegExp(`^${codePrefix}(\\d{4,})$`);
    for (const row of (data ?? []) as { supplier_code: string | null }[]) {
      const m = row.supplier_code?.match(re);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const next = String(max + 1).padStart(4, "0");
    setValue("supplier_code", `${codePrefix}${next}`, { shouldValidate: true });
  }

  async function onSubmit(values: SupplierFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save a supplier");
      return;
    }

    const overallRating = values.overall_rating ? Number(values.overall_rating) : null;
    const leadTimeDays = values.lead_time_days ? Number(values.lead_time_days) : null;
    const isActive = values.is_active === "active";

    const profilePayload = {
      supplier_code: values.supplier_code.trim(),
      supplier_type: isSubcon ? null : values.supplier_type || null,
      contact_person: values.contact_person?.trim() || null,
      phone: values.phone?.trim() || null,
      payment_terms: values.payment_terms?.trim() || null,
      delivery_terms: values.delivery_terms?.trim() || null,
      lead_time_days: leadTimeDays,
      price_competitiveness: values.price_competitiveness || null,
      overall_rating: overallRating,
      reliability_rating: values.reliability_rating?.trim() || null,
      lifecycle_status: values.is_active,
      notes: values.notes?.trim() || null,
    };

    if (isEdit && editRow) {
      const { error: supErr } = await supabase
        .from("dwl_suppliers")
        .update({
          name: values.name.trim(),
          contact: values.contact_person?.trim() || null,
          rating: overallRating != null ? ratingBand(overallRating) : editRow.rating,
          is_active: isActive,
        })
        .eq("id", editRow.supplier_id);
      if (supErr) {
        toast.error(supErr.message);
        return;
      }
      const { error: profErr } = await supabase
        .from("dwl_supplier_profiles")
        .update({ ...profilePayload, updated_at: new Date().toISOString() })
        .eq("supplier_id", editRow.supplier_id);
      if (profErr) {
        toast.error(profErr.message);
        return;
      }
      toast.success(`${noun} ${values.name.trim()} updated`);
      onSaved();
      onOpenChange(false);
      return;
    }

    const { data: supplier, error: supErr } = await supabase
      .from("dwl_suppliers")
      .insert({
        tenant_id: tenantId,
        name: values.name.trim(),
        contact: values.contact_person?.trim() || null,
        rating: overallRating != null ? ratingBand(overallRating) : "B",
        is_active: isActive,
        created_by: userId,
      })
      .select("id")
      .single();
    if (supErr || !supplier) {
      toast.error(supErr?.message ?? "Failed to create supplier");
      return;
    }

    const supplierId = supplier.id as string;
    const { error: profErr } = await supabase.from("dwl_supplier_profiles").insert({
      supplier_id: supplierId,
      tenant_id: tenantId,
      vendor_kind: vendorKind,
      ...profilePayload,
      created_by: userId,
    });
    if (profErr) {
      // Two-step spine+companion insert — never leave an orphaned dwl_suppliers row.
      await supabase.from("dwl_suppliers").delete().eq("id", supplierId);
      if (profErr.code === "23505" || /unique/i.test(profErr.message)) {
        setError("supplier_code", { message: `A ${noun.toLowerCase()} with this code already exists` });
      } else {
        toast.error(profErr.message);
      }
      return;
    }

    toast.success(`${noun} ${values.name.trim()} registered`);
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${noun}` : `Register New ${isSubcon ? "Subcontractor" : "Commercial Vendor"}`}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update this ${noun.toLowerCase()}'s classification, terms and performance rating.`
              : `Add a new ${noun.toLowerCase()} with its classification, terms and performance rating.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className={cn("grid gap-3", isSubcon ? "grid-cols-1" : "grid-cols-2")}>
            <div className="space-y-1">
              <Label htmlFor="supplier_code">{noun} Code *</Label>
              <div className="flex gap-1.5">
                <Input
                  id="supplier_code"
                  placeholder={`${codePrefix}0001`}
                  {...register("supplier_code")}
                  onChange={(e) => setValue("supplier_code", e.target.value.toUpperCase(), { shouldValidate: true })}
                />
                {!isEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void suggestNextCode()} disabled={suggesting} title="Suggest next code">
                    {suggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
              {errors.supplier_code && <p className="text-xs text-destructive">{errors.supplier_code.message}</p>}
            </div>

            {!isSubcon && (
              <div className="space-y-1">
                <Label htmlFor="supplier_type">Vendor Type</Label>
                <select id="supplier_type" {...register("supplier_type")} className={SELECT_CLASS}>
                  {DWL_SUPPLIER_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="name">Company Registered Name *</Label>
            <Input id="name" placeholder="e.g. Siam City Cement (Cambodia) Ltd" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input id="contact_person" {...register("contact_person")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Input id="payment_terms" placeholder="30 Days Net" {...register("payment_terms")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="delivery_terms">Delivery Terms</Label>
              <Input id="delivery_terms" placeholder="FOB Site" {...register("delivery_terms")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lead_time_days">Lead Time (Days)</Label>
              <Input id="lead_time_days" type="number" min="0" placeholder="7" {...register("lead_time_days")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="price_competitiveness">Price Competitiveness</Label>
              <select id="price_competitiveness" {...register("price_competitiveness")} className={SELECT_CLASS}>
                <option value="">— None —</option>
                {DWL_PRICE_COMPETITIVENESS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="overall_rating">Star Rating (1-5)</Label>
              <Input id="overall_rating" type="number" min="1" max="5" step="0.1" placeholder="4.8" {...register("overall_rating")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reliability_rating">Reliability Rating (1-5)</Label>
              <Input id="reliability_rating" placeholder="4.8" {...register("reliability_rating")} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="is_active">Status</Label>
            <select id="is_active" {...register("is_active")} className={SELECT_CLASS}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Reliability &amp; Performance Assessment Note</Label>
            <textarea
              id="notes"
              className={TEXTAREA_CLASS}
              placeholder="e.g. Consistently delivers on schedule with complete quality assurance and test certs..."
              {...register("notes")}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? `Update ${noun}` : `Save ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
