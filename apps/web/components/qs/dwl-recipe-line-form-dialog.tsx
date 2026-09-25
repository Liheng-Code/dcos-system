"use client";

import { useEffect, useMemo, useState } from "react";
import { useQsLibrarySearch } from "@/hooks/use-qs-library-search";
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
import { dwlDisplayResourceDescription as displayResourceDescription, type DwlResource, type DwlWorkItem, type DwlWorkItemResource } from "@/components/qs/dwl-types";

// waste_pct is entered here as a percentage (0–99.99) and converted to the
// stored fraction (0–<1) on submit — SOP §8: "waste_pct is stored as a
// fraction (0.03 = 3%)".
const recipeLineFormSchema = z.object({
  resource_id: z.string().min(1, "Select a resource"),
  consumption: z
    .string()
    .trim()
    .min(1, "Consumption is required")
    .regex(/^\d*\.?\d+$/, "Enter a positive number")
    .refine((v) => Number(v) > 0, "Consumption must be greater than 0"),
  waste_pct: z
    .string()
    .trim()
    .min(1, "Waste % is required (enter 0 if none)")
    .regex(/^\d*\.?\d+$/, "Enter a non-negative number")
    .refine((v) => Number(v) >= 0 && Number(v) < 100, "Waste % must be 0–99.99"),
  // Mandatory per SOP §8 Step 2.1: "a consumption without a basis is
  // rejected at review" — the DB rejects null too, but we surface this as a
  // proper form validation, not a raw DB error.
  basis_note: z.string().trim().min(5, "Basis note is required — state where this number came from"),
  sort_order: z
    .string()
    .trim()
    .min(1, "Sort order is required")
    .regex(/^\d+$/, "Enter a whole number"),
});

type RecipeLineFormValues = z.infer<typeof recipeLineFormSchema>;

interface DwlRecipeLineFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  workItem: DwlWorkItem | null;
  /** When set, the dialog edits this existing line instead of creating a new one. */
  editingLine: DwlWorkItemResource | null;
  nextSortOrder: number;
  /** When set, the resource picker only lists resources of this category. */
  resourceCategory?: DwlResource["category"];
  onSaved: () => void;
}

export function DwlRecipeLineFormDialog({
  open,
  onOpenChange,
  tenantId,
  workItem,
  editingLine,
  nextSortOrder,
  resourceCategory,
  onSaved,
}: DwlRecipeLineFormDialogProps) {
  const supabase = createClient();
  const isEditing = editingLine !== null;
  const isMaterial = resourceCategory === "material";
  const itemNoun = isMaterial ? "Material" : "Recipe Line";

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
  } = useForm<RecipeLineFormValues>({
    resolver: zodResolver(recipeLineFormSchema),
    defaultValues: {
      resource_id: "",
      consumption: "",
      waste_pct: "0",
      basis_note: "",
      sort_order: "0",
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
        consumption: String(editingLine.consumption),
        waste_pct: String(editingLine.waste_pct * 100),
        basis_note: editingLine.basis_note,
        sort_order: String(editingLine.sort_order),
      });
    } else {
      reset({
        resource_id: "",
        consumption: "",
        waste_pct: "0",
        basis_note: "",
        sort_order: String(nextSortOrder),
      });
    }
    setLoadingResources(true);
    let query = supabase
      .from("dwl_resources")
      .select("id, tenant_id, code, category, description, unit, spec_reference, is_active, created_by, created_at, updated_at")
      .eq("is_active", true);
    if (resourceCategory) query = query.eq("category", resourceCategory);
    query.order("code").then(({ data, error }) => {
      if (!error && data) setResources(data as DwlResource[]);
      setLoadingResources(false);
    });
  }, [open, editingLine, nextSortOrder, resourceCategory, reset, supabase]);

  // Hybrid search: ranked (typo-tolerant, meaning-based) hits first, plus the plain substring matches.
  const librarySearch = useQsLibrarySearch(resourceSearch, ["resource"]);
  const filteredResources = useMemo(() => {
    if (!resourceSearch.trim()) return resources.slice(0, 50);
    const q = resourceSearch.trim().toLowerCase();
    const ranks = librarySearch.ranks;
    const rankOf = (id: string) => ranks?.get(id) ?? Number.MAX_SAFE_INTEGER;
    return resources
      .filter((r) => (ranks?.has(r.id) ?? false) || r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      .sort((a, b) => rankOf(a.id) - rankOf(b.id))
      .slice(0, 50);
  }, [resources, resourceSearch, librarySearch.ranks]);

  async function onSubmit(values: RecipeLineFormValues) {
    if (!workItem) return;
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save a recipe line");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      work_item_id: workItem.id,
      resource_id: values.resource_id,
      consumption: Number(values.consumption),
      waste_pct: Number(values.waste_pct) / 100,
      basis_note: values.basis_note.trim(),
      sort_order: Number(values.sort_order),
    };

    if (isEditing && editingLine) {
      const { error } = await supabase
        .from("dwl_work_item_resources")
        .update({
          consumption: payload.consumption,
          waste_pct: payload.waste_pct,
          basis_note: payload.basis_note,
          sort_order: payload.sort_order,
        })
        .eq("id", editingLine.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Recipe line updated");
    } else {
      const { error } = await supabase.from("dwl_work_item_resources").insert(payload);
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message ?? "")) {
          toast.error("This resource is already a recipe line on this work item — edit the existing line instead");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Recipe line added");
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit ${itemNoun}` : `Add ${itemNoun}`}
            {workItem ? ` — ${workItem.code}` : ""}
          </DialogTitle>
          <DialogDescription>
            {isMaterial
              ? "Pick a material and how much of it this item uses. Its unit price is looked up automatically from Material Master — you don't enter a price here."
              : "No money here — consumption and waste only. The live price is looked up from Level 1 when this recipe is priced."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>{isMaterial ? "Material *" : "Resource *"}</Label>
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
                <p className="whitespace-normal break-words">
                  {displayResourceDescription(selectedResource.description)} <span className="text-muted-foreground">({selectedResource.unit})</span>
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={resourceSearch}
                    onChange={(e) => setResourceSearch(e.target.value)}
                    placeholder={
                      loadingResources
                        ? `Loading ${isMaterial ? "materials" : "resources"}…`
                        : `Search ${resources.length} ${isMaterial ? "materials" : "resources"} by code or description…`
                    }
                    className="pl-8"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-input">
                  {filteredResources.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">No matching {isMaterial ? "materials" : "resources"}</p>
                  ) : (
                    filteredResources.map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => setValue("resource_id", r.id, { shouldValidate: true })}
                        className="flex w-full flex-col gap-0.5 border-b border-border/50 px-2.5 py-2 text-left text-xs last:border-0 hover:bg-accent"
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-mono font-medium">{r.code}</span>
                          <span className="shrink-0 text-muted-foreground">{r.unit}</span>
                        </span>
                        <span className="whitespace-normal break-words text-muted-foreground">{displayResourceDescription(r.description)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
            {errors.resource_id && (
              <p className="text-xs text-destructive">{errors.resource_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="consumption">
                Consumption * {selectedResource ? `(${selectedResource.unit})` : ""}
              </Label>
              <Input id="consumption" inputMode="decimal" placeholder="1.00" {...register("consumption")} />
              {errors.consumption && (
                <p className="text-xs text-destructive">{errors.consumption.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="waste_pct">Waste %</Label>
              <Input id="waste_pct" inputMode="decimal" placeholder="3" {...register("waste_pct")} />
              {errors.waste_pct && (
                <p className="text-xs text-destructive">{errors.waste_pct.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input id="sort_order" inputMode="numeric" {...register("sort_order")} />
              {errors.sort_order && (
                <p className="text-xs text-destructive">{errors.sort_order.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="basis_note">Basis Note *</Label>
            <Input
              id="basis_note"
              placeholder="e.g. Gang of 6 places 30 m3/day, site records"
              {...register("basis_note")}
            />
            {errors.basis_note && (
              <p className="text-xs text-destructive">{errors.basis_note.message}</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !workItem}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Save Line" : "Add Line"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
