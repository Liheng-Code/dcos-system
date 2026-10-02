"use client";

import { useEffect, useState } from "react";
import { getTrialBalance } from "@/lib/account/account-service";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ReportExport } from "@/components/report-kit/layout/report-export";

interface TbRow {
  account_id: string; code: string; name: string;
  type: string; normal_balance: string;
  parent_id: string | null; total_debit: number;
  total_credit: number; balance: number;
}

export function TrialBalanceView() {
  const [rows, setRows] = useState<TbRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getTrialBalance().then(({ data }) => {
      if (data) setRows(data as TbRow[]);
      setLoading(false);
    });
  }, []);

  const filtered = rows.filter(r =>
    r.code.toLowerCase().includes(search.toLowerCase()) ||
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.type.toLowerCase().includes(search.toLowerCase())
  );

  const totalDebit = filtered.reduce((s, r) => s + r.total_debit, 0);
  const totalCredit = filtered.reduce((s, r) => s + r.total_credit, 0);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ReportExport
          data={filtered.map((r) => ({
            code: r.code,
            name: r.name,
            type: r.type,
            debit: r.total_debit,
            credit: r.total_credit,
            balance: r.balance,
          }))}
          columns={[
            { key: "code", label: "Code" },
            { key: "name", label: "Account Name" },
            { key: "type", label: "Type" },
            { key: "debit", label: "Debit", format: (v) => Number(v).toFixed(2) },
            { key: "credit", label: "Credit", format: (v) => Number(v).toFixed(2) },
            { key: "balance", label: "Balance", format: (v) => Number(v).toFixed(2) },
          ]}
          filename="trial-balance"
        />
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase">
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-left px-3 py-2">Account Name</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-right px-3 py-2">Debit</th>
              <th className="text-right px-3 py-2">Credit</th>
              <th className="text-right px-3 py-2">Balance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.account_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5 font-mono">{r.code}</td>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.type}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.total_debit > 0 ? `$${r.total_debit.toFixed(2)}` : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.total_credit > 0 ? `$${r.total_credit.toFixed(2)}` : ""}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${r.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ${r.balance.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/10 font-semibold">
              <td colSpan={3} className="px-3 py-2 text-xs">Totals</td>
              <td className="px-3 py-2 text-right font-mono">${totalDebit.toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-mono">${totalCredit.toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-mono">${(totalDebit - totalCredit).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
