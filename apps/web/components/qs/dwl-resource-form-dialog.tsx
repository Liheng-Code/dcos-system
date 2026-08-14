"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { DWL_CATEGORIES, DWL_UNITS, type DwlResource, type DwlUnit } from "@/components/qs/dwl-types";

// SOP §6 Decision D2 — locked coding standard: {M/L/E/S}-{GROUP3}-{NNN}, e.g. M-CON-001.
const CODE_PATTERN = /^[MLES]-[A-Z]{3}-\d{3}$/;

const resourceFormSchema = z
  .object({
    category: z.enum(["material", "labor", "equipment", "subcon"], {
      message: "Category is required",
    }),
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .regex(CODE_PATTERN, "Code must match {M/L/E/S}-{GROUP3}-{NNN}, e.g. M-CON-001"),
    description: z
      .string()
      .trim()
      .min(8, "Description must state the price-driving spec (grade, size, class) — \"Concrete\" alone is rejected"),
    unit: z.enum(DWL_UNITS, { message: "Unit is required" }),
    spec_reference: z.string().trim().optional(),
    is_active: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const prefix = DWL_CATEGORIES.find((c) => c.value === data.category)?.codePrefix;
    if (prefix && data.code && !data.code.startsWith(`${prefix}-`)) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: `Code for category "${data.category}" must start with "${prefix}-" per the coding standard`,
      });
    }
  });

type ResourceFormValues = z.infer<typeof resourceFormSchema>;

interface DwlResourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onCreated: () => void;
  editResource?: DwlResource | null;
}

export function DwlResourceFormDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  onCreated,
  editResource,
}: DwlResourceFormDialogProps) {
  const supabase = createClient();
  const isEdit = editResource !== null && editResource !== undefined;

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      category: "material",
      code: "",
      description: "",
      unit: "m2",
      spec_reference: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (editResource) {
        reset({
          category: editResource.category,
          code: editResource.code,
          description: editResource.description,
          unit: editResource.unit as DwlUnit,
          spec_reference: editResource.spec_reference ?? "",
          is_active: editResource.is_active,
        });
      } else {
        reset({
          category: "material",
          code: "",
          description: "",
          unit: "m2",
          spec_reference: "",
          is_active: true,
        });
      }
    }
  }, [open, reset, editResource]);

  const category = watch("category");

  async function onSubmit(values: ResourceFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot create a resource");
      return;
    }

    const codeUpper = values.code.trim().toUpperCase();

    if (isEdit && editResource) {
      const { error } = await supabase
        .from("dwl_resources")
        .update({
          category: values.category,
          description: values.description.trim(),
          unit: values.unit,
          spec_reference: values.spec_reference?.trim() || null,
          is_active: values.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editResource.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`Resource ${editResource.code} updated`);
    } else {
      const payload = {
        tenant_id: tenantId,
        category: values.category,
        code: codeUpper,
        description: values.description.trim(),
        unit: values.unit,
        spec_reference: values.spec_reference?.trim() || null,
        is_active: values.is_active,
        created_by: userId,
      };
      const { error } = await supabase.from("dwl_resources").insert(payload);
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message)) {
          setError("code", { message: "A resource with this code already exists" });
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success(`Resource ${payload.code} created`);
    }

    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Resource" : "Add Resource"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the resource details in the Direct Works Cost Library."
              : "Add a new priceable resource to the Direct Works Cost Library (Level 1). Every resource must carry a price entry separately once created."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="category">Category *</Label>
              <select
                id="category"
                {...register("category")}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {DWL_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {errors.category && (
                <p className="text-xs text-destructive">{errors.category.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="code">
                Code * <span className="font-normal text-muted-foreground">({DWL_CATEGORIES.find((c) => c.value === category)?.codePrefix}-GRP-NNN)</span>
              </Label>
              <Input
                id="code"
                placeholder={`${DWL_CATEGORIES.find((c) => c.value === category)?.codePrefix}-CON-001`}
                {...register("code")}
                disabled={isEdit}
                onChange={(e) => setValue("code", e.target.value.toUpperCase(), { shouldValidate: true })}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              placeholder="e.g. Ready-mix concrete C30, slump 10±2cm"
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="unit">Unit *</Label>
              <select
                id="unit"
                {...register("unit")}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {DWL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="spec_reference">Spec Reference</Label>
              <Input id="spec_reference" placeholder="e.g. ASTM C94" {...register("spec_reference")} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="is_active"
              type="checkbox"
              className="size-4 rounded border-input"
              {...register("is_active")}
            />
            <Label htmlFor="is_active" className="font-normal">Active (visible in the current-price list)</Label>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Update Resource" : "Create Resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
