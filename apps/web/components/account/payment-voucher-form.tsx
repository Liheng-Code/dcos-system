"use client";

import { useState } from "react";
import { createPaymentVoucher, updatePaymentVoucher } from "@/lib/account/account-service";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface PvEntry {
  id: string; voucher_no: string; voucher_date: string;
  type: string; payee_type: string; payee_id: string | null;
  payee_name: string; amount: number; currency: string;
  payment_method: string | null; status: string; notes: string | null;
}

export function PaymentVoucherForm({ voucher: raw, onSaved, onCancel }: { voucher: PvEntry | null; onSaved: () => void; onCancel: () => void }) {
  const isNew = !raw?.id;
  const [voucherNo] = useState(raw?.voucher_no ?? `PV-${Date.now()}`);
  const [voucherDate, setVoucherDate] = useState(raw?.voucher_date ?? new Date().toISOString().slice(0, 10));
  const [type, setType] = useState(raw?.type ?? "payment");
  const [payeeType, setPayeeType] = useState(raw?.payee_type ?? "supplier");
  const [payeeName, setPayeeName] = useState(raw?.payee_name ?? "");
  const [amount, setAmount] = useState(raw?.amount ?? 0);
  const [currency, setCurrency] = useState(raw?.currency ?? "USD");
  const [paymentMethod, setPaymentMethod] = useState(raw?.payment_method ?? "bank_transfer");
  const [notes, setNotes] = useState(raw?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payeeName.trim()) { toast.error("Payee name is required"); return; }
    setSaving(true);

    const payload: Record<string, unknown> = {
      voucher_no: voucherNo,
      voucher_date: voucherDate,
      type,
      payee_type: payeeType,
      payee_name: payeeName.trim(),
      amount,
      currency,
      payment_method: paymentMethod,
      notes: notes.trim() || null,
    };

    if (isNew) {
      const { error } = await createPaymentVoucher(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Payment voucher created");
    } else {
      const { error } = await updatePaymentVoucher(raw!.id, payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Payment voucher updated");
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h2 className="text-lg font-semibold">{isNew ? "New Payment Voucher" : "Edit Payment Voucher"}</h2>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Voucher No</Label>
                <Input value={voucherNo} disabled className="bg-muted/30" />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={type} onChange={e => setType(e.target.value)}>
                  <option value="payment">Payment</option>
                  <option value="receipt">Receipt</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Payee Type</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={payeeType} onChange={e => setPayeeType(e.target.value)}>
                  <option value="supplier">Supplier</option>
                  <option value="client">Client</option>
                  <option value="employee">Employee</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Payee Name *</Label>
                <Input value={payeeName} onChange={e => setPayeeName(e.target.value)} placeholder="Payee name" required />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Amount ($)</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={currency} onChange={e => setCurrency(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="KHR">KHR</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isNew ? "Create" : "Update"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
