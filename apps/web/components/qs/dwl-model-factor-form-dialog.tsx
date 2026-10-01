"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { insertDwlModelFactors, listDwlAssembliesWithIsActive, updateDwlModelFactorById } from "@/lib/qs/qs-queries";
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
import { DWL_MODEL_DRIVERS } from "@/components/qs/dwl-types";
import type { DwlAssembly, DwlModelFactor, DwlQuantityModel } from "@/components/qs/dwl-types";

const modelFactorFormSchema = z.object({
  assembly_id: z.string().min(1, "Select an assembly"),
  driver: z.enum(["gfa", "footprint", "storeys", "gfa_per_45", "fixed"], {
    message: "Select a driver",
  }),
  // qty = driver_value × factor (SOP §10 Step 4.1).
  factor: z
    .string()
    .trim()
    .min(1, "Factor is required")
    .regex(/^\d*\.?\d+$/, "Enter a positive number")
    .refine((v) => Number(v) > 0, "Factor must be greater than 0"),
  basis_note: z.string().trim().min(5, "Basis note is required — state the calibration basis"),
});

type ModelFactorFormValues = z.infer<typeof modelFactorFormSchema>;

interface DwlModelFactorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  model: DwlQuantityModel | null;
  /** When set, the dialog edits this existing line instead of creating a new one. */
  editingFactor: DwlModelFactor | null;
  editingFactorAssembly: { code: string; description: string; unit: string } | null;
  onSaved: () => void;
}

export function DwlModelFactorFormDialog({
  open,
  onOpenChange,
  tenantId,
  model,
  editingFactor,
  editingFactorAssembly,
  onSaved,
}: DwlModelFactorFormDialogProps) {
  const isEditing = editingFactor !== null;

  const [assemblies, setAssemblies] = useState<DwlAssembly[]>([]);
  const [loadingAssemblies, setLoadingAssemblies] = useState(false);
  const [assemblySearch, setAssemblySearch] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModelFactorFormValues>({
    resolver: zodResolver(modelFactorFormSchema),
    defaultValues: {
      assembly_id: "",
      driver: "gfa",
      factor: "",
      basis_note: "",
    },
  });

  const assemblyId = watch("assembly_id");
  const selectedAssembly = assemblies.find((a) => a.id === assemblyId) ?? null;

  useEffect(() => {
    if (!open) return;
    setAssemblySearch("");
    if (editingFactor) {
      reset({
        assembly_id: editingFactor.assembly_id,
        driver: editingFactor.driver,
        factor: String(editingFactor.factor),
        basis_note: editingFactor.basis_note,
      });
    } else {
      reset({ assembly_id: "", driver: "gfa", factor: "", basis_note: "" });
    }
    setLoadingAssemblies(true);
    listDwlAssembliesWithIsActive()
      .then(({ data, error }) => {
        if (!error && data) setAssemblies(data as DwlAssembly[]);
        setLoadingAssemblies(false);
      });
  }, [open, editingFactor, reset]);

  const filteredAssemblies = useMemo(() => {
    if (!assemblySearch.trim()) return assemblies.slice(0, 50);
    const q = assemblySearch.trim().toLowerCase();
    return assemblies
      .filter((a) => a.code.toLowerCase().includes(q) || a.description.toLowerCase().includes(q))
      .slice(0, 50);
  }, [assemblies, assemblySearch]);

  async function onSubmit(values: ModelFactorFormValues) {
    if (!model) return;
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save a factor");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      model_id: model.id,
      assembly_id: values.assembly_id,
      driver: values.driver,
      factor: Number(values.factor),
      basis_note: values.basis_note.trim(),
    };

    if (isEditing && editingFactor) {
      const { error } = await updateDwlModelFactorById({
          driver: payload.driver,
          factor: payload.factor,
          basis_note: payload.basis_note,
        }, editingFactor.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Factor updated");
    } else {
      const { error } = await insertDwlModelFactors(payload);
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message ?? "")) {
          toast.error("This assembly already has a factor on this model — edit the existing line instead");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Factor added");
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Factor" : "Add Factor"}
            {model ? ` — ${model.code}` : ""}
          </DialogTitle>
          <DialogDescription>
            Quantity ratio, not price: quantity of the assembly = (driver value from the project) ×
            factor. E.g. driver GFA, factor 0.045 → 8,000 m² GFA gives 360 m³ of column concrete.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Assembly *</Label>
            {isEditing ? (
              <div className="rounded-lg border border-input bg-muted/30 px-2.5 py-1.5 text-sm">
                <span className="font-mono text-xs font-medium">{editingFactorAssembly?.code}</span>{" "}
                {editingFactorAssembly?.description ?? "—"}
              </div>
            ) : selectedAssembly ? (
              <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1.5 text-sm">
                <span>
                  <span className="font-mono text-xs font-medium">{selectedAssembly.code}</span>{" "}
                  {selectedAssembly.description} <span className="text-muted-foreground">({selectedAssembly.unit})</span>
                </span>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setValue("assembly_id", "", { shouldValidate: true })}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={assemblySearch}
                    onChange={(e) => setAssemblySearch(e.target.value)}
                    placeholder={
                      loadingAssemblies ? "Loading assemblies…" : `Search ${assemblies.length} assemblies by code or description…`
                    }
                    className="pl-8"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-input">
                  {filteredAssemblies.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">
                      {assemblies.length === 0
                        ? "No assemblies exist yet — create one in Direct Works Assemblies first."
                        : "No matching assemblies"}
                    </p>
                  ) : (
                    filteredAssemblies.map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => setValue("assembly_id", a.id, { shouldValidate: true })}
                        className="flex w-full items-center gap-2 border-b border-border/50 px-2.5 py-1.5 text-left text-xs last:border-0 hover:bg-accent"
                      >
                        <span className="font-mono font-medium">{a.code}</span>
                        <span className="truncate text-muted-foreground">{a.description}</span>
                        <span className="ml-auto shrink-0 text-muted-foreground">{a.unit}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            {errors.assembly_id && <p className="text-xs text-destructive">{errors.assembly_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="driver">Driver *</Label>
              <select
                id="driver"
                {...register("driver")}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {DWL_MODEL_DRIVERS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              {errors.driver && <p className="text-xs text-destructive">{errors.driver.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="factor">Factor *</Label>
              <Input id="factor" inputMode="decimal" placeholder="e.g. 0.045" {...register("factor")} />
              {errors.factor && <p className="text-xs text-destructive">{errors.factor.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="basis_note">Basis Note *</Label>
            <Input
              id="basis_note"
              placeholder="e.g. Column concrete per m² GFA, calibrated from Project X"
              {...register("basis_note")}
            />
            {errors.basis_note && <p className="text-xs text-destructive">{errors.basis_note.message}</p>}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !model}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Save Factor" : "Add Factor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
