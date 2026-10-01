"use client";

import { useEffect, useState } from "react";
import { listArInvoices } from "@/lib/account/account-service";
import { Search, Plus, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArInvoiceForm } from "./ar-invoice-form";

interface ArInvoice {
  id: string;
  project_id: string;
  client_id: string;
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  tax_amount: number;
  net_amount: number;
  description: string | null;
  status: string;
  claim_id: string | null;
  notes: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  paid: "bg-purple-100 text-purple-700",
};

export function ArInvoiceList() {
  const [invoices, setInvoices] = useState<ArInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ArInvoice | null>(null);

  useEffect(() => {
    listArInvoices().then(({ data }) => {
      if (data) setInvoices(data as ArInvoice[]);
      setLoading(false);
    });
  }, []);

  const filtered = invoices.filter(i =>
    i.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
    (i.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) => STATUS_COLORS[s] ?? "bg-gray-100 text-gray-700";

  if (showForm) {
    return (
      <ArInvoiceForm
        invoice={editing}
        onSaved={() => { setShowForm(false); setEditing(null); }}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New AR Invoice
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Invoice No</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Due Date</th>
              <th className="text-right px-4 py-2">Amount</th>
              <th className="text-right px-4 py-2">Net</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No AR invoices found.</td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors text-sm">
                <td className="px-4 py-2 font-medium">{inv.invoice_no}</td>
                <td className="px-4 py-2 text-muted-foreground">{inv.invoice_date}</td>
                <td className="px-4 py-2 text-muted-foreground">{inv.due_date}</td>
                <td className="px-4 py-2 text-right">${Number(inv.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-right font-semibold">${Number(inv.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-center">
                  <Badge className={`${statusColor(inv.status)} border-0 text-[10px]`}>{inv.status}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditing(inv); setShowForm(true); }}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
