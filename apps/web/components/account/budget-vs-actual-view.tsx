"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface BvaRow {
  project_id: string; project_name: string;
  total_budget: number; total_actual: number;
  variance: number; pct_used: number;
}

export function BudgetVsActualView() {
  const supabase = createClient();
  const [rows, setRows] = useState<BvaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("account_budget_vs_actual").select("*").order("project_name").then(({ data }) => {
      if (data) setRows(data as BvaRow[]);
      setLoading(false);
    });
  }, []);

  const filtered = rows.filter(r =>
    r.project_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalBudget = filtered.reduce((s, r) => s + r.total_budget, 0);
  const totalActual = filtered.reduce((s, r) => s + r.total_actual, 0);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Total Budget</div>
          <div className="text-lg font-semibold font-mono">${totalBudget.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Total Actual</div>
          <div className="text-lg font-semibold font-mono">${totalActual.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Variance</div>
          <div className={`text-lg font-semibold font-mono ${totalBudget - totalActual >= 0 ? "text-green-600" : "text-red-600"}`}>
            ${(totalBudget - totalActual).toFixed(2)}
          </div>
        </div>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase">
              <th className="text-left px-3 py-2">Project</th>
              <th className="text-right px-3 py-2">Budget</th>
              <th className="text-right px-3 py-2">Actual</th>
              <th className="text-right px-3 py-2">Variance</th>
              <th className="text-right px-3 py-2">% Used</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No budget data found.</td></tr>
            ) : filtered.map(r => (
              <tr key={r.project_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5 font-medium">{r.project_name}</td>
                <td className="px-3 py-1.5 text-right font-mono">${r.total_budget.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right font-mono">${r.total_actual.toFixed(2)}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${r.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ${r.variance.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{r.pct_used.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
