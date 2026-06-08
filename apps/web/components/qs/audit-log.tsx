"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type QsAuditEntry, getQsAuditLog } from "@/lib/qs-service";

const TABLE_LABELS: Record<string, string> = {
  qs_variation_orders:     "Variation Orders",
  qs_progress_claims:      "Progress Claims",
  qs_retention_ledger:     "Retention",
  qs_contingency_drawdowns:"Contingency",
  qs_budget_revisions:     "Budget Revisions",
};

const ACTION_CLS: Record<QsAuditEntry["action"], string> = {
  INSERT: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
};

function getChangedFields(entry: QsAuditEntry): { field: string; from: string; to: string }[] {
  if (entry.action !== "UPDATE" || !entry.old_data || !entry.new_data) return [];
  const skip = new Set(["updated_at", "created_at"]);
  return Object.keys(entry.new_data)
    .filter((k) => !skip.has(k) && JSON.stringify(entry.new_data![k]) !== JSON.stringify(entry.old_data![k]))
    .slice(0, 5)
    .map((k) => ({
      field: k,
      from:  String(entry.old_data![k] ?? "—"),
      to:    String(entry.new_data![k] ?? "—"),
    }));
}

interface Props { projectId: string }

export function QsAuditLog({ projectId }: Props) {
  const [entries, setEntries] = useState<QsAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableFilter, setTableFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQsAuditLog(projectId, 200);
      setEntries(data);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const tables = ["all", ...Object.keys(TABLE_LABELS)];
  const filtered = tableFilter === "all" ? entries : entries.filter((e) => e.table_name === tableFilter);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{filtered.length} audit entr{filtered.length !== 1 ? "ies" : "y"}</p>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {tables.map((t) => (
          <button
            key={t}
            onClick={() => setTableFilter(t)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              tableFilter === t
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {TABLE_LABELS[t] ?? "All"}
          </button>
        ))}
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <History className="mb-3 h-9 w-9 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No audit entries yet</p>
          <p className="mt-1 text-xs text-slate-400">Changes to QS financial records will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((entry) => {
            const changes = getChangedFields(entry);
            const isExp = expanded.has(entry.id);
            return (
              <div
                key={entry.id}
                className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm"
              >
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50/60"
                  onClick={() => setExpanded((p) => {
                    const n = new Set(p);
                    if (n.has(entry.id)) n.delete(entry.id); else n.add(entry.id);
                    return n;
                  })}
                >
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", ACTION_CLS[entry.action])}>
                    {entry.action}
                  </span>
                  <span className="text-xs font-medium text-slate-700">{TABLE_LABELS[entry.table_name] ?? entry.table_name}</span>
                  <span className="font-mono text-[10px] text-slate-400">{entry.record_id.slice(0, 8)}…</span>
                  <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                    {new Date(entry.changed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {changes.length > 0 && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{changes.length} change{changes.length !== 1 ? "s" : ""}</span>
                  )}
                </div>

                {isExp && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {entry.action === "UPDATE" && changes.length > 0 ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                            <th className="py-1 text-left w-40">Field</th>
                            <th className="py-1 text-left">From</th>
                            <th className="py-1 text-left">To</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map((c) => (
                            <tr key={c.field} className="border-t border-slate-100">
                              <td className="py-1 font-medium text-slate-600">{c.field}</td>
                              <td className="py-1 text-slate-400 line-through">{c.from.slice(0, 60)}</td>
                              <td className="py-1 font-medium text-slate-700">{c.to.slice(0, 60)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <pre className="whitespace-pre-wrap text-[10px] text-slate-500">
                        {JSON.stringify(entry.new_data ?? entry.old_data, null, 2).slice(0, 500)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
