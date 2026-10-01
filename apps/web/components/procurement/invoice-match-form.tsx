"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { insertInvoiceMatch, listGoodsReceiptsByPoId, listPosReadyForInvoiceMatch, updatePoById } from "@/lib/procurement/procurement-service";
import { Loader2, Save, ArrowLeft, Calculator } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface POSummary {
  id: string;
  po_number: string;
  supplier_id: string;
  total_amount: number | null;
  grand_total: number | null;
  status: string;
}

export function InvoiceMatchForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState<POSummary[]>([]);
  const [selectedPoId, setSelectedPoId] = useState("");
  const [matchedPoAmount, setMatchedPoAmount] = useState(0);
  const [matchedGrAmount, setMatchedGrAmount] = useState(0);
  const [supplierId, setSupplierId] = useState("");
  const [form, setForm] = useState({
    po_id: "",
    invoice_ref: "",
    invoice_date: "",
    invoice_amount: 0,
    notes: "",
  });

  const variance = Math.abs(form.invoice_amount - matchedPoAmount);

  useEffect(() => {
    listPosReadyForInvoiceMatch()
      .then(({ data }) => {
        if (data) setPos(data as POSummary[]);
      });
  }, []);

  async function handlePOSelect(poId: string) {
    setSelectedPoId(poId);
    setForm(prev => ({ ...prev, po_id: poId }));

    if (!poId) {
      setMatchedPoAmount(0);
      setMatchedGrAmount(0);
      setSupplierId("");
      return;
    }

    const po = pos.find(p => p.id === poId);
    if (po) {
      setSupplierId(po.supplier_id);
      const poAmt = po.grand_total ?? po.total_amount ?? 0;
      setMatchedPoAmount(poAmt);

      const { data: grData } = await listGoodsReceiptsByPoId(poId);

      let grTotal = 0;
      if (grData) {
        for (const gr of grData as unknown as { quantity_accepted: number; procurement_po_items: { unit_price: number } }[]) {
          grTotal += gr.quantity_accepted * gr.procurement_po_items.unit_price;
        }
      }
      setMatchedGrAmount(grTotal);
    }
  }

  function updateForm(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.po_id) { toast.error("Select a PO"); return; }
    if (!form.invoice_ref) { toast.error("Enter invoice reference"); return; }
    if (!form.invoice_date) { toast.error("Enter invoice date"); return; }
    if (form.invoice_amount <= 0) { toast.error("Enter invoice amount"); return; }

    setSaving(true);

    const threshold = matchedPoAmount * 0.02;
    const hasVariance = Math.abs(form.invoice_amount - matchedPoAmount) > threshold;
    const matchStatus = hasVariance ? "variance_detected" : "matched";

    const { data: result, error } = await insertInvoiceMatch({
        po_id: form.po_id,
        supplier_id: supplierId,
        invoice_ref: form.invoice_ref,
        invoice_date: form.invoice_date,
        invoice_amount: form.invoice_amount,
        matched_po_amount: matchedPoAmount,
        matched_gr_amount: matchedGrAmount,
        variance_amount: form.invoice_amount - matchedPoAmount,
        status: matchStatus,
        notes: form.notes || null,
      });

    if (error) { toast.error(error.message); setSaving(false); return; }

    await updatePoById({ status: "under_invoice_match" }, form.po_id);

    const matchId = (result as { id: string }).id;
    toast.success(hasVariance ? "Invoice match created — variance detected" : "Invoice matched successfully");
    router.push(`/dashboard/procurement/invoice-matches/${matchId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-2xl font-semibold tracking-tight">New Invoice Match</h1>
        </div>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Create Match
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Invoice Details</h3>

            <div className="space-y-1.5">
              <Label>Source PO *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={selectedPoId} onChange={e => handlePOSelect(e.target.value)}>
                <option value="">Select PO...</option>
                {pos.map(p => <option key={p.id} value={p.id}>{p.po_number} (${(p.grand_total ?? p.total_amount ?? 0).toLocaleString()})</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Reference *</Label>
              <Input value={form.invoice_ref} onChange={e => updateForm("invoice_ref", e.target.value)} placeholder="INV-001" />
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Date *</Label>
              <Input type="date" value={form.invoice_date} onChange={e => updateForm("invoice_date", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Amount *</Label>
              <Input type="number" min="0" step="0.01" value={form.invoice_amount || ""} onChange={e => updateForm("invoice_amount", parseFloat(e.target.value) || 0)} />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => updateForm("notes", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4" /> 3-Way Match Summary
            </h3>

            {!selectedPoId ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Select a PO to view match details.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">PO Amount</span>
                    <span className="font-semibold">${matchedPoAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GR Amount (accepted)</span>
                    <span className="font-semibold">${matchedGrAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Invoice Amount</span>
                    <span className="font-semibold">${form.invoice_amount.toLocaleString()}</span>
                  </div>
                  <hr />
                  <div className="flex justify-between text-sm font-bold">
                    <span>Variance</span>
                    <span className={variance > 0 ? "text-red-600" : "text-emerald-600"}>
                      ${variance.toLocaleString()}
                      {variance > matchedPoAmount * 0.02 && (
                        <span className="ml-2 text-xs font-normal text-red-500">(exceeds 2% threshold)</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className={`h-3 w-3 rounded-full ${variance <= matchedPoAmount * 0.02 ? "bg-emerald-500" : "bg-red-500"}`} />
                  {variance <= matchedPoAmount * 0.02
                    ? "Amounts match within 2% threshold — will be marked as Matched"
                    : "Variance exceeds 2% threshold — will be marked as Variance Detected"}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
