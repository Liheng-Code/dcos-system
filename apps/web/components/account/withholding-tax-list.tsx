"use client";

import { useEffect, useState } from "react";
import { createWithholdingTax, listWithholdingTax, updateWithholdingTax } from "@/lib/account/account-service";
import { Search, Plus, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface WhtEntry {
  id: string; project_id: string | null; ap_invoice_id: string | null;
  supplier_id: string | null; tax_cert_no: string | null;
  invoice_amount: number; tax_rate_pct: number; tax_amount: number;
  tax_date: string; status: string; notes: string | null;
}

export function WithholdingTaxList() {
  const [items, setItems] = useState<WhtEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    listWithholdingTax().then(({ data }) => {
      if (data) setItems(data as WhtEntry[]);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = items.filter(w =>
    (w.tax_cert_no || "").toLowerCase().includes(search.toLowerCase()) ||
    w.status.toLowerCase().includes(search.toLowerCase())
  );

  async function handleRemit(id: string) {
    const { error } = await updateWithholdingTax(id, { status: "remitted" });
    if (error) { toast.error(error.message); return; }
    toast.success("Marked as remitted");
    load();
  }

  if (showForm) return <WithholdingTaxForm onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const statusColors: Record<string, string> = { pending: "bg-yellow-100 text-yellow-700", remitted: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search WHT..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Entry
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Tax Cert No</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-right px-4 py-2">Invoice Amt</th>
              <th className="text-center px-4 py-2">Rate</th>
              <th className="text-right px-4 py-2">Tax Amt</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No withholding tax entries found.</td></tr>
            ) : filtered.map(w => (
              <tr key={w.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors text-sm">
                <td className="px-4 py-2 font-mono text-xs">{w.tax_cert_no ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{w.tax_date}</td>
                <td className="px-4 py-2 text-right font-mono">${w.invoice_amount.toFixed(2)}</td>
                <td className="px-4 py-2 text-center">{w.tax_rate_pct}%</td>
                <td className="px-4 py-2 text-right font-mono">${w.tax_amount.toFixed(2)}</td>
                <td className="px-4 py-2 text-center">
                  <Badge className={`border-0 text-[10px] ${statusColors[w.status] || "bg-gray-100 text-gray-600"}`}>{w.status}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  {w.status === "pending" && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleRemit(w.id)}>Remit</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WithholdingTaxForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [certNo, setCertNo] = useState(`WHT-${Date.now()}`);
  const [invoiceAmount, setInvoiceAmount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [taxDate, setTaxDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const taxAmount = invoiceAmount * (taxRate / 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createWithholdingTax({
      tax_cert_no: certNo,
      invoice_amount: invoiceAmount,
      tax_rate_pct: taxRate,
      tax_amount: taxAmount,
      tax_date: taxDate,
      notes: notes.trim() || null,
      status: "pending",
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Withholding tax entry created");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">New Withholding Tax Entry</h2>
      </div>
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tax Cert No</Label>
                <Input value={certNo} onChange={e => setCertNo(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Date</Label>
                <Input type="date" value={taxDate} onChange={e => setTaxDate(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Invoice Amount</Label>
                <Input type="number" step="0.01" min="0" value={invoiceAmount || ""} onChange={e => setInvoiceAmount(parseFloat(e.target.value) || 0)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={taxRate || ""} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Tax Amount (auto-calculated)</Label>
                <Input value={`$${taxAmount.toFixed(2)}`} disabled className="bg-muted/30" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
