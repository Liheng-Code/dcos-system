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

// SOP §6 Decision D2 — locked coding standard: {BOQ section}.{trade}.{NNN}, e.g. 03.02.010.
const CODE_PATTERN = /^\d{2}\.\d{2}\.\d{3}$/;

const workItemFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .regex(CODE_PATTERN, "Code must match {BOQ section}.{trade}.{NNN}, e.g. 03.02.010"),
    boq_section: z.string().trim().min(1, "BOQ section is required"),
    description: z
      .string()
      .trim()
      .min(15, "Description must state inclusions AND exclusions (SOP §8 Step 2.1) — too short to cover both"),
    unit: z.enum(DWL_UNITS, { message: "Unit is required" }),
    method_note: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.boq_section && data.code && !data.code.startsWith(`${data.boq_section}.`)) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: `Code should start with "${data.boq_section}." to match the BOQ section`,
      });
    }
  });

type WorkItemFormValues = z.infer<typeof workItemFormSchema>;

interface DwlWorkItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  editItem?: { id: string; code: string; boq_section: string; description: string; unit: string; method_note: string | null } | null;
  onCreated: (newWorkItemId: string) => void;
  onSaved?: () => void;
}

export function DwlWorkItemFormDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  editItem,
  onCreated,
  onSaved,
}: DwlWorkItemFormDialogProps) {
  const supabase = createClient();
  const isEdit = !!editItem;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WorkItemFormValues>({
    resolver: zodResolver(workItemFormSchema),
    defaultValues: {
      code: "",
      boq_section: "",
      description: "",
      unit: "m3",
      method_note: "",
    },
  });

  useEffect(() => {
    if (open) {
      if (editItem) {
        reset({
          code: editItem.code,
          boq_section: editItem.boq_section,
          description: editItem.description,
          unit: ((DWL_UNITS as readonly string[]).includes(editItem.unit) ? editItem.unit : "m3") as DwlUnit,
          method_note: editItem.method_note ?? "",
        });
      } else {
        reset({ code: "", boq_section: "", description: "", unit: "m3", method_note: "" });
      }
    }
  }, [open, editItem, reset]);

  async function onSubmit(values: WorkItemFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save a work item");
      return;
    }

    const fields = {
      code: values.code.trim(),
      boq_section: values.boq_section.trim(),
      description: values.description.trim(),
      unit: values.unit,
      method_note: values.method_note?.trim() || null,
    };

    if (isEdit) {
      const { error } = await supabase.from("dwl_work_items").update(fields).eq("id", editItem.id);
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message ?? "")) {
          setError("code", { message: "A work item with this code already exists" });
        } else {
          toast.error(error.message ?? "Failed to update work item");
        }
        return;
      }
      toast.success(`Work item ${fields.code} updated`);
      onSaved?.();
      onOpenChange(false);
      return;
    }

    const payload = {
      tenant_id: tenantId,
      ...fields,
      created_by: userId,
    };

    const { data, error } = await supabase.from("dwl_work_items").insert(payload).select("id").single();
    if (error || !data) {
      if (error?.code === "23505" || /unique/i.test(error?.message ?? "")) {
        setError("code", { message: "A work item with this code already exists" });
      } else {
        toast.error(error?.message ?? "Failed to create work item");
      }
      return;
    }

    toast.success(`Work item ${payload.code} created — add recipe lines next`);
    onCreated(data.id as string);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Work Item" : "Add Work Item"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the work item details below."
              : "One BOQ-line scope of work, priced by a recipe of resources (Level 2). It stores no price itself — add recipe lines afterward to build up its rate."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="boq_section">BOQ Section *</Label>
              <Input id="boq_section" placeholder="e.g. 03" {...register("boq_section")} />
              {errors.boq_section && (
                <p className="text-xs text-destructive">{errors.boq_section.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="code">Code * (section.trade.NNN)</Label>
              <Input id="code" placeholder="03.02.010" {...register("code")} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description * (state inclusions AND exclusions)</Label>
            <Input
              id="description"
              placeholder="e.g. Vibrated concrete C30 in columns, per m3. Incl. ... Excl. ..."
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
              <Label htmlFor="method_note">Method Note</Label>
              <Input id="method_note" placeholder="e.g. Pump placement" {...register("method_note")} />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Work Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
