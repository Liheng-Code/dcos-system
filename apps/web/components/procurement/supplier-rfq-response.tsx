"use client";

import { useEffect, useState } from "react";
import { getRfqById, insertQuotation, insertQuotationItems, listPrItemsByPrId, listRfqSuppliersBySupplierId, updateRfqSuppliersByRfqIdAndSupplierId } from "@/lib/procurement/procurement-service";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RFQSummary {
  id: string;
  rfq_id: string;
  supplier_id: string;
  responded: boolean;
  procurement_rfqs: {
    rfq_number: string;
    issue_date: string | null;
    response_deadline: string | null;
    status: string;
  } | null;
}

interface PRItem {
  id: string;
  line_no: number;
  item_description: string;
  unit: string;
  quantity: number;
}

export function SupplierRFQResponse({ supplierId }: { supplierId: string }) {
  const [rfqs, setRfqs] = useState<RFQSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [prItems, setPrItems] = useState<PRItem[]>([]);
  const [lineItems, setLineItems] = useState<Record<string, { unit_price: string; delivery_date: string }>>({});
  const [quoteRef, setQuoteRef] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!supplierId) return;
    setLoading(true);
    listRfqSuppliersBySupplierId(supplierId).then(({ data }) => {
      if (data) setRfqs(data as unknown as RFQSummary[]);
      setLoading(false);
    });
  }, [supplierId]);

  async function startResponse(rfqId: string) {
    setRespondingTo(rfqId);
    const { data: rfq } = await getRfqById(rfqId, "pr_id");
    if (rfq?.pr_id) {
      const { data: items } = await listPrItemsByPrId(rfq.pr_id, "id, line_no, item_description, unit, quantity");
      if (items) {
        setPrItems(items as PRItem[]);
        const initial: Record<string, { unit_price: string; delivery_date: string }> = {};
        for (const item of items) {
          initial[item.id] = { unit_price: "", delivery_date: "" };
        }
        setLineItems(initial);
      }
    }
  }

  function cancelResponse() {
    setRespondingTo(null);
    setPrItems([]);
    setLineItems({});
    setQuoteRef("");
  }

  async function submitResponse() {
    if (!respondingTo) return;
    if (!quoteRef.trim()) { toast.error("Enter a quotation reference"); return; }
    const missing = prItems.find(item => !lineItems[item.id]?.unit_price);
    if (missing) { toast.error("Enter unit price for all items"); return; }

    setSubmitting(true);

    const itemsPayload = prItems.map(item => ({
      pr_item_id: item.id,
      line_no: item.line_no,
      item_code: null,
      item_description: item.item_description,
      unit: item.unit,
      quantity: item.quantity,
      unit_price: parseFloat(lineItems[item.id].unit_price) || 0,
      total: item.quantity * (parseFloat(lineItems[item.id].unit_price) || 0),
      delivery_date: lineItems[item.id].delivery_date || null,
    }));

    const totalAmount = itemsPayload.reduce((s, i) => s + i.total, 0);

    const { data: quote, error } = await insertQuotation({
      rfq_id: respondingTo,
      supplier_id: supplierId,
      quotation_ref: quoteRef,
      received_at: new Date().toISOString(),
      currency: "USD",
      total_amount: totalAmount,
      status: "pending",
      procurement_quotation_items: itemsPayload,
    });

    if (error) { toast.error(error.message); setSubmitting(false); return; }

    await insertQuotationItems(itemsPayload.map(i => ({ ...i, quotation_id: quote.id })));

    await updateRfqSuppliersByRfqIdAndSupplierId({ responded: true }, respondingTo, supplierId);

    toast.success("Quotation submitted");
    cancelResponse();

    const { data } = await listRfqSuppliersBySupplierId(supplierId);
    if (data) setRfqs(data as unknown as RFQSummary[]);
    setSubmitting(false);
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (rfqs.length === 0) return <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">No RFQ invitations for this supplier.</div>;

  if (respondingTo) {
    const rfq = rfqs.find(r => r.rfq_id === respondingTo);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Quotation Response</h3>
            <p className="text-sm text-muted-foreground">RFQ: {rfq?.procurement_rfqs?.rfq_number}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={cancelResponse}><X className="h-4 w-4 mr-1" /> Cancel</Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Quotation Reference</Label>
            <Input value={quoteRef} onChange={e => setQuoteRef(e.target.value)} placeholder="e.g. QT-2026-001" />
          </div>
        </div>

        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Unit Price</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Delivery Date</th>
              </tr>
            </thead>
            <tbody>
              {prItems.map((item, idx) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">{item.item_description}</td>
                  <td className="px-3 py-2 text-right">{item.quantity} {item.unit}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      className="h-8 w-28 text-right ml-auto"
                      placeholder="0.00"
                      value={lineItems[item.id]?.unit_price ?? ""}
                      onChange={e => setLineItems(prev => ({ ...prev, [item.id]: { ...prev[item.id], unit_price: e.target.value } }))}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    ${((parseFloat(lineItems[item.id]?.unit_price) || 0) * item.quantity).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="date"
                      className="h-8"
                      value={lineItems[item.id]?.delivery_date ?? ""}
                      onChange={e => setLineItems(prev => ({ ...prev, [item.id]: { ...prev[item.id], delivery_date: e.target.value } }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td colSpan={4} className="px-3 py-2 text-right">Total</td>
                <td className="px-3 py-2 text-right">
                  ${prItems.reduce((s, item) => s + ((parseFloat(lineItems[item.id]?.unit_price) || 0) * item.quantity), 0).toLocaleString()}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex justify-end">
          <Button onClick={submitResponse} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Submit Quotation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">RFQ#</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issued</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deadline</th>
            <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Responded</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
          </tr>
        </thead>
        <tbody>
          {rfqs.map(rs => (
            <tr key={rs.id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="px-4 py-3 text-sm font-medium">{rs.procurement_rfqs?.rfq_number ?? "—"}</td>
              <td className="px-4 py-3 text-sm">{rs.procurement_rfqs?.issue_date ?? "—"}</td>
              <td className="px-4 py-3 text-sm">{rs.procurement_rfqs?.response_deadline ?? "—"}</td>
              <td className="px-4 py-3 text-center">
                {rs.responded ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Responded</Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-200">Pending</Badge>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {!rs.responded && rs.procurement_rfqs?.status === "issued" && (
                  <Button size="sm" onClick={() => startResponse(rs.rfq_id)}><Send className="h-3 w-3 mr-1" /> Respond</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
