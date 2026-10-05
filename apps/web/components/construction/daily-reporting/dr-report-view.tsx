"use client";

// One report, read-only, with its versions, evidence and history. The reporter
// sees it to follow status and act on a return; the reviewer sees the same
// content plus the review panel (rule results, verified quantities, delay
// classification, correction items, decision).

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, FileEdit, Loader2, MessageSquare, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  answerInfoRequest,
  decideReview,
  DrApiError,
  evidenceUrls,
  getReportDetail,
  openReview,
  withdrawReport,
  type DrCapabilities,
  type ReportDetail,
} from "@/lib/construction/daily-reporting/service";
import {
  DELAY_CAUSE_LABELS,
  DELAY_TYPE_LABELS,
  REVIEW_FLAG_LABELS,
  SECTION_LABELS,
  SYNC_STATE_LABELS,
  WORK_STATUS_LABELS,
} from "@/lib/construction/daily-reporting/status";
import {
  DELAY_TYPES,
  LIST_SECTIONS,
  PROPOSED_DELAY_TYPE,
  type CorrectionItem,
  type DelayType,
  type DrPayload,
  type DrReportVersion,
  type ReviewDecision,
  type SectionKey,
} from "@/lib/construction/daily-reporting/types";
import { DrAiFindings } from "./dr-ai";
import { DrCustomFieldsView } from "./dr-custom-fields";
import { DrFollowUps } from "./dr-follow-ups";
import { Field, Flag, formatDateTime, inputClass, RuleList, SectionCard, StateBadge, textareaClass } from "./dr-ui";

type Line = { line_id: string } & Record<string, unknown>;

/** line_ids whose content differs from the previous version (or are new). */
function changedLines(current: DrPayload, previous: DrPayload | null): Set<string> {
  const out = new Set<string>();
  if (!previous) return out;
  for (const section of LIST_SECTIONS) {
    const before = new Map(((previous[section] as unknown as Line[]) ?? []).map((l) => [l.line_id, JSON.stringify(l)]));
    for (const line of (current[section] as unknown as Line[]) ?? []) {
      if (before.get(line.line_id) !== JSON.stringify(line)) out.add(`${section}:${line.line_id}`);
    }
  }
  for (const section of ["weather", "safety"] as const) {
    if (JSON.stringify(current[section]) !== JSON.stringify(previous[section])) out.add(`${section}:`);
  }
  return out;
}

export function DrReportView({
  reportId,
  capabilities,
  onBack,
  onCorrect,
  onAmend,
}: {
  reportId: string;
  capabilities: DrCapabilities;
  onBack: () => void;
  onCorrect: (unitId: string, date: string) => void;
  onAmend: (unitId: string, date: string) => void;
}) {
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [versionNo, setVersionNo] = useState<number | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Review panel state
  const [comment, setComment] = useState("");
  const [verified, setVerified] = useState<Record<string, { qty: string; remark: string }>>({});
  const [delayClass, setDelayClass] = useState<Record<string, DelayType>>({});
  const [returned, setReturned] = useState<Record<string, string>>({});
  const [infoResponse, setInfoResponse] = useState("");

  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    getReportDetail(reportId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setVersionNo(d?.report.current_version_no ?? null);
        // The review inputs belong to one version; start clean on (re)load.
        setVerified({});
        setReturned({});
        setDelayClass({});
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [reportId, refresh]);

  const version: DrReportVersion | null = useMemo(
    () => detail?.versions.find((v) => v.version_no === versionNo) ?? null,
    [detail, versionNo],
  );
  const previous = useMemo(
    () => detail?.versions.find((v) => v.version_no === (versionNo ?? 0) - 1) ?? null,
    [detail, versionNo],
  );
  const changed = useMemo(() => (version ? changedLines(version.payload, previous?.payload ?? null) : new Set<string>()), [version, previous]);
  const evidence = useMemo(() => detail?.evidence.filter((e) => e.version_id === version?.id) ?? [], [detail, version]);

  useEffect(() => {
    const ids = evidence.filter((e) => e.scan_status === "Available").map((e) => e.id);
    if (ids.length === 0) return;
    evidenceUrls(ids)
      .then(setUrls)
      .catch(() => setUrls({}));
  }, [evidence]);

  const report = detail?.report;
  const isCurrent = !!report && versionNo === report.current_version_no;
  const reviewable =
    !!report &&
    capabilities.canReview &&
    isCurrent &&
    report.submission_state === "SUBMITTED" &&
    ["AWAITING_REVIEW", "IN_REVIEW", "AMENDMENT_PENDING"].includes(report.review_state);

  // Opening the package moves the report to "In review" once.
  useEffect(() => {
    if (report && capabilities.canReview && report.review_state === "AWAITING_REVIEW" && report.submission_state === "SUBMITTED") {
      openReview(report.id).catch(() => undefined);
    }
  }, [report, capabilities.canReview]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!detail || !report || !version) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">This report is not available to you.</p>
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  const p = version.payload;
  const taskLabel = (id?: string | null) => (id && detail.taskNames[id] ? `${detail.taskNames[id].task_code} — ${detail.taskNames[id].task_name}` : null);
  const versionRules = detail.ruleResults.filter((r) => r.version_id === version.id);
  const openCorrection = detail.corrections.find((c) => ["Sent", "Acknowledged"].includes(c.status));
  const verifiedFor = (lineId: string) => detail.verified.find((v) => v.version_id === version.id && v.line_id === lineId);
  const isMember = !capabilities.canReview || report.review_state === "RETURNED" || report.review_state === "INFO_REQUESTED";
  const toggleReturn = (key: string) =>
    setReturned((r) => {
      const next = { ...r };
      if (key in next) delete next[key];
      else next[key] = "";
      return next;
    });

  async function decide(decision: ReviewDecision) {
    if (!report || !version) return;
    const correction_items: CorrectionItem[] = Object.entries(returned).map(([key, reason]) => {
      const [section, lineId] = key.split(":");
      return { target_section: section as SectionKey, target_line_id: lineId || null, reason: reason.trim() || comment.trim() };
    });
    const adjustments = Object.entries(verified)
      .filter(([, v]) => v.qty !== "")
      .map(([line_id, v]) => ({ line_id, verified_qty: Number(v.qty), remark: v.remark.trim() }));

    if (decision !== "APPROVE" && comment.trim() === "") return void toast.error("A comment is required for this decision.");
    if (decision === "RETURN" && correction_items.length === 0) return void toast.error("Select at least one item to return.");
    if (adjustments.some((a) => a.remark === "")) return void toast.error("Each adjusted quantity needs a remark.");

    setBusy(true);
    try {
      const approving = decision === "APPROVE" || decision === "APPROVE_WITH_REMARK";
      const res = await decideReview(report.id, {
        version_no: version.version_no,
        decision,
        comment: comment.trim() || null,
        verified: approving ? adjustments : [],
        correction_items: approving ? [] : correction_items,
        delay_classes: approving
          ? version.payload.delays.map((d) => ({ line_id: d.line_id, delay_type: delayClass[d.line_id] ?? PROPOSED_DELAY_TYPE[d.cause_category] }))
          : [],
      });
      const sync = res.planning_sync;
      toast.success(
        approving
          ? `Approved. ${sync.activities_synced ?? 0} activity update(s) sent to planning${sync.errors ? `, ${sync.errors} could not be applied` : ""}.`
          : decision === "RETURN"
            ? "Returned to the reporting unit."
            : "Information requested.",
      );
      setComment("");
      reload();
    } catch (e) {
      toast.error(e instanceof DrApiError ? e.message : "Could not record the decision.");
    } finally {
      setBusy(false);
    }
  }

  const mark = (section: SectionKey, lineId = "") => changed.has(`${section}:${lineId}`);
  // Plain render helpers (not components): the reason input must keep focus while typing.
  const returnBox = (section: SectionKey, lineId = "") =>
    reviewable ? (
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" className="h-4 w-4" checked={`${section}:${lineId}` in returned} onChange={() => toggleReturn(`${section}:${lineId}`)} />
        Return
      </label>
    ) : null;
  const returnReason = (section: SectionKey, lineId = "") => {
    const key = `${section}:${lineId}`;
    return reviewable && key in returned ? (
      <input
        className={cn(inputClass, "mt-2")}
        placeholder="What needs to be corrected?"
        value={returned[key]}
        onChange={(e) => setReturned((r) => ({ ...r, [key]: e.target.value }))}
      />
    ) : null;
  };

  const simpleSections: { key: SectionKey; rows: { id: string; text: string }[] }[] = [
    { key: "equipment", rows: p.equipment.map((e) => ({ id: e.line_id, text: `${e.equipment_type}${e.asset_ref ? ` (${e.asset_ref})` : ""} — working ${e.hours_working ?? 0} h, idle ${e.hours_idle ?? 0} h, breakdown ${e.hours_breakdown ?? 0} h` })) },
    { key: "materials", rows: p.materials.map((m) => ({ id: m.line_id, text: `${m.description} — delivered ${m.qty_delivered ?? 0}, used ${m.qty_used ?? 0} ${m.uom ?? ""}${m.delivery_note_ref ? ` · DN ${m.delivery_note_ref}` : ""}` })) },
    { key: "issues", rows: p.issues.map((i) => ({ id: i.line_id, text: `${i.severity ? `[${i.severity}] ` : ""}${i.description}${i.action_required_from ? ` — action: ${i.action_required_from}` : ""}` })) },
    { key: "instructions", rows: p.instructions.map((i) => ({ id: i.line_id, text: `${i.instruction_type ?? ""} ${i.given_by ? `from ${i.given_by}` : ""}${i.reference ? ` (${i.reference})` : ""}: ${i.description}` })) },
    { key: "inspections", rows: p.inspections.map((i) => ({ id: i.line_id, text: `${i.reference ?? "Inspection request"}${i.status ? ` — ${i.status}` : ""}` })) },
    { key: "area_access", rows: p.area_access.map((a) => ({ id: a.line_id, text: `${a.access_state}: ${a.note ?? ""}` })) },
    { key: "next_day", rows: p.next_day.map((n) => ({ id: n.line_id, text: `${taskLabel(n.task_id) ?? n.description ?? "Planned work"} — manpower ${n.planned_manpower ?? 0}${n.planned_qty ? `, qty ${n.planned_qty}` : ""}` })) },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" onClick={onBack} className="mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {report.report_no} <StateBadge report={report} />
            {report.report_kind === "NO_WORK" ? <Flag tone="neutral">No work</Flag> : null}
            {report.late_flag ? <Flag>Late</Flag> : null}
            {report.backdated_flag ? <Flag>Backdated</Flag> : null}
            {report.imported_flag ? <Flag tone="neutral">Imported</Flag> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            {report.unit?.display_name} ({report.unit?.unit_code}) · {report.report_date}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Version</span>
            <select className={cn(inputClass, "w-auto")} value={version.version_no}
              onChange={(e) => {
                setVersionNo(Number(e.target.value));
                setVerified({});
                setReturned({});
                setDelayClass({});
              }}
            >
              {detail.versions.map((v) => (
                <option key={v.id} value={v.version_no}>
                  v{v.version_no} · {v.version_kind.toLowerCase()}
                  {v.version_no === report.approved_version_no ? " · approved" : ""}
                </option>
              ))}
            </select>
          </label>
          {report.review_state === "RETURNED" && detail.isReporter ? (
            <Button onClick={() => onCorrect(report.unit_id, report.report_date)}>
              <RotateCcw className="mr-1 h-4 w-4" /> Correct returned items
            </Button>
          ) : null}
          {["APPROVED", "APPROVED_WITH_REMARK"].includes(report.review_state) ? (
            <Button variant="outline" onClick={() => onAmend(report.unit_id, report.report_date)}>
              <FileEdit className="mr-1 h-4 w-4" /> Amend
            </Button>
          ) : null}
          {report.review_state === "AWAITING_REVIEW" && report.submission_state === "SUBMITTED" && detail.isReporter ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await withdrawReport(report.id);
                  toast.success("Report withdrawn.");
                  reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Undo2 className="mr-1 h-4 w-4" /> Withdraw
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        v{version.version_no} submitted {formatDateTime(version.submitted_at)} by {version.submitted_by ? detail.people[version.submitted_by] ?? "—" : "—"} · {version.channel}
        {version.change_reason ? ` · reason: ${version.change_reason}` : ""} · hash {version.content_hash.slice(0, 12)}…
        {previous ? ` · changes since v${previous.version_no} are highlighted` : ""}
      </p>

      {capabilities.canReview && (report.review_flags?.length ?? 0) > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Written offline and accepted for your review</p>
          <ul className="mt-1 list-disc pl-5">
            {report.review_flags.map((f) => (
              <li key={f}>{REVIEW_FLAG_LABELS[f] ?? f}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">The report was kept because site work is a fact. Approve it, return it, or ask for information as usual.</p>
        </div>
      ) : null}
      {SYNC_STATE_LABELS[report.sync_state] && report.sync_state !== "REQUIRES_REVIEW" ? (
        <p className="text-sm text-blue-700">{SYNC_STATE_LABELS[report.sync_state]}.</p>
      ) : null}

      {openCorrection && isMember ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">{openCorrection.request_kind === "RETURN" ? "Returned for correction" : "Information requested"}</p>
          <p className="mt-1 whitespace-pre-wrap">{openCorrection.message}</p>
          {openCorrection.items.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {openCorrection.items.map((i) => (
                <li key={i.id}>
                  <span className="font-medium">{SECTION_LABELS[i.target_section]}</span>: {i.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {openCorrection.request_kind === "REQUEST_INFO" && detail.isReporter ? (
            <div className="mt-3 space-y-2">
              <textarea className={textareaClass} placeholder="Your answer" value={infoResponse} onChange={(e) => setInfoResponse(e.target.value)} />
              <Button
                size="sm"
                disabled={busy || infoResponse.trim() === ""}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await answerInfoRequest(report.id, infoResponse.trim());
                    toast.success("Answer sent.");
                    setInfoResponse("");
                    reload();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <MessageSquare className="mr-1 h-4 w-4" /> Send answer
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {capabilities.canReview && versionRules.length > 0 ? (
        <SectionCard title={`Checks — ${versionRules.length} flagged`}>
          <RuleList results={versionRules} />
        </SectionCard>
      ) : null}

      {capabilities.canReview && version.report_kind !== "NO_WORK" ? (
        <DrAiFindings
          key={version.id}
          versionId={version.id}
          assuranceState={version.version_no === report.current_version_no ? report.assurance_state : "COMPLETE"}
          lineLabels={Object.fromEntries(
            (version.payload.activities ?? []).map((a) => [
              a.line_id,
              (a.task_id ? detail.taskNames[a.task_id]?.task_name : null) ?? a.free_text_activity ?? "Activity",
            ]),
          )}
        />
      ) : null}

      {capabilities.canReview && version.report_kind !== "NO_WORK" && report.submission_state !== "WITHDRAWN" ? (
        <DrFollowUps reportId={report.id} payload={version.payload} canRaise={version.version_no === report.current_version_no} />
      ) : null}

      {version.report_kind === "NO_WORK" ? (
        <SectionCard title="No work today">
          <p className="text-sm">{p.no_work_reason ?? "No reason recorded."}</p>
        </SectionCard>
      ) : (
        <>
          <DrCustomFieldsView unitId={report.unit_id} version={p.custom_field_def_version} values={p.custom_fields} />
          <SectionCard title={SECTION_LABELS.weather} action={returnBox("weather")}>
            <p className={cn("text-sm", mark("weather") && "rounded bg-amber-50 px-1")}>
              {p.weather?.condition ?? "—"} · {p.weather?.hours_lost ?? 0} h lost{p.weather?.note ? ` · ${p.weather.note}` : ""}
            </p>
            {returnReason("weather")}
          </SectionCard>

          <SectionCard title={SECTION_LABELS.manpower} action={returnBox("manpower")}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-1">Trade</th>
                  <th className="pb-1 text-right">Planned</th>
                  <th className="pb-1 text-right">On site</th>
                  <th className="pb-1 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {p.manpower.map((m) => (
                  <tr key={m.line_id} className={cn("border-t border-border", mark("manpower", m.line_id) && "bg-amber-50")}>
                    <td className="py-1">{m.trade}</td>
                    <td className="py-1 text-right tabular-nums">{m.planned_count ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{m.reported_count ?? "—"}</td>
                    <td className="py-1 text-right tabular-nums">{m.hours ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {returnReason("manpower")}
          </SectionCard>

          <SectionCard title={SECTION_LABELS.activities}>
            <div className="space-y-3">
              {p.activities.map((a) => {
                const v = verifiedFor(a.line_id);
                const lineEvidence = evidence.filter((e) => e.target_section === "activities" && e.target_line_id === a.line_id);
                return (
                  <div key={a.line_id} className={cn("rounded-md border border-border p-3", mark("activities", a.line_id) && "border-amber-300 bg-amber-50/60")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{taskLabel(a.task_id) ?? a.free_text_activity ?? "Activity"}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.work_status ? WORK_STATUS_LABELS[a.work_status] : "—"} · progress {a.progress_before ?? "?"}% → {a.progress_today ?? "?"}% · crew {a.headcount ?? "—"} × {(a.hours_normal ?? 0) + (a.hours_ot ?? 0)} h
                        </p>
                        {a.unplanned ? <p className="text-xs text-amber-700">Not on the plan: {a.unplanned_reason}</p> : null}
                        {a.remarks ? <p className="mt-1 text-xs">{a.remarks}</p> : null}
                      </div>
                      {returnBox("activities", a.line_id)}
                    </div>

                    <div className="mt-2 grid gap-3 text-sm md:grid-cols-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Reported quantity</p>
                        <p className="font-medium tabular-nums">
                          {a.reported_qty ?? "—"} {a.uom ?? ""}
                        </p>
                      </div>
                      {v ? (
                        <div className="md:col-span-2">
                          <p className="text-xs text-muted-foreground">Verified quantity</p>
                          <p className="font-medium tabular-nums">
                            {v.verified_qty} {a.uom ?? ""} <span className="font-normal text-muted-foreground">— {v.remark}</span>
                          </p>
                        </div>
                      ) : reviewable && a.reported_qty !== null && a.reported_qty !== undefined ? (
                        <>
                          <Field label="Verified quantity" hint="Leave blank to accept the reported value.">
                            <input
                              type="number"
                              inputMode="decimal"
                              className={inputClass}
                              value={verified[a.line_id]?.qty ?? ""}
                              onChange={(e) => setVerified((s) => ({ ...s, [a.line_id]: { qty: e.target.value, remark: s[a.line_id]?.remark ?? "" } }))}
                            />
                          </Field>
                          <Field label="Remark (required if adjusted)">
                            <input
                              className={inputClass}
                              value={verified[a.line_id]?.remark ?? ""}
                              onChange={(e) => setVerified((s) => ({ ...s, [a.line_id]: { qty: s[a.line_id]?.qty ?? "", remark: e.target.value } }))}
                            />
                          </Field>
                        </>
                      ) : null}
                    </div>

                    {lineEvidence.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {lineEvidence.map((e) =>
                          urls[e.id] ? (
                            <a key={e.id} href={urls[e.id]} target="_blank" rel="noreferrer" title={`Received ${formatDateTime(e.received_at_server)}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
                              <img src={urls[e.id]} alt={e.caption ?? "Site photo"} className="h-20 w-20 rounded-md border border-border object-cover" />
                            </a>
                          ) : (
                            <span key={e.id} className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-border text-center text-[10px] text-muted-foreground">
                              {e.scan_status}
                            </span>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">No photos for this activity.</p>
                    )}
                    {returnReason("activities", a.line_id)}
                  </div>
                );
              })}
              {p.activities.length === 0 ? <p className="text-sm text-muted-foreground">No activities.</p> : null}
            </div>
          </SectionCard>

          {p.delays.length > 0 ? (
            <SectionCard title={SECTION_LABELS.delays}>
              <div className="space-y-2">
                {p.delays.map((d) => (
                  <div key={d.line_id} className={cn("rounded-md border border-border p-3 text-sm", mark("delays", d.line_id) && "border-amber-300 bg-amber-50/60")}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {DELAY_CAUSE_LABELS[d.cause_category]} · {d.hours_lost ?? 0} h lost {d.notice_required ? <Flag tone="bad">Notice required</Flag> : null}
                        </p>
                        <p>{d.description}</p>
                        {taskLabel(d.task_id) ? <p className="text-xs text-muted-foreground">{taskLabel(d.task_id)}</p> : null}
                      </div>
                      {returnBox("delays", d.line_id)}
                    </div>
                    {reviewable ? (
                      <Field label="Contractual classification" hint="Proposed from the cause. Confirm or change before approving; it is written to the delay register." className="mt-2 max-w-sm">
                        <select className={inputClass} value={delayClass[d.line_id] ?? PROPOSED_DELAY_TYPE[d.cause_category]} onChange={(e) => setDelayClass((s) => ({ ...s, [d.line_id]: e.target.value as DelayType }))}>
                          {DELAY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {DELAY_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    {returnReason("delays", d.line_id)}
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title={SECTION_LABELS.safety} action={returnBox("safety")}>
            <p className={cn("text-sm", mark("safety") && "rounded bg-amber-50 px-1")}>
              Toolbox talk: {p.safety?.toolbox_talk_held === true ? "held" : p.safety?.toolbox_talk_held === false ? "not held" : "—"} · incidents {p.safety?.incident_count ?? 0} · near misses {p.safety?.near_miss_count ?? 0}
            </p>
            {p.safety?.observations ? <p className="mt-1 text-sm">{p.safety.observations}</p> : null}
            {returnReason("safety")}
          </SectionCard>

          {simpleSections
            .filter((s) => s.rows.length > 0)
            .map((s) => (
              <SectionCard key={s.key} title={SECTION_LABELS[s.key]} action={returnBox(s.key)}>
                <ul className="space-y-1 text-sm">
                  {s.rows.map((r) => (
                    <li key={r.id} className={cn(mark(s.key, r.id) && "rounded bg-amber-50 px-1")}>
                      {r.text}
                    </li>
                  ))}
                </ul>
                {returnReason(s.key)}
              </SectionCard>
            ))}

          {evidence.some((e) => e.target_section !== "activities") ? (
            <SectionCard title="Other evidence">
              <ul className="space-y-1 text-sm">
                {evidence
                  .filter((e) => e.target_section !== "activities")
                  .map((e) => (
                    <li key={e.id}>
                      {urls[e.id] ? (
                        <a className="text-primary underline" href={urls[e.id]} target="_blank" rel="noreferrer">
                          {e.caption ?? e.mime_type}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{e.scan_status}</span>
                      )}{" "}
                      <span className="text-xs text-muted-foreground">received {formatDateTime(e.received_at_server)}</span>
                    </li>
                  ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      )}

      {detail.decisions.length > 0 || detail.corrections.length > 0 ? (
        <SectionCard title="History">
          <ul className="space-y-2 text-sm">
            {detail.decisions.map((d) => (
              <li key={d.id}>
                <span className="font-medium">{d.decision.replaceAll("_", " ").toLowerCase()}</span> by {d.reviewer_id ? detail.people[d.reviewer_id] ?? "reviewer" : "reviewer"} · {formatDateTime(d.decided_at)}
                {d.comment ? <span className="text-muted-foreground"> — {d.comment}</span> : null}
              </li>
            ))}
            {!capabilities.canReview
              ? detail.corrections.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.request_kind === "RETURN" ? "returned" : "information requested"}</span> · {formatDateTime(c.sent_at)} · {c.status}
                    <span className="text-muted-foreground"> — {c.message}</span>
                  </li>
                ))
              : null}
          </ul>
        </SectionCard>
      ) : null}

      {reviewable ? (
        <SectionCard title={report.review_state === "AMENDMENT_PENDING" ? "Decide on this amendment" : "Review decision"}>
          {version.submitted_by === capabilities.userId ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">
              You submitted this version, so you cannot approve it. Another approver must decide.
            </p>
          ) : null}
          <Field label="Comment" hint="Required to return, request information, or approve with a remark. The reporting unit sees it.">
            <textarea className={textareaClass} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <p className="mt-2 text-xs text-muted-foreground">
            {Object.keys(returned).length} item(s) selected to return · {Object.values(verified).filter((v) => v.qty !== "").length} quantity adjustment(s)
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy || version.submitted_by === capabilities.userId} onClick={() => void decide(comment.trim() ? "APPROVE_WITH_REMARK" : "APPROVE")}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
              {comment.trim() ? "Approve with remark" : "Approve"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void decide("REQUEST_INFO")}>
              <MessageSquare className="mr-1 h-4 w-4" /> Request information
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void decide("RETURN")}>
              <RotateCcw className="mr-1 h-4 w-4" /> Return for correction
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
