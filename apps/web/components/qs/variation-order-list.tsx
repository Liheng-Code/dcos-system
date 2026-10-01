"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Clock, Download, Loader2, Plus, Printer, Trash2, X, XCircle, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type QsVariationOrder,
  type QsVoApproval,
  type QsVoItem,
  type VoApprovalStep,
  type VoType,
  createVariationOrder,
  createVoItem,
  deleteVoItem,
  getVariationOrders,
  getVoApprovalSteps,
  getVoApprovals,
  getVoItems,
  submitVoApprovalDecision,
  updateVoStatus,
  voApprovalThreshold,
} from "@/lib/qs/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { downloadCsv, fmtCsvNum } from "@/lib/csv-export";
import { printVoRegister } from "@/lib/print-service";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const VO_TYPES: { value: VoType; label: string }[] = [
  { value: "client_request",  label: "Client Request" },
  { value: "design_change",   label: "Design Change"  },
  { value: "site_condition",  label: "Site Condition" },
  { value: "regulatory",      label: "Regulatory"     },
  { value: "other",           label: "Other"          },
];

const STATUS_CLS: Record<QsVariationOrder["status"], string> = {
  draft:       "bg-slate-100 text-slate-500",
  submitted:   "bg-blue-100 text-blue-700",
  approved:    "bg-emerald-100 text-emerald-700",
  rejected:    "bg-red-100 text-red-700",
  implemented: "bg-purple-100 text-purple-700",
};

const BLANK_FORM = {
  title: "", vo_type: "client_request" as VoType, description: "", schedule_impact_days: "0",
};
const BLANK_ITEM = { description: "", unit: "", quantity: "", unit_rate: "" };

/** Determine which approval step is pending for a submitted VO */
function currentPendingStep(approvals: QsVoApproval[], steps: VoApprovalStep[]): number | null {
  for (const s of steps) {
    const a = approvals.find((ap) => ap.step === s.step);
    if (!a || a.decision === "pending") return s.step;
    if (a.decision === "rejected") return null;
  }
  return null;
}

/** Check if the current user (by roleCodes) can act on a given step */
function canActOnStep(step: number, roleCodes: string[]): boolean {
  if (step === 1) return roleCodes.some((r) => ["L0","L1","L2","L3"].includes(r));
  if (step === 2) return roleCodes.some((r) => ["L0","L1","L2","QS"].includes(r));
  if (step === 3) return roleCodes.some((r) => ["L0","L1","L2"].includes(r));
  return false;
}

interface Props { projectId: string; projectName?: string }

export function VariationOrderList({ projectId, projectName = projectId }: Props) {
  const { can, roleCodes, loaded: permsLoaded } = useQsPermissions();

  const [vos, setVos]               = useState<QsVariationOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpanded]   = useState<string | null>(null);
  const [voItems, setVoItems]       = useState<Record<string, QsVoItem[]>>({});
  const [voApprovals, setVoApprovals] = useState<Record<string, QsVoApproval[]>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]             = useState(BLANK_FORM);
  const [saving, setSaving]         = useState(false);
  const [itemForm, setItemForm]     = useState(BLANK_ITEM);
  const [addingItem, setAddingItem] = useState(false);
  const [rejectId, setRejectId]     = useState<string | null>(null);
  const [rejectStep, setRejectStep] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setVos(await getVariationOrders(projectId)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function loadVoDetails(voId: string) {
    const needItems = !voItems[voId];
    const needApprovals = !voApprovals[voId];
    if (!needItems && !needApprovals) return;
    try {
      const [items, approvals] = await Promise.all([
        needItems    ? getVoItems(voId)    : Promise.resolve(voItems[voId]),
        needApprovals ? getVoApprovals(voId) : Promise.resolve(voApprovals[voId]),
      ]);
      if (needItems)    setVoItems((p) => ({ ...p, [voId]: items }));
      if (needApprovals) setVoApprovals((p) => ({ ...p, [voId]: approvals }));
    } catch (e: any) { toast.error(e.message); }
  }

  function toggle(id: string) {
    if (expandedId === id) { setExpanded(null); return; }
    setExpanded(id);
    void loadVoDetails(id);
  }

  async function handleCreate() {
    if (!form.title.trim()) { toast.error("Title is required."); return; }
    setSaving(true);
    try {
      const vo = await createVariationOrder({
        project_id:           projectId,
        title:                form.title.trim(),
        vo_type:              form.vo_type,
        description:          form.description || null,
        schedule_impact_days: parseInt(form.schedule_impact_days) || 0,
      });
      setVos((p) => [vo, ...p]);
      setVoItems((p) => ({ ...p, [vo.id]: [] }));
      setVoApprovals((p) => ({ ...p, [vo.id]: [] }));
      setForm(BLANK_FORM);
      setShowCreate(false);
      setExpanded(vo.id);
      toast.success(`${vo.vo_number} created`);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function handleAddItem(voId: string) {
    if (!itemForm.description.trim() || !itemForm.unit.trim()) {
      toast.error("Description and unit required.");
      return;
    }
    setAddingItem(true);
    try {
      const item = await createVoItem({
        vo_id:       voId,
        description: itemForm.description.trim(),
        unit:        itemForm.unit.trim(),
        quantity:    parseFloat(itemForm.quantity) || 0,
        unit_rate:   parseFloat(itemForm.unit_rate) || 0,
      });
      setVoItems((p) => ({ ...p, [voId]: [...(p[voId] ?? []), item] }));
      setVos(await getVariationOrders(projectId));
      setItemForm(BLANK_ITEM);
      toast.success("Item added");
    } catch (e: any) { toast.error(e.message); }
    finally { setAddingItem(false); }
  }

  async function handleDeleteItem(voId: string, itemId: string) {
    try {
      await deleteVoItem(itemId, voId);
      setVoItems((p) => ({ ...p, [voId]: (p[voId] ?? []).filter((i) => i.id !== itemId) }));
      setVos(await getVariationOrders(projectId));
      toast.success("Item removed");
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleSimpleStatus(id: string, status: QsVariationOrder["status"]) {
    try {
      await updateVoStatus(id, status);
      setVos((p) => p.map((v) => v.id === id ? { ...v, status } : v));
      toast.success(`VO ${status}`);
    } catch (e: any) { toast.error(e.message); }
  }

  async function handleApprovalDecision(voId: string, totalAmount: number, step: number, decision: "approved" | "rejected") {
    if (decision === "rejected" && !rejectReason.trim()) { toast.error("Rejection reason is required."); return; }
    try {
      await submitVoApprovalDecision(voId, totalAmount, step, decision, rejectReason || undefined);
      // Refresh VO list and approvals for this VO
      const [updatedVos, updatedApprovals] = await Promise.all([
        getVariationOrders(projectId),
        getVoApprovals(voId),
      ]);
      setVos(updatedVos);
      setVoApprovals((p) => ({ ...p, [voId]: updatedApprovals }));
      setRejectId(null);
      setRejectStep(null);
      setRejectReason("");
      toast.success(decision === "approved" ? "Step approved" : "VO rejected");
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading || !permsLoaded) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  const stats = {
    draft:       vos.filter((v) => v.status === "draft").length,
    submitted:   vos.filter((v) => v.status === "submitted").length,
    approved:    vos.filter((v) => v.status === "approved").length,
    implemented: vos.filter((v) => v.status === "implemented").length,
    total:       vos.filter((v) => ["approved","implemented"].includes(v.status))
                    .reduce((s, v) => s + Number(v.total_amount), 0),
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
          {[
            { label: "Draft",       val: stats.draft,       cls: "bg-slate-100 text-slate-500"     },
            { label: "Submitted",   val: stats.submitted,   cls: "bg-blue-100 text-blue-700"       },
            { label: "Approved",    val: stats.approved,    cls: "bg-emerald-100 text-emerald-700" },
            { label: "Implemented", val: stats.implemented, cls: "bg-purple-100 text-purple-700"   },
          ].map((s) => (
            <span key={s.label} className={cn("rounded-full px-2.5 py-1 font-medium", s.cls)}>
              {s.label}: {s.val}
            </span>
          ))}
          <span className="py-1 font-semibold text-emerald-600">Approved total: ${fmt(stats.total)}</span>
        </div>
        <div className="flex items-center gap-2">
          {can("variation_orders", "export") && (
            <Button size="sm" variant="outline" onClick={() => {
              const rows: string[][] = [
                ["VO Number", "Title", "Type", "Status", "Schedule Impact (days)", "Total Amount", "Submitted At", "Rejection Reason"],
                ...vos.map((v) => [
                  v.vo_number ?? "", v.title, v.vo_type, v.status,
                  String(v.schedule_impact_days ?? 0), fmtCsvNum(Number(v.total_amount)),
                  v.submitted_at ? v.submitted_at.slice(0, 10) : "",
                  v.rejection_reason ?? "",
                ]),
              ];
              downloadCsv("variation-orders.csv", rows);
            }} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => printVoRegister(vos, projectName)} className="gap-1.5">
            <Printer className="h-3.5 w-3.5" /> Print Register
          </Button>
          {can("variation_orders", "can_create") && (
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New VO
            </Button>
          )}
        </div>
      </div>

      {/* Create VO slide-in */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold">New Variation Order</h2>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Title *</label>
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Brief description of the variation"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500">Type</label>
                  <select value={form.vo_type} onChange={(e) => setForm((p) => ({ ...p, vo_type: e.target.value as VoType }))}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm outline-none focus:border-primary">
                    {VO_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500">Schedule Impact (days)</label>
                  <input type="number" value={form.schedule_impact_days}
                    onChange={(e) => setForm((p) => ({ ...p, schedule_impact_days: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Description</label>
                <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Detailed scope of variation…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-200 px-6 py-4">
              <Button onClick={handleCreate} disabled={saving || !form.title.trim()} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create as Draft
              </Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setRejectId(null); setRejectStep(null); setRejectReason(""); }} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="font-semibold">Reject Variation Order</h3>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} placeholder="Reason for rejection…"
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={async () => {
                  const vo = vos.find((v) => v.id === rejectId);
                  if (!vo) return;
                  if (rejectStep !== null) {
                    await handleApprovalDecision(rejectId, Number(vo.total_amount), rejectStep, "rejected");
                  } else {
                    await updateVoStatus(rejectId, "rejected", { rejection_reason: rejectReason });
                    setVos((p) => p.map((v) => v.id === rejectId ? { ...v, status: "rejected", rejection_reason: rejectReason } : v));
                    setRejectId(null); setRejectReason("");
                  }
                }}
                disabled={!rejectReason.trim()}
              >Reject</Button>
              <Button variant="outline" onClick={() => { setRejectId(null); setRejectStep(null); setRejectReason(""); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* VO list */}
      {vos.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <GitBranch className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No variation orders yet. Use "New VO" to raise the first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vos.map((vo) => {
            const isExp = expandedId === vo.id;
            const items = voItems[vo.id] ?? [];
            const approvals = voApprovals[vo.id] ?? [];
            const amount = Number(vo.total_amount);
            const steps = getVoApprovalSteps(amount);
            const pendingStep = vo.status === "submitted" ? currentPendingStep(approvals, steps) : null;
            const userCanApproveCurrentStep = pendingStep !== null && canActOnStep(pendingStep, roleCodes);

            return (
              <div key={vo.id} className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                {/* Row */}
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50/60"
                  onClick={() => toggle(vo.id)}
                >
                  {isExp ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{vo.title}</p>
                    <p className="text-xs text-slate-400">{vo.vo_number} · {VO_TYPES.find((t) => t.value === vo.vo_type)?.label}</p>
                  </div>
                  {vo.schedule_impact_days > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-600">+{vo.schedule_impact_days}d</span>
                  )}
                  <span className="min-w-24 text-right text-sm font-semibold text-slate-700">${fmt(amount)}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize", STATUS_CLS[vo.status])}>
                    {vo.status}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div className="border-t border-slate-100">
                    {vo.description && (
                      <p className="px-4 py-2 text-xs text-slate-500">{vo.description}</p>
                    )}

                    {/* Approval chain */}
                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                      <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">Approval Chain — {voApprovalThreshold(amount)}</p>
                      <div className="flex items-start gap-3 flex-wrap">
                        {steps.map((s) => {
                          const a = approvals.find((ap) => ap.step === s.step);
                          const isPending = !a || a.decision === "pending";
                          const isApproved = a?.decision === "approved";
                          const isRejected = a?.decision === "rejected";
                          const isCurrentStep = pendingStep === s.step;
                          return (
                            <div key={s.step} className={cn(
                              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                              isApproved ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                              isRejected ? "border-red-200 bg-red-50 text-red-700" :
                              isCurrentStep ? "border-blue-200 bg-blue-50 text-blue-700" :
                              "border-slate-200 bg-white text-slate-500"
                            )}>
                              {isApproved ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                               isRejected ? <XCircle className="h-3.5 w-3.5" /> :
                               <Clock className="h-3.5 w-3.5" />}
                              <div>
                                <p className="font-medium">Step {s.step}: {s.label}</p>
                                {isApproved && a?.decided_at && (
                                  <p className="text-[10px] opacity-70">{new Date(a.decided_at).toLocaleDateString()}</p>
                                )}
                                {isRejected && a?.comments && (
                                  <p className="text-[10px] opacity-70">{a.comments}</p>
                                )}
                                {isCurrentStep && vo.status === "submitted" && (
                                  <p className="text-[10px] opacity-70">Awaiting decision</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {vo.rejection_reason && (
                        <p className="mt-2 text-xs text-red-600">Rejection reason: {vo.rejection_reason}</p>
                      )}
                    </div>

                    {/* Items table */}
                    {items.length > 0 && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                            <th className="px-4 py-2 text-left">Description</th>
                            <th className="px-3 py-2 text-center">Unit</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Total</th>
                            <th className="w-8 px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                              <td className="px-4 py-2 text-slate-700">{item.description}</td>
                              <td className="px-3 py-2 text-center text-slate-500">{item.unit}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{Number(item.quantity).toLocaleString()}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{fmt(Number(item.unit_rate))}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-700">${fmt(Number(item.total_amount ?? 0))}</td>
                              <td className="px-3 py-2">
                                {vo.status === "draft" && can("variation_orders", "delete") && (
                                  <button onClick={() => void handleDeleteItem(vo.id, item.id)}
                                    className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                            <td colSpan={4} className="px-4 py-2 text-xs text-slate-600">Total</td>
                            <td className="px-3 py-2 text-right text-sm text-slate-800">${fmt(amount)}</td>
                            <td />
                          </tr>
                        </tbody>
                      </table>
                    )}

                    {/* Add item form (draft only) */}
                    {vo.status === "draft" && can("variation_orders", "edit") && (
                      <div className="border-t border-slate-100 bg-slate-50/40 p-3 space-y-2">
                        <div className="grid grid-cols-12 gap-2">
                          <input value={itemForm.description} onChange={(e) => setItemForm((p) => ({ ...p, description: e.target.value }))}
                            placeholder="Description *" className="col-span-5 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary" />
                          <input value={itemForm.unit} onChange={(e) => setItemForm((p) => ({ ...p, unit: e.target.value }))}
                            placeholder="Unit *" className="col-span-2 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary" />
                          <input type="number" min="0" step="any" value={itemForm.quantity} onChange={(e) => setItemForm((p) => ({ ...p, quantity: e.target.value }))}
                            placeholder="Qty" className="col-span-2 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary" />
                          <input type="number" min="0" step="any" value={itemForm.unit_rate} onChange={(e) => setItemForm((p) => ({ ...p, unit_rate: e.target.value }))}
                            placeholder="Rate" className="col-span-3 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary" />
                        </div>
                        <Button size="sm" onClick={() => void handleAddItem(vo.id)} disabled={addingItem || !itemForm.description.trim()} className="gap-1">
                          {addingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Add Item
                        </Button>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
                      {vo.status === "draft" && can("variation_orders", "submit") && (
                        <Button size="sm" onClick={() => void handleSimpleStatus(vo.id, "submitted")} className="gap-1.5">
                          Submit for Approval
                        </Button>
                      )}

                      {/* Step-based approval buttons — only for the current pending step */}
                      {vo.status === "submitted" && pendingStep !== null && userCanApproveCurrentStep && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void handleApprovalDecision(vo.id, amount, pendingStep, "approved")}
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve (Step {pendingStep})
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { setRejectId(vo.id); setRejectStep(pendingStep); }}
                          >
                            Reject
                          </Button>
                        </>
                      )}

                      {/* Waiting indicator when user can't act on current step */}
                      {vo.status === "submitted" && pendingStep !== null && !userCanApproveCurrentStep && (
                        <span className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600">
                          <Clock className="h-3.5 w-3.5" />
                          Awaiting Step {pendingStep} approval ({steps.find((s) => s.step === pendingStep)?.label})
                        </span>
                      )}

                      {vo.status === "approved" && can("variation_orders", "edit") && (
                        <Button size="sm" onClick={() => void handleSimpleStatus(vo.id, "implemented")} className="gap-1.5 bg-purple-600 hover:bg-purple-700">
                          Implement VO
                        </Button>
                      )}

                      {vo.status === "rejected" && can("variation_orders", "edit") && (
                        <Button size="sm" variant="outline" onClick={() => void handleSimpleStatus(vo.id, "draft")}>
                          Reset to Draft
                        </Button>
                      )}
                    </div>
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
