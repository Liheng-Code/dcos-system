"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { insertDwlLaborRateAttribute, insertDwlResourcePrice, insertDwlResourceReturning, updateDwlResourceById, upsertDwlLaborRateAttribute } from "@/lib/qs/qs-queries";
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
import { DWL_LABOR_BUILD_UP_DEFAULTS, DWL_LABOR_SKILL_LEVELS, type DwlLaborRateRow } from "@/components/qs/dwl-types";

// Same locked spine coding standard every resource in this library uses
// (dwl-resource-form-dialog.tsx's CODE_PATTERN), narrowed to the "L-" labor
// prefix — kept as one system rather than the mockup's own "LAB-XXX-NN"
// shorthand, so Labor Rates codes stay consistent with Material Master /
// Price History / everywhere else a resource code is issued.
const CODE_PATTERN = /^L-[A-Z]{3}-\d{3}$/;
const RATE_BASIS_UNITS = ["day", "month", "hr"] as const;
const NUM_RE = /^\d*\.?\d+$/;
const optionalNum = z.string().trim().refine((v) => v === "" || NUM_RE.test(v), "Enter a non-negative number");
const BUILD_UP_PCT = ["ot_allowance_pct", "nssf_employer_pct", "other_statutory_pct"] as const;
const BUILD_UP_DAY = ["meal_per_day", "transport_per_day", "accommodation_per_day", "ppe_tools_per_day"] as const;
const toNum = (v: string | undefined) => (v == null || v.trim() === "" ? null : Number(v));
// Stored as fractions (0.054); edited as percent (5.4).
const pctToForm = (v: number | null) => (v == null ? "" : String(Math.round(v * 10000) / 100));
const dayToForm = (v: number | null) => (v == null ? "" : String(v));

const laborRateFormSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, "Labor Code is required").regex(CODE_PATTERN, "Code must match L-GRP-NNN, e.g. L-MAS-001"),
  skill_level: z.enum(DWL_LABOR_SKILL_LEVELS, { message: "Skill Level is required" }),
  description: z.string().trim().min(8, "Trade Craft Description must state enough detail (min 8 characters)"),
  unit: z.enum(RATE_BASIS_UNITS, { message: "Rate Basis is required" }),
  daily_basic_rate: z.string().trim().min(1, "Basic Rate is required").regex(NUM_RE, "Enter a non-negative number"),
  overtime_rate: z.string().trim().min(1, "Overtime Rate is required").regex(NUM_RE, "Enter a non-negative number"),
  standard_productivity_note: z.string().trim().optional(),
  // All-in build-up: percentages entered as % (5 = 5%), allowances in $/day.
  all_in_enabled: z.boolean(),
  ot_allowance_pct: optionalNum,
  nssf_employer_pct: optionalNum,
  other_statutory_pct: optionalNum,
  meal_per_day: optionalNum,
  transport_per_day: optionalNum,
  accommodation_per_day: optionalNum,
  ppe_tools_per_day: optionalNum,
});

type LaborRateFormValues = z.infer<typeof laborRateFormSchema>;

const DEFAULT_VALUES: LaborRateFormValues = {
  code: "", skill_level: "Skilled", description: "", unit: "day",
  daily_basic_rate: "", overtime_rate: "", standard_productivity_note: "",
  all_in_enabled: false, ot_allowance_pct: "", nssf_employer_pct: "", other_statutory_pct: "",
  meal_per_day: "", transport_per_day: "", accommodation_per_day: "", ppe_tools_per_day: "",
};

function buildUpPayload(values: LaborRateFormValues) {
  return {
    all_in_enabled: values.unit === "day" && values.all_in_enabled,
    ot_allowance_pct: toNum(values.ot_allowance_pct) != null ? toNum(values.ot_allowance_pct)! / 100 : null,
    nssf_employer_pct: toNum(values.nssf_employer_pct) != null ? toNum(values.nssf_employer_pct)! / 100 : null,
    other_statutory_pct: toNum(values.other_statutory_pct) != null ? toNum(values.other_statutory_pct)! / 100 : null,
    meal_per_day: toNum(values.meal_per_day),
    transport_per_day: toNum(values.transport_per_day),
    accommodation_per_day: toNum(values.accommodation_per_day),
    ppe_tools_per_day: toNum(values.ppe_tools_per_day),
  };
}

interface DwlLaborRateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  editRow?: DwlLaborRateRow | null;
  onSaved: () => void;
}

export function DwlLaborRateFormDialog({
  open, onOpenChange, tenantId, userId, editRow, onSaved,
}: DwlLaborRateFormDialogProps) {
  const isEdit = editRow != null;

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LaborRateFormValues>({
    resolver: zodResolver(laborRateFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const watched = useWatch({ control });
  const isDayRate = watched.unit === "day";
  const basic = Number(watched.daily_basic_rate) || 0;
  const pctSum = BUILD_UP_PCT.reduce((s, k) => s + (Number(watched[k]) || 0), 0) / 100;
  const daySum = BUILD_UP_DAY.reduce((s, k) => s + (Number(watched[k]) || 0), 0);
  const allInPreview = basic * (1 + pctSum) + daySum;

  function applyCambodiaDefaults() {
    const d = DWL_LABOR_BUILD_UP_DEFAULTS;
    setValue("ot_allowance_pct", pctToForm(d.ot_allowance_pct));
    setValue("nssf_employer_pct", pctToForm(d.nssf_employer_pct));
    setValue("other_statutory_pct", pctToForm(d.other_statutory_pct));
    setValue("meal_per_day", dayToForm(d.meal_per_day));
    setValue("transport_per_day", dayToForm(d.transport_per_day));
    setValue("accommodation_per_day", dayToForm(d.accommodation_per_day));
    setValue("ppe_tools_per_day", dayToForm(d.ppe_tools_per_day));
    setValue("all_in_enabled", true);
  }

  useEffect(() => {
    if (!open) return;
    if (editRow) {
      reset({
        code: editRow.code,
        skill_level: editRow.skill_level ?? "Skilled",
        description: editRow.description,
        unit: (RATE_BASIS_UNITS as readonly string[]).includes(editRow.unit) ? (editRow.unit as (typeof RATE_BASIS_UNITS)[number]) : "day",
        daily_basic_rate: editRow.daily_basic_rate != null ? String(editRow.daily_basic_rate) : "",
        overtime_rate: editRow.overtime_rate_per_hr != null ? String(editRow.overtime_rate_per_hr) : "",
        standard_productivity_note: editRow.standard_productivity_note ?? "",
        all_in_enabled: editRow.all_in_enabled,
        ot_allowance_pct: pctToForm(editRow.ot_allowance_pct),
        nssf_employer_pct: pctToForm(editRow.nssf_employer_pct),
        other_statutory_pct: pctToForm(editRow.other_statutory_pct),
        meal_per_day: dayToForm(editRow.meal_per_day),
        transport_per_day: dayToForm(editRow.transport_per_day),
        accommodation_per_day: dayToForm(editRow.accommodation_per_day),
        ppe_tools_per_day: dayToForm(editRow.ppe_tools_per_day),
      });
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [open, editRow, reset]);

  async function onSubmit(values: LaborRateFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save a labor rate");
      return;
    }

    const dailyRate = Number(values.daily_basic_rate);
    const otRate = Number(values.overtime_rate);
    const productivityNote = values.standard_productivity_note?.trim() || null;

    if (isEdit && editRow) {
      const { error: resErr } = await updateDwlResourceById({ description: values.description.trim(), unit: values.unit, updated_at: new Date().toISOString() }, editRow.resource_id);
      if (resErr) { toast.error(resErr.message); return; }

      const { error: attrErr } = await upsertDwlLaborRateAttribute({
          resource_id: editRow.resource_id,
          tenant_id: tenantId,
          skill_level: values.skill_level,
          standard_productivity_note: productivityNote,
          ...buildUpPayload(values),
          updated_by: userId,
        });
      if (attrErr) { toast.error(attrErr.message); return; }

      // Rates are append-only: only write a new price row when the rate
      // actually changed, never overwrite the existing history.
      const rateChanged = Math.abs((editRow.daily_basic_rate ?? 0) - dailyRate) > 0.001
        || Math.abs((editRow.overtime_rate_per_hr ?? 0) - otRate) > 0.001;
      if (rateChanged) {
        const { error: priceErr } = await insertDwlResourcePrice({
          tenant_id: tenantId,
          resource_id: editRow.resource_id,
          unit_price: dailyRate,
          overtime_rate_per_hr: otRate,
          currency: editRow.currency ?? "USD",
          valid_from: new Date().toISOString().slice(0, 10),
          source_type: "estimate",
          price_status: "approved",
          created_by: userId,
        });
        if (priceErr) { toast.error(priceErr.message); return; }
      }

      toast.success(`Labor rate ${editRow.code} updated`);
    } else {
      const { data: resourceRow, error: resErr } = await insertDwlResourceReturning({
          tenant_id: tenantId,
          category: "labor",
          code: values.code,
          description: values.description.trim(),
          unit: values.unit,
          created_by: userId,
        });
      if (resErr || !resourceRow) {
        if (resErr?.code === "23505" || /unique/i.test(resErr?.message ?? "")) {
          setError("code", { message: "A resource with this code already exists" });
        } else {
          toast.error(resErr?.message ?? "Failed to create the labor rate");
        }
        return;
      }
      const resourceId = resourceRow.id as string;

      const { error: attrErr } = await insertDwlLaborRateAttribute({
        resource_id: resourceId,
        tenant_id: tenantId,
        skill_level: values.skill_level,
        standard_productivity_note: productivityNote,
        ...buildUpPayload(values),
        created_by: userId,
      });
      if (attrErr) { toast.error(attrErr.message); return; }

      const { error: priceErr } = await insertDwlResourcePrice({
        tenant_id: tenantId,
        resource_id: resourceId,
        unit_price: dailyRate,
        overtime_rate_per_hr: otRate,
        currency: "USD",
        valid_from: new Date().toISOString().slice(0, 10),
        source_type: "estimate",
        price_status: "approved",
        created_by: userId,
      });
      if (priceErr) { toast.error(priceErr.message); return; }

      toast.success(`Labor rate ${values.code} registered`);
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Labor Trade Rate" : "Add Labor Trade Rate"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Trade description and productivity note update in place. Changing a rate appends a new price record — the old one stays in history."
              : "Registers a new labor resource and its starting rate together."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="code">Labor Code *</Label>
              <Input
                id="code"
                placeholder="L-MAS-001"
                disabled={isEdit}
                {...register("code")}
                onChange={(e) => setValue("code", e.target.value.toUpperCase(), { shouldValidate: true })}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="skill_level">Skill Level *</Label>
              <select id="skill_level" {...register("skill_level")} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                {DWL_LABOR_SKILL_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.skill_level && <p className="text-xs text-destructive">{errors.skill_level.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Trade Craft Description *</Label>
            <Input id="description" placeholder="e.g. Master Carpenter / Formwork Lead" {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="unit">Rate Basis *</Label>
              <select id="unit" {...register("unit")} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm">
                <option value="day">Day (8 hrs)</option>
                <option value="month">Month (8 hrs)</option>
                <option value="hr">Hour</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="daily_basic_rate">Basic Rate ($) *</Label>
              <Input id="daily_basic_rate" inputMode="decimal" placeholder="25" {...register("daily_basic_rate")} />
              {errors.daily_basic_rate && <p className="text-xs text-destructive">{errors.daily_basic_rate.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="overtime_rate">Overtime ($/hr) *</Label>
              <Input id="overtime_rate" inputMode="decimal" placeholder="4.5" {...register("overtime_rate")} />
              {errors.overtime_rate && <p className="text-xs text-destructive">{errors.overtime_rate.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="standard_productivity_note">Standard Productivity Constant</Label>
            <Input id="standard_productivity_note" placeholder="e.g. 15 m2 formwork / day / pair" {...register("standard_productivity_note")} />
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" disabled={!isDayRate} {...register("all_in_enabled")} />
                Use all-in day rate for costing
              </label>
              <Button type="button" variant="outline" size="sm" disabled={!isDayRate} onClick={applyCambodiaDefaults}>
                Cambodia defaults
              </Button>
            </div>
            {!isDayRate ? (
              <p className="text-xs text-muted-foreground">The all-in build-up applies to day-rate trades only.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {([["ot_allowance_pct", "Routine OT %"], ["nssf_employer_pct", "NSSF employer %"], ["other_statutory_pct", "Seniority / other %"]] as const).map(([k, label]) => (
                    <div key={k} className="space-y-1">
                      <Label htmlFor={k} className="text-xs">{label}</Label>
                      <Input id={k} inputMode="decimal" placeholder="0" {...register(k)} />
                      {errors[k] && <p className="text-xs text-destructive">{errors[k]?.message}</p>}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {([["meal_per_day", "Meals $/day"], ["transport_per_day", "Transport $/day"], ["accommodation_per_day", "Lodging $/day"], ["ppe_tools_per_day", "PPE & tools $/day"]] as const).map(([k, label]) => (
                    <div key={k} className="space-y-1">
                      <Label htmlFor={k} className="text-xs">{label}</Label>
                      <Input id={k} inputMode="decimal" placeholder="0" {...register(k)} />
                      {errors[k] && <p className="text-xs text-destructive">{errors[k]?.message}</p>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  All-in = basic × (1 + OT + NSSF + other) + daily allowances ={" "}
                  <span className="font-mono font-medium text-foreground">${allInPreview.toFixed(2)}</span>/day
                  {watched.all_in_enabled
                    ? " — cost items use this rate."
                    : " — not used until the switch above is on (cost items use the basic rate)."}
                </p>
              </>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Labor Rate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
