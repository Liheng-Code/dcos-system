"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ShoppingCart } from "lucide-react";
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
import type { BoqItemForPr } from "@/lib/qs-service";

interface Props {
  projectId: string;
  projectName?: string;
  boqItemIds: string[];
  triggerLabel?: string;
  triggerSize?: "sm" | "default";
  triggerClassName?: string;
}

export function RaisePrFromBoqDialog({
  projectId,
  projectName,
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

  const [siteLocations, setSiteLocations] = useState<{ id: string; name: string; address: string | null }[]>([]);

  const [form, setForm] = useState({
    required_date: "",
    delivery_location: "",
    priority: "normal",
    notes: "",
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

  useEffect(() => {
    if (!open || boqItemIds.length === 0) return;
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      supabase
        .from("qs_v_boq_requisition_status")
        .select("*")
        .in("boq_item_id", boqItemIds),
      supabase
        .from("site_locations")
        .select("id, name, address")
        .eq("is_active", true)
        .order("name"),
    ]).then(([boqRes, locRes]) => {
      if (boqRes.error) { toast.error(boqRes.error.message); return; }
      const rows = (boqRes.data ?? []) as BoqItemForPr[];
      setSourceItems(rows);
      setLineItems(
        rows.map((bi) => ({
          boq_item_id: bi.boq_item_id,
          item_code: bi.item_code ?? "",
          description: bi.description,
          unit: bi.unit,
          quantity: bi.remaining_quantity,
          unit_rate: bi.unit_rate,
          budget_code: "",
          notes: "",
        })),
      );
      if (locRes.data) setSiteLocations(locRes.data);
    }, () => {}).then(() => { setLoading(false); });
  }, [open, boqItemIds]);

  function updateLine(idx: number, field: string, value: string | number) {
    setLineItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  }

  function totalEstimated() {
    return lineItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_rate || 0), 0);
  }

  async function handleSubmit() {
    if (!lineItems.length) {
      toast.error("No items to requisition");
      return;
    }
    const valid = lineItems.filter((l) => l.description.trim() && l.quantity > 0);
    if (!valid.length) {
      toast.error("At least one item must have a description and quantity > 0");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { data: prData, error: prError } = await supabase
      .from("procurement_prs")
      .insert([
        {
          pr_number: `PR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
          project_id: projectId,
          required_date: form.required_date || null,
          delivery_location: form.delivery_location || null,
          priority: form.priority,
          notes: form.notes || null,
        },
      ])
      .select("id")
      .single();

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

    const { error: itemsError } = await supabase.from("procurement_pr_items").insert(itemInserts);

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
            <div className="grid grid-cols-3 gap-3">
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
                <Label className="text-xs">Delivery Location</Label>
                <select
                  className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs"
                  value={form.delivery_location}
                  onChange={(e) => setForm((p) => ({ ...p, delivery_location: e.target.value }))}
                >
                  <option value="">Select location...</option>
                  {siteLocations.map(loc => (
                    <option key={loc.id} value={loc.name}>{loc.name}{loc.address ? ` — ${loc.address}` : ""}</option>
                  ))}
                </select>
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
              <Label className="text-xs">Notes</Label>
              <Input
                className="h-8 text-xs"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes"
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
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-1.5 text-muted-foreground">{item.item_code || "—"}</td>
                      <td className="px-3 py-1.5">{item.description}</td>
                      <td className="px-3 py-1.5 text-center">{item.unit}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {sourceItems[idx]?.boq_quantity.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          className="h-7 w-20 text-right text-xs"
                          value={item.quantity}
                          onChange={(e) => updateLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                        />
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
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td colSpan={6} className="px-3 py-2 text-right">Total</td>
                    <td className="px-3 py-2 text-right">
                      ${totalEstimated().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Create PR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
