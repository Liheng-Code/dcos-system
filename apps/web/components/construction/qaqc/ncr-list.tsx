"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type Ncr, getNcrs } from "@/lib/construction/qaqc-service";
import { NcrCreateSheet } from "@/components/construction/qaqc/ncr-detail-sheet";

const SEVERITY_COLORS: Record<Ncr["severity"], string> = {
  minor:    "bg-slate-100 text-slate-600",
  major:    "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<Ncr["status"], string> = {
  open:               "bg-red-100 text-red-700",
  corrective_action:  "bg-amber-100 text-amber-700",
  reinspection:       "bg-purple-100 text-purple-700",
  closed:             "bg-emerald-100 text-emerald-700",
  voided:             "bg-slate-200 text-slate-500",
};

interface Props {
  projectId: string;
  pendingIrId?: string | null;
  onClearPending: () => void;
}

export function NcrList({ projectId, pendingIrId, onClearPending }: Props) {
  const [ncrs, setNcrs] = useState<Ncr[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createIrId, setCreateIrId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setNcrs(await getNcrs(projectId)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Auto-open create sheet when navigated here from a failed IR
  useEffect(() => {
    if (pendingIrId) {
      setCreateIrId(pendingIrId);
      setShowCreate(true);
    }
  }, [pendingIrId]);

  function handleCreate() {
    setCreateIrId(null);
    setShowCreate(true);
    onClearPending();
  }

  function handleNcrCreated(ncr: Ncr) {
    setNcrs((prev) => [ncr, ...prev]);
    setShowCreate(false);
    setCreateIrId(null);
    onClearPending();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const openCount = ncrs.filter((n) => n.status === "open" || n.status === "corrective_action").length;

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-500">{ncrs.length} NCR{ncrs.length !== 1 ? "s" : ""}</div>
            {openCount > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                {openCount} open
              </span>
            )}
          </div>
          <Button size="sm" onClick={handleCreate} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New NCR
          </Button>
        </div>

        {/* NCR table */}
        {ncrs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
            <AlertTriangle className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">No non-conformances raised. Good quality work!</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 text-left">NCR Number</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-center">Severity</th>
                  <th className="px-3 py-2 text-left">Responsible</th>
                  <th className="px-3 py-2 text-center">Due Date</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-left">Linked IR</th>
                </tr>
              </thead>
              <tbody>
                {ncrs.map((ncr) => {
                  const overdue = ncr.due_date && new Date(ncr.due_date) < new Date() && ncr.status !== "closed" && ncr.status !== "voided";
                  return (
                    <tr key={ncr.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-mono font-semibold text-slate-700">{ncr.ncr_number}</td>
                      <td className="px-3 py-2 max-w-[240px] truncate text-slate-700">{ncr.description}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", SEVERITY_COLORS[ncr.severity])}>
                          {ncr.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{ncr.responsible_party ?? "—"}</td>
                      <td className={cn("px-3 py-2 text-center", overdue ? "font-semibold text-red-600" : "text-slate-500")}>
                        {ncr.due_date ?? "—"}
                        {overdue && <span className="ml-1 text-[9px]">OVERDUE</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_COLORS[ncr.status])}>
                          {ncr.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-400">
                        {(ncr.inspection_requests as any)?.ir_number ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create NCR sheet */}
      {showCreate && (
        <NcrCreateSheet
          projectId={projectId}
          irId={createIrId}
          onClose={() => { setShowCreate(false); setCreateIrId(null); onClearPending(); }}
          onCreate={handleNcrCreated}
        />
      )}
    </>
  );
}
