"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, Clock, Download, FileText, Loader2, Plus, Printer, XCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type ClaimApprovalStep,
  type ClaimStatus,
  type QsClaimApproval,
  type QsClaimItem,
  type QsProgressClaim,
  createProgressClaim,
  getClaimApprovals,
  getClaimApprovalSteps,
  getClaimItems,
  getProgressClaims,
  getProjectClaimDefaults,
  recalculateClaim,
  resetClaimToDraft,
  submitClaimApprovalDecision,
  updateClaimItem,
  updateClaimStatus,
} from "@/lib/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { downloadCsv, fmtCsvNum } from "@/lib/csv-export";
import { printIpcCertificate, printIpcSubmissionPackage } from "@/lib/print-service";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_CLS: Record<ClaimStatus, string> = {
  draft:            "bg-slate-100 text-slate-500",
  internal_review:  "bg-amber-100 text-amber-700",
  pm_endorsed:      "bg-cyan-100 text-cyan-700",
  submitted:        "bg-blue-100 text-blue-700",
  client_reviewed:  "bg-amber-100 text-amber-700",
  certified:        "bg-emerald-100 text-emerald-700",
  paid:             "bg-purple-100 text-purple-700",
  rejected:         "bg-red-100 text-red-700",
};

/** Determine which approval step is pending for a claim in internal_review — mirrors
 *  variation-order-list.tsx's currentPendingStep exactly. */
function currentPendingStep(approvals: QsClaimApproval[], steps: ClaimApprovalStep[]): number | null {
  for (const s of steps) {
    const a = approvals.find((ap) => ap.step === s.step);
    if (!a || a.decision === "pending") return s.step;
    if (a.decision === "rejected") return null;
  }
  return null;
}

/** Role gate per fixed step: step 1 = QS Manager, step 2 = PM — same role sets
 *  as useQsPermissions().isQsManager / isPM. */
function canActOnStep(step: number, roleCodes: string[]): boolean {
  if (step === 1) return roleCodes.some((r) => ["QS","L0","L1","L2"].includes(r));
  if (step === 2) return roleCodes.some((r) => ["L3","L0","L1","L2"].includes(r));
  return false;
}

const BLANK = {
  period_start:         new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
  period_end:           new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0],
  original_contract_sum: "",
  retention_pct:        "5",
  advance_recovery_this_period: "0",
  notes:                "",
};

interface Props { projectId: string; projectName?: string }

export function ProgressClaimList({ projectId, projectName = projectId }: Props) {
  const { can, roleCodes } = useQsPermissions();

  const [claims, setClaims]     = useState<QsProgressClaim[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]         = useState(BLANK);
  const [creating, setCreating] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [advanceAvailable, setAdvanceAvailable] = useState<number | null>(null);
  const [expandedId, setExpanded] = useState<string | null>(null);
  const [itemsMap, setItemsMap] = useState<Record<string, QsClaimItem[]>>({});
  const [approvalsMap, setApprovalsMap] = useState<Record<string, QsClaimApproval[]>>({});
  const [inputs, setInputs]     = useState<Record<string, { this_period: string; materials_stored: string; client_adjustment: string; adjustment_reason: string; override_reason: string }>>({});
  const [saving, setSaving]     = useState(false);
  const [rejectId, setRejectId]     = useState<string | null>(null);
  const [rejectStep, setRejectStep] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setClaims(await getProgressClaims(projectId)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load progress claims"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function loadItems(claimId: string) {
    if (itemsMap[claimId]) return;
    try {
      const items = await getClaimItems(claimId);
      setItemsMap((p) => ({ ...p, [claimId]: items }));
      const init: Record<string, { this_period: string; materials_stored: string; client_adjustment: string; adjustment_reason: string; override_reason: string }> = {};
      for (const i of items) {
        init[i.id] = {
          this_period: String(i.this_period),
          materials_stored: String(i.materials_stored),
          client_adjustment: String(i.client_adjustment ?? 0),
          adjustment_reason: i.adjustment_reason ?? "",
          override_reason: i.override_reason ?? "",
        };
      }
      setInputs((p) => ({ ...p, ...init }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load claim items"); }
  }

  async function loadApprovals(claimId: string) {
    if (approvalsMap[claimId]) return;
    try {
      const approvals = await getClaimApprovals(claimId);
      setApprovalsMap((p) => ({ ...p, [claimId]: approvals }));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load approval chain"); }
  }

  function toggle(id: string) {
    if (expandedId === id) { setExpanded(null); return; }
    setExpanded(id);
    void loadItems(id);
    void loadApprovals(id);
  }

  async function handleApprovalDecision(claimId: string, step: number, decision: "approved" | "rejected") {
    if (decision === "rejected" && !rejectReason.trim()) { toast.error("Rejection reason is required."); return; }
    try {
      await submitClaimApprovalDecision(claimId, step, decision, rejectReason || undefined);
      const [updatedClaims, updatedApprovals] = await Promise.all([
        getProgressClaims(projectId),
        getClaimApprovals(claimId),
      ]);
      setClaims(updatedClaims);
      setApprovalsMap((p) => ({ ...p, [claimId]: updatedApprovals }));
      setRejectId(null);
      setRejectStep(null);
      setRejectReason("");
      toast.success(decision === "approved" ? "Step approved" : "IPC rejected");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to record decision"); }
  }

  async function handleResetToDraft(claimId: string) {
    try {
      await resetClaimToDraft(claimId);
      setClaims(await getProgressClaims(projectId));
      setApprovalsMap((p) => ({ ...p, [claimId]: [] }));
      toast.success("IPC reset to draft");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to reset IPC"); }
  }

  async function openCreate() {
    setShowCreate(true);
    setLoadingDefaults(true);
    try {
      const defaults = await getProjectClaimDefaults(projectId);
      setForm((p) => ({
        ...p,
        retention_pct: defaults.retentionPct != null ? String(defaults.retentionPct) : p.retention_pct,
        original_contract_sum: defaults.contractSum != null ? String(defaults.contractSum) : p.original_contract_sum,
      }));
      setAdvanceAvailable(
        defaults.advancePct != null && defaults.contractSum != null
          ? Math.round(defaults.contractSum * defaults.advancePct) / 100
          : null,
      );
    } catch (error) {
      // Defaults are a convenience, not a requirement — fall through to manual entry.
      toast.error(error instanceof Error ? error.message : "Could not load contract defaults; enter values manually.");
    } finally {
      setLoadingDefaults(false);
    }
  }

  function closeCreate() {
    setShowCreate(false);
    setForm(BLANK);
    setAdvanceAvailable(null);
  }

  async function handleCreate() {
    const contractSum = parseFloat(form.original_contract_sum);
    if (isNaN(contractSum) || contractSum <= 0) { toast.error("Contract sum is required."); return; }
    setCreating(true);
    try {
      const claim = await createProgressClaim({
        project_id:           projectId,
        period_start:         form.period_start,
        period_end:           form.period_end,
        retention_pct:        parseFloat(form.retention_pct) || 5,
        original_contract_sum: contractSum,
        advance_recovery_this_period: parseFloat(form.advance_recovery_this_period) || 0,
        notes:                form.notes || null,
      });
      setClaims((p) => [claim, ...p]);
      setForm(BLANK);
      setShowCreate(false);
      setAdvanceAvailable(null);
      setExpanded(claim.id);
      toast.success(`IPC #${claim.claim_number} created`);
      void loadItems(claim.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to create IPC"); }
    finally { setCreating(false); }
  }

  async function handleSaveItems(claimId: string) {
    const items = itemsMap[claimId] ?? [];
    if (items.length === 0) return;
    setSaving(true);
    try {
      await Promise.all(items.map((item) => {
        const inp = inputs[item.id];
        if (!inp) return Promise.resolve();
        return updateClaimItem(
          item.id,
          parseFloat(inp.this_period) || 0,
          parseFloat(inp.materials_stored) || 0,
          parseFloat(inp.client_adjustment) || 0,
          inp.adjustment_reason || null,
          inp.override_reason || null,
        );
      }));
      const updated = await recalculateClaim(claimId);
      setClaims((p) => p.map((c) => c.id === claimId ? updated : c));
      // Reload items to get fresh totals from GENERATED columns
      const fresh = await getClaimItems(claimId);
      setItemsMap((p) => ({ ...p, [claimId]: fresh }));
      toast.success("Items saved and claim recalculated");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to save claim items"); }
    finally { setSaving(false); }
  }

  async function handleStatus(id: string, status: ClaimStatus) {
    try {
      await updateClaimStatus(id, status);
      await load();
      toast.success(`Claim ${status}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to update claim status"); }
  }

  // Group claim items by section
  function groupedItems(items: QsClaimItem[]): { sectionTitle: string; rows: QsClaimItem[] }[] {
    const sectionMap: Record<string, { title: string; rows: QsClaimItem[] }> = {};
    for (const item of items) {
      const key = item.boq_section_id ?? "unlinked";
      const section = item.qs_boq_sections as { title?: string } | { title?: string }[] | null | undefined;
      const title = Array.isArray(section) ? section[0]?.title ?? "Unlinked Items" : section?.title ?? "Unlinked Items";
      if (!sectionMap[key]) sectionMap[key] = { title, rows: [] };
      sectionMap[key].rows.push(item);
    }
    return Object.values(sectionMap).map((s) => ({ sectionTitle: s.title, rows: s.rows }));
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          {claims.length} claim{claims.length !== 1 ? "s" : ""} ·{" "}
          <span className="font-semibold text-emerald-600">
            Certified to date: ${fmt(
              claims.filter((c) => ["certified","paid"].includes(c.status))
                    .reduce((s, c) => s + Number(c.total_completed_stored), 0)
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {can("claims", "export") && (
            <Button size="sm" variant="outline" onClick={() => {
              const rows: string[][] = [
                ["IPC #", "Period Start", "Period End", "Contract Sum", "Total Completed", "Retention", "Prev Certs", "Current Payment Due", "Status"],
                ...claims.map((c) => [
                  String(c.claim_number), c.period_start, c.period_end,
                  fmtCsvNum(Number(c.original_contract_sum)), fmtCsvNum(Number(c.total_completed_stored)),
                  fmtCsvNum(Number(c.retention_amount)), fmtCsvNum(Number(c.prev_certificates_total)),
                  fmtCsvNum(Number(c.current_payment_due)), c.status,
                ]),
              ];
              downloadCsv("progress-claims.csv", rows);
            }} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
          )}
          {can("claims", "can_create") && (
            <Button size="sm" onClick={() => void openCreate()} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New IPC
            </Button>
          )}
        </div>
      </div>

      {/* Create IPC slide-in */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={closeCreate} />
          <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold">New Progress Claim (IPC)</h2>
              <button onClick={closeCreate} className="rounded-lg p-1.5 hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {loadingDefaults && (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading contract defaults…
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Original Contract Sum *</label>
                <input type="number" min="0" step="any"
                  value={form.original_contract_sum}
                  onChange={(e) => setForm((p) => ({ ...p, original_contract_sum: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                <p className="text-[10px] text-slate-400">Pre-filled from the project's head contract or most recent claim, where available. Net VO amount is auto-calculated from implemented VOs.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500">Period Start</label>
                  <input type="date" value={form.period_start}
                    onChange={(e) => setForm((p) => ({ ...p, period_start: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500">Period End</label>
                  <input type="date" value={form.period_end}
                    onChange={(e) => setForm((p) => ({ ...p, period_end: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500">Retention %</label>
                  <input type="number" min="0" max="100" step="0.5"
                    value={form.retention_pct}
                    onChange={(e) => setForm((p) => ({ ...p, retention_pct: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500">Advance Recovery</label>
                  <input type="number" min="0" step="any"
                    value={form.advance_recovery_this_period}
                    onChange={(e) => setForm((p) => ({ ...p, advance_recovery_this_period: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
                  {advanceAvailable != null && (
                    <p className="text-[10px] text-slate-400">Advance given: ${fmt(advanceAvailable)}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-slate-500">Notes</label>
                <textarea rows={3} value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Claim items will be pre-populated from your project BOQ.
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-200 px-6 py-4">
              <Button onClick={handleCreate} disabled={creating || !form.original_contract_sum} className="gap-1.5">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Create IPC
              </Button>
              <Button variant="outline" onClick={closeCreate}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setRejectId(null); setRejectStep(null); setRejectReason(""); }} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="font-semibold">Reject IPC</h3>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} placeholder="Reason for rejection…"
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => { if (rejectStep !== null) void handleApprovalDecision(rejectId, rejectStep, "rejected"); }}
                disabled={!rejectReason.trim()}
              >Reject</Button>
              <Button variant="outline" onClick={() => { setRejectId(null); setRejectStep(null); setRejectReason(""); }}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Claims */}
      {claims.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <FileText className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No progress claims yet. Create your first monthly IPC.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {claims.map((claim) => {
            const isExp = expandedId === claim.id;
            const items = itemsMap[claim.id] ?? [];
            const isDraft = claim.status === "draft";
            const contractSumToDate = Number(claim.original_contract_sum) + Number(claim.net_vo_amount);
            const groups = groupedItems(items);
            const approvals = approvalsMap[claim.id] ?? [];
            const approvalSteps = getClaimApprovalSteps();
            const pendingStep = claim.status === "internal_review" ? currentPendingStep(approvals, approvalSteps) : null;
            const userCanApproveCurrentStep = pendingStep !== null && canActOnStep(pendingStep, roleCodes);

            return (
              <div key={claim.id} className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                {/* Claim row */}
                <div
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50/60"
                  onClick={() => toggle(claim.id)}
                >
                  {isExp ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">IPC #{claim.claim_number}</p>
                    <p className="text-xs text-slate-400">{claim.period_start} → {claim.period_end}</p>
                  </div>
                  <div className="hidden sm:flex gap-4 text-right text-xs">
                    <div>
                      <p className="text-slate-400">Completed</p>
                      <p className="font-medium text-slate-700">${fmt(Number(claim.total_completed_stored))}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Net Due</p>
                      <p className="font-medium text-emerald-600">${fmt(Number(claim.current_payment_due))}</p>
                    </div>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize", STATUS_CLS[claim.status])}>
                    {claim.status}
                  </span>
                </div>

                {/* Detail */}
                {isExp && (
                  <div className="border-t border-slate-100">
                    {/* G702 Summary */}
                    <div className="grid grid-cols-1 gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        { label: "Original Contract",   val: fmt(Number(claim.original_contract_sum)) },
                        { label: "Net VO Amount",       val: fmt(Number(claim.net_vo_amount))         },
                        { label: "Contract Sum to Date",val: fmt(contractSumToDate)                   },
                        { label: "Total Completed",     val: fmt(Number(claim.total_completed_stored))},
                        { label: "Client Adjustment",   val: fmt(Number(claim.client_adjustment_total ?? 0)), cls: Number(claim.client_adjustment_total ?? 0) < 0 ? "text-red-600" : "text-emerald-600" },
                        { label: `Retention (${claim.retention_pct}%)`, val: `(${fmt(Number(claim.retention_amount))})`, cls: "text-red-600" },
                        { label: "Less Previous Certs", val: `(${fmt(Number(claim.prev_certificates_total))})`, cls: "text-red-600" },
                        ...(Number(claim.advance_recovery_this_period ?? 0) !== 0
                          ? [{ label: "Advance Recovery", val: `(${fmt(Number(claim.advance_recovery_this_period))})`, cls: "text-red-600" }]
                          : []),
                        { label: "CURRENT PAYMENT DUE", val: fmt(Number(claim.current_payment_due)),  cls: "font-bold text-emerald-600" },
                        { label: "Status",              val: claim.status.toUpperCase(),               cls: "capitalize" },
                      ].map((row) => (
                        <div key={row.label} className="bg-white px-4 py-3">
                          <p className="text-[10px] uppercase tracking-wider text-slate-400">{row.label}</p>
                          <p className={cn("mt-0.5 text-sm font-medium text-slate-700", row.cls)}>${row.val}</p>
                        </div>
                      ))}
                    </div>

                    {/* Approval chain */}
                    {(claim.status === "internal_review" || approvals.length > 0) && (
                      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                        <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-400">Internal Approval Chain</p>
                        <div className="flex items-start gap-3 flex-wrap">
                          {approvalSteps.map((s) => {
                            const a = approvals.find((ap) => ap.step === s.step);
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
                                  {isCurrentStep && claim.status === "internal_review" && (
                                    <p className="text-[10px] opacity-70">Awaiting decision</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {claim.status === "rejected" && claim.rejection_reason && (
                          <p className="mt-2 text-xs text-red-600">Rejection reason: {claim.rejection_reason}</p>
                        )}
                      </div>
                    )}

                    {/* AR Invoice link */}
                    {claim.ar_invoice_id && (() => {
                      const arInv = Array.isArray(claim.account_ar_invoices) ? claim.account_ar_invoices[0] : claim.account_ar_invoices;
                      if (!arInv) return null;
                      return (
                        <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-4 py-2 text-xs">
                          <span className="text-slate-400">AR Invoice:</span>
                          <span className="font-medium text-slate-700">{arInv.invoice_no}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", STATUS_CLS[arInv.status as ClaimStatus] ?? "bg-slate-100 text-slate-500")}>
                            {arInv.status}
                          </span>
                          <span className="ml-auto text-slate-400">${fmt(Number(arInv.net_amount))}</span>
                        </div>
                      );
                    })()}

                    {/* Items table */}
                    {items.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                              <th className="px-3 py-2 text-left">Description</th>
                              <th className="px-3 py-2 text-right w-28">Scheduled</th>
                              <th className="px-3 py-2 text-right w-24">Prev</th>
                              <th className="px-3 py-2 text-center w-16">Plan %</th>
                              <th className="px-3 py-2 text-right w-28">This Period</th>
                              <th className="px-3 py-2 text-right w-24">Stored</th>
                              <th className="px-3 py-2 text-right w-28">Adjustment</th>
                              <th className="px-3 py-2 text-right w-28">Total to Date</th>
                              <th className="px-3 py-2 text-center w-16">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {groups.map((group) => (
                              <Fragment key={group.sectionTitle}>
                                <tr key={group.sectionTitle} className="bg-slate-50">
                                  <td colSpan={9} className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                    {group.sectionTitle}
                                  </td>
                                </tr>
                                {group.rows.map((item) => {
                                  const inp = inputs[item.id] ?? { this_period: "0", materials_stored: "0", client_adjustment: "0", adjustment_reason: "", override_reason: "" };
                                  const hasPlanningPct = item.planning_pct !== null && item.planning_pct !== undefined;
                                  const planningImplied = hasPlanningPct
                                    ? Math.max(0, (Number(item.planning_pct) / 100) * Number(item.scheduled_value) - Number(item.prev_completed))
                                    : null;
                                  const deviates = planningImplied !== null && Math.abs((parseFloat(inp.this_period) || 0) - planningImplied) > 0.01;
                                  return (
                                    <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                                      <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate">{item.description}</td>
                                      <td className="px-3 py-2 text-right text-slate-600">${fmt(Number(item.scheduled_value))}</td>
                                      <td className="px-3 py-2 text-right text-slate-500">${fmt(Number(item.prev_completed))}</td>
                                      <td className="px-3 py-2 text-center text-slate-500" title={hasPlanningPct ? `Planning-confirmed as of ${item.planning_snapshot_date ?? "—"}` : "No linked WBS node / planning progress"}>
                                        {hasPlanningPct ? `${Number(item.planning_pct).toFixed(1)}%` : "—"}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        {isDraft ? (
                                          <div className="space-y-1">
                                            <input
                                              type="number" min="0" step="any"
                                              value={inp.this_period}
                                              onChange={(e) => setInputs((p) => ({ ...p, [item.id]: { ...inp, this_period: e.target.value } }))}
                                              className={cn(
                                                "w-full rounded border bg-white px-2 py-1 text-right text-xs outline-none focus:border-primary",
                                                deviates ? "border-amber-400 bg-amber-50" : "border-slate-200",
                                              )}
                                            />
                                            {deviates && (
                                              <input
                                                value={inp.override_reason}
                                                onChange={(e) => setInputs((p) => ({ ...p, [item.id]: { ...inp, override_reason: e.target.value } }))}
                                                placeholder="Override reason (required)"
                                                className="w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs outline-none focus:border-primary"
                                              />
                                            )}
                                          </div>
                                        ) : (
                                          <span className={cn("text-slate-600", deviates && "text-amber-600 font-medium")}>${fmt(Number(item.this_period))}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        {isDraft ? (
                                          <input
                                            type="number" min="0" step="any"
                                            value={inp.materials_stored}
                                            onChange={(e) => setInputs((p) => ({ ...p, [item.id]: { ...inp, materials_stored: e.target.value } }))}
                                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-primary"
                                          />
                                        ) : (
                                          <span className="text-slate-500">${fmt(Number(item.materials_stored))}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        {claim.status === "submitted" || claim.status === "client_reviewed" ? (
                                          <div className="space-y-1">
                                            <input
                                              type="number" step="any"
                                              value={inp.client_adjustment}
                                              onChange={(e) => setInputs((p) => ({ ...p, [item.id]: { ...inp, client_adjustment: e.target.value } }))}
                                              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs outline-none focus:border-primary"
                                            />
                                            <input
                                              value={inp.adjustment_reason}
                                              onChange={(e) => setInputs((p) => ({ ...p, [item.id]: { ...inp, adjustment_reason: e.target.value } }))}
                                              placeholder="Reason"
                                              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-primary"
                                            />
                                          </div>
                                        ) : (
                                          <span className={cn("text-slate-500", Number(item.client_adjustment ?? 0) < 0 && "text-red-500")}>${fmt(Number(item.client_adjustment ?? 0))}</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-right font-medium text-slate-700">${fmt(Number(item.total_to_date))}</td>
                                      <td className={cn("px-3 py-2 text-center font-medium",
                                        Number(item.pct_complete) >= 100 ? "text-emerald-600" : "text-slate-600")}>
                                        {Number(item.pct_complete).toFixed(1)}%
                                      </td>
                                    </tr>
                                  );
                                })}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="px-4 py-6 text-center text-xs text-slate-400">
                        No BOQ items found. Add items to the BOQ first, then create a new IPC.
                      </p>
                    )}

                    {/* Action bar */}
                    <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
                      {isDraft && items.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => void handleSaveItems(claim.id)} disabled={saving} className="gap-1.5">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Save & Recalculate
                        </Button>
                      )}
                      {items.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => printIpcCertificate(claim, items, projectName)} className="gap-1.5 ml-auto">
                          <Printer className="h-3.5 w-3.5" /> Print Certificate
                        </Button>
                      )}
                      {claim.status === "draft" && can("claims", "submit") && (
                        <Button size="sm" onClick={() => void handleStatus(claim.id, "internal_review")}>
                          Submit for Internal Review
                        </Button>
                      )}

                      {/* Step-based approval buttons — only for the current pending step */}
                      {claim.status === "internal_review" && pendingStep !== null && userCanApproveCurrentStep && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => void handleApprovalDecision(claim.id, pendingStep, "approved")}
                            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve (Step {pendingStep})
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => { setRejectId(claim.id); setRejectStep(pendingStep); }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {claim.status === "internal_review" && pendingStep !== null && !userCanApproveCurrentStep && (
                        <span className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600">
                          <Clock className="h-3.5 w-3.5" />
                          Awaiting Step {pendingStep} approval ({approvalSteps.find((s) => s.step === pendingStep)?.label})
                        </span>
                      )}

                      {claim.status === "pm_endorsed" && can("claims", "submit") && (
                        <Button size="sm" onClick={() => void handleStatus(claim.id, "submitted")}>
                          Submit to Client
                        </Button>
                      )}

                      {claim.status === "rejected" && can("claims", "edit") && (
                        <Button size="sm" variant="outline" onClick={() => void handleResetToDraft(claim.id)}>
                          Reset to Draft
                        </Button>
                      )}

                      {claim.submission_document_id && (
                        <Button size="sm" variant="outline" onClick={() => printIpcSubmissionPackage(claim, items, projectName)} className="gap-1.5">
                          <Printer className="h-3.5 w-3.5" /> Print Submission Package
                        </Button>
                      )}

                      {(claim.status === "submitted" || claim.status === "client_reviewed") && items.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => void handleSaveItems(claim.id)} disabled={saving} className="gap-1.5">
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Save Client Adjustments
                        </Button>
                      )}
                      {claim.status === "submitted" && can("claims", "approve") && (
                        <Button size="sm" onClick={() => void handleStatus(claim.id, "client_reviewed")} className="bg-amber-600 hover:bg-amber-700">
                          Mark Client Reviewed
                        </Button>
                      )}
                      {claim.status === "client_reviewed" && can("claims", "approve") && (
                        <Link href={`/dashboard/qs/claims/${claim.id}/certify`}>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                            Certify IPC
                          </Button>
                        </Link>
                      )}
                      {claim.status === "certified" && can("claims", "approve") && (
                        <Button size="sm" onClick={() => void handleStatus(claim.id, "paid")} className="bg-purple-600 hover:bg-purple-700">
                          Mark as Paid
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
