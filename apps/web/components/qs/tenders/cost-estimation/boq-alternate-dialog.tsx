"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { alternateAmount, alternateDelta, type TenderBoqItemAlternate } from "@/lib/qs/boq-alternates";
import { boqUnitRate, createBoqAlternate, updateBoqAlternate } from "@/lib/qs/tender-cost-service";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface AlternateParentLine {
  id: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  total_amount: number | null;
}

const NUMBER_RE = /^\d+(\.\d+)?$/;
const numField = (label: string) => z.string().trim().regex(NUMBER_RE, `${label}: enter a non-negative number`);

const alternateFormSchema = z.object({
  description: z.string().trim().min(1, "Description is required"),
  labor_net_cost: numField("Labor net"),
  labor_margin_pct: numField("Labor margin"),
  material_net_cost: numField("Material net"),
  material_margin_pct: numField("Material margin"),
  notes: z.string().trim(),
});

type AlternateFormValues = z.infer<typeof alternateFormSchema>;

interface BoqAlternateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenderId: string;
  item: AlternateParentLine | null;
  /** When set, the dialog edits this alternate; otherwise it creates a new one. */
  alternate?: TenderBoqItemAlternate | null;
  /** Default margins for a new alternate (tender-level defaults). */
  defaultLaborMarginPct?: number;
  defaultMaterialMarginPct?: number;
  onSaved: () => void;
}

const num = (s: string | undefined) => (s && NUMBER_RE.test(s.trim()) ? parseFloat(s) : 0);

export function BoqAlternateDialog({
  open, onOpenChange, tenderId, item, alternate, defaultLaborMarginPct = 0, defaultMaterialMarginPct = 0, onSaved,
}: BoqAlternateDialogProps) {
  const isEdit = !!alternate;
  const {
    register, handleSubmit, reset, control, setError,
    formState: { errors, isSubmitting },
  } = useForm<AlternateFormValues>({
    resolver: zodResolver(alternateFormSchema),
    defaultValues: {
      description: "", labor_net_cost: "0", labor_margin_pct: "0", material_net_cost: "0", material_margin_pct: "0", notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (alternate) {
      reset({
        description: alternate.description,
        labor_net_cost: String(alternate.labor_net_cost),
        labor_margin_pct: String(alternate.labor_margin_pct),
        material_net_cost: String(alternate.material_net_cost),
        material_margin_pct: String(alternate.material_margin_pct),
        notes: alternate.notes ?? "",
      });
    } else {
      reset({
        description: "", labor_net_cost: "0", labor_margin_pct: String(defaultLaborMarginPct),
        material_net_cost: "0", material_margin_pct: String(defaultMaterialMarginPct), notes: "",
      });
    }
  }, [open, alternate, reset, defaultLaborMarginPct, defaultMaterialMarginPct]);

  const [labNet, labPct, matNet, matPct] = useWatch({ control, name: ["labor_net_cost", "labor_margin_pct", "material_net_cost", "material_margin_pct"] });
  const buildUpUnchanged =
    !!alternate &&
    num(labNet) === alternate.labor_net_cost && num(labPct) === alternate.labor_margin_pct &&
    num(matNet) === alternate.material_net_cost && num(matPct) === alternate.material_margin_pct;
  // The DB keeps a swapped-in rate verbatim until the build-up is edited, and otherwise
  // stores round(rate, 2) — preview the same figure so it matches what gets saved.
  const altRate = alternate && buildUpUnchanged
    ? alternate.unit_rate
    : Math.round((boqUnitRate(num(labNet), num(labPct), num(matNet), num(matPct)) + Number.EPSILON) * 100) / 100;
  const qty = item?.quantity ?? 0;
  const altAmt = alternateAmount(qty, altRate);
  const delta = alternateDelta(qty, altRate, item?.total_amount ?? 0);

  async function onSubmit(values: AlternateFormValues) {
    if (!item) return;
    const payload = {
      description: values.description,
      notes: values.notes || null,
      labor_net_cost: num(values.labor_net_cost),
      labor_margin_pct: num(values.labor_margin_pct),
      material_net_cost: num(values.material_net_cost),
      material_margin_pct: num(values.material_margin_pct),
    };
    try {
      if (alternate) {
        // Send only the build-up fields that changed: any build-up field in the update
        // re-derives the rate (and a net change re-tags it manual), which would wipe a
        // swapped-in library rate on a description- or notes-only edit.
        const update: Parameters<typeof updateBoqAlternate>[1] = { description: payload.description, notes: payload.notes };
        if (payload.labor_net_cost !== alternate.labor_net_cost) update.labor_net_cost = payload.labor_net_cost;
        if (payload.labor_margin_pct !== alternate.labor_margin_pct) update.labor_margin_pct = payload.labor_margin_pct;
        if (payload.material_net_cost !== alternate.material_net_cost) update.material_net_cost = payload.material_net_cost;
        if (payload.material_margin_pct !== alternate.material_margin_pct) update.material_margin_pct = payload.material_margin_pct;
        await updateBoqAlternate(alternate.id, update);
        toast.success(`Alt ${alternate.alt_no} updated`);
      } else {
        const created = await createBoqAlternate({ tender_id: tenderId, boq_item_id: item.id, ...payload });
        toast.success(`Alt ${created.alt_no} added`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save alternate";
      setError("description", { message });
      toast.error(message);
    }
  }

  const deltaCls = delta > 0 ? "text-amber-700" : delta < 0 ? "text-green-700" : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit Alt ${alternate?.alt_no}` : "Add alternate rate"}</DialogTitle>
          <DialogDescription>
            Alternates are memo-only: they are not included in the tender total (Direct Works) unless promoted to base.
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium">{item.item_code} — {item.description}</div>
            <div className="text-muted-foreground">
              {fmt(item.quantity)} {item.unit} · Base rate ${fmt(item.unit_rate)} · Base amount ${fmt(item.total_amount ?? 0)}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="space-y-1">
            <Label htmlFor="alt-description">Description *</Label>
            <Input id="alt-description" {...register("description")} placeholder="e.g. Imported tile instead of local" />
            {errors.description && <p className="text-xs text-red-600">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="alt-lab-net">Labor net cost</Label>
              <Input id="alt-lab-net" inputMode="decimal" {...register("labor_net_cost")} />
              {errors.labor_net_cost && <p className="text-xs text-red-600">{errors.labor_net_cost.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="alt-lab-pct">Labor margin %</Label>
              <Input id="alt-lab-pct" inputMode="decimal" {...register("labor_margin_pct")} />
              {errors.labor_margin_pct && <p className="text-xs text-red-600">{errors.labor_margin_pct.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="alt-mat-net">Material net cost</Label>
              <Input id="alt-mat-net" inputMode="decimal" {...register("material_net_cost")} />
              {errors.material_net_cost && <p className="text-xs text-red-600">{errors.material_net_cost.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="alt-mat-pct">Material margin %</Label>
              <Input id="alt-mat-pct" inputMode="decimal" {...register("material_margin_pct")} />
              {errors.material_margin_pct && <p className="text-xs text-red-600">{errors.material_margin_pct.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="alt-notes">Notes</Label>
            <textarea
              id="alt-notes"
              rows={2}
              {...register("notes")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3 text-xs">
            <div>
              <div className="text-muted-foreground">Alt rate</div>
              <div className="font-mono font-medium">${fmt(altRate)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Alt amount</div>
              <div className="font-mono font-medium">${fmt(altAmt)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Δ vs base</div>
              <div className={`font-mono font-medium ${deltaCls}`}>
                {delta > 0 ? "+" : delta < 0 ? "−" : ""}${fmt(Math.abs(delta))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !item}>
              {isSubmitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? "Save" : "Add alternate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
