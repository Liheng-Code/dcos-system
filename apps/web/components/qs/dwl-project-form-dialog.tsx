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
import type { DwlQuantityModel } from "@/components/qs/dwl-types";

const numericOptional = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\d*\.?\d+$/.test(v), "Enter a positive number");

const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  model_id: z.string().min(1, "Select a quantity model"),
  gfa: z
    .string()
    .trim()
    .min(1, "GFA is required to drive most parametric models")
    .regex(/^\d*\.?\d+$/, "Enter a positive number"),
  footprint: numericOptional,
  storeys: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), "Enter a whole number"),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface DwlProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  models: DwlQuantityModel[];
  onCreated: (newProjectId: string) => void;
}

export function DwlProjectFormDialog({ open, onOpenChange, tenantId, models, onCreated }: DwlProjectFormDialogProps) {
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", model_id: "", gfa: "", footprint: "", storeys: "" },
  });

  useEffect(() => {
    if (open) {
      reset({ name: "", model_id: models[0]?.id ?? "", gfa: "", footprint: "", storeys: "" });
    }
  }, [open, models, reset]);

  async function onSubmit(values: ProjectFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot create a project");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      name: values.name.trim(),
      model_id: values.model_id,
      gfa: Number(values.gfa),
      footprint: values.footprint ? Number(values.footprint) : null,
      storeys: values.storeys ? Number(values.storeys) : null,
      status: "draft",
    };

    const { data, error } = await supabase.from("dwl_projects").insert(payload).select("id").single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create project");
      return;
    }

    toast.success(`Project "${payload.name}" created`);
    onCreated(data.id as string);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Quick Estimate Project</DialogTitle>
          <DialogDescription>
            A lightweight quick-estimate record (not the main DCOS project registry) driven by a
            parametric quantity model. Enter building parameters to generate an elemental estimate.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">Project Name *</Label>
            <Input id="name" placeholder="e.g. New District School, Phase 1" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="model_id">Quantity Model *</Label>
            <select
              id="model_id"
              {...register("model_id")}
              disabled={models.length === 0}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {models.length === 0 && <option value="">No active models available</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.building_type}
                </option>
              ))}
            </select>
            {errors.model_id && <p className="text-xs text-destructive">{errors.model_id.message}</p>}
            {models.length === 0 && (
              <p className="text-xs text-muted-foreground">Create a quantity model with factor lines first.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="gfa">GFA (m²) *</Label>
              <Input id="gfa" inputMode="decimal" placeholder="8000" {...register("gfa")} />
              {errors.gfa && <p className="text-xs text-destructive">{errors.gfa.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="footprint">Footprint (m²)</Label>
              <Input id="footprint" inputMode="decimal" placeholder="Optional" {...register("footprint")} />
              {errors.footprint && <p className="text-xs text-destructive">{errors.footprint.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="storeys">Storeys</Label>
              <Input id="storeys" inputMode="numeric" placeholder="Optional" {...register("storeys")} />
              {errors.storeys && <p className="text-xs text-destructive">{errors.storeys.message}</p>}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || models.length === 0}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
