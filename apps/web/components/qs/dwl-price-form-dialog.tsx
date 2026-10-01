"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { insertDwlResourcePrices, insertDwlSupplierReturning, listDwlSuppliersWithIsActive } from "@/lib/qs/qs-queries";
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
import { DWL_SOURCE_TYPES } from "@/components/qs/dwl-types";
import type { DwlResource, DwlSupplier } from "@/components/qs/dwl-types";

const NEW_SUPPLIER_VALUE = "__new__";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const priceFormSchema = z
  .object({
    unit_price: z
      .string()
      .trim()
      .min(1, "Unit price is required")
      .regex(/^\d+(\.\d{1,4})?$/, "Enter a valid non-negative amount (up to 4 decimals)"),
    currency: z
      .string()
      .trim()
      .min(3, "3-letter currency code required")
      .max(3, "3-letter currency code required")
      .transform((v) => v.toUpperCase()),
    valid_from: z.string().trim().min(1, "Valid-from date is required"),
    quote_valid_until: z.string().trim().optional(),
    source_type: z.enum(["quotation", "purchase", "market_survey", "estimate"], {
      message: "Source type is required",
    }),
    supplier_id: z.string(),
    new_supplier_name: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.quote_valid_until &&
      data.valid_from &&
      data.quote_valid_until < data.valid_from
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["quote_valid_until"],
        message: "Quote-valid-until cannot be before valid-from",
      });
    }
    if (data.supplier_id === NEW_SUPPLIER_VALUE && !data.new_supplier_name?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["new_supplier_name"],
        message: "Enter the new supplier's name",
      });
    }
    // Quotations should carry a validity date per SOP §7 Step 1.4.3.
    if (data.source_type === "quotation" && !data.quote_valid_until) {
      ctx.addIssue({
        code: "custom",
        path: ["quote_valid_until"],
        message: "Quotations must carry a quote-valid-until date",
      });
    }
  });

type PriceFormValues = z.infer<typeof priceFormSchema>;

interface DwlPriceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: DwlResource | null;
  tenantId: string;
  userId: string | null;
  onCreated: () => void;
}

export function DwlPriceFormDialog({
  open,
  onOpenChange,
  resource,
  tenantId,
  userId,
  onCreated,
}: DwlPriceFormDialogProps) {
  const [suppliers, setSuppliers] = useState<DwlSupplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PriceFormValues>({
    resolver: zodResolver(priceFormSchema),
    defaultValues: {
      unit_price: "",
      currency: "USD",
      valid_from: todayIso(),
      quote_valid_until: "",
      source_type: "quotation",
      supplier_id: "",
      new_supplier_name: "",
      notes: "",
    },
  });

  const supplierId = watch("supplier_id");

  useEffect(() => {
    if (!open) return;
    reset({
      unit_price: "",
      currency: "USD",
      valid_from: todayIso(),
      quote_valid_until: "",
      source_type: "quotation",
      supplier_id: "",
      new_supplier_name: "",
      notes: "",
    });
    setLoadingSuppliers(true);
    listDwlSuppliersWithIsActive()
      .then(({ data, error }) => {
        if (!error && data) setSuppliers(data as DwlSupplier[]);
        setLoadingSuppliers(false);
      });
  }, [open, reset]);

  async function onSubmit(values: PriceFormValues) {
    if (!resource) return;
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot add a price");
      return;
    }

    let supplierId = values.supplier_id || null;

    if (supplierId === NEW_SUPPLIER_VALUE) {
      const { data: newSupplier, error: supplierError } = await insertDwlSupplierReturning({
          tenant_id: tenantId,
          name: values.new_supplier_name!.trim(),
          created_by: userId,
        });
      if (supplierError || !newSupplier) {
        toast.error(supplierError?.message ?? "Failed to create supplier");
        return;
      }
      supplierId = newSupplier.id as string;
    }

    const payload = {
      tenant_id: tenantId,
      resource_id: resource.id,
      supplier_id: supplierId,
      unit_price: Number(values.unit_price),
      currency: values.currency,
      valid_from: values.valid_from,
      quote_valid_until: values.quote_valid_until || null,
      source_type: values.source_type,
      notes: values.notes?.trim() || null,
      created_by: userId,
    };

    const { error } = await insertDwlResourcePrices(payload);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`Price added for ${resource.code}`);
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Price{resource ? ` — ${resource.code}` : ""}</DialogTitle>
          <DialogDescription>
            {resource?.description ?? "Prices are append-only: this adds a new price row and never edits or removes an existing one."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="unit_price">Unit Price *</Label>
              <Input id="unit_price" inputMode="decimal" placeholder="0.0000" {...register("unit_price")} />
              {errors.unit_price && (
                <p className="text-xs text-destructive">{errors.unit_price.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="currency">Currency *</Label>
              <Input id="currency" placeholder="USD" maxLength={3} {...register("currency")} />
              {errors.currency && (
                <p className="text-xs text-destructive">{errors.currency.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="valid_from">Valid From *</Label>
              <Input id="valid_from" type="date" {...register("valid_from")} />
              {errors.valid_from && (
                <p className="text-xs text-destructive">{errors.valid_from.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="quote_valid_until">Quote Valid Until</Label>
              <Input id="quote_valid_until" type="date" {...register("quote_valid_until")} />
              {errors.quote_valid_until && (
                <p className="text-xs text-destructive">{errors.quote_valid_until.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="source_type">Source Type *</Label>
            <select
              id="source_type"
              {...register("source_type")}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {DWL_SOURCE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            {errors.source_type && (
              <p className="text-xs text-destructive">{errors.source_type.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="supplier_id">Supplier</Label>
            <select
              id="supplier_id"
              {...register("supplier_id")}
              disabled={loadingSuppliers}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="">— None —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SUPPLIER_VALUE}>+ Add new supplier…</option>
            </select>
          </div>

          {supplierId === NEW_SUPPLIER_VALUE && (
            <div className="space-y-1">
              <Label htmlFor="new_supplier_name">New Supplier Name *</Label>
              <Input id="new_supplier_name" placeholder="Supplier company name" {...register("new_supplier_name")} />
              {errors.new_supplier_name && (
                <p className="text-xs text-destructive">{errors.new_supplier_name.message}</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" placeholder="Basis, original currency if converted, etc." {...register("notes")} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !resource}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add Price
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
