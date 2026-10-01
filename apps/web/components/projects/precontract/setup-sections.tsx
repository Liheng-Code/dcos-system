"use client";

import { useEffect, useState } from "react";
import { Check, ThumbsDown, ThumbsUp, Play, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { sectorLabel } from "@/lib/project-categories";
import {
  closeTender,
  criteriaAverage,
  criteriaRecommendation,
  GO_NO_GO_CRITERIA,
  isSubmittedOrLater,
  isTerminalStage,
  setTenderStage,
  setUpTenderPreparation,
  setWorkstreamRequired,
  STAGE_LABELS,
  STAGE_PATH,
  stageIndex,
  workstreamLabel,
  type GoNoGoCriteria,
  type Workstream,
} from "@/lib/qs/tender-lifecycle";
import {
  Card,
  EmptyState,
  Field,
  fieldClass,
  formatDate,
  formatDateTime,
  formatMoney,
  Pill,
  smallFieldClass,
  staffName,
  toastResult,
  type PrecontractCtx,
} from "./shared";

const label = (v: string | null | undefined) => (v ? v.replace(/_/g, " ") : "—");

// ─── 01 Registration ─────────────────────────────────────────────────────────

export function RegistrationSection({ ctx }: { ctx: PrecontractCtx }) {
  const { project, details, tender } = ctx;
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = [project.client_id, project.consultant_id].filter((v): v is string => !!v);
    if (!ids.length) return;
    createClient()
      .from("stakeholders")
      .select("id, organization_name")
      .in("id", ids)
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((s) => [s.id, s.organization_name]))));
  }, [project.client_id, project.consultant_id]);

  const cur = details.bid_currency;
  return (
    <Card title="Project / Tender Registration" description="The opportunity as registered. Use Edit at the top to change any field.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Project Name" value={project.project_name} />
        <Field label="Project Code" value={project.project_code} />
        <Field label="Tender Reference" value={tender?.tender_no ?? "—"} />
        <Field label="Client / Owner" value={(project.client_id && names[project.client_id]) || "—"} />
        <Field label="Consultant" value={(project.consultant_id && names[project.consultant_id]) || "—"} />
        <Field label="Location" value={project.location ?? "—"} />
        <Field label="Category" value={`${project.category ? sectorLabel(project.category) : "—"}${project.building_type ? ` · ${label(project.building_type)}` : ""}`} />
        <Field label="Contract Type" className="capitalize" value={label(project.contract_type)} />
        <Field label="Tender Type" className="capitalize" value={label(details.tender_type)} />
        <Field label="Procurement Method" className="capitalize" value={label(details.procurement_method)} />
        <Field label="Estimated Value" value={formatMoney(details.estimated_value, cur)} />
        <Field label="Estimated Duration" value={project.duration ? `${project.duration} months` : "—"} />
        <Field label="Invitation Date" value={formatDate(tender?.issue_date)} />
        <Field label="Submission Deadline" value={formatDateTime(details.submission_deadline)} />
        <Field label="Person in Charge" value={staffName(ctx, project.project_manager_id)} />
      </div>
    </Card>
  );
}

// ─── 02 Tender Management ────────────────────────────────────────────────────

export function TenderManagementSection({ ctx }: { ctx: PrecontractCtx }) {
  const { details } = ctx;
  const stage = details.tender_stage;
  const [openedAt] = useState(() => Date.now());
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const deadline = details.submission_deadline ? new Date(details.submission_deadline) : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - openedAt) / 86_400_000) : null;
  const required = ctx.workstreams.filter((w) => w.required);
  const done = required.filter((w) => w.status === "completed").length;
  const canEditMatrix = ctx.can("tender_workstreams", "edit") && !isTerminalStage(stage) && !isSubmittedOrLater(stage);
  const pastGo = stageIndex(stage) >= stageIndex("tendering") && stage !== "closed";

  // Shown at once; only a failed save reloads (which puts the saved value back).
  async function updateWorkstream(w: Workstream, patch: Partial<Workstream>) {
    ctx.patchWorkstream(w.id, patch);
    const r = patch.required !== undefined
      ? await setWorkstreamRequired(w, patch.required)
      : await createClient()
          .from("tender_workstreams")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", w.id)
          .then(({ error }) => ({ error: error?.message ?? null }));
    if (r.error) {
      toast.error(r.error);
      await ctx.refresh();
    }
  }

  async function setUp() {
    if (!ctx.tender) return;
    setBusy(true);
    const r = await setUpTenderPreparation(ctx.tender.id, details.submission_deadline?.slice(0, 10) ?? null);
    setBusy(false);
    if (toastResult(r, "Tender preparation set up")) await ctx.refresh();
  }

  async function close() {
    setBusy(true);
    const r = await closeTender(ctx.project.id, stage, reason);
    setBusy(false);
    if (toastResult(r, "Tender closed")) {
      setClosing(false);
      await ctx.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <Card title="Tender Status">
        <ol className="flex flex-wrap items-center gap-1.5">
          {STAGE_PATH.map((s, i) => {
            const current = s.stage === stage;
            const passed = stageIndex(stage) > i && stage !== "closed";
            return (
              <li key={s.stage} className="flex items-center gap-1.5">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
                  current ? "border-primary bg-primary text-primary-foreground" :
                  passed ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" :
                  "border-border text-muted-foreground",
                )}>
                  {passed && <Check className="h-3 w-3" />}
                  {s.label}
                </span>
                {i < STAGE_PATH.length - 1 && <span className="text-muted-foreground/50">›</span>}
              </li>
            );
          })}
          {isTerminalStage(stage) && (
            <li className="ml-2">
              <Pill tone={stage === "awarded" ? "green" : stage === "unsuccessful" ? "amber" : "red"}>{STAGE_LABELS[stage]}</Pill>
            </li>
          )}
        </ol>
        {stage === "closed" && details.closed_reason && (
          <p className="mt-3 text-sm text-red-700 dark:text-red-300"><strong>Closed:</strong> {details.closed_reason}</p>
        )}
        {!isTerminalStage(stage) && !isSubmittedOrLater(stage) && ctx.can("tender_lifecycle", "approve") && (
          <div className="mt-4">
            {closing ? (
              <div className="space-y-2">
                <textarea className={fieldClass} rows={2} placeholder="Reason for withdrawing / closing the tender"
                  value={reason} onChange={(e) => setReason(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={close}>Close Tender</Button>
                  <Button size="sm" variant="ghost" onClick={() => setClosing(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setClosing(true)}>
                <XCircle className="h-3.5 w-3.5 mr-1.5" /> Withdraw / Close Tender
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card title="Key Dates" description="Change dates through Registration → Edit.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Invitation" value={formatDate(ctx.tender?.issue_date)} />
          <Field label="Site Visit" value={formatDate(details.site_visit_date)} />
          <Field label="Query Deadline" value={formatDateTime(details.query_deadline)} />
          <Field label="Submission Deadline" value={formatDateTime(details.submission_deadline)} />
          <Field
            label="Time Remaining"
            className={cn(daysLeft != null && daysLeft < 0 && "text-red-600", daysLeft != null && daysLeft >= 0 && daysLeft <= 7 && "text-orange-600")}
            value={isSubmittedOrLater(stage) || isTerminalStage(stage) ? "—" : daysLeft == null ? "—" : daysLeft < 0 ? `${-daysLeft} days overdue` : `${daysLeft} days`}
          />
        </div>
      </Card>

      <Card
        title="Tender Team & Responsibility Matrix"
        description={required.length ? `${done} of ${required.length} required workstreams completed` : undefined}
      >
        {!ctx.workstreams.length ? (
          pastGo && ctx.tender && ctx.can("tender_workstreams", "can_create") ? (
            <EmptyState>
              <p>This tender has no workstreams yet.</p>
              <Button size="sm" className="mt-3" disabled={busy} onClick={setUp}>Set up tender preparation</Button>
            </EmptyState>
          ) : (
            <EmptyState>Workstreams, owners and due dates are created when the Go decision is made.</EmptyState>
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Workstream</th>
                  <th className="py-2 pr-3 font-medium">Required</th>
                  <th className="py-2 pr-3 font-medium">Owner</th>
                  <th className="py-2 pr-3 font-medium">Due</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ctx.workstreams.map((w) => (
                  <tr key={w.id} className={cn(!w.required && "text-muted-foreground")}>
                    <td className="py-2 pr-3">{workstreamLabel(w.code)}</td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" className="h-4 w-4" checked={w.required} disabled={!canEditMatrix}
                        onChange={(e) => updateWorkstream(w, { required: e.target.checked })} />
                    </td>
                    <td className="py-2 pr-3">
                      <select className={cn(smallFieldClass, "w-44")} value={w.owner_id ?? ""} disabled={!canEditMatrix || !w.required}
                        onChange={(e) => updateWorkstream(w, { owner_id: e.target.value || null })}>
                        <option value="">— Unassigned —</option>
                        {ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input type="date" className={smallFieldClass} value={w.due_date ?? ""} disabled={!canEditMatrix || !w.required}
                        onChange={(e) => updateWorkstream(w, { due_date: e.target.value || null })} />
                    </td>
                    <td className="py-2">
                      {w.required ? (
                        <Pill tone={w.status === "completed" ? "green" : w.status === "in_progress" ? "blue" : "muted"}>
                          {w.status.replace(/_/g, " ")}
                        </Pill>
                      ) : <span className="text-xs">n/a</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── 03 Go / No-Go ───────────────────────────────────────────────────────────

export function GoNoGoSection({ ctx }: { ctx: PrecontractCtx }) {
  const { details } = ctx;
  const stage = details.tender_stage;
  const [criteria, setCriteria] = useState<GoNoGoCriteria>(details.go_no_go_criteria ?? {});
  const [rationale, setRationale] = useState(details.go_no_go_rationale ?? "");
  const [busy, setBusy] = useState(false);

  const scoringOpen = stage === "review" || stage === "go_no_go";
  const canScore = scoringOpen && ctx.can("tender_lifecycle", "submit");
  const canDecide = stage === "go_no_go" && ctx.can("tender_go_no_go", "approve");
  const avg = criteriaAverage(criteria);
  const rec = criteriaRecommendation(avg);

  function setScore(key: string, score: number) {
    setCriteria((prev) => ({ ...prev, [key]: { ...(prev as Record<string, { score: number; note?: string }>)[key], score } }));
  }
  function setNote(key: string, note: string) {
    setCriteria((prev) => ({ ...prev, [key]: { score: (prev as Record<string, { score: number }>)[key]?.score ?? 0, note } }));
  }

  async function saveCriteria() {
    const { error } = await createClient()
      .from("project_precontract_details")
      .update({ go_no_go_criteria: criteria, updated_at: new Date().toISOString() })
      .eq("project_id", ctx.project.id);
    if (error) toast.error(error.message);
    else toast.success("Review saved");
    return !error;
  }

  async function move(to: "review" | "go_no_go") {
    setBusy(true);
    if (to === "go_no_go" && !(await saveCriteria())) { setBusy(false); return; }
    const r = await setTenderStage(ctx.project.id, stage, to);
    setBusy(false);
    if (toastResult(r, to === "review" ? "Initial review started" : "Submitted for Go / No-Go decision")) await ctx.refresh();
  }

  async function decide(decision: "go" | "no_go") {
    if (decision === "no_go" && !rationale.trim()) {
      toast.error("Record the reason for No-Go.");
      return;
    }
    setBusy(true);
    const { data: { user } } = await createClient().auth.getUser();
    const record = {
      go_no_go_decision: decision,
      go_no_go_date: new Date().toISOString().slice(0, 10),
      go_no_go_by: user?.id ?? null,
      go_no_go_rationale: rationale.trim() || null,
      go_no_go_criteria: criteria,
    };
    const r = decision === "go"
      ? await setTenderStage(ctx.project.id, "go_no_go", "tendering", record)
      : await setTenderStage(ctx.project.id, "go_no_go", "closed", { ...record, closed_reason: `No-Go: ${rationale.trim()}` });
    if (!r.error && decision === "go" && ctx.tender) {
      const setup = await setUpTenderPreparation(ctx.tender.id, details.submission_deadline?.slice(0, 10) ?? null);
      if (setup.error) toast.error(`Go recorded, but tender preparation set-up failed: ${setup.error}`);
    }
    setBusy(false);
    if (toastResult(r, decision === "go" ? "Go — tender preparation started" : "No-Go — tender closed")) await ctx.refresh();
  }

  const decided = details.go_no_go_decision != null;
  return (
    <div className="space-y-4">
      {stage === "opportunity" && (
        <Card title="Initial Review" description="Review the opportunity against the criteria below before committing estimating effort.">
          {ctx.can("tender_lifecycle", "submit") ? (
            <Button size="sm" disabled={busy} onClick={() => move("review")}>
              <Play className="h-3.5 w-3.5 mr-1.5" /> Start Initial Review
            </Button>
          ) : <p className="text-xs text-muted-foreground">Waiting for the tender manager to start the review.</p>}
        </Card>
      )}

      <Card
        title="Go / No-Go Review"
        description="Score each criterion 1 (poor) to 5 (strong)."
        actions={rec && <Pill tone={rec.tone === "go" ? "green" : rec.tone === "marginal" ? "amber" : "red"}>{rec.label} · {avg!.toFixed(1)}</Pill>}
      >
        <div className="divide-y divide-border">
          {GO_NO_GO_CRITERIA.map((c) => {
            const entry = (criteria as Record<string, { score: number; note?: string } | undefined>)[c.key];
            return (
              <div key={c.key} className="grid gap-2 py-2 sm:grid-cols-[140px_auto_1fr] sm:items-center">
                <span className="text-sm font-medium">{c.label}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" disabled={!canScore}
                      onClick={() => setScore(c.key, n)}
                      className={cn(
                        "h-7 w-7 rounded-md border text-xs font-medium transition-colors disabled:cursor-default",
                        entry?.score === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
                        canScore && entry?.score !== n && "hover:bg-muted",
                      )}>
                      {n}
                    </button>
                  ))}
                </div>
                <input className={cn(smallFieldClass, "w-full")} placeholder="Note" disabled={!canScore}
                  value={entry?.note ?? ""} onChange={(e) => setNote(c.key, e.target.value)} />
              </div>
            );
          })}
        </div>
        {canScore && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={saveCriteria}>Save Review</Button>
            {stage === "review" && (
              <Button size="sm" disabled={busy || avg == null} onClick={() => move("go_no_go")}>
                <Send className="h-3.5 w-3.5 mr-1.5" /> Submit for Decision
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card title="Decision">
        {decided ? (
          <div className="space-y-1">
            <Pill tone={details.go_no_go_decision === "go" ? "green" : "red"}>
              {details.go_no_go_decision === "go" ? "Go — bid" : "No-Go — do not bid"}
            </Pill>
            <p className="text-xs text-muted-foreground">
              {staffName(ctx, details.go_no_go_by)} · {formatDate(details.go_no_go_date)}
            </p>
            {details.go_no_go_rationale && <p className="text-sm">{details.go_no_go_rationale}</p>}
          </div>
        ) : stage === "go_no_go" ? (
          canDecide ? (
            <div className="space-y-2">
              <textarea className={fieldClass} rows={2} placeholder="Rationale (required for No-Go)"
                value={rationale} onChange={(e) => setRationale(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => decide("go")}><ThumbsUp className="h-3.5 w-3.5 mr-1.5" /> Go</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("no_go")}><ThumbsDown className="h-3.5 w-3.5 mr-1.5" /> No-Go</Button>
              </div>
            </div>
          ) : <p className="text-xs text-muted-foreground">Awaiting the management decision (directors).</p>
        ) : (
          <p className="text-xs text-muted-foreground">Not yet decided.</p>
        )}
      </Card>
    </div>
  );
}
