"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

interface BsRow {
  section: string; account_id: string;
  code: string; name: string; balance: number;
}

export function BalanceSheetView() {
  const supabase = createClient();
  const [rows, setRows] = useState<BsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("account_balance_sheet").select("*").order("sort_order").then(({ data }) => {
      if (data) setRows(data as BsRow[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const assets = rows.filter(r => r.section === "asset");
  const liabilities = rows.filter(r => r.section === "liability");
  const equity = rows.filter(r => r.section === "equity");
  const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0);

  function SectionTable({ title, data, total }: { title: string; data: BsRow[]; total: number }) {
    return (
      <div className="rounded-lg border">
        <div className="px-4 py-2 bg-muted/20 font-semibold text-sm border-b">{title}</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[10px] font-semibold text-muted-foreground uppercase">
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-left px-3 py-2">Account</th>
              <th className="text-right px-3 py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.account_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5 font-mono">{r.code}</td>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 text-right font-mono">${r.balance.toFixed(2)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={3} className="text-center py-4 text-muted-foreground">No {title.toLowerCase()} entries.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/10 font-semibold">
              <td colSpan={2} className="px-3 py-2 text-xs">Total {title}</td>
              <td className="px-3 py-2 text-right font-mono">${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <SectionTable title="Assets" data={assets} total={totalAssets} />
      <SectionTable title="Liabilities" data={liabilities} total={totalLiabilities} />
      <SectionTable title="Equity" data={equity} total={totalEquity} />
      <div className="rounded-lg border bg-primary/5">
        <div className="px-4 py-3 flex items-center justify-between text-sm">
          <span className="font-semibold">Liabilities + Equity</span>
          <span className="font-mono text-lg font-semibold">${(totalLiabilities + totalEquity).toFixed(2)}</span>
        </div>
        <div className="px-4 pb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Check: Assets = Liabilities + Equity</span>
          <span className={totalAssets.toFixed(2) === (totalLiabilities + totalEquity).toFixed(2) ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
            {totalAssets.toFixed(2) === (totalLiabilities + totalEquity).toFixed(2) ? "✓ Balanced" : "✗ Not balanced"}
          </span>
        </div>
      </div>
    </div>
  );
}
