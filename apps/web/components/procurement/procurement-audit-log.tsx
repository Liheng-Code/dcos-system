"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  INSERT: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  UPDATE: "bg-amber-500/10 text-amber-600 border-amber-200",
  DELETE: "bg-red-500/10 text-red-600 border-red-200",
};

export function ProcurementAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("procurement_audit_log").select("*").order("changed_at", { ascending: false }).limit(100).then(({ data }) => {
      if (data) setEntries(data as AuditEntry[]);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  if (entries.length === 0) return <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">No audit log entries yet.</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <History className="h-4 w-4" />
        <span>Showing last {entries.length} entries</span>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Table</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Record ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const nd = e.new_data;
              const summary = e.action === "INSERT"
                ? "Record created"
                : e.action === "DELETE"
                  ? "Record deleted"
                  : nd
                    ? Object.keys(nd).filter(k => e.old_data && JSON.stringify(e.old_data[k]) !== JSON.stringify(nd[k])).slice(0, 3).join(", ") || "No changes"
                    : "Updated";
              return (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/50 text-sm">
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(e.changed_at).toLocaleString()}</td>
                  <td className="px-4 py-3"><Badge className={ACTION_COLORS[e.action] ?? ""} variant="outline">{e.action}</Badge></td>
                  <td className="px-4 py-3 font-mono text-xs">{e.table_name.replace("procurement_", "")}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.record_id.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-muted-foreground">{summary}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
