"use client";

import { useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getQuantityHistory, type QuantityHistoryRow } from "@/lib/planning/boq-mapping-service";

interface Props {
  taskId: string;
  taskLabel: string;
  onClose: () => void;
}

const SOURCE_LABEL: Record<string, string> = { manual: "manual", boq: "Project BOQ", tender_boq: "Tender BOQ", qto: "QTO", import: "CSV import" };

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

export function PlanTaskWorkHistoryDialog({ taskId, taskLabel, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QuantityHistoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    getQuantityHistory(taskId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [taskId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-[620px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border bg-muted px-4 py-3">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Quantity history — {taskLabel}</h2>
            <p className="text-[11px] text-muted-foreground">Every quantity, unit, source or BOQ-link change, newest first.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-background"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-y-auto p-4 text-xs">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{new Date(r.changedAt).toLocaleString()}</span>
                    <span>{SOURCE_LABEL[r.newSource ?? ""] ?? r.newSource}</span>
                  </div>
                  <p className="mt-1 font-medium text-foreground">
                    {fmt(r.oldQuantity)} {r.oldUnit ?? ""} <span className="text-muted-foreground">→</span> {fmt(r.newQuantity)} {r.newUnit ?? ""}
                  </p>
                  {r.reason && <p className="mt-0.5 text-muted-foreground">{r.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
