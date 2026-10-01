"use client";

import { useEffect, useState } from "react";
import { insertDeliveryNote, insertGoodsReceipt, listPoItemsByPoId, listPosAwaitingDeliveryBySupplierId, updatePoById, updatePoItemById } from "@/lib/procurement/procurement-queries";
import { Loader2, Truck, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface IssuedPO {
  id: string;
  po_number: string;
  status: string;
  delivery_date_expected: string | null;
}

interface POItemLine {
  id: string;
  po_item_id: string;
  line_no: number;
  item_description: string;
  unit: string;
  quantity_ordered: number;
  quantity_delivered: number;
}

export function SupplierDeliveryForm({ supplierId }: { supplierId: string }) {
  const [pos, setPos] = useState<IssuedPO[]>([]);
  const [selectedPO, setSelectedPO] = useState("");
  const [items, setItems] = useState<POItemLine[]>([]);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [dnRef, setDnRef] = useState("");
  const [deliverQty, setDeliverQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supplierId) return;
    listPosAwaitingDeliveryBySupplierId(supplierId).then(({ data }) => {
      if (data) setPos(data as IssuedPO[]);
      setLoading(false);
    });
  }, [supplierId]);

  async function loadPOItems(poId: string) {
    setSelectedPO(poId);
    setItems([]);
    setDeliverQty({});
    const { data: poItems } = await listPoItemsByPoId(poId, "id, line_no, item_description, unit, quantity_ordered, quantity_delivered");
    if (poItems) {
      const mapped = poItems.map(i => ({
        id: i.id,
        po_item_id: i.id,
        line_no: i.line_no,
        item_description: i.item_description,
        unit: i.unit,
        quantity_ordered: i.quantity_ordered,
        quantity_delivered: i.quantity_delivered,
      }));
      setItems(mapped);
      const initial: Record<string, string> = {};
      for (const item of mapped) {
        const remaining = item.quantity_ordered - item.quantity_delivered;
        initial[item.id] = String(Math.max(0, remaining));
      }
      setDeliverQty(initial);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPO) { toast.error("Select a PO"); return; }

    const hasQty = Object.values(deliverQty).some(v => parseFloat(v) > 0);
    if (!hasQty) { toast.error("Enter delivery quantity for at least one item"); return; }

    setSubmitting(true);

    const { data: dn, error: dnError } = await insertDeliveryNote({
      po_id: selectedPO,
      supplier_id: supplierId,
      delivery_note_ref: dnRef || null,
      delivery_date: deliveryDate,
      received_by: null,
      status: "delivered",
    });

    if (dnError) { toast.error(dnError.message); setSubmitting(false); return; }

    for (const item of items) {
      const qty = parseFloat(deliverQty[item.id]) || 0;
      if (qty <= 0) continue;

      const { error: grError } = await insertGoodsReceipt({
        delivery_note_id: dn.id,
        po_item_id: item.po_item_id,
        quantity_received: qty,
        quantity_accepted: qty,
        quantity_rejected: 0,
        inspection_result: "passed",
      });
      if (grError) { toast.error(grError.message); setSubmitting(false); return; }

      const newDelivered = item.quantity_delivered + qty;
      const newStatus = newDelivered >= item.quantity_ordered ? "delivered" : "partially_delivered";
      await updatePoItemById({ quantity_delivered: newDelivered, quantity_accepted: newDelivered }, item.po_item_id);
      await updatePoById({ status: newStatus }, selectedPO);
    }

    toast.success("Delivery notice submitted");
    setSelectedPO("");
    setItems([]);
    setDeliverQty({});
    setDnRef("");
    setDeliveryDate(new Date().toISOString().slice(0, 10));
    setSubmitting(false);

    const { data } = await listPosAwaitingDeliveryBySupplierId(supplierId);
    if (data) setPos(data as IssuedPO[]);
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const issuedPOs = pos.filter(p => p.status === "issued" || p.status === "partially_delivered");
  if (pos.length === 0) return <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">No issued or partially delivered POs for this supplier.</div>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Purchase Order</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={selectedPO}
            onChange={e => loadPOItems(e.target.value)}
          >
            <option value="">Select PO...</option>
            {issuedPOs.map(po => (
              <option key={po.id} value={po.id}>{po.po_number} (Due: {po.delivery_date_expected ?? "—"})</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Delivery Date</Label>
          <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
        </div>
        <div>
          <Label>Delivery Note Reference</Label>
          <Input value={dnRef} onChange={e => setDnRef(e.target.value)} placeholder="e.g. DN-2026-001" />
        </div>
      </div>

      {items.length > 0 && (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Ordered</th>
                <th className="text-right px-3 py-2">Previously Delivered</th>
                <th className="text-right px-3 py-2">Delivering Now</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const remaining = item.quantity_ordered - item.quantity_delivered;
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2">{item.item_description}</td>
                    <td className="px-3 py-2 text-right">{item.quantity_ordered} {item.unit}</td>
                    <td className="px-3 py-2 text-right">{item.quantity_delivered}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        className="h-8 w-24 text-right ml-auto"
                        min={0}
                        max={remaining}
                        step={1}
                        value={deliverQty[item.id] ?? ""}
                        onChange={e => setDeliverQty(prev => ({ ...prev, [item.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Truck className="h-4 w-4 mr-1" />}
            Submit Delivery Notice
          </Button>
        </div>
      )}
    </form>
  );
}
