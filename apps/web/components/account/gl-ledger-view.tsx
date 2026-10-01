"use client";

import { useEffect, useState } from "react";
import { getGeneralLedger } from "@/lib/account/account-service";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface GlLine {
  line_id: string; entry_no: string; entry_date: string;
  account_code: string; account_name: string; account_type: string;
  debit_amount: number; credit_amount: number; net_amount: number;
  entry_description: string | null; line_description: string | null;
  source: string;
}

export function GlLedgerView() {
  const [lines, setLines] = useState<GlLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getGeneralLedger().then(({ data }) => {
      if (data) setLines(data as GlLine[]);
      setLoading(false);
    });
  }, []);

  const filtered = lines.filter(l =>
    l.entry_no.toLowerCase().includes(search.toLowerCase()) ||
    l.account_code.toLowerCase().includes(search.toLowerCase()) ||
    l.account_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.entry_description || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search GL ledger..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="text-left px-3 py-2">Entry</th>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Source</th>
              <th className="text-left px-3 py-2">Account</th>
              <th className="text-right px-3 py-2">Debit</th>
              <th className="text-right px-3 py-2">Credit</th>
              <th className="text-right px-3 py-2">Net</th>
              <th className="text-left px-3 py-2">Description</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-sm text-muted-foreground">No ledger entries found.</td></tr>
            ) : filtered.map(l => (
              <tr key={l.line_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5 font-mono">{l.entry_no}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{l.entry_date}</td>
                <td className="px-3 py-1.5"><Badge variant="outline" className="text-[9px]">{l.source}</Badge></td>
                <td className="px-3 py-1.5">
                  <span className="font-mono">{l.account_code}</span>
                  <span className="text-muted-foreground ml-1">— {l.account_name}</span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono">{l.debit_amount > 0 ? `$${l.debit_amount.toFixed(2)}` : ""}</td>
                <td className="px-3 py-1.5 text-right font-mono">{l.credit_amount > 0 ? `$${l.credit_amount.toFixed(2)}` : ""}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${l.net_amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ${l.net_amount.toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[200px]">{l.entry_description ?? l.line_description ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
