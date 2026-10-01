"use client";

import { useEffect, useState } from "react";
import { getProfitLoss } from "@/lib/account/account-service";
import { Loader2 } from "lucide-react";
import { ReportExport } from "@/components/reports/layout/report-export";

interface PlRow {
  section: string; account_id: string;
  code: string; name: string; amount: number;
}

export function ProfitLossView() {
  const [rows, setRows] = useState<PlRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfitLoss().then(({ data }) => {
      if (data) setRows(data as PlRow[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const income = rows.filter(r => r.section === "income");
  const expenses = rows.filter(r => r.section === "expense");
  const totalIncome = income.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  const netIncome = totalIncome - totalExpense;

  function SectionTable({ title, data, total }: { title: string; data: PlRow[]; total: number }) {
    return (
      <div className="rounded-lg border">
        <div className="px-4 py-2 bg-muted/20 font-semibold text-sm border-b">{title}</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[10px] font-semibold text-muted-foreground uppercase">
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-left px-3 py-2">Account</th>
              <th className="text-right px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.account_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5 font-mono">{r.code}</td>
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 text-right font-mono">${r.amount.toFixed(2)}</td>
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
      <div className="flex justify-end">
        <ReportExport
          data={rows.map((r) => ({
            section: r.section,
            code: r.code,
            name: r.name,
            amount: r.amount,
          }))}
          columns={[
            { key: "section", label: "Section" },
            { key: "code", label: "Code" },
            { key: "name", label: "Account" },
            { key: "amount", label: "Amount", format: (v) => Number(v).toFixed(2) },
          ]}
          filename="profit-loss"
        />
      </div>
      <SectionTable title="Income / Revenue" data={income} total={totalIncome} />
      <SectionTable title="Expenses / COGS" data={expenses} total={totalExpense} />
      <div className="rounded-lg border bg-primary/5">
        <div className="px-4 py-3 flex items-center justify-between text-sm font-semibold">
          <span>Net {netIncome >= 0 ? "Income" : "Loss"}</span>
          <span className={`font-mono text-lg ${netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
            ${Math.abs(netIncome).toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
