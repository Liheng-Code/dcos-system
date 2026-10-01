"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Circle, Loader2, Lock, Plus, Send, Trophy, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClarificationsRegister, ReturnablesChecklist, type Returnable } from "@/components/projects/precontract-bid-prep";
import { AwardConversionDialog } from "@/components/projects/award-conversion-dialog";
import { setTenderStage, STAGE_LABELS } from "@/lib/qs/tender-lifecycle";
import {
  APPROVAL_STEPS,
  canDecideStep,
  decideApprovalStep,
  recordSubmission,
  recordUnsuccessful,
  REVIEW_STEPS,
  startInternalReview,
  SUBMISSION_METHODS,
  type ApprovalDecision,
  type ApprovalStep,
  type BidApproval,
} from "@/lib/qs/tender-approval";
import {
  canPrepare,
  Card,
  EmptyState,
  Field,
  fieldClass,
  formatDate,
  formatDateTime,
  formatMoney,
  Pill,
  staffName,
  toastResult,
  WorkstreamStrip,
  type PrecontractCtx,
} from "./shared";

const db = () => createClient();

interface BidRevision {
  id: string;
  revision_no: number;
  total_bid_price: number | null;
  status: string;
}

/** What the compliance check (master step 13 → 14) and final compliance check (15) look at. */
function useCompliance(ctx: PrecontractCtx) {
  const tenderId = ctx.tender?.id;
  const [revisions, setRevisions] = useState<BidRevision[]>([]);
  const [returnables, setReturnables] = useState<Returnable[]>([]);
  const [openQueries, setOpenQueries] = useState(0);
  const [loading, setLoading] = useState(!!tenderId);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!tenderId) return;
    let cancelled = false;
    async function load() {
      const [rev, ret, clar] = await Promise.all([
        db().from("tender_bid_summaries").select("id, revision_no, total_bid_price, status").eq("tender_id", tenderId!).order("revision_no", { ascending: false }),
        db().from("tender_returnables").select("*").eq("tender_id", tenderId!),
        db().from("tender_clarifications").select("id", { count: "exact", head: true }).eq("tender_id", tenderId!).eq("status", "open"),
      ]);
      if (cancelled) return;
      setRevisions((rev.data ?? []) as BidRevision[]);
      setReturnables((ret.data ?? []) as Returnable[]);
      setOpenQueries(clar.count ?? 0);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [tenderId, key]);

  const mandatory = returnables.filter((r) => r.is_mandatory);
  const requiredWs = ctx.workstreams.filter((w) => w.required);
  const checks = [
    { label: "Go decision recorded", ok: ctx.details.go_no_go_decision === "go", required: true },
    { label: "Bid summary prepared", ok: revisions.length > 0, required: true },
    {
      label: mandatory.length ? `Mandatory returnables ready (${mandatory.filter((r) => r.is_ready).length}/${mandatory.length})` : "Mandatory returnables listed",
      ok: mandatory.length > 0 && mandatory.every((r) => r.is_ready),
      required: true,
    },
    {
      label: `Required workstreams completed (${requiredWs.filter((w) => w.status === "completed").length}/${requiredWs.length})`,
      ok: requiredWs.length > 0 && requiredWs.every((w) => w.status === "completed"),
      required: false,
    },
    { label: openQueries ? `${openQueries} client ${openQueries === 1 ? "query" : "queries"} still open` : "No open client queries", ok: openQueries === 0, required: false },
  ];
  return {
    loading,
    latest: revisions[0] as BidRevision | undefined,
    revisions,
    checks,
    compliant: checks.every((c) => !c.required || c.ok),
    reload: useCallback(() => setKey((k) => k + 1), []),
  };
}

function Checklist({ checks }: { checks: { label: string; ok: boolean; required: boolean }[] }) {
  return (
    <ul className="space-y-1.5">
      {checks.map((c) => (
        <li key={c.label} className="flex items-center gap-2 text-sm">
          {c.ok ? <CheckCircle className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          <span className={cn(!c.ok && "text-muted-foreground")}>{c.label}</span>
          {c.required && !c.ok && <span className="text-[10px] text-orange-600">required</span>}
        </li>
      ))}
    </ul>
  );
}

// ─── 12 Clarifications & Addenda ─────────────────────────────────────────────

interface Addendum {
  id: string;
  addendum_no: string;
  title: string;
  description: string;
  issue_date: string;
  affects_drawings: boolean;
  affects_boq: boolean;
  affects_spec: boolean;
  affects_programme: boolean;
  affects_cost: boolean;
  affects_risk: boolean;
  impact_notes: string | null;
  assessed: boolean;
}

const IMPACTS = [
  ["affects_drawings", "Drawings"], ["affects_boq", "BOQ"], ["affects_spec", "Specification"],
  ["affects_programme", "Programme"], ["affects_cost", "Cost"], ["affects_risk", "Risk"],
] as const;

export function ClarificationsSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const [addenda, setAddenda] = useState<Addendum[]>([]);
  const [key, setKey] = useState(0);
  const empty = { addendum_no: "", title: "", description: "", issue_date: new Date().toISOString().slice(0, 10) };
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const stage = ctx.details.tender_stage;
  const live = !["awarded", "unsuccessful", "closed"].includes(stage);
  const canLog = live && ctx.can("tender_register", "edit");

  useEffect(() => {
    if (!tenderId) return;
    db().from("tender_addenda").select("*").eq("tender_id", tenderId).order("issue_date", { ascending: false })
      .then(({ data }) => setAddenda((data ?? []) as Addendum[]));
  }, [tenderId, key]);

  async function add() {
    if (addenda.some((a) => a.addendum_no.trim().toUpperCase() === form.addendum_no.trim().toUpperCase())) {
      toast.error(`Addendum ${form.addendum_no.trim()} is already recorded.`);
      return;
    }
    const reopens = ["tendering", "internal_review", "approval"].includes(stage);
    const { error } = await db().from("tender_addenda").insert({
      tender_id: tenderId!, addendum_no: form.addendum_no.trim(), title: form.title.trim(),
      description: form.description.trim(), issue_date: form.issue_date,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(reopens && stage !== "tendering"
      ? "Addendum recorded — the bid returned to Tendering; re-price the affected items"
      : "Addendum recorded — assess its impact");
    setForm(empty);
    setShowForm(false);
    setKey((k) => k + 1);
    await ctx.refresh();
  }

  // Shown at once; a failed save reloads the saved values.
  async function patch(a: Addendum, fields: Partial<Addendum>) {
    setAddenda((prev) => prev.map((x) => (x.id === a.id ? { ...x, ...fields } : x)));
    const { error } = await db().from("tender_addenda").update(fields).eq("id", a.id);
    if (error) {
      toast.error(error.message);
      setKey((k) => k + 1);
    }
  }

  if (!tenderId) return <EmptyState>Link a tender register to track clarifications and addenda.</EmptyState>;
  return (
    <div className="space-y-4">
      <WorkstreamStrip ctx={ctx} codes={["clarifications"]} />
      <ClarificationsRegister tenderId={tenderId} readOnly={!live} />
      <Card
        title="Addenda from Client"
        description="During preparation an addendum returns a finalised or approved bid to Tendering for re-pricing. After submission it is logged only."
        actions={canLog && <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}><Plus className="h-3.5 w-3.5 mr-1" /> Record Addendum</Button>}
      >
        {showForm && (
          <div className="mb-4 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
            <input className={fieldClass} placeholder="Addendum No." value={form.addendum_no} onChange={(e) => setForm({ ...form, addendum_no: e.target.value })} />
            <input className={cn(fieldClass, "sm:col-span-2")} placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <input type="date" className={fieldClass} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} />
            <textarea className={cn(fieldClass, "sm:col-span-4")} rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" disabled={!form.addendum_no.trim() || !form.title.trim() || !form.description.trim()} onClick={add}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {addenda.length === 0 ? <p className="text-xs text-muted-foreground">No addenda issued.</p> : (
          <div className="divide-y divide-border">
            {addenda.map((a) => (
              <div key={a.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{a.addendum_no} · {a.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDate(a.issue_date)}</span>
                    <Pill tone={a.assessed ? "green" : "amber"}>{a.assessed ? "assessed" : "to assess"}</Pill>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-xs text-muted-foreground">Affects:</span>
                  {IMPACTS.map(([field, lbl]) => (
                    <label key={field} className="flex items-center gap-1 text-xs">
                      <input type="checkbox" className="h-3.5 w-3.5" checked={a[field]} disabled={!canLog || a.assessed}
                        onChange={(e) => patch(a, { [field]: e.target.checked } as Partial<Addendum>)} />
                      {lbl}
                    </label>
                  ))}
                  {canLog && !a.assessed && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => patch(a, { assessed: true })}>Mark assessed</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── 13 Tender Compilation ───────────────────────────────────────────────────

export function CompilationSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const compliance = useCompliance(ctx);
  if (!tenderId) return <EmptyState>Link a tender register to compile the tender.</EmptyState>;
  return (
    <div className="space-y-4">
      <WorkstreamStrip ctx={ctx} codes={["compilation"]} />
      <Card title="Compliance Check" description="Complete → Bid Approval. Not complete → return the item to its responsible team.">
        {compliance.loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Checklist checks={compliance.checks} />}
      </Card>
      <ReturnablesChecklist tenderId={tenderId} readOnly={!canPrepare(ctx)} onChange={compliance.reload} />
    </div>
  );
}

// ─── 14 Bid Approval ─────────────────────────────────────────────────────────

export function BidApprovalSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { details } = ctx;
  const stage = details.tender_stage;
  const compliance = useCompliance(ctx);
  const [approvals, setApprovals] = useState<BidApproval[]>([]);
  const [reviewRev, setReviewRev] = useState<BidRevision | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (!tenderId) return;
    db().from("tender_bid_approvals").select("*").eq("tender_id", tenderId).order("round", { ascending: false }).order("decided_at")
      .then(({ data }) => setApprovals((data ?? []) as BidApproval[]));
    if (details.review_bid_summary_id) {
      db().from("tender_bid_summaries").select("id, revision_no, total_bid_price, status").eq("id", details.review_bid_summary_id).maybeSingle()
        .then(({ data }) => setReviewRev((data as BidRevision | null) ?? null));
    }
  }, [tenderId, details.review_bid_summary_id, details.approval_round, key]);

  const round = details.approval_round;
  const current = approvals.filter((a) => a.round === round);
  const history = approvals.filter((a) => a.round < round);
  const inReview = stage === "internal_review" || stage === "approval";
  const approved = !!details.bid_approved_at;
  const money = (v: number | null | undefined) => formatMoney(v, details.bid_currency);

  async function start() {
    if (!compliance.latest) return;
    setBusy(true);
    const r = await startInternalReview(ctx.project.id, round, compliance.latest.id);
    setBusy(false);
    if (toastResult(r, "Submitted for internal review — pricing is now locked")) await ctx.refresh();
  }

  async function decide(step: ApprovalStep, decision: ApprovalDecision) {
    setBusy(true);
    const r = await decideApprovalStep({
      projectId: ctx.project.id, tenderId: tenderId!, stage, round, bidSummaryId: details.review_bid_summary_id,
      step, decision, comments: comments[step] ?? "",
    });
    setBusy(false);
    const msg = decision === "approved" ? (step === "management" ? "Bid approved — price locked" : "Review approved")
      : decision === "returned" ? "Bid returned to Tendering" : "Bid rejected — tender closed";
    if (toastResult(r, msg)) {
      setComments((c) => ({ ...c, [step]: "" }));
      setKey((k) => k + 1);
      await ctx.refresh();
    }
  }

  if (!tenderId) return <EmptyState>Link a tender register to run the bid approval.</EmptyState>;
  return (
    <div className="space-y-4">
      {stage === "tendering" && (
        <Card title="Submit for Internal Review" description="Technical, commercial and price reviews, then management approval. Pricing locks while the bid is under review.">
          {compliance.loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
            <>
              <Checklist checks={compliance.checks} />
              {compliance.latest && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Revision to review: Rev {compliance.latest.revision_no} · {money(compliance.latest.total_bid_price)}
                </p>
              )}
              {ctx.can("tender_lifecycle", "submit") && (
                <Button size="sm" className="mt-3" disabled={busy || !compliance.compliant} onClick={start}>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Submit for Internal Review
                </Button>
              )}
            </>
          )}
        </Card>
      )}

      {(inReview || approved) && (
        <Card
          title={`Approval Round ${round}`}
          description={reviewRev ? `Rev ${reviewRev.revision_no} · ${money(reviewRev.total_bid_price)}` : undefined}
          actions={approved && <Pill tone="green"><Lock className="mr-1 h-3 w-3" /> Approved {formatDate(details.bid_approved_at)}</Pill>}
        >
          <div className="grid gap-3 md:grid-cols-2">
            {APPROVAL_STEPS.map(({ step, label }) => {
              const rec = current.find((a) => a.step === step);
              const active = step === "management" ? stage === "approval" && !approved : stage === "internal_review" && rec?.decision !== "approved";
              const mayDecide = active && ctx.can("tender_bid_approval", "approve") && canDecideStep(step, ctx.roleCodes);
              const waiting = step === "management" && stage === "internal_review";
              return (
                <div key={step} className={cn("rounded-lg border p-3", rec?.decision === "approved" ? "border-emerald-200 dark:border-emerald-900" : "border-border", step === "management" && "md:col-span-2")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    {rec ? (
                      <Pill tone={rec.decision === "approved" ? "green" : rec.decision === "returned" ? "amber" : "red"}>{rec.decision}</Pill>
                    ) : <Pill>{waiting ? "after reviews" : "pending"}</Pill>}
                  </div>
                  {rec && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {staffName(ctx, rec.user_id)} · {formatDateTime(rec.decided_at)}{rec.comments && ` — ${rec.comments}`}
                    </p>
                  )}
                  {mayDecide && (
                    <div className="mt-2 space-y-2">
                      <textarea className={fieldClass} rows={2} placeholder="Comments (required to return or reject)"
                        value={comments[step] ?? ""} onChange={(e) => setComments((c) => ({ ...c, [step]: e.target.value }))} />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy} onClick={() => decide(step, "approved")}>Approve</Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide(step, "returned")}>Return for Revision</Button>
                        {step === "management" && (
                          <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(step, "rejected")}>Reject</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {approved && (
            <p className="mt-3 text-sm">
              Approved bid price <strong>{money(details.bid_price)}</strong> is locked. Changes now need an addendum (controlled re-open).
            </p>
          )}
        </Card>
      )}

      {!inReview && !approved && stage !== "tendering" && (
        <EmptyState>
          {["opportunity", "review", "go_no_go"].includes(stage)
            ? "Bid approval follows tender preparation (after the Go decision)."
            : `No approval in progress — the tender is ${STAGE_LABELS[stage]}.`}
        </EmptyState>
      )}

      {history.length > 0 && (
        <Card title="Previous Rounds">
          <div className="space-y-1">
            {history.map((a) => (
              <p key={a.id} className="text-xs text-muted-foreground">
                Round {a.round} · {APPROVAL_STEPS.find((s) => s.step === a.step)?.label} · <span className="capitalize">{a.decision}</span>
                {" "}by {staffName(ctx, a.user_id)} {formatDate(a.decided_at)}{a.comments && ` — ${a.comments}`}
              </p>
            ))}
          </div>
        </Card>
      )}
      <p className="text-[11px] text-muted-foreground">
        Reviewers: {REVIEW_STEPS.map((s) => APPROVAL_STEPS.find((x) => x.step === s)!).map((s) => `${s.label} (${s.roles.join("/")})`).join(" · ")} · Management (L0/L1/L2)
      </p>
    </div>
  );
}

// ─── 15 Submission ───────────────────────────────────────────────────────────

function localNow() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function SubmissionSection({ ctx }: { ctx: PrecontractCtx }) {
  const { details } = ctx;
  const stage = details.tender_stage;
  const compliance = useCompliance(ctx);
  const [form, setForm] = useState({ submitted_at: localNow(), method: "portal", reference: "" });
  const [busy, setBusy] = useState(false);
  const [submittedRev, setSubmittedRev] = useState<BidRevision | null>(null);
  const money = (v: number | null | undefined) => formatMoney(v, details.bid_currency);

  useEffect(() => {
    if (!details.submitted_bid_summary_id) return;
    db().from("tender_bid_summaries").select("id, revision_no, total_bid_price, status").eq("id", details.submitted_bid_summary_id).maybeSingle()
      .then(({ data }) => setSubmittedRev((data as BidRevision | null) ?? null));
  }, [details.submitted_bid_summary_id]);

  const ready = stage === "approval" && !!details.bid_approved_at && !!details.approved_bid_summary_id;
  const finalChecks = [
    { label: "Bid approved by management", ok: !!details.bid_approved_at, required: true },
    ...compliance.checks.filter((c) => c.label.startsWith("Mandatory returnables")),
  ];
  const canSubmit = ready && finalChecks.every((c) => !c.required || c.ok) && ctx.can("tender_lifecycle", "submit");

  async function submit() {
    setBusy(true);
    const r = await recordSubmission({
      projectId: ctx.project.id,
      approvedBidSummaryId: details.approved_bid_summary_id!,
      submittedAt: new Date(form.submitted_at).toISOString(),
      method: form.method,
      reference: form.reference,
    });
    setBusy(false);
    if (toastResult(r, "Tender submitted — the tender is now frozen")) await ctx.refresh();
  }

  if (details.submitted_at) {
    return (
      <Card title="Submission Record" actions={<Pill tone="blue">{STAGE_LABELS[stage]}</Pill>}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Submitted" value={formatDateTime(details.submitted_at)} />
          <Field label="Submitted By" value={staffName(ctx, details.submitted_by)} />
          <Field label="Method" value={SUBMISSION_METHODS.find((m) => m.value === details.submission_method)?.label ?? details.submission_method ?? "—"} />
          <Field label="Reference / Receipt" value={details.submission_reference ?? "—"} />
          <Field label="Final Price" value={money(submittedRev?.total_bid_price ?? details.bid_price)} />
          <Field label="Final Revision" value={submittedRev ? `Rev ${submittedRev.revision_no}` : "—"} />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Tender Submission" description="Approved bid → final compliance check → submit → record.">
      {compliance.loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Checklist checks={finalChecks} />}
      {ready ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-muted-foreground">Submitted at
            <input type="datetime-local" className={fieldClass} value={form.submitted_at} onChange={(e) => setForm({ ...form, submitted_at: e.target.value })} />
          </label>
          <label className="text-xs text-muted-foreground">Method
            <select className={fieldClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {SUBMISSION_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">Reference / receipt no.
            <input className={fieldClass} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </label>
          <p className="text-sm sm:col-span-3">Final price <strong>{money(details.bid_price)}</strong></p>
          <div>
            <Button size="sm" disabled={busy || !canSubmit} onClick={submit}><Send className="h-3.5 w-3.5 mr-1.5" /> Record Submission</Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">The bid must pass Bid Approval before it can be submitted.</p>
      )}
    </Card>
  );
}

// ─── 16 Tender Outcome ───────────────────────────────────────────────────────

interface WinLoss {
  our_bid_amount: number;
  winning_bid_amount: number | null;
  awardee_name: string | null;
  bid_spread: number | null;
  competitor_count: number | null;
  reason_lost: string | null;
  lesson_learned: string | null;
}

export function OutcomeSection({ ctx }: { ctx: PrecontractCtx }) {
  const tenderId = ctx.tender?.id;
  const { details } = ctx;
  const stage = details.tender_stage;
  const [winLoss, setWinLoss] = useState<WinLoss | null>(null);
  const [mode, setMode] = useState<"none" | "lost" | "award">("none");
  const [form, setForm] = useState({ winning: "", awardee: "", competitors: "", reason: "", lessons: "" });
  const [busy, setBusy] = useState(false);
  const money = (v: number | null | undefined) => formatMoney(v, details.bid_currency);
  const awaiting = stage === "submitted" || stage === "awaiting_result";
  const canDecide = ctx.can("tender_lifecycle", "submit");

  useEffect(() => {
    if (!tenderId) return;
    db().from("tender_win_loss").select("*").eq("tender_id", tenderId).maybeSingle()
      .then(({ data }) => setWinLoss((data as WinLoss | null) ?? null));
  }, [tenderId, stage]);

  async function markAwaiting() {
    setBusy(true);
    const r = await setTenderStage(ctx.project.id, "submitted", "awaiting_result");
    setBusy(false);
    if (toastResult(r, "Tender closed — awaiting result")) await ctx.refresh();
  }

  async function markLost() {
    setBusy(true);
    const r = await recordUnsuccessful({
      projectId: ctx.project.id, tenderId: tenderId!, stage, ourBid: Number(details.bid_price ?? 0),
      winningBid: form.winning ? Number(form.winning) : null, awardee: form.awardee,
      competitorCount: form.competitors ? parseInt(form.competitors, 10) : null,
      reasonLost: form.reason, lessons: form.lessons,
    });
    setBusy(false);
    if (toastResult(r, "Recorded as unsuccessful — lessons learned saved")) {
      setMode("none");
      await ctx.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Tender Result" actions={<Pill tone={stage === "awarded" ? "green" : stage === "unsuccessful" ? "amber" : stage === "closed" ? "red" : "muted"}>{STAGE_LABELS[stage]}</Pill>}>
        {stage === "awarded" && (
          <div className="space-y-2">
            <p className="text-sm">Awarded {formatDate(details.award_date)} at <strong>{money(details.bid_price)}</strong>.</p>
            {ctx.project.project_type === "awarded" ? (
              <p className="text-xs text-muted-foreground">This project is now post-contract. Tender records stay attached as the tender record.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Awarded before in-place conversion — see the linked post-contract project in the project list.</p>
            )}
          </div>
        )}
        {stage === "unsuccessful" && (
          <div className="space-y-1">
            <p className="text-sm"><strong>Unsuccessful.</strong> {details.loss_reason}</p>
          </div>
        )}
        {stage === "closed" && <p className="text-sm text-red-700 dark:text-red-300">{details.closed_reason ?? "Closed."}</p>}
        {!awaiting && !["awarded", "unsuccessful", "closed"].includes(stage) && (
          <p className="text-xs text-muted-foreground">The result is recorded after submission.</p>
        )}

        {awaiting && canDecide && mode === "none" && (
          <div className="flex flex-wrap gap-2">
            {stage === "submitted" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={markAwaiting}>Tender Closed — Awaiting Result</Button>
            )}
            <Button size="sm" onClick={() => setMode("award")}><Trophy className="h-3.5 w-3.5 mr-1.5" /> Awarded</Button>
            <Button size="sm" variant="outline" onClick={() => setMode("lost")}><XCircle className="h-3.5 w-3.5 mr-1.5" /> Unsuccessful</Button>
          </div>
        )}

        {mode === "lost" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <input type="number" className={fieldClass} placeholder={`Winning bid (${details.bid_currency})`} value={form.winning} onChange={(e) => setForm({ ...form, winning: e.target.value })} />
            <input className={fieldClass} placeholder="Awarded to" value={form.awardee} onChange={(e) => setForm({ ...form, awardee: e.target.value })} />
            <input type="number" className={fieldClass} placeholder="No. of competitors" value={form.competitors} onChange={(e) => setForm({ ...form, competitors: e.target.value })} />
            <textarea className={cn(fieldClass, "sm:col-span-3")} rows={2} placeholder="Reason lost (required)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            <textarea className={cn(fieldClass, "sm:col-span-3")} rows={3} placeholder="Lessons learned" value={form.lessons} onChange={(e) => setForm({ ...form, lessons: e.target.value })} />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !form.reason.trim()} onClick={markLost}>Record Unsuccessful</Button>
              <Button size="sm" variant="ghost" onClick={() => setMode("none")}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      {winLoss && (
        <Card title="Lessons Learned">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Our Bid" value={money(winLoss.our_bid_amount)} />
            <Field label="Winning Bid" value={money(winLoss.winning_bid_amount)} />
            <Field label="Awarded To" value={winLoss.awardee_name ?? "—"} />
            <Field label="Spread" value={winLoss.bid_spread != null ? `${winLoss.bid_spread}%` : "—"} />
          </div>
          {winLoss.lesson_learned && <p className="mt-3 whitespace-pre-wrap text-sm">{winLoss.lesson_learned}</p>}
        </Card>
      )}

      {mode === "award" && tenderId && (
        <AwardConversionDialog
          project={ctx.project}
          tenderId={tenderId}
          stage={stage}
          bidPrice={details.bid_price}
          onClose={() => setMode("none")}
          onConvert={(updated) => {
            setMode("none");
            ctx.onProjectUpdate(updated);
          }}
        />
      )}
    </div>
  );
}
