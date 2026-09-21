"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
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
import { dwlDisplayResourceDescription as displayResourceDescription, type DwlAssemblyCrewRow, type DwlAssemblyEquipmentRow, type DwlResource } from "@/components/qs/dwl-types";

const resourceLineFormSchema = z.object({
  resource_id: z.string().min(1, "Select a resource"),
  role_label: z.string().trim().min(1, "Label is required"),
  quantity: z
    .string()
    .trim()
    .min(1, "Quantity is required")
    .regex(/^\d*\.?\d+$/, "Enter a positive number")
    .refine((v) => Number(v) > 0, "Quantity must be greater than 0"),
  description: z.string().trim(),
  benchmark_note: z.string().trim(),
  sort_order: z
    .string()
    .trim()
    .min(1, "Sort order is required")
    .regex(/^\d+$/, "Enter a whole number"),
});

type ResourceLineFormValues = z.infer<typeof resourceLineFormSchema>;

interface DwlAssemblyResourceLineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  assemblyId: string;
  kind: "crew" | "equipment";
  editingLine: DwlAssemblyCrewRow | DwlAssemblyEquipmentRow | null;
  nextSortOrder: number;
  onSaved: () => void;
}

export function DwlAssemblyResourceLineFormDialog({
  open,
  onOpenChange,
  tenantId,
  assemblyId,
  kind,
  editingLine,
  nextSortOrder,
  onSaved,
}: DwlAssemblyResourceLineFormDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const isEditing = editingLine !== null;
  const isCrew = kind === "crew";
  const table = isCrew ? "dwl_assembly_crew" : "dwl_assembly_equipment";
  const resourceCategory = isCrew ? "labor" : "equipment";
  const noun = isCrew ? "Crew Member" : "Equipment Item";

  const [resources, setResources] = useState<DwlResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceSearch, setResourceSearch] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResourceLineFormValues>({
    resolver: zodResolver(resourceLineFormSchema),
    defaultValues: {
      resource_id: "", role_label: "", quantity: "1", description: "", benchmark_note: "", sort_order: "0",
    },
  });

  const resourceId = watch("resource_id");
  const selectedResource = resources.find((r) => r.id === resourceId) ?? null;

  useEffect(() => {
    if (!open) return;
    setResourceSearch("");
    if (editingLine) {
      reset({
        resource_id: editingLine.resource_id,
        role_label: editingLine.role_label,
        quantity: String(editingLine.quantity),
        description: editingLine.description ?? "",
        benchmark_note: editingLine.benchmark_note ?? "",
        sort_order: String(editingLine.sort_order),
      });
    } else {
      reset({ resource_id: "", role_label: "", quantity: "1", description: "", benchmark_note: "", sort_order: String(nextSortOrder) });
    }
    setLoadingResources(true);
    supabase
      .from("dwl_resources")
      .select("id, tenant_id, code, category, description, unit, spec_reference, is_active, created_by, created_at, updated_at")
      .eq("is_active", true)
      .eq("category", resourceCategory)
      .order("code")
      .then(({ data, error }) => {
        if (!error && data) setResources(data as DwlResource[]);
        setLoadingResources(false);
      });
  }, [open, editingLine, nextSortOrder, resourceCategory, reset, supabase]);

  const filteredResources = useMemo(() => {
    if (!resourceSearch.trim()) return resources.slice(0, 50);
    const q = resourceSearch.trim().toLowerCase();
    return resources
      .filter((r) => r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      .slice(0, 50);
  }, [resources, resourceSearch]);

  async function onSubmit(values: ResourceLineFormValues) {
    if (!tenantId) {
      toast.error(`No tenant assigned to your profile — cannot save this ${noun.toLowerCase()}`);
      return;
    }

    const payload = {
      tenant_id: tenantId,
      assembly_id: assemblyId,
      resource_id: values.resource_id,
      role_label: values.role_label.trim(),
      quantity: Number(values.quantity),
      description: values.description.trim() || null,
      ...(isCrew ? { benchmark_note: values.benchmark_note.trim() || null } : {}),
      sort_order: Number(values.sort_order),
    };

    if (isEditing && editingLine) {
      const { error } = await supabase
        .from(table)
        .update({
          role_label: payload.role_label,
          quantity: payload.quantity,
          description: payload.description,
          ...(isCrew ? { benchmark_note: values.benchmark_note.trim() || null } : {}),
          sort_order: payload.sort_order,
        })
        .eq("id", editingLine.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(`${noun} updated`);
    } else {
      const { error } = await supabase.from(table).insert(payload);
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message ?? "")) {
          toast.error(`This resource is already on the ${isCrew ? "crew" : "equipment"} list — edit the existing line instead`);
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success(`${noun} added`);
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
          <DialogDescription>
            {isCrew
              ? "Day rate is looked up live from this resource's current Material/Resource price — not entered here."
              : "Day/rental rate is looked up live from this resource's current Material/Resource price — not entered here."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Resource *</Label>
            {isEditing ? (
              <div className="rounded-lg border border-input bg-muted/30 px-2.5 py-1.5 text-sm">
                <span className="font-mono text-xs font-medium">{selectedResource?.code}</span>{" "}
                {selectedResource ? displayResourceDescription(selectedResource.description) : "—"}
              </div>
            ) : selectedResource ? (
              <div className="flex flex-col gap-1 rounded-lg border border-input px-2.5 py-2 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-medium">{selectedResource.code}</span>
                  <button
                    type="button"
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                    onClick={() => setValue("resource_id", "", { shouldValidate: true })}
                  >
                    Change
                  </button>
                </div>
                <p className="whitespace-normal break-words">{displayResourceDescription(selectedResource.description)}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={resourceSearch}
                    onChange={(e) => setResourceSearch(e.target.value)}
                    placeholder={loadingResources ? "Loading resources…" : `Search ${resources.length} ${resourceCategory} resources…`}
                    className="pl-8"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-input">
                  {filteredResources.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">No matching resources</p>
                  ) : (
                    filteredResources.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => {
                          setValue("resource_id", r.id, { shouldValidate: true });
                          if (!watch("role_label")) setValue("role_label", displayResourceDescription(r.description));
                        }}
                        className="flex w-full flex-col gap-0.5 border-b border-border/50 px-2.5 py-2 text-left text-xs last:border-0 hover:bg-accent"
                      >
                        <span className="font-mono font-medium">{r.code}</span>
                        <span className="whitespace-normal break-words text-muted-foreground">{displayResourceDescription(r.description)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            {errors.resource_id && <p className="text-xs text-destructive">{errors.resource_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="role_label">Label *</Label>
              <Input id="role_label" placeholder="e.g. Skilled Mason (Thmar)" {...register("role_label")} />
              {errors.role_label && <p className="text-xs text-destructive">{errors.role_label.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="quantity">Quantity *</Label>
              <Input id="quantity" inputMode="decimal" placeholder="1" {...register("quantity")} />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="description">{isCrew ? "Role Description" : "Scope / Specification"}</Label>
            <Input
              id="description"
              placeholder={isCrew ? "e.g. Sets out line & level, fixes framing, joint tooling" : "e.g. Standard 2.0m rolling staging"}
              {...register("description")}
            />
          </div>

          {isCrew && (
            <div className="space-y-1">
              <Label htmlFor="benchmark_note">Market Benchmark Note</Label>
              <Input id="benchmark_note" placeholder="e.g. Cambodia Market Benchmark: $20.00 – $25.00 / 8-hour shift" {...register("benchmark_note")} />
            </div>
          )}

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
              {isEditing ? "Save" : `Add ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
