"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
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
import { DwlSupplierFormDialog } from "@/components/qs/dwl-supplier-form-dialog";
import { DWL_RATE_TYPES, DWL_UNITS } from "@/components/qs/dwl-types";

const rateFormSchema = z.object({
  supplier_id: z.string().trim().min(1, "Select a subcontractor"),
  trade: z.string().trim().min(1, "Trade is required"),
  item_description: z.string().trim().min(3, "Item description is required"),
  rate_type: z.string().trim().min(1, "Rate type is required"),
  unit: z.enum(DWL_UNITS, { message: "Unit is required" }),
  rate: z.string().trim().min(1, "Rate is required"),
  currency: z.string().trim().min(1, "Currency is required"),
  effective_date: z.string().trim().min(1, "Effective date is required"),
  scope_notes: z.string().trim().optional(),
});

type RateFormValues = z.infer<typeof rateFormSchema>;

interface SubcontractorOption {
  id: string;
  name: string;
  supplier_code: string | null;
}

const SELECT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";
const TEXTAREA_CLASS =
  "w-full min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface DwlSubconRateFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onSaved: () => void;
}

export function DwlSubconRateFormDialog({ open, onOpenChange, tenantId, userId, onSaved }: DwlSubconRateFormDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [showNewSubcontractor, setShowNewSubcontractor] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RateFormValues>({
    resolver: zodResolver(rateFormSchema),
    defaultValues: {
      supplier_id: "", trade: "", item_description: "", rate_type: "Unit Rate", unit: "m2",
      rate: "", currency: "USD", effective_date: new Date().toISOString().slice(0, 10), scope_notes: "",
    },
  });

  const loadLookups = useMemo(
    () => async () => {
      const [subRes, tradeRes] = await Promise.all([
        supabase
          .from("dwl_supplier_profiles")
          .select("supplier_id, supplier_code, dwl_suppliers!inner(id, name, is_active)")
          .eq("vendor_kind", "subcontractor")
          .eq("dwl_suppliers.is_active", true),
        supabase.from("dwl_subcon_attributes").select("trade"),
      ]);
      const subs = ((subRes.data ?? []) as unknown as { supplier_id: string; supplier_code: string | null; dwl_suppliers: { id: string; name: string } }[])
        .map((r) => ({ id: r.supplier_id, name: r.dwl_suppliers.name, supplier_code: r.supplier_code }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setSubcontractors(subs);
      const tradeSet = new Set<string>();
      for (const row of (tradeRes.data ?? []) as { trade: string | null }[]) if (row.trade) tradeSet.add(row.trade);
      setTrades(Array.from(tradeSet).sort());
    },
    [supabase]
  );

  useEffect(() => {
    if (!open) return;
    void (async () => {
      await loadLookups();
      reset({
        supplier_id: "", trade: "", item_description: "", rate_type: "Unit Rate", unit: "m2",
        rate: "", currency: "USD", effective_date: new Date().toISOString().slice(0, 10), scope_notes: "",
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reset]);

  async function onSubmit(values: RateFormValues) {
    if (!tenantId) {
      toast.error("No tenant assigned to your profile — cannot save a trade rate");
      return;
    }
    const rate = Number(values.rate);
    if (!Number.isFinite(rate) || rate < 0) {
      toast.error("Rate must be a non-negative number");
      return;
    }

    // Find-or-create the trade item (dwl_resources + dwl_subcon_attributes),
    // matched by trade + item description — a new Effective Date for the
    // SAME item appends a new price row rather than duplicating the item,
    // matching the append-only price-history principle already used by
    // Material Master.
    const { data: existingAttrs } = await supabase
      .from("dwl_subcon_attributes")
      .select("resource_id, dwl_resources!inner(id, description)")
      .eq("trade", values.trade.trim());
    const match = ((existingAttrs ?? []) as unknown as { resource_id: string; dwl_resources: { description: string } }[])
      .find((r) => r.dwl_resources.description.trim().toLowerCase() === values.item_description.trim().toLowerCase());

    let resourceId = match?.resource_id;
    if (!resourceId) {
      const codeSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
      const tradeGroup = values.trade.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X") || "GEN";
      const { data: resource, error: resErr } = await supabase
        .from("dwl_resources")
        .insert({
          tenant_id: tenantId, code: `S-${tradeGroup}-${codeSuffix}`, category: "subcon",
          description: values.item_description.trim(), unit: values.unit, created_by: userId,
        })
        .select("id")
        .single();
      if (resErr || !resource) {
        toast.error(resErr?.message ?? "Failed to create the trade item");
        return;
      }
      resourceId = resource.id as string;
      const { error: attrErr } = await supabase.from("dwl_subcon_attributes").insert({
        resource_id: resourceId, tenant_id: tenantId, trade: values.trade.trim(), created_by: userId,
      });
      if (attrErr) {
        // Two-step spine+companion insert — never leave an orphaned dwl_resources row.
        await supabase.from("dwl_resources").delete().eq("id", resourceId);
        toast.error(attrErr.message);
        return;
      }
    }

    const { error: priceErr } = await supabase.from("dwl_resource_prices").insert({
      tenant_id: tenantId, resource_id: resourceId, supplier_id: values.supplier_id,
      unit_price: rate, currency: values.currency.trim().toUpperCase(), valid_from: values.effective_date,
      source_type: "quotation", rate_type: values.rate_type, notes: values.scope_notes?.trim() || null,
      created_by: userId,
    });
    if (priceErr) {
      toast.error(priceErr.message);
      return;
    }

    toast.success("Trade rate saved");
    onSaved();
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Trade Rate</DialogTitle>
            <DialogDescription>
              Record a commercial rate for a subcontractor trade item. Re-adding the same item with a new
              Effective Date appends a new rate to its history rather than overwriting the previous one.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="supplier_id">Subcontractor *</Label>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline"
                  onClick={() => setShowNewSubcontractor(true)}
                >
                  <Plus className="h-3 w-3" /> New Subcontractor
                </button>
              </div>
              <select id="supplier_id" {...register("supplier_id")} className={SELECT_CLASS}>
                <option value="">— Select —</option>
                {subcontractors.map((s) => (
                  <option key={s.id} value={s.id}>{s.supplier_code ? `${s.supplier_code} — ` : ""}{s.name}</option>
                ))}
              </select>
              {errors.supplier_id && <p className="text-xs text-destructive">{errors.supplier_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="trade">Trade *</Label>
                <Input id="trade" list="dwl-subcon-trade-options" placeholder="e.g. Waterproofing & Joint Sealing" {...register("trade")} />
                <datalist id="dwl-subcon-trade-options">
                  {trades.map((t) => <option key={t} value={t} />)}
                </datalist>
                {errors.trade && <p className="text-xs text-destructive">{errors.trade.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="rate_type">Rate Type *</Label>
                <select id="rate_type" {...register("rate_type")} className={SELECT_CLASS}>
                  {DWL_RATE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="item_description">Item Description *</Label>
              <textarea
                id="item_description"
                className={TEXTAREA_CLASS}
                placeholder="e.g. Torch-applied 4mm SBS bituminous roof membrane installation including primer, heat welding, and perimeter upstands"
                {...register("item_description")}
              />
              {errors.item_description && <p className="text-xs text-destructive">{errors.item_description.message}</p>}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="unit">Unit *</Label>
                <select id="unit" {...register("unit")} className={SELECT_CLASS}>
                  {DWL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="rate">Commercial Rate *</Label>
                <Input id="rate" type="number" min="0" step="0.01" placeholder="10.00" {...register("rate")} />
                {errors.rate && <p className="text-xs text-destructive">{errors.rate.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" placeholder="USD" {...register("currency")} onChange={(e) => setValue("currency", e.target.value.toUpperCase())} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="effective_date">Effective Date *</Label>
              <Input id="effective_date" type="date" {...register("effective_date")} />
              {errors.effective_date && <p className="text-xs text-destructive">{errors.effective_date.message}</p>}
            </div>

            <div className="space-y-1">
              <Label htmlFor="scope_notes">Scope Notes</Label>
              <textarea
                id="scope_notes"
                className={TEXTAREA_CLASS}
                placeholder="e.g. Includes material and labor with 10-year warranty"
                {...register("scope_notes")}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Trade Rate
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DwlSupplierFormDialog
        open={showNewSubcontractor}
        onOpenChange={setShowNewSubcontractor}
        tenantId={tenantId}
        userId={userId}
        vendorKind="subcontractor"
        onSaved={() => void loadLookups()}
      />
    </>
  );
}
