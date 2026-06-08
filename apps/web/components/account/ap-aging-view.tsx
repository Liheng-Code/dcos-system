"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ApAging {
  invoice_id: string; invoice_no: string;
  invoice_date: string; due_date: string;
  net_amount: number; supplier_name: string;
  days_overdue: number; aging_bucket: string;
  payment_status: string;
}

export function ApAgingView() {
  const supabase = createClient();
  const [rows, setRows] = useState<ApAging[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("account_ap_aging").select("*").order("due_date").then(({ data }) => {
      if (data) setRows(data as ApAging[]);
      setLoading(false);
    });
  }, []);

  const filtered = rows.filter(r =>
    r.invoice_no.toLowerCase().includes(search.toLowerCase()) ||
    r.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
    r.aging_bucket.includes(search)
  );

  const buckets = ["current", "1-30", "31-60", "61-90", "90+"];
  const bucketTotals = buckets.map(b => ({
    bucket: b,
    total: filtered.filter(r => r.aging_bucket === b).reduce((s, r) => s + r.net_amount, 0),
    count: filtered.filter(r => r.aging_bucket === b).length,
  }));

  const bucketColors: Record<string, string> = { current: "bg-green-100 text-green-700", "1-30": "bg-yellow-100 text-yellow-700", "31-60": "bg-orange-100 text-orange-700", "61-90": "bg-red-100 text-red-700", "90+": "bg-red-200 text-red-800" };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-3">
        {bucketTotals.map(({ bucket, total, count }) => (
          <div key={bucket} className="rounded-lg border p-3 text-center">
            <div className={`text-[10px] font-semibold uppercase ${bucket === "current" ? "" : ""}`}>{bucket}</div>
            <div className="text-lg font-bold font-mono">${total.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">{count} invoice{count !== 1 ? "s" : ""}</div>
          </div>
        ))}
      </div>
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase">
              <th className="text-left px-3 py-2">Invoice</th>
              <th className="text-left px-3 py-2">Supplier</th>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Due</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-center px-3 py-2">Overdue</th>
              <th className="text-center px-3 py-2">Bucket</th>
              <th className="text-center px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No AP invoices found.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.invoice_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5 font-mono">{r.invoice_no}</td>
                <td className="px-3 py-1.5">{r.supplier_name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.invoice_date}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.due_date}</td>
                <td className="px-3 py-1.5 text-right font-mono">${r.net_amount.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-center">{r.days_overdue > 0 ? `${r.days_overdue}d` : "—"}</td>
                <td className="px-3 py-1.5 text-center">
                  <Badge className={`border-0 text-[9px] ${bucketColors[r.aging_bucket] || ""}`}>{r.aging_bucket}</Badge>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <Badge variant="outline" className="text-[9px]">{r.payment_status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
