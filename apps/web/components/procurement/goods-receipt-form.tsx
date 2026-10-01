"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { insertDeliveryNote, insertGoodsReceipts, listPosAwaitingDelivery, updatePoById, updatePoItemById } from "@/lib/procurement/procurement-queries";

interface IssuedPO {
  id: string;
  po_number: string;
  supplier_id: string;
  procurement_po_items: {
    id: string;
    item_type: string;
    item_code: string | null;
    item_description: string;
    unit: string;
    quantity_ordered: number;
    quantity_delivered: number;
    unit_price: number;
  }[];
}

interface LineItem {
  po_item_id: string;
  item_description: string;
  unit: string;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  rejection_reason: string;
  inspection_result: string;
}

export function GoodsReceiptForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState<IssuedPO[]>([]);
  const [selectedPO, setSelectedPO] = useState("");
  const [deliveryNoteRef, setDeliveryNoteRef] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);

  useEffect(() => {
    const supabase = createClient();
    listPosAwaitingDelivery()
      .then(({ data }) => {
        if (data) setPos(data as unknown as IssuedPO[]);
      });
  }, []);

  function handlePOSelect(poId: string) {
    setSelectedPO(poId);
    const po = pos.find(p => p.id === poId);
    if (po) {
      setItems(po.procurement_po_items.filter(item => item.item_type !== "section").map(item => ({
        po_item_id: item.id,
        item_description: item.item_description,
        unit: item.unit,
        quantity_ordered: item.quantity_ordered,
        quantity_delivered: item.quantity_delivered,
        quantity_received: 0,
        quantity_accepted: 0,
        quantity_rejected: 0,
        rejection_reason: "",
        inspection_result: "passed",
      })));
    } else {
      setItems([]);
    }
  }

  function updateItem(poItemId: string, field: string, value: string | number) {
    setItems(prev => prev.map(item => {
      if (item.po_item_id !== poItemId) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity_received") {
        updated.quantity_accepted = Math.min(Number(value), updated.quantity_received);
        updated.quantity_rejected = updated.quantity_received - updated.quantity_accepted;
      }
      if (field === "quantity_accepted") {
        updated.quantity_accepted = Math.min(Number(value), updated.quantity_received);
        updated.quantity_rejected = Math.max(0, updated.quantity_received - updated.quantity_accepted);
      }
      return updated;
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPO) { toast.error("Select a PO"); return; }
    const validItems = items.filter(i => i.quantity_received > 0);
    if (validItems.length === 0) { toast.error("Receive at least one item"); return; }

    setSaving(true);
    const supabase = createClient();

        const { data: { user } } = await supabase.auth.getUser();

    const po = pos.find(p => p.id === selectedPO) as IssuedPO | undefined;
    if (!po) { toast.error("PO not found"); setSaving(false); return; }

    const { data: dnData, error: dnError } = await insertDeliveryNote({
        po_id: selectedPO,
        supplier_id: po.supplier_id,
        delivery_note_ref: deliveryNoteRef || null,
        delivery_date: deliveryDate,
        received_by: user?.id,
        status: "delivered",
        remarks: remarks || null,
      });

    if (dnError) { toast.error(dnError.message); setSaving(false); return; }

    const dnId = (dnData as { id: string }).id;

    const grInserts = validItems.map(item => ({
      delivery_note_id: dnId,
      po_item_id: item.po_item_id,
      quantity_received: item.quantity_received,
      quantity_accepted: item.quantity_accepted,
      quantity_rejected: item.quantity_rejected,
      rejection_reason: item.rejection_reason || null,
      inspection_result: item.inspection_result,
      inspected_by: user?.id,
      inspected_at: new Date().toISOString(),
    }));

    const { error: grError } = await insertGoodsReceipts(grInserts);
    if (grError) { toast.error(grError.message); setSaving(false); return; }

    // Note: this form only records the delivery/inspection result for invoice
    // three-way-match. Actual warehouse stock-in is now owned exclusively by the
    // Inventory module's own GRN flow (inv_grns/inv_grn_lines -> inv_stock) — the
    // legacy procurement_inventory upsert that used to happen here has been removed.
    for (const item of validItems) {
      const poItem = po.procurement_po_items.find(i => i.id === item.po_item_id);
      if (poItem) {
        const newDelivered = (poItem.quantity_delivered || 0) + item.quantity_accepted;
        await updatePoItemById({ quantity_delivered: newDelivered }, item.po_item_id);
      }
    }

    const totalOrdered = po.procurement_po_items.reduce((s, i) => s + i.quantity_ordered, 0);
    const totalDelivered = po.procurement_po_items.reduce((s, i) => {
      const match = validItems.find(v => v.po_item_id === i.id);
      return s + (i.quantity_delivered || 0) + (match ? match.quantity_accepted : 0);
    }, 0);

    const newPOStatus = totalDelivered >= totalOrdered ? "delivered" : "partially_delivered";
    await updatePoById({ status: newPOStatus }, selectedPO);

    toast.success("Goods receipt recorded");
    router.push("/dashboard/procurement/goods-receipt");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-2xl font-semibold tracking-tight">Record Goods Receipt</h1>
        </div>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Record Receipt
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Delivery Information</h3>

            <div className="space-y-1.5">
              <Label>Purchase Order *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={selectedPO} onChange={e => handlePOSelect(e.target.value)}>
                <option value="">Select PO...</option>
                {pos.map(p => <option key={p.id} value={p.id}>{p.po_number}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Note Reference</Label>
              <Input value={deliveryNoteRef} onChange={e => setDeliveryNoteRef(e.target.value)} placeholder="Supplier DN #" />
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Date *</Label>
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Input value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Any notes about this delivery" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Items Received</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Select a PO to load items.</p>
            ) : (
              items.map(item => (
                <div key={item.po_item_id} className="rounded-lg border p-3 space-y-2">
                  <div className="text-xs font-medium">{item.item_description}</div>
                  <div className="text-xs text-muted-foreground">
                    Ordered: {item.quantity_ordered} {item.unit} | Previously delivered: {item.quantity_delivered}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Received</Label>
                      <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.quantity_received} onChange={e => updateItem(item.po_item_id, "quantity_received", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Accepted</Label>
                      <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.quantity_accepted} onChange={e => updateItem(item.po_item_id, "quantity_accepted", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Rejected</Label>
                      <div className="h-8 flex items-center text-xs font-medium text-red-600">{item.quantity_rejected}</div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Inspection</Label>
                      <select className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs" value={item.inspection_result} onChange={e => updateItem(item.po_item_id, "inspection_result", e.target.value)}>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                        <option value="conditional">Conditional</option>
                      </select>
                    </div>
                  </div>
                  {(item.quantity_rejected > 0 || item.inspection_result === "failed") && (
                    <div className="space-y-1">
                      <Label className="text-xs">Rejection Reason</Label>
                      <Input className="h-8 text-xs" value={item.rejection_reason} onChange={e => updateItem(item.po_item_id, "rejection_reason", e.target.value)} placeholder="Why rejected?" />
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
