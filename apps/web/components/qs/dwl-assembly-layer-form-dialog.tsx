"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DwlAssemblyLayer, DwlAssemblyLayerSpec, DwlAssemblyMaterialExplosionRow } from "@/components/qs/dwl-types";

const COLOR_PRESETS = [
  "#f59e0b", "#60a5fa", "#cbd5e1", "#34d399", "#f472b6", "#a78bfa", "#fb923c", "#94a3b8",
];

const layerFormSchema = z.object({
  layer_name: z.string().trim().min(1, "Layer name is required"),
  material_label: z.string().trim(),
  thickness_mm: z
    .string()
    .trim()
    .min(1, "Thickness is required")
    .regex(/^\d*\.?\d+$/, "Enter a positive number")
    .refine((v) => Number(v) > 0, "Thickness must be greater than 0"),
  color_hex: z.string().trim().min(1, "Pick a color"),
  sort_order: z
    .string()
    .trim()
    .min(1, "Sort order is required")
    .regex(/^\d+$/, "Enter a whole number"),
});

type LayerFormValues = z.infer<typeof layerFormSchema>;

interface DwlAssemblyLayerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  assemblyId: string;
  editingLayer: DwlAssemblyLayer | null;
  nextSortOrder: number;
  materials: DwlAssemblyMaterialExplosionRow[];
  linkedResourceIds: string[];
  layerSpecs: DwlAssemblyLayerSpec[];
  onSaved: () => void;
}

export function DwlAssemblyLayerFormDialog({
  open, onOpenChange, tenantId, assemblyId, editingLayer, nextSortOrder,
  materials, linkedResourceIds, layerSpecs, onSaved,
}: DwlAssemblyLayerFormDialogProps) {
  const supabase = createClient();
  const isEditing = editingLayer !== null;

  const [selectedResourceIds, setSelectedResourceIds] = useState<Set<string>>(new Set());
  const [specRows, setSpecRows] = useState<{ label: string; value: string }[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LayerFormValues>({
    resolver: zodResolver(layerFormSchema),
    defaultValues: { layer_name: "", material_label: "", thickness_mm: "", color_hex: COLOR_PRESETS[0], sort_order: "0" },
  });

  useEffect(() => {
    if (!open) return;
    if (editingLayer) {
      reset({
        layer_name: editingLayer.layer_name,
        material_label: editingLayer.material_label ?? "",
        thickness_mm: String(editingLayer.thickness_mm),
        color_hex: editingLayer.color_hex,
        sort_order: String(editingLayer.sort_order),
      });
      setSelectedResourceIds(new Set(linkedResourceIds));
      setSpecRows(layerSpecs.map((s) => ({ label: s.spec_label, value: s.spec_value })));
    } else {
      reset({ layer_name: "", material_label: "", thickness_mm: "", color_hex: COLOR_PRESETS[0], sort_order: String(nextSortOrder) });
      setSelectedResourceIds(new Set());
      setSpecRows([]);
    }
  }, [open, editingLayer, nextSortOrder, linkedResourceIds, layerSpecs, reset]);

  const colorHex = watch("color_hex");

  function toggleResource(id: string) {
    setSelectedResourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(values: LayerFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save this layer");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      assembly_id: assemblyId,
      layer_name: values.layer_name.trim(),
      material_label: values.material_label.trim() || null,
      thickness_mm: Number(values.thickness_mm),
      color_hex: values.color_hex,
      sort_order: Number(values.sort_order),
    };

    let layerId = editingLayer?.id ?? null;

    if (isEditing && editingLayer) {
      const { error } = await supabase
        .from("dwl_assembly_layers")
        .update({
          layer_name: payload.layer_name,
          material_label: payload.material_label,
          thickness_mm: payload.thickness_mm,
          color_hex: payload.color_hex,
          sort_order: payload.sort_order,
        })
        .eq("id", editingLayer.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from("dwl_assembly_layers").insert(payload).select("id").single();
      if (error) {
        toast.error(error.message);
        return;
      }
      layerId = data.id as string;
    }

    if (!layerId) {
      toast.error("Could not resolve the saved layer's id");
      return;
    }

    const { error: delMatErr } = await supabase.from("dwl_assembly_layer_materials").delete().eq("layer_id", layerId);
    if (delMatErr) { toast.error(delMatErr.message); return; }
    if (selectedResourceIds.size > 0) {
      const matInserts = Array.from(selectedResourceIds).map((resource_id, i) => ({
        tenant_id: tenantId, layer_id: layerId, resource_id, sort_order: i + 1,
      }));
      const { error: insMatErr } = await supabase.from("dwl_assembly_layer_materials").insert(matInserts);
      if (insMatErr) { toast.error(insMatErr.message); return; }
    }

    const { error: delSpecErr } = await supabase.from("dwl_assembly_layer_specs").delete().eq("layer_id", layerId);
    if (delSpecErr) { toast.error(delSpecErr.message); return; }
    const cleanedSpecs = specRows.filter((s) => s.label.trim() && s.value.trim());
    if (cleanedSpecs.length > 0) {
      const specInserts = cleanedSpecs.map((s, i) => ({
        tenant_id: tenantId, layer_id: layerId, sort_order: i + 1, spec_label: s.label.trim(), spec_value: s.value.trim(),
      }));
      const { error: insSpecErr } = await supabase.from("dwl_assembly_layer_specs").insert(specInserts);
      if (insSpecErr) { toast.error(insSpecErr.message); return; }
    }

    toast.success(isEditing ? "Layer updated" : "Layer added");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Layer" : "Add Layer"}</DialogTitle>
          <DialogDescription>
            A build-up layer in the assembly cross-section, its real linked BOQ material(s), and its technical specs.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="layer_name">Layer Name *</Label>
              <Input id="layer_name" placeholder="e.g. Joint" {...register("layer_name")} />
              {errors.layer_name && <p className="text-xs text-destructive">{errors.layer_name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="thickness_mm">Thickness (mm) *</Label>
              <Input id="thickness_mm" inputMode="decimal" placeholder="1.0" {...register("thickness_mm")} />
              {errors.thickness_mm && <p className="text-xs text-destructive">{errors.thickness_mm.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="material_label">Description</Label>
            <Input id="material_label" placeholder="e.g. Paper Joint Tape + 2-Coat Jointing Compound & Primer" {...register("material_label")} />
          </div>

          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValue("color_hex", c, { shouldValidate: true })}
                  className={cn("h-6 w-6 rounded-full border-2", colorHex === c ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
              <input type="color" value={colorHex} onChange={(e) => setValue("color_hex", e.target.value, { shouldValidate: true })} className="h-6 w-8 rounded border border-input" />
            </div>
            {errors.color_hex && <p className="text-xs text-destructive">{errors.color_hex.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Linked BOQ Materials</Label>
            <p className="text-[11px] text-muted-foreground">Only this assembly&apos;s own Bill of Quantities materials can be linked.</p>
            {materials.length === 0 ? (
              <p className="text-xs text-muted-foreground">No BOQ materials on this assembly yet.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-input">
                {materials.map((m) => (
                  <label key={m.resource_id} className="flex cursor-pointer items-center gap-2 border-b border-border/50 px-2.5 py-1.5 text-xs last:border-0 hover:bg-accent">
                    <Checkbox checked={selectedResourceIds.has(m.resource_id)} onCheckedChange={() => toggleResource(m.resource_id)} />
                    <span className="font-mono font-medium">{m.material_code}</span>
                    <span className="truncate text-muted-foreground">{m.material_description}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Technical Specifications</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setSpecRows((prev) => [...prev, { label: "", value: "" }])}>
                <Plus className="h-3 w-3" /> Add line
              </Button>
            </div>
            {specRows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No spec lines yet.</p>
            ) : (
              <div className="space-y-1.5">
                {specRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input
                      value={row.label}
                      onChange={(e) => setSpecRows((prev) => prev.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                      placeholder="Label, e.g. Surface Level"
                      className="w-2/5 text-xs"
                    />
                    <Input
                      value={row.value}
                      onChange={(e) => setSpecRows((prev) => prev.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                      placeholder="Value, e.g. Level 4 Drywall Finish"
                      className="text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setSpecRows((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove line"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input id="sort_order" inputMode="numeric" className="max-w-24" {...register("sort_order")} />
            {errors.sort_order && <p className="text-xs text-destructive">{errors.sort_order.message}</p>}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Save Layer" : "Add Layer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
