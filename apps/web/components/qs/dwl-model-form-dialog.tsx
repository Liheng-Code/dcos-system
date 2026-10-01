"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { insertDwlQuantityModelsReturning } from "@/lib/qs/qs-queries";
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

// SOP §10 Step 4.1/4.2 coding pattern: MDL-{TYPE}-{NNN}, e.g. MDL-SCH-001.
const CODE_PATTERN = /^MDL-[A-Z]+-\d{3}$/;

const modelFormSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Code is required")
    .regex(CODE_PATTERN, "Code must match MDL-{TYPE}-{NNN}, e.g. MDL-SCH-001"),
  building_type: z.string().trim().min(1, "Building type is required (e.g. school, office, apartment)"),
  description: z.string().trim().min(10, "Description is required"),
  // Mandatory per SOP §10 Step 4.1: "which completed projects calibrated it".
  basis_note: z
    .string()
    .trim()
    .min(5, "Basis note is required — state which completed projects calibrated this model"),
  is_active: z.boolean(),
});

type ModelFormValues = z.infer<typeof modelFormSchema>;

interface DwlModelFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onCreated: (newModelId: string) => void;
}

export function DwlModelFormDialog({ open, onOpenChange, tenantId, onCreated }: DwlModelFormDialogProps) {

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ModelFormValues>({
    resolver: zodResolver(modelFormSchema),
    defaultValues: {
      code: "",
      building_type: "",
      description: "",
      basis_note: "",
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset({ code: "", building_type: "", description: "", basis_note: "", is_active: true });
    }
  }, [open, reset]);

  async function onSubmit(values: ModelFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot create a quantity model");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      code: values.code.trim().toUpperCase(),
      building_type: values.building_type.trim(),
      description: values.description.trim(),
      basis_note: values.basis_note.trim(),
      is_active: values.is_active,
    };

    const { data, error } = await insertDwlQuantityModelsReturning(payload);
    if (error || !data) {
      if (error?.code === "23505" || /unique/i.test(error?.message ?? "")) {
        setError("code", { message: "A quantity model with this code already exists" });
      } else {
        toast.error(error?.message ?? "Failed to create quantity model");
      }
      return;
    }

    toast.success(`Model ${payload.code} created — add factor lines next`);
    onCreated(data.id as string);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Quantity Model</DialogTitle>
          <DialogDescription>
            A parametric model (Level 4) — a set of per-assembly quantity ratios calibrated against
            real projects. Stores no price itself; add factor lines afterward to drive estimates.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="code">Code * (MDL-TYPE-NNN)</Label>
              <Input id="code" placeholder="MDL-SCH-001" {...register("code")} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="building_type">Building Type *</Label>
              <Input id="building_type" placeholder="school / office / apartment…" {...register("building_type")} />
              {errors.building_type && (
                <p className="text-xs text-destructive">{errors.building_type.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              placeholder="e.g. School, RC frame, mid-rise"
              {...register("description")}
            />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="basis_note">Basis Note *</Label>
            <Input
              id="basis_note"
              placeholder="Calibrated against Project X, Project Y as-built quantities"
              {...register("basis_note")}
            />
            {errors.basis_note && <p className="text-xs text-destructive">{errors.basis_note.message}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" {...register("is_active")} />
            Active (available for new projects to select)
          </label>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Model
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
