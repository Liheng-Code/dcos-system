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
import { DWL_UNITS, type DwlUnit } from "@/components/qs/dwl-types";

// SOP §6 Decision D2 — locked coding standard: ASM-{ELEMENT}-{NNN}, e.g. ASM-WALL-010.
const CODE_PATTERN = /^ASM-[A-Z]+-\d{3}$/;

const assemblyFormSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Code is required")
    .regex(CODE_PATTERN, "Code must match ASM-{ELEMENT}-{NNN}, e.g. ASM-WALL-010"),
  element_group: z.string().trim().min(1, "Element group is required (e.g. wall, slab, roof, door, finish)"),
  description: z.string().trim().min(10, "Description is required"),
  unit: z.enum(DWL_UNITS, { message: "Unit is required" }),
  // Mandatory per SOP §9 Step 3.2 rule 3: "an assembly rate without a
  // measurement rule is ambiguous."
  measurement_rule: z
    .string()
    .trim()
    .min(5, "Measurement rule is required — e.g. \"Net area, openings deducted\""),
});

type AssemblyFormValues = z.infer<typeof assemblyFormSchema>;

interface DwlAssemblyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  editItem?: { id: string; code: string; element_group: string; description: string; unit: string; measurement_rule: string } | null;
  onCreated: (newAssemblyId: string) => void;
  onSaved?: () => void;
}

export function DwlAssemblyFormDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  editItem,
  onCreated,
  onSaved,
}: DwlAssemblyFormDialogProps) {
  const supabase = createClient();
  const isEdit = !!editItem;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AssemblyFormValues>({
    resolver: zodResolver(assemblyFormSchema),
    defaultValues: {
      code: "",
      element_group: "",
      description: "",
      unit: "m2",
      measurement_rule: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (editItem) {
        reset({
          code: editItem.code,
          element_group: editItem.element_group,
          description: editItem.description,
          unit: ((DWL_UNITS as readonly string[]).includes(editItem.unit) ? editItem.unit : "m2") as DwlUnit,
          measurement_rule: editItem.measurement_rule,
        });
      } else {
        reset({ code: "", element_group: "", description: "", unit: "m2", measurement_rule: "" });
      }
    }
  }, [open, editItem, reset]);

  async function onSubmit(values: AssemblyFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save an assembly");
      return;
    }

    const fields = {
      code: values.code.trim().toUpperCase(),
      element_group: values.element_group.trim(),
      description: values.description.trim(),
      unit: values.unit,
      measurement_rule: values.measurement_rule.trim(),
    };

    if (isEdit) {
      const { error } = await supabase.from("dwl_assemblies").update(fields).eq("id", editItem.id);
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message ?? "")) {
          setError("code", { message: "An assembly with this code already exists" });
        } else {
          toast.error(error.message ?? "Failed to update assembly");
        }
        return;
      }
      toast.success(`Assembly ${fields.code} updated`);
      onSaved?.();
      onOpenChange(false);
      return;
    }

    const payload = {
      tenant_id: tenantId,
      ...fields,
      created_by: userId,
    };

    const { data, error } = await supabase.from("dwl_assemblies").insert(payload).select("id").single();
    if (error || !data) {
      if (error?.code === "23505" || /unique/i.test(error?.message ?? "")) {
        setError("code", { message: "An assembly with this code already exists" });
      } else {
        toast.error(error?.message ?? "Failed to create assembly");
      }
      return;
    }

    toast.success(`Assembly ${payload.code} created — add item lines next`);
    onCreated(data.id as string);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Assembly" : "Add Assembly"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the assembly details below."
              : "A complete building element measured the way a QS measures it (Level 3) — a recipe of work items. Stores no price itself; add item lines afterward to build up its rate."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="code">Code * (ASM-ELEMENT-NNN)</Label>
              <Input id="code" placeholder="ASM-WALL-010" {...register("code")} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="element_group">Element Group *</Label>
              <Input id="element_group" placeholder="wall / slab / roof / door / finish…" {...register("element_group")} />
              {errors.element_group && (
                <p className="text-xs text-destructive">{errors.element_group.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              placeholder="e.g. Internal partition wall complete, painted both faces"
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
              <Label htmlFor="measurement_rule">Measurement Rule *</Label>
              <Input id="measurement_rule" placeholder="Net area, openings deducted" {...register("measurement_rule")} />
              {errors.measurement_rule && (
                <p className="text-xs text-destructive">{errors.measurement_rule.message}</p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Assembly"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
