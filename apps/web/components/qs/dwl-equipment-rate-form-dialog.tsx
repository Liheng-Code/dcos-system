"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { insertDwlEquipmentAttribute, insertDwlResourcePrice, insertDwlResourceReturning, updateDwlResourceById, upsertDwlEquipmentAttribute } from "@/lib/qs/qs-queries";
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
  DWL_EQUIPMENT_RATE_BASES, DWL_EQUIPMENT_RATE_BASIS_LABEL, DWL_UNITS, type DwlEquipmentRateRow,
} from "@/components/qs/dwl-types";

// Locked spine coding standard (dwl-resource-form-dialog.tsx), narrowed to the
// "E-" equipment prefix, as Labor Rates narrows it to "L-".
const CODE_PATTERN = /^E-[A-Z]{3}-\d{3}$/;
const NUM_RE = /^\d*\.?\d+$/;
const optionalNum = z.string().trim().refine((v) => v === "" || NUM_RE.test(v), "Enter a non-negative number");

// rate_basis → the resource unit the price is quoted in.
const BASIS_UNIT: Record<string, string> = { hour: "hr", day: "day", week: "week", month: "month" };

const equipmentFormSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, "Equipment Code is required").regex(CODE_PATTERN, "Code must match E-GRP-NNN, e.g. E-EXC-001"),
  description: z.string().trim().min(6, "Describe the plant item (min 6 characters)"),
  ownership: z.enum(["hired", "owned"]),
  rate_basis: z.enum(DWL_EQUIPMENT_RATE_BASES),
  output_unit: z.string().trim(),
  rate: z.string().trim().min(1, "Rate is required").regex(NUM_RE, "Enter a non-negative number"),
  capacity_model: z.string().trim().optional(),
  operator_included: z.boolean(),
  fuel_included: z.boolean(),
  fuel_l_per_day: optionalNum,
  min_hire_qty: optionalNum,
  mobilisation_cost: optionalNum,
  notes: z.string().trim().optional(),
}).refine((v) => v.rate_basis !== "unit_output" || v.output_unit !== "", {
  path: ["output_unit"], message: "Choose the unit of output (e.g. m3)",
});

type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

const DEFAULT_VALUES: EquipmentFormValues = {
  code: "", description: "", ownership: "hired", rate_basis: "day", output_unit: "", rate: "",
  capacity_model: "", operator_included: false, fuel_included: false,
  fuel_l_per_day: "", min_hire_qty: "", mobilisation_cost: "", notes: "",
};

const toNum = (v: string | undefined) => (v == null || v.trim() === "" ? null : Number(v));
const toStr = (v: number | null) => (v == null ? "" : String(v));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  editRow?: DwlEquipmentRateRow | null;
  onSaved: () => void;
}

export function DwlEquipmentRateFormDialog({ open, onOpenChange, tenantId, userId, editRow, onSaved }: Props) {
  const isEdit = editRow != null;

  const {
    register, handleSubmit, setValue, setError, reset, control,
    formState: { errors, isSubmitting },
  } = useForm<EquipmentFormValues>({ resolver: zodResolver(equipmentFormSchema), defaultValues: DEFAULT_VALUES });

  const rateBasis = useWatch({ control, name: "rate_basis" });
  const fuelIncluded = useWatch({ control, name: "fuel_included" });

  useEffect(() => {
    if (!open) return;
    if (editRow) {
      const basis = editRow.rate_basis ?? "day";
      reset({
        code: editRow.code,
        description: editRow.description,
        ownership: editRow.ownership ?? "hired",
        rate_basis: basis,
        output_unit: basis === "unit_output" ? editRow.unit : "",
        rate: toStr(editRow.rate),
        capacity_model: editRow.capacity_model ?? "",
        operator_included: editRow.operator_included,
        fuel_included: editRow.fuel_included,
        fuel_l_per_day: toStr(editRow.fuel_l_per_day),
        min_hire_qty: toStr(editRow.min_hire_qty),
        mobilisation_cost: toStr(editRow.mobilisation_cost),
        notes: editRow.notes ?? "",
      });
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [open, editRow, reset]);

  async function onSubmit(values: EquipmentFormValues) {
    if (!tenantId) { toast.error("No tenant assigned to your profile — cannot save equipment"); return; }

    const unit = values.rate_basis === "unit_output" ? values.output_unit : BASIS_UNIT[values.rate_basis];
    const rate = Number(values.rate);
    const attrs = {
      tenant_id: tenantId,
      ownership: values.ownership,
      rate_basis: values.rate_basis,
      operator_included: values.operator_included,
      fuel_included: values.fuel_included,
      fuel_l_per_day: values.fuel_included ? null : toNum(values.fuel_l_per_day),
      min_hire_qty: toNum(values.min_hire_qty),
      mobilisation_cost: toNum(values.mobilisation_cost),
      capacity_model: values.capacity_model?.trim() || null,
      notes: values.notes?.trim() || null,
    };

    let resourceId: string;
    if (isEdit && editRow) {
      resourceId = editRow.resource_id;
      const { error: resErr } = await updateDwlResourceById({ description: values.description.trim(), unit, updated_at: new Date().toISOString() }, resourceId);
      if (resErr) { toast.error(resErr.message); return; }
      const { error: attrErr } = await upsertDwlEquipmentAttribute({ resource_id: resourceId, ...attrs, updated_by: userId });
      if (attrErr) { toast.error(attrErr.message); return; }
    } else {
      const { data: resourceRow, error: resErr } = await insertDwlResourceReturning({ tenant_id: tenantId, category: "equipment", code: values.code, description: values.description.trim(), unit, created_by: userId });
      if (resErr || !resourceRow) {
        if (resErr?.code === "23505" || /unique/i.test(resErr?.message ?? "")) setError("code", { message: "A resource with this code already exists" });
        else toast.error(resErr?.message ?? "Failed to create the equipment");
        return;
      }
      resourceId = resourceRow.id as string;
      const { error: attrErr } = await insertDwlEquipmentAttribute({ resource_id: resourceId, ...attrs, created_by: userId });
      if (attrErr) { toast.error(attrErr.message); return; }
    }

    // Rates are append-only: record a new price only when the rate changed.
    if (!isEdit || Math.abs((editRow?.rate ?? -1) - rate) > 0.0001) {
      const { error: priceErr } = await insertDwlResourcePrice({
        tenant_id: tenantId,
        resource_id: resourceId,
        unit_price: rate,
        currency: editRow?.currency ?? "USD",
        valid_from: new Date().toISOString().slice(0, 10),
        source_type: "estimate",
        price_status: "approved",
        created_by: userId,
      });
      if (priceErr) { toast.error(priceErr.message); return; }
    }

    toast.success(isEdit ? `Equipment ${editRow?.code} updated` : `Equipment ${values.code} registered`);
    onSaved();
    onOpenChange(false);
  }

  const selectClass = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Equipment Rate" : "Add Equipment Rate"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Details update in place. Changing the rate appends a new price record — the old one stays in history."
              : "Registers a new plant / equipment resource and its starting rate together."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="code">Equipment Code *</Label>
              <Input
                id="code"
                placeholder="E-EXC-001"
                disabled={isEdit}
                {...register("code")}
                onChange={(e) => setValue("code", e.target.value.toUpperCase(), { shouldValidate: true })}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="ownership">Ownership *</Label>
              <select id="ownership" {...register("ownership")} className={selectClass}>
                <option value="hired">Hired (rental)</option>
                <option value="owned">Company-owned</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description *</Label>
            <Input id="description" placeholder="e.g. Excavator PC200, 0.8 m3 bucket" {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="rate_basis">Rate Basis *</Label>
              <select id="rate_basis" {...register("rate_basis")} className={selectClass}>
                {DWL_EQUIPMENT_RATE_BASES.map((b) => <option key={b} value={b}>{DWL_EQUIPMENT_RATE_BASIS_LABEL[b]}</option>)}
              </select>
            </div>
            {rateBasis === "unit_output" ? (
              <div className="space-y-1">
                <Label htmlFor="output_unit">Unit of Output *</Label>
                <select id="output_unit" {...register("output_unit")} className={selectClass}>
                  <option value="">Select…</option>
                  {DWL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                {errors.output_unit && <p className="text-xs text-destructive">{errors.output_unit.message}</p>}
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="min_hire_qty">Minimum Hire</Label>
                <Input id="min_hire_qty" inputMode="decimal" placeholder={`e.g. 1 ${BASIS_UNIT[rateBasis] ?? ""}`} {...register("min_hire_qty")} />
                {errors.min_hire_qty && <p className="text-xs text-destructive">{errors.min_hire_qty.message}</p>}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="rate">Rate ($) *</Label>
              <Input id="rate" inputMode="decimal" placeholder="85" {...register("rate")} />
              {errors.rate && <p className="text-xs text-destructive">{errors.rate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="capacity_model">Capacity / Model</Label>
              <Input id="capacity_model" placeholder="e.g. 25 t, 60 kVA, 350 L drum" {...register("capacity_model")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mobilisation_cost">Mobilisation ($, one-off)</Label>
              <Input id="mobilisation_cost" inputMode="decimal" placeholder="0" {...register("mobilisation_cost")} />
              {errors.mobilisation_cost && <p className="text-xs text-destructive">{errors.mobilisation_cost.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 items-end gap-3">
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" {...register("operator_included")} /> Operator included
            </label>
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" {...register("fuel_included")} /> Fuel included
            </label>
            <div className="space-y-1">
              <Label htmlFor="fuel_l_per_day">Fuel (L/day)</Label>
              <Input id="fuel_l_per_day" inputMode="decimal" disabled={fuelIncluded} placeholder={fuelIncluded ? "In rate" : "e.g. 80"} {...register("fuel_l_per_day")} />
              {errors.fuel_l_per_day && <p className="text-xs text-destructive">{errors.fuel_l_per_day.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" placeholder="e.g. Rate excludes transport to Siem Reap" {...register("notes")} />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Equipment Rate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
