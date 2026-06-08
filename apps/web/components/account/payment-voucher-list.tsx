"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Search, Plus, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PaymentVoucherForm } from "./payment-voucher-form";

interface PvEntry {
  id: string;
  voucher_no: string;
  voucher_date: string;
  type: string;
  payee_name: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  paid: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-700",
};

export function PaymentVoucherList() {
  const supabase = createClient();
  const [vouchers, setVouchers] = useState<PvEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PvEntry | null>(null);

  useEffect(() => {
    supabase.from("account_payment_vouchers").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setVouchers(data as PvEntry[]);
      setLoading(false);
    });
  }, []);

  const filtered = vouchers.filter(v =>
    v.voucher_no.toLowerCase().includes(search.toLowerCase()) ||
    v.payee_name.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) => STATUS_COLORS[s] ?? "bg-gray-100 text-gray-700";

  if (showForm) {
    return (
      <PaymentVoucherForm
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        voucher={editing as any}
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
          <Input className="pl-9" placeholder="Search vouchers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Voucher
        </Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-4 py-2">Voucher No</th>
              <th className="text-left px-4 py-2">Date</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Payee</th>
              <th className="text-right px-4 py-2">Amount</th>
              <th className="text-center px-4 py-2">Status</th>
              <th className="text-right px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-sm text-muted-foreground">No payment vouchers found.</td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors text-sm">
                <td className="px-4 py-2 font-medium">{v.voucher_no}</td>
                <td className="px-4 py-2 text-muted-foreground">{v.voucher_date}</td>
                <td className="px-4 py-2 text-muted-foreground">{v.type}</td>
                <td className="px-4 py-2">{v.payee_name}</td>
                <td className="px-4 py-2 text-right font-semibold">{v.currency} ${Number(v.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-center">
                  <Badge className={`${statusColor(v.status)} border-0 text-[10px]`}>{v.status}</Badge>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditing(v); setShowForm(true); }}>
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
