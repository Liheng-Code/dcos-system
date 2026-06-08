"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type Itp,
  type InspectionRequest,
  getItps,
  getInspectionRequests,
  createInspectionRequest,
  generateIrNumber,
} from "@/lib/qaqc-service";
import { InspectionResultSheet } from "@/components/qaqc/inspection-result-sheet";

const STATUS_COLORS: Record<InspectionRequest["status"], string> = {
  draft:      "bg-slate-100 text-slate-500",
  submitted:  "bg-blue-100 text-blue-700",
  scheduled:  "bg-amber-100 text-amber-700",
  inspected:  "bg-purple-100 text-purple-700",
  passed:     "bg-emerald-100 text-emerald-700",
  failed:     "bg-red-100 text-red-700",
  closed:     "bg-slate-200 text-slate-500",
};

interface Props {
  projectId: string;
  onRaiseNcr: (irId: string) => void;
}

export function InspectionRequestList({ projectId, onRaiseNcr }: Props) {
  const [irs, setIrs] = useState<InspectionRequest[]>([]);
  const [itps, setItps] = useState<Itp[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeIr, setActiveIr] = useState<InspectionRequest | null>(null);

  const [form, setForm] = useState({
    itp_id: "",
    location: "",
    request_date: new Date().toISOString().slice(0, 10),
    inspection_date: "",
    inspector_name: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedIrs, loadedItps] = await Promise.all([
        getInspectionRequests(projectId),
        getItps(projectId),
      ]);
      setIrs(loadedIrs);
      setItps(loadedItps.filter((i) => i.status === "active"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleSubmit() {
    if (!form.itp_id) { toast.error("Select an ITP first."); return; }
    setSaving(true);
    try {
      await createInspectionRequest({
        project_id: projectId,
        itp_id: form.itp_id || null,
        ir_number: generateIrNumber(),
        location: form.location || null,
        request_date: form.request_date,
        inspection_date: form.inspection_date || null,
        inspector_name: form.inspector_name || null,
        notes: form.notes || null,
      });
      setShowForm(false);
      setForm({ itp_id: "", location: "", request_date: new Date().toISOString().slice(0, 10), inspection_date: "", inspector_name: "", notes: "" });
      await load();
      toast.success("Inspection request submitted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">{irs.length} inspection request{irs.length !== 1 ? "s" : ""}</div>
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New IR
          </Button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="text-sm font-semibold">New Inspection Request</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">ITP *</label>
                <select
                  value={form.itp_id}
                  onChange={(e) => setForm((p) => ({ ...p, itp_id: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select ITP…</option>
                  {itps.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
                </select>
                {itps.length === 0 && (
                  <p className="text-[10px] text-amber-600">No active ITPs. Activate an ITP in the ITPs tab first.</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Location</label>
                <input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} placeholder="e.g. Level 3, Grid A-B" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Inspector</label>
                <input value={form.inspector_name} onChange={(e) => setForm((p) => ({ ...p, inspector_name: e.target.value }))} placeholder="Inspector name" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Request Date</label>
                <input type="date" value={form.request_date} onChange={(e) => setForm((p) => ({ ...p, request_date: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Inspection Date</label>
                <input type="date" value={form.inspection_date} onChange={(e) => setForm((p) => ({ ...p, inspection_date: e.target.value }))} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Optional notes" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmit} disabled={saving || !form.itp_id}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Submit IR
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* IR list */}
        {irs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
            <ClipboardList className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-400">No inspection requests yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 text-left">IR Number</th>
                  <th className="px-3 py-2 text-left">ITP</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-center">Request Date</th>
                  <th className="px-3 py-2 text-center">Insp. Date</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {irs.map((ir) => (
                  <tr key={ir.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-mono font-semibold text-slate-700">{ir.ir_number}</td>
                    <td className="px-3 py-2 text-slate-600">{(ir.itps as any)?.title ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{ir.location ?? "—"}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{ir.request_date}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{ir.inspection_date ?? "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_COLORS[ir.status])}>
                        {ir.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => setActiveIr(ir)}
                        className="rounded px-2 py-1 text-[10px] font-medium text-primary hover:underline"
                      >
                        {ir.status === "submitted" || ir.status === "scheduled" ? "Enter Results" : "View"}
                      </button>
                      {ir.status === "failed" && (
                        <button
                          onClick={() => onRaiseNcr(ir.id)}
                          className="ml-1 rounded px-2 py-1 text-[10px] font-medium text-red-600 hover:underline"
                        >
                          Raise NCR
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Result sheet */}
      {activeIr && (
        <InspectionResultSheet
          ir={activeIr}
          onClose={() => setActiveIr(null)}
          onRaiseNcr={(irId) => { setActiveIr(null); onRaiseNcr(irId); }}
          onStatusChange={() => { void load(); setActiveIr(null); }}
        />
      )}
    </>
  );
}
