"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { insertDwlAssemblyItems, listDwlWorkItemsWithIsActive, updateDwlAssemblyItemById } from "@/lib/qs/qs-queries";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DwlAssembly, DwlAssemblyItem, DwlWorkItem } from "@/components/qs/dwl-types";

const assemblyItemFormSchema = z.object({
  work_item_id: z.string().min(1, "Select a work item"),
  // A DESIGN RATIO, not waste — e.g. 2.00 = plaster on both faces (SOP §9
  // Step 3.2 rule 1). Waste already lives inside the Level 2 work item
  // recipe, never here.
  qty_per_unit: z
    .string()
    .trim()
    .min(1, "Design ratio is required")
    .regex(/^\d*\.?\d+$/, "Enter a positive number")
    .refine((v) => Number(v) > 0, "Design ratio must be greater than 0"),
  // Mandatory per SOP §9 — same required-field pattern as work item recipe
  // lines; the DB rejects a null value too, but this is surfaced as a form
  // validation, not a raw DB error.
  basis_note: z.string().trim().min(5, "Basis note is required — state where this ratio came from"),
  sort_order: z
    .string()
    .trim()
    .min(1, "Sort order is required")
    .regex(/^\d+$/, "Enter a whole number"),
});

type AssemblyItemFormValues = z.infer<typeof assemblyItemFormSchema>;

interface DwlAssemblyItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  assembly: DwlAssembly | null;
  /** When set, the dialog edits this existing line instead of creating a new one. */
  editingItem: DwlAssemblyItem | null;
  editingItemWorkItem: { code: string; description: string; unit: string } | null;
  nextSortOrder: number;
  onSaved: () => void;
}

export function DwlAssemblyItemFormDialog({
  open,
  onOpenChange,
  tenantId,
  assembly,
  editingItem,
  editingItemWorkItem,
  nextSortOrder,
  onSaved,
}: DwlAssemblyItemFormDialogProps) {
  const isEditing = editingItem !== null;

  const [workItems, setWorkItems] = useState<DwlWorkItem[]>([]);
  const [loadingWorkItems, setLoadingWorkItems] = useState(false);
  const [workItemSearch, setWorkItemSearch] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssemblyItemFormValues>({
    resolver: zodResolver(assemblyItemFormSchema),
    defaultValues: {
      work_item_id: "",
      qty_per_unit: "",
      basis_note: "",
      sort_order: "0",
    },
  });

  const workItemId = watch("work_item_id");
  const selectedWorkItem = workItems.find((w) => w.id === workItemId) ?? null;

  useEffect(() => {
    if (!open) return;
    setWorkItemSearch("");
    if (editingItem) {
      reset({
        work_item_id: editingItem.work_item_id,
        qty_per_unit: String(editingItem.qty_per_unit),
        basis_note: editingItem.basis_note,
        sort_order: String(editingItem.sort_order),
      });
    } else {
      reset({ work_item_id: "", qty_per_unit: "", basis_note: "", sort_order: String(nextSortOrder) });
    }
    setLoadingWorkItems(true);
    listDwlWorkItemsWithIsActive()
      .then(({ data, error }) => {
        if (!error && data) setWorkItems(data as DwlWorkItem[]);
        setLoadingWorkItems(false);
      });
  }, [open, editingItem, nextSortOrder, reset]);

  const filteredWorkItems = useMemo(() => {
    if (!workItemSearch.trim()) return workItems.slice(0, 50);
    const q = workItemSearch.trim().toLowerCase();
    return workItems
      .filter((w) => w.code.toLowerCase().includes(q) || w.description.toLowerCase().includes(q))
      .slice(0, 50);
  }, [workItems, workItemSearch]);

  async function onSubmit(values: AssemblyItemFormValues) {
    if (!assembly) return;
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save an assembly item");
      return;
    }

    const payload = {
      tenant_id: tenantId,
      assembly_id: assembly.id,
      work_item_id: values.work_item_id,
      qty_per_unit: Number(values.qty_per_unit),
      basis_note: values.basis_note.trim(),
      sort_order: Number(values.sort_order),
    };

    if (isEditing && editingItem) {
      const { error } = await updateDwlAssemblyItemById({
          qty_per_unit: payload.qty_per_unit,
          basis_note: payload.basis_note,
          sort_order: payload.sort_order,
        }, editingItem.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Assembly item updated");
    } else {
      const { error } = await insertDwlAssemblyItems(payload);
      if (error) {
        if (error.code === "23505" || /unique/i.test(error.message ?? "")) {
          toast.error("This work item is already a line on this assembly — edit the existing line instead");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Assembly item added");
    }

    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Assembly Item" : "Add Assembly Item"}
            {assembly ? ` — ${assembly.code}` : ""}
          </DialogTitle>
          <DialogDescription>
            Design ratio, not waste — e.g. 2.00 means the work item applies twice per unit of this
            assembly (plaster on both faces). Waste already lives inside the work item&apos;s own recipe.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="space-y-1">
            <Label>Work Item *</Label>
            {isEditing ? (
              <div className="flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-2.5 py-1.5 text-xs">
                <span className="font-mono font-medium">{editingItemWorkItem?.code}</span>
                <span className="flex-1 truncate">{editingItemWorkItem?.description ?? "—"}</span>
                {editingItemWorkItem?.unit && (
                  <span className="shrink-0 text-muted-foreground">{editingItemWorkItem.unit}</span>
                )}
              </div>
            ) : selectedWorkItem ? (
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5 py-1.5 text-xs">
                <span className="font-mono font-medium">{selectedWorkItem.code}</span>
                <span className="flex-1 truncate">{selectedWorkItem.description}</span>
                <span className="shrink-0 text-muted-foreground">{selectedWorkItem.unit}</span>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-primary hover:underline"
                  onClick={() => setValue("work_item_id", "", { shouldValidate: true })}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={workItemSearch}
                    onChange={(e) => setWorkItemSearch(e.target.value)}
                    placeholder={loadingWorkItems ? "Loading work items…" : `Search ${workItems.length} work items by code or description…`}
                    className="pl-8"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-input">
                  {filteredWorkItems.length === 0 ? (
                    <p className="p-3 text-center text-xs text-muted-foreground">No matching work items</p>
                  ) : (
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead className="w-24">Code</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-14">Unit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWorkItems.map((w) => (
                          <TableRow
                            key={w.id}
                            onClick={() => setValue("work_item_id", w.id, { shouldValidate: true })}
                            className="cursor-pointer"
                          >
                            <TableCell className="font-mono text-xs font-medium">{w.code}</TableCell>
                            <TableCell className="text-xs">
                              <div className="line-clamp-1">{w.description}</div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{w.unit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            )}
            {errors.work_item_id && (
              <p className="text-xs text-destructive">{errors.work_item_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="qty_per_unit">Design Ratio *</Label>
              <Input id="qty_per_unit" inputMode="decimal" placeholder="e.g. 2.00" {...register("qty_per_unit")} />
              <p className="text-[11px] text-muted-foreground">
                Qty per {assembly ? assembly.unit : "unit"} of this assembly
              </p>
              {errors.qty_per_unit && (
                <p className="text-xs text-destructive">{errors.qty_per_unit.message}</p>
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
              placeholder="e.g. Two faces plastered per m2 of wall"
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
            <Button type="submit" disabled={isSubmitting || !assembly}>
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Save Item" : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
