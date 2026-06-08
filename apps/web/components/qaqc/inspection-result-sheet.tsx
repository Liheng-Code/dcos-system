"use client";

import { useCallback, useEffect, useState } from "react";
import { X, CheckCircle2, XCircle, Minus, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type InspectionRequest,
  type ItpItem,
  type InspectionResult,
  getItpItems,
  getInspectionResults,
  upsertInspectionResult,
  updateInspectionRequestStatus,
} from "@/lib/qaqc-service";

const TYPE_COLORS = {
  hold:    "bg-red-100 text-red-700",
  witness: "bg-amber-100 text-amber-700",
  review:  "bg-blue-100 text-blue-700",
};

type ResultValue = "pass" | "fail" | "na" | "pending";

interface Props {
  ir: InspectionRequest;
  onClose: () => void;
  onRaiseNcr: (irId: string) => void;
  onStatusChange: () => void;
}

export function InspectionResultSheet({ ir, onClose, onRaiseNcr, onStatusChange }: Props) {
  const [items, setItems] = useState<ItpItem[]>([]);
  const [results, setResults] = useState<Record<string, InspectionResult>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!ir.itp_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const [loadedItems, loadedResults] = await Promise.all([
        getItpItems(ir.itp_id),
        getInspectionResults(ir.id),
      ]);
      setItems(loadedItems);
      const map: Record<string, InspectionResult> = {};
      const remMap: Record<string, string> = {};
      for (const r of loadedResults) {
        map[r.itp_item_id] = r;
        remMap[r.itp_item_id] = r.remark ?? "";
      }
      setResults(map);
      setRemarks(remMap);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [ir.id, ir.itp_id]);

  useEffect(() => { void load(); }, [load]);

  async function setResult(itemId: string, value: ResultValue) {
    const prev = results[itemId];
    // Optimistic update
    setResults((r) => ({ ...r, [itemId]: { ...(prev ?? { id: "", inspection_request_id: ir.id, itp_item_id: itemId, remark: null }), result: value } }));
    try {
      await upsertInspectionResult({
        inspection_request_id: ir.id,
        itp_item_id: itemId,
        result: value,
        remark: remarks[itemId] || null,
      });
    } catch (e: any) {
      toast.error(e.message);
      await load(); // revert on error
    }
  }

  async function handleSubmit() {
    const anyFail = items.some((item) => results[item.id]?.result === "fail");
    const anyPending = items.some((item) => !results[item.id]?.result || results[item.id]?.result === "pending");
    if (anyPending) {
      toast.error("All items must be marked pass/fail/NA before submitting.");
      return;
    }
    const newStatus: InspectionRequest["status"] = anyFail ? "failed" : "passed";
    setSubmitting(true);
    try {
      await updateInspectionRequestStatus(ir.id, newStatus);
      toast.success(`Inspection marked as ${newStatus.toUpperCase()}`);
      onStatusChange();
      if (anyFail) {
        onRaiseNcr(ir.id);
      } else {
        onClose();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const canEdit = ir.status === "submitted" || ir.status === "scheduled";
  const hasFail = items.some((i) => results[i.id]?.result === "fail");

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-xs text-slate-500">{ir.ir_number}</div>
            <h2 className="mt-0.5 text-lg font-semibold">{(ir.itps as any)?.title ?? "Inspection"}</h2>
            <div className="mt-1 flex gap-3 text-xs text-slate-500">
              {ir.location && <span>📍 {ir.location}</span>}
              {ir.inspection_date && <span>📅 {ir.inspection_date}</span>}
              {ir.inspector_name && <span>👤 {ir.inspector_name}</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          ) : !ir.itp_id ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-400">
              No ITP linked to this inspection request.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const r = results[item.id];
                const rv = r?.result ?? "pending";
                return (
                  <div key={item.id} className={cn(
                    "rounded-xl border p-3",
                    rv === "pass" ? "border-emerald-200 bg-emerald-50" :
                    rv === "fail" ? "border-red-200 bg-red-50" :
                    rv === "na"   ? "border-slate-200 bg-slate-50" :
                    "border-slate-200",
                  )}>
                    <div className="flex items-start gap-3">
                      <div className="w-5 shrink-0 text-center text-xs text-slate-400 pt-0.5">{item.seq}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{item.activity}</div>
                        <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
                          <span className={cn("rounded-full px-2 py-0.5 capitalize", TYPE_COLORS[item.inspection_type])}>
                            {item.inspection_type}
                          </span>
                          {item.responsible_party && (
                            <span className="text-slate-500">{item.responsible_party}</span>
                          )}
                          {item.acceptance_criteria && (
                            <span className="text-slate-400 italic">{item.acceptance_criteria}</span>
                          )}
                        </div>
                      </div>

                      {/* Result toggle */}
                      {canEdit && (
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => setResult(item.id, "pass")}
                            className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", rv === "pass" ? "bg-emerald-500 text-white" : "bg-white border border-slate-200 hover:bg-emerald-50")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setResult(item.id, "fail")}
                            className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", rv === "fail" ? "bg-red-500 text-white" : "bg-white border border-slate-200 hover:bg-red-50")}
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setResult(item.id, "na")}
                            className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition-colors", rv === "na" ? "bg-slate-400 text-white" : "bg-white border border-slate-200 hover:bg-slate-100")}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                        </div>
                      )}

                      {!canEdit && (
                        <div className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase",
                          rv === "pass" ? "bg-emerald-100 text-emerald-700" :
                          rv === "fail" ? "bg-red-100 text-red-700" :
                          rv === "na"   ? "bg-slate-200 text-slate-500" :
                          "bg-slate-100 text-slate-400",
                        )}>
                          {rv}
                        </div>
                      )}
                    </div>

                    {/* Remark */}
                    {canEdit && (
                      <div className="mt-2 pl-8">
                        <input
                          value={remarks[item.id] ?? ""}
                          onChange={(e) => setRemarks((p) => ({ ...p, [item.id]: e.target.value }))}
                          onBlur={() => {
                            if (rv !== "pending") {
                              void upsertInspectionResult({
                                inspection_request_id: ir.id,
                                itp_item_id: item.id,
                                result: rv as ResultValue,
                                remark: remarks[item.id] || null,
                              });
                            }
                          }}
                          placeholder="Remark (optional)"
                          className="w-full rounded-lg border border-slate-200 bg-white/70 px-2 py-1 text-xs outline-none focus:border-primary"
                        />
                      </div>
                    )}
                    {!canEdit && r?.remark && (
                      <div className="mt-1 pl-8 text-xs italic text-slate-500">{r.remark}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && items.length > 0 && (
          <div className="border-t border-slate-200 px-6 py-4">
            {hasFail && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                One or more items failed. Submitting will mark this inspection as FAILED and prompt you to raise an NCR.
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Submit Result
              </Button>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {!canEdit && (
          <div className="border-t border-slate-200 px-6 py-4">
            <div className="text-xs text-slate-400">
              This inspection is {ir.status}. Results are read-only.
              {ir.status === "failed" && (
                <button onClick={() => onRaiseNcr(ir.id)} className="ml-2 font-medium text-red-600 underline hover:no-underline">
                  Raise NCR
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
