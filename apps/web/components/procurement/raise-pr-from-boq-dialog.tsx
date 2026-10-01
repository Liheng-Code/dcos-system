"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getProjectById, insertPr, insertPrItems, listBoqRequisitionStatusByBoqItemIds, listPrsByProjectId } from "@/lib/procurement/procurement-service";
import { Loader2, ShoppingCart, Hash, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BoqItemForPr } from "@/lib/qs/public";

interface Props {
  projectId: string;
  projectName?: string;
  projectCode?: string;
  companyCode?: string | null;
  projectLocation?: string | null;
  boqItemIds: string[];
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
  triggerClassName?: string;
}

export function RaisePrFromBoqDialog({
  projectId,
  projectName,
  projectCode,
  companyCode,
  projectLocation,
  boqItemIds,
  triggerLabel,
  triggerSize = "sm",
  triggerClassName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceItems, setSourceItems] = useState<BoqItemForPr[]>([]);
  const [generatedPrNumber, setGeneratedPrNumber] = useState("");

  const [form, setForm] = useState({
    preparation_date: new Date().toISOString().slice(0, 10),
    required_date: "",
    ship_to: "",
    priority: "normal",
    purpose: "",
  });

  const [lineItems, setLineItems] = useState<{
    boq_item_id: string;
    item_code: string;
    description: string;
    unit: string;
    quantity: number;
    unit_rate: number;
    budget_code: string;
    notes: string;
  }[]>([]);

  const generatePrNumber = useCallback(async () => {
    let pc = projectCode ?? "";
    let cc = companyCode ?? "";
    if (!pc || !cc) {
      const { data: proj } = await getProjectById(projectId, "project_code, company_code");
      if (proj) {
        pc = proj.project_code;
        cc = proj.company_code ?? "";
      }
    }
    const { data: existingPRs } = await listPrsByProjectId(projectId);
    const prefix = `${pc}-${cc || "DCOS"}-PR-`;
    let maxSeq = 0;
    for (const pr of (existingPRs ?? [])) {
      if (pr.pr_number.startsWith(prefix)) {
        const num = parseInt(pr.pr_number.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    }
    setGeneratedPrNumber(`${prefix}${String(maxSeq + 1).padStart(3, "0")}`);
  }, [projectId, projectCode, companyCode]);

  useEffect(() => {
    if (!open || boqItemIds.length === 0) return;
    setLoading(true);
    listBoqRequisitionStatusByBoqItemIds(boqItemIds).then((boqRes) => {
      if (boqRes.error) { toast.error(boqRes.error.message); return; }
      const rows = (boqRes.data ?? []) as BoqItemForPr[];
      setSourceItems(rows);
      setLineItems(
        rows.map((bi) => ({
          boq_item_id: bi.boq_item_id,
          item_code: bi.item_no ?? bi.item_code ?? "",
          description: bi.description,
          unit: bi.unit,
          quantity: bi.remaining_quantity,
          unit_rate: bi.unit_rate,
          budget_code: bi.elemental_category ?? "",
          notes: "",
        })),
      );
    }, () => {}).then(() => {
      setLoading(false);
      generatePrNumber();
    });
    if (projectLocation) {
      setForm(prev => ({ ...prev, ship_to: projectLocation }));
    } else {
      getProjectById(projectId, "location").then(({ data }) => {
        if (data?.location) setForm(prev => ({ ...prev, ship_to: data.location }));
      });
    }
  }, [open, boqItemIds, projectLocation, projectId, generatePrNumber]);

  function updateLine(idx: number, field: string, value: string | number) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  }

  function totalEstimated() {
    return lineItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_rate || 0), 0);
  }

  const hasOverReq = lineItems.some((l, i) => {
    const remaining = sourceItems[i]?.remaining_quantity ?? 0;
    return l.quantity > remaining;
  });

  async function handleSubmit() {
    if (!lineItems.length) {
      toast.error("No items to requisition");
      return;
    }
    const overItem = lineItems.find((l, i) => {
      const remaining = sourceItems[i]?.remaining_quantity ?? 0;
      return l.quantity > remaining;
    });
    if (overItem) {
      toast.error("One or more items exceed the remaining BOQ quantity");
      return;
    }

    const valid = lineItems.filter((l) => l.description.trim() && l.quantity > 0);
    if (!valid.length) {
      toast.error("At least one item must have a description and quantity > 0");
      return;
    }

    setSaving(true);

    const { data: prData, error: prError } = await insertPr({
          pr_number: generatedPrNumber,
          project_id: projectId,
          preparation_date: form.preparation_date || null,
          required_date: form.required_date || null,
          ship_to: form.ship_to || null,
          priority: form.priority,
          notes: form.purpose || null,
        });

    if (prError) {
      toast.error(prError.message);
      setSaving(false);
      return;
    }

    const prId = (prData as { id: string }).id;

    const itemInserts = valid.map((item, idx) => ({
      pr_id: prId,
      line_no: idx + 1,
      boq_item_id: item.boq_item_id,
      item_code: item.item_code || null,
      item_description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      estimated_unit_price: item.unit_rate || null,
      estimated_total: (item.quantity || 0) * (item.unit_rate || 0),
      budget_code: item.budget_code || null,
      notes: item.notes || null,
    }));

    const { error: itemsError } = await insertPrItems(itemInserts);

    if (itemsError) {
      toast.error(itemsError.message);
      setSaving(false);
      return;
    }

    toast.success("Purchase requisition created from BOQ");
    setOpen(false);
    router.push(`/dashboard/procurement/pr/${prId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size={triggerSize} variant="outline" className={triggerClassName ?? "gap-1.5"} />}
        onClick={(e) => { e.stopPropagation(); }}
      >
        <ShoppingCart className="h-3.5 w-3.5" />
        {triggerLabel ?? "Raise PR"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Raise Purchase Requisition</DialogTitle>
          <DialogDescription>
            {projectName ? `${projectName} — ` : ""}
            {boqItemIds.length} BOQ item{boqItemIds.length !== 1 ? "s" : ""} selected.
            Quantities default to the remaining un-requisitioned amount.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-mono">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{generatedPrNumber || "Generating..."}</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date Prepared</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={form.preparation_date}
                  onChange={(e) => setForm((p) => ({ ...p, preparation_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Required Date</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={form.required_date}
                  onChange={(e) => setForm((p) => ({ ...p, required_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Ship To</Label>
              <Input
                className="h-8 text-xs"
                value={form.ship_to}
                onChange={(e) => setForm((p) => ({ ...p, ship_to: e.target.value }))}
                placeholder="Project location"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Purpose</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none resize-y min-h-[50px]"
                value={form.purpose}
                onChange={(e) => setForm((p) => ({ ...p, purpose: e.target.value }))}
                placeholder="Describe the purpose of this requisition..."
                rows={2}
              />
            </div>

            <div className="rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                    <tr className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 text-left">Code</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-center">Unit</th>
                      <th className="px-3 py-2 text-right">BOQ Qty</th>
                      <th className="px-3 py-2 text-right">Remaining</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => {
                      const src = sourceItems[idx];
                      const remainingQty = src?.remaining_quantity ?? 0;
                      const over = item.quantity > remainingQty;
                      return (
                      <tr key={idx} className={cn("border-t", over && "bg-red-50")}>
                        <td className="px-3 py-1.5 text-muted-foreground">{item.item_code || "—"}</td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1">
                            <span>{item.description}</span>
                            {over && <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-center">{item.unit}</td>
                        <td className="px-3 py-1.5 text-right text-muted-foreground">
                          {src?.boq_quantity.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium text-amber-600">
                          {remainingQty.toLocaleString()}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            className={cn("h-7 w-20 text-right text-xs", over && "border-red-400 text-red-600")}
                            value={item.quantity}
                            onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                          />
                          {over && <p className="mt-0.5 text-[10px] text-red-500">Exceeds remaining by {(item.quantity - remainingQty).toLocaleString()}</p>}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-7 w-24 text-right text-xs"
                            value={item.unit_rate}
                            onChange={(e) => updateLine(idx, "unit_rate", parseFloat(e.target.value) || 0)}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-medium">
                          ${((item.quantity || 0) * (item.unit_rate || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td colSpan={7} className="px-3 py-2 text-right">Total</td>
                      <td className="px-3 py-2 text-right">
                        ${totalEstimated().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
              </table>
            </div>
          </div>
        )}

        {hasOverReq && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Some items exceed the remaining BOQ quantity. Reduce quantities before submitting.</span>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || loading || hasOverReq} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Create PR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
