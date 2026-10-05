"use client";

// Daily report form (design §21): sections as steps, activities pre-filled from
// the plan, live intake rules, a review screen before submit. Used for a new
// report, for correcting returned items (only those are editable) and for
// amending an approved report.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, CloudOff, Loader2, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isEditable, isSectionOpen } from "@/lib/construction/daily-reporting/merge";
import { blockingErrors, evaluateRules, warnings } from "@/lib/construction/daily-reporting/rules";
import {
  amendReport,
  DrApiError,
  fetchFormContext,
  newIdempotencyKey,
  resubmitReport,
  saveDraft,
  submitReport,
  uploadEvidence,
} from "@/lib/construction/daily-reporting/service";
import { DELAY_CAUSE_LABELS, SECTION_LABELS, WORK_STATUS_LABELS } from "@/lib/construction/daily-reporting/status";
import {
  ACCESS_STATES,
  DELAY_CAUSES,
  emptyPayload,
  ISSUE_SEVERITIES,
  WORK_STATUSES,
  type DrActivity,
  type DrPayload,
  type EvidenceRef,
  type FormActivity,
  type FormContext,
  type ReportKind,
  type RuleResult,
  type SectionKey,
} from "@/lib/construction/daily-reporting/types";
import { LineList, newLineId, type Column } from "./dr-line-list";
import { Field, Flag, inputClass, RuleList, SectionCard, textareaClass } from "./dr-ui";

export type FormMode = "new" | "correct" | "amend";

export interface PendingEvidence extends EvidenceRef {
  name: string;
}

/**
 * Field App data source. When given, the form never talks to the server: the
 * form definition comes from the device cache, photos stay on the device, and
 * Submit puts the report in the device queue for the sync engine to send.
 */
export interface OfflineFormSource {
  loadContext(): Promise<FormContext>;
  storePhoto(file: File, section: SectionKey, lineId?: string): Promise<PendingEvidence>;
  enqueue(report: { payload: DrPayload; kind: ReportKind; evidence: PendingEvidence[]; findings: RuleResult[] }): Promise<void>;
}

const STEPS = ["Site & manpower", "Activities", "Resources", "Events", "Safety & next day", "Review & submit"] as const;

const WEATHER = ["Sunny", "Cloudy", "Light rain", "Heavy rain", "Storm", "Flooded"];

function prefill(ctx: FormContext): DrPayload {
  const p = emptyPayload();
  // Activities scheduled for the day are offered ready-filled; the reporter
  // confirms progress instead of typing activity names.
  p.activities = ctx.activities.filter((a) => a.planned_today).map((a) => activityLine(a));
  // Yesterday's next-day plan becomes today's planned manpower.
  const planned = ctx.previous_next_day.reduce((s, n) => s + (n.planned_manpower ?? 0), 0);
  if (planned > 0) p.manpower = [{ line_id: newLineId(), trade: "", planned_count: planned, reported_count: null }];
  return p;
}

function activityLine(a: FormActivity): DrActivity {
  return {
    line_id: newLineId(),
    task_id: a.task_id,
    wbs_node_id: a.wbs_node_id,
    discipline: a.discipline,
    work_status: "in_progress",
    progress_before: a.current_progress,
    progress_today: a.current_progress,
    reported_qty: null,
    uom: a.quantity_unit,
    trade_code: a.suggested_trade,
    headcount: null,
    hours_normal: 8,
    hours_ot: 0,
    step_progress: a.steps.map((s) => ({ step_id: s.id, step_no: s.step_no, step_name: s.step_name, progress: s.progress, weight: s.weight })),
    unplanned: false,
    remarks: null,
  };
}

/** Weighted roll-up of step progress (same formula the schedule uses). */
function rollUp(steps: NonNullable<DrActivity["step_progress"]>): number {
  const weight = steps.reduce((s, x) => s + x.weight, 0);
  if (weight <= 0) return 0;
  return Math.round((steps.reduce((s, x) => s + x.progress * x.weight, 0) / weight) * 100) / 100;
}

export function DrReportForm({
  unitId,
  date,
  mode,
  onDone,
  onCancel,
  offline,
  retryWhenOnline = false,
}: {
  unitId: string;
  date: string;
  mode: FormMode;
  /** Receives the report id, or null when the report was queued on the device. */
  onDone: (reportId: string | null) => void;
  onCancel: () => void;
  offline?: OfflineFormSource;
  /** Telegram Mini App: after a failed send, keep trying while the form stays open (same idempotency key). */
  retryWhenOnline?: boolean;
}) {
  const [ctx, setCtx] = useState<FormContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DrPayload>(emptyPayload());
  const [kind, setKind] = useState<ReportKind>("WORK");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<PendingEvidence[]>([]);
  const [uploading, setUploading] = useState(0);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [serverResults, setServerResults] = useState<RuleResult[]>([]);
  const [draftState, setDraftState] = useState<"idle" | "saved" | "local">("idle");
  const [queued, setQueued] = useState(false);
  // One key per form session: a retry after a dropped connection returns the
  // original receipt instead of creating a second report.
  const idempotencyKey = useRef(newIdempotencyKey());
  const dirty = useRef(false);
  const localKey = `dcos_dr_draft_${unitId}_${date}`;

  useEffect(() => {
    let cancelled = false;
    (offline ? offline.loadContext() : fetchFormContext(unitId, date))
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        if (mode !== "new" && c.existing_payload) {
          setPayload(c.existing_payload);
          setKind(c.existing?.report_kind ?? "WORK");
          return;
        }
        let local: DrPayload | null = null;
        try {
          const raw = localStorage.getItem(localKey);
          local = raw ? (JSON.parse(raw) as DrPayload) : null;
        } catch {
          local = null;
        }
        setPayload(local ?? c.draft ?? prefill(c));
        if (local) setDraftState("local");
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
    // `offline` is created per form session by the Field App; it is not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, date, mode, localKey]);

  // Draft resilience: written to the device immediately, then to the server.
  useEffect(() => {
    if (mode !== "new" || !ctx || !dirty.current) return;
    try {
      localStorage.setItem(localKey, JSON.stringify(payload));
    } catch {
      /* storage full or unavailable: the server draft still applies */
    }
    if (offline) {
      const shown = setTimeout(() => setDraftState("local"), 0);
      return () => clearTimeout(shown);
    }
    const timer = setTimeout(() => {
      saveDraft(unitId, date, payload)
        .then(() => setDraftState("saved"))
        .catch(() => setDraftState("local"));
    }, 3000);
    return () => clearTimeout(timer);
  }, [payload, mode, ctx, unitId, date, localKey, offline]);

  // Short signal loss: the report waits on the device and is re-sent when
  // the connection returns. The idempotency key makes a repeat harmless.
  const submitRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    if (!queued || submitting) return;
    const retry = () => submitRef.current();
    const timer = setInterval(retry, 15_000);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [queued, submitting]);

  const patch = useCallback((changes: Partial<DrPayload>) => {
    dirty.current = true;
    setQueued(false);
    setServerResults([]);
    setPayload((p) => ({ ...p, ...changes }));
  }, []);

  const correctionItems = useMemo(() => (mode === "correct" ? ctx?.correction?.items ?? [] : []), [mode, ctx]);
  const canEdit = useCallback(
    (section: SectionKey, lineId?: string) => (mode === "correct" ? isEditable(correctionItems, section, lineId) : true),
    [mode, correctionItems],
  );
  const canAddTo = useCallback(
    (section: SectionKey) => (mode === "correct" ? isSectionOpen(correctionItems, section) : true),
    [mode, correctionItems],
  );

  const allEvidence = useMemo<Pick<EvidenceRef, "target_section" | "target_line_id">[]>(
    () => [
      ...(mode === "new" ? [] : (ctx?.existing_evidence ?? []).map((e) => ({ target_section: e.target_section as SectionKey, target_line_id: e.target_line_id }))),
      ...evidence,
    ],
    [ctx, evidence, mode],
  );

  const liveResults = useMemo<RuleResult[]>(() => {
    if (!ctx) return [];
    return evaluateRules({
      payload,
      reportKind: kind,
      reportDate: date,
      todayLocal: ctx.today_local,
      unit: ctx.unit,
      activities: ctx.activities,
      evidence: allEvidence,
      rules: ctx.rules,
      previousNextDay: ctx.previous_next_day,
      approvedProgress: ctx.approved_progress,
      knownUom: ctx.known_uom,
    });
  }, [ctx, payload, kind, date, allEvidence]);

  const results = serverResults.length > 0 ? serverResults : liveResults;
  const errors = blockingErrors(results);
  const warns = warnings(results);

  async function attach(files: FileList | null, section: SectionKey, lineId?: string) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        if (offline) {
          const stored = await offline.storePhoto(file, section, lineId);
          setEvidence((list) => [...list, stored]);
          continue;
        }
        const storage_key = await uploadEvidence(unitId, date, file);
        setEvidence((list) => [
          ...list,
          { storage_key, target_section: section, target_line_id: lineId ?? null, name: file.name, captured_at_device: new Date(file.lastModified).toISOString() },
        ]);
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function submit() {
    if (!ctx) return;
    if (mode === "amend" && reason.trim() === "") {
      toast.error("Give the reason for this amendment.");
      return;
    }
    setSubmitting(true);
    if (offline) {
      try {
        await offline.enqueue({ payload, kind, evidence, findings: liveResults });
        try {
          localStorage.removeItem(localKey);
        } catch {
          /* nothing to clear */
        }
        toast.success("Saved on this device. It will be sent when there is a connection.");
        onDone(null);
      } catch (e) {
        toast.error(`Could not save on this device: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const body = { payload, evidence: evidence.map((e): EvidenceRef => ({
          storage_key: e.storage_key,
          target_section: e.target_section,
          target_line_id: e.target_line_id,
          captured_at_device: e.captured_at_device,
        })), reason: reason.trim() || null, report_kind: kind };
      const res =
        mode === "new"
          ? await submitReport(unitId, date, body, idempotencyKey.current)
          : mode === "correct"
            ? await resubmitReport(ctx.existing!.id, body, idempotencyKey.current)
            : await amendReport(ctx.existing!.id, body, idempotencyKey.current);
      try {
        localStorage.removeItem(localKey);
      } catch {
        /* nothing to clear */
      }
      toast.success(
        `${res.receipt.report_no} ${mode === "new" ? "submitted" : mode === "correct" ? "resubmitted" : "amendment sent for approval"}` +
          (res.warnings.length ? ` — ${res.warnings.length} item(s) flagged for the PM` : ""),
      );
      onDone(res.receipt.report_id);
    } catch (e) {
      if (e instanceof DrApiError) setQueued(false);
      if (e instanceof DrApiError && e.results.length > 0) {
        setServerResults(e.results);
        setStep(STEPS.length - 1);
        toast.error(e.message);
      } else if (e instanceof DrApiError) {
        toast.error(e.message);
      } else {
        // Network failure: the draft is on the device and the same key is reused on retry.
        setDraftState("local");
        if (retryWhenOnline) {
          if (!queued) toast.message("No connection. Your report is saved on this device and will be sent when the connection returns. Keep this page open.");
          setQueued(true);
        } else {
          toast.error("Could not reach the server. Your report is saved on this device — try Submit again.");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{loadError}</p>
        <Button variant="outline" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }
  if (!ctx) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const replacingNoWork = mode === "new" && ctx.existing?.report_kind === "NO_WORK" && ctx.existing.submission_state !== "WITHDRAWN";
  const blockedByExisting = mode === "new" && !!ctx.existing && ctx.existing.submission_state !== "WITHDRAWN" && !replacingNoWork;
  const taskById = new Map(ctx.activities.map((a) => [a.task_id, a]));
  const usedTasks = new Set(payload.activities.map((a) => a.task_id).filter(Boolean));
  const noWork = kind === "NO_WORK";
  const steps = noWork ? (["Review & submit"] as const) : STEPS;
  const current = steps[Math.min(step, steps.length - 1)];
  const taskOptions = ctx.activities.map((a) => ({ value: a.task_id, label: `${a.task_code} — ${a.task_name}` }));

  const setActivity = (lineId: string, changes: Partial<DrActivity>) =>
    patch({ activities: payload.activities.map((a) => (a.line_id === lineId ? { ...a, ...changes } : a)) });

  const col = <T,>(c: Column<T>) => c;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" onClick={onCancel} className="mb-1 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to reports
          </button>
          <h2 className="text-lg font-semibold">
            {mode === "new" ? "Daily report" : mode === "correct" ? `Correct ${ctx.existing?.report_no}` : `Amend ${ctx.existing?.report_no}`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ctx.unit.display_name} ({ctx.unit.unit_code}) · {date} · deadline {ctx.schedule.deadline_time.slice(0, 5)}
          </p>
        </div>
        {mode === "new" ? (
          <div className="text-xs text-muted-foreground" aria-live="polite">
            {draftState === "saved" ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Draft saved
              </span>
            ) : draftState === "local" ? (
              <span className="flex items-center gap-1 text-amber-700">
                <CloudOff className="h-3.5 w-3.5" /> Saved on device — not yet sent
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {blockedByExisting ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {ctx.existing?.report_no} already exists for this unit and date. Open it from the report list instead of submitting again.
        </div>
      ) : null}

      {mode === "correct" && ctx.correction ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">Returned by the Project Manager</p>
          <p className="mt-1 whitespace-pre-wrap">{ctx.correction.message}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {ctx.correction.items.map((i) => (
              <li key={i.id}>
                <span className="font-medium">{SECTION_LABELS[i.target_section]}</span>
                {i.target_line_id ? " (one line)" : ""}: {i.reason}
                {i.required_action ? ` — ${i.required_action}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Only the returned items can be edited. Everything else stays as submitted.</p>
        </div>
      ) : null}

      {/* Work / no work */}
      {mode === "new" && !blockedByExisting ? (
        <div className="flex gap-2">
          {(["WORK", "NO_WORK"] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={replacingNoWork && k === "NO_WORK"}
              onClick={() => {
                setKind(k);
                setStep(0);
              }}
              className={cn(
                "h-10 flex-1 rounded-md border text-sm font-medium disabled:opacity-50",
                kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {k === "WORK" ? "Work was done" : "No work today"}
            </button>
          ))}
        </div>
      ) : null}

      {/* Stepper */}
      {!noWork ? (
        <ol className="flex gap-1 overflow-x-auto">
          {steps.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "w-full whitespace-nowrap rounded-md border px-2 py-2 text-xs font-medium",
                  i === step ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
                )}
              >
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <RuleList results={results} forSection="header" />

      {/* ── Step: site & manpower ─────────────────────────────────────────── */}
      {current === "Site & manpower" ? (
        <>
          <SectionCard title={SECTION_LABELS.weather} locked={!canEdit("weather")}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Condition">
                <select
                  className={inputClass}
                  disabled={!canEdit("weather")}
                  value={payload.weather?.condition ?? ""}
                  onChange={(e) => patch({ weather: { ...payload.weather, condition: e.target.value || null } })}
                >
                  <option value="">Select…</option>
                  {WEATHER.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </Field>
              <Field label="Hours lost to weather">
                <input
                  type="number"
                  inputMode="decimal"
                  className={inputClass}
                  disabled={!canEdit("weather")}
                  value={payload.weather?.hours_lost ?? ""}
                  onChange={(e) => patch({ weather: { ...payload.weather, hours_lost: e.target.value === "" ? null : Number(e.target.value) } })}
                />
              </Field>
              <Field label="Site conditions">
                <input
                  className={inputClass}
                  disabled={!canEdit("weather")}
                  value={payload.weather?.note ?? ""}
                  onChange={(e) => patch({ weather: { ...payload.weather, note: e.target.value || null } })}
                />
              </Field>
            </div>
            <div className="mt-2">
              <RuleList results={results} forSection="weather" />
            </div>
          </SectionCard>

          <SectionCard title={SECTION_LABELS.manpower} locked={!canEdit("manpower")}>
            <LineList
              section="manpower"
              lines={payload.manpower}
              onChange={(manpower) => patch({ manpower })}
              makeLine={() => ({ line_id: newLineId(), trade: "", planned_count: null, reported_count: null, supervisors: null, hours: 8 })}
              addLabel="Add trade"
              results={results}
              canEditLine={(id) => canEdit("manpower", id)}
              canAdd={canAddTo("manpower")}
              emptyText="No manpower recorded yet."
              columns={[
                col<DrPayload["manpower"][number]>({ key: "trade", label: "Trade", type: "text", span: 4, placeholder: "e.g. Carpenter" }),
                { key: "planned_count", label: "Planned", type: "number", span: 2 },
                { key: "reported_count", label: "On site", type: "number", span: 2 },
                { key: "supervisors", label: "Supervisors", type: "number", span: 2 },
                { key: "hours", label: "Hours", type: "number", span: 2 },
              ]}
            />
            <div className="mt-2">
              <RuleList results={results.filter((r) => !r.target.line_id)} forSection="manpower" />
            </div>
          </SectionCard>
        </>
      ) : null}

      {/* ── Step: activities ──────────────────────────────────────────────── */}
      {current === "Activities" ? (
        <SectionCard title={SECTION_LABELS.activities} locked={!canEdit("activities")}>
          <div className="space-y-3">
            {payload.activities.length === 0 ? <p className="text-sm text-muted-foreground">No activities yet. Add one from the plan below.</p> : null}
            {payload.activities.map((a) => {
              const planned = a.task_id ? taskById.get(a.task_id) : undefined;
              const editable = canEdit("activities", a.line_id);
              const photos = allEvidence.filter((e) => e.target_section === "activities" && e.target_line_id === a.line_id).length;
              const steps = a.step_progress ?? [];
              return (
                <div key={a.line_id} className={cn("rounded-md border border-border p-3", !editable && "bg-muted/40")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {a.task_id ? (
                        <p className="text-sm font-medium">
                          {planned ? `${planned.task_code} — ${planned.task_name}` : "Activity on the reviewed version"}
                        </p>
                      ) : (
                        <Flag>Not on the plan</Flag>
                      )}
                      {planned ? (
                        <p className="text-xs text-muted-foreground">
                          Planned {planned.start_date ?? "?"} → {planned.end_date ?? "?"} · currently {planned.current_progress}%
                          {ctx.approved_progress[planned.task_id] !== undefined ? ` · last approved ${ctx.approved_progress[planned.task_id]}%` : ""}
                        </p>
                      ) : null}
                    </div>
                    {editable && canAddTo("activities") ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Remove activity"
                        onClick={() => patch({ activities: payload.activities.filter((x) => x.line_id !== a.line_id) })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>

                  {!a.task_id ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label="Activity description">
                        <input className={inputClass} disabled={!editable} value={a.free_text_activity ?? ""} onChange={(e) => setActivity(a.line_id, { free_text_activity: e.target.value || null })} />
                      </Field>
                      <Field label="Why is it not on the plan?">
                        <input className={inputClass} disabled={!editable} value={a.unplanned_reason ?? ""} onChange={(e) => setActivity(a.line_id, { unplanned_reason: e.target.value || null })} />
                      </Field>
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-6">
                    <Field label="Status">
                      <select className={inputClass} disabled={!editable} value={a.work_status ?? ""} onChange={(e) => setActivity(a.line_id, { work_status: (e.target.value || null) as DrActivity["work_status"] })}>
                        <option value="">Select…</option>
                        {WORK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {WORK_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Progress % (cumulative)">
                      <input
                        type="number"
                        inputMode="decimal"
                        className={inputClass}
                        disabled={!editable || steps.length > 0}
                        value={a.progress_today ?? ""}
                        onChange={(e) => setActivity(a.line_id, { progress_today: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Quantity today">
                      <input type="number" inputMode="decimal" className={inputClass} disabled={!editable} value={a.reported_qty ?? ""} onChange={(e) => setActivity(a.line_id, { reported_qty: e.target.value === "" ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label="Unit">
                      <input className={inputClass} disabled={!editable} value={a.uom ?? ""} onChange={(e) => setActivity(a.line_id, { uom: e.target.value || null })} />
                    </Field>
                    <Field label="Crew size">
                      <input type="number" inputMode="numeric" className={inputClass} disabled={!editable} value={a.headcount ?? ""} onChange={(e) => setActivity(a.line_id, { headcount: e.target.value === "" ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label="Hours / OT">
                      <div className="flex gap-1">
                        <input type="number" inputMode="decimal" aria-label="Normal hours" className={inputClass} disabled={!editable} value={a.hours_normal ?? ""} onChange={(e) => setActivity(a.line_id, { hours_normal: e.target.value === "" ? null : Number(e.target.value) })} />
                        <input type="number" inputMode="decimal" aria-label="Overtime hours" className={inputClass} disabled={!editable} value={a.hours_ot ?? ""} onChange={(e) => setActivity(a.line_id, { hours_ot: e.target.value === "" ? null : Number(e.target.value) })} />
                      </div>
                    </Field>
                  </div>

                  {steps.length > 0 ? (
                    <div className="mt-3 rounded-md bg-muted/50 p-2">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">Steps (progress rolls up by weight)</p>
                      <div className="grid gap-2 md:grid-cols-2">
                        {steps.map((s) => (
                          <label key={s.step_id} className="flex items-center justify-between gap-2 text-xs">
                            <span>
                              {s.step_no}. {s.step_name}
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              aria-label={`${s.step_name} progress`}
                              className={cn(inputClass, "h-8 w-20")}
                              disabled={!editable}
                              value={s.progress}
                              onChange={(e) => {
                                const next = steps.map((x) => (x.step_id === s.step_id ? { ...x, progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } : x));
                                setActivity(a.line_id, { step_progress: next, progress_today: rollUp(next) });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <Field label="Actual start">
                      <input type="date" className={inputClass} disabled={!editable} value={a.actual_start_date ?? ""} onChange={(e) => setActivity(a.line_id, { actual_start_date: e.target.value || null })} />
                    </Field>
                    <Field label="Actual finish">
                      <input type="date" className={inputClass} disabled={!editable} value={a.actual_finish_date ?? ""} onChange={(e) => setActivity(a.line_id, { actual_finish_date: e.target.value || null })} />
                    </Field>
                    <Field label="Remarks">
                      <input className={inputClass} disabled={!editable} value={a.remarks ?? ""} onChange={(e) => setActivity(a.line_id, { remarks: e.target.value || null })} />
                    </Field>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {editable || canEdit("evidence") ? (
                      <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
                        <Camera className="h-4 w-4" /> Add photo
                        <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => { void attach(e.target.files, "activities", a.line_id); e.target.value = ""; }} />
                      </label>
                    ) : null}
                    <span className="text-xs text-muted-foreground">{photos} photo(s) attached</span>
                  </div>
                  <div className="mt-2">
                    <RuleList results={results} forSection="activities" lineId={a.line_id} />
                  </div>
                </div>
              );
            })}

            {canAddTo("activities") ? (
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Add an activity from the plan"
                  className={cn(inputClass, "max-w-md")}
                  value=""
                  onChange={(e) => {
                    const task = taskById.get(e.target.value);
                    if (task) patch({ activities: [...payload.activities, activityLine(task)] });
                  }}
                >
                  <option value="">Add an activity from the plan…</option>
                  {taskOptions
                    .filter((o) => !usedTasks.has(o.value))
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    patch({
                      activities: [
                        ...payload.activities,
                        { line_id: newLineId(), task_id: null, unplanned: true, work_status: "in_progress", progress_today: 0, hours_normal: 8, hours_ot: 0 },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Activity not on the plan
                </Button>
              </div>
            ) : null}
            <RuleList results={results.filter((r) => !r.target.line_id)} forSection="activities" />
          </div>
        </SectionCard>
      ) : null}

      {/* ── Step: resources ───────────────────────────────────────────────── */}
      {current === "Resources" ? (
        <>
          <SectionCard title={SECTION_LABELS.equipment} locked={!canEdit("equipment")}>
            <LineList
              section="equipment"
              lines={payload.equipment}
              onChange={(equipment) => patch({ equipment })}
              makeLine={() => ({ line_id: newLineId(), equipment_type: "", asset_ref: null, hours_working: null, hours_idle: null, hours_breakdown: null })}
              addLabel="Add equipment"
              results={results}
              canEditLine={(id) => canEdit("equipment", id)}
              canAdd={canAddTo("equipment")}
              emptyText="No equipment recorded."
              columns={[
                col<DrPayload["equipment"][number]>({ key: "equipment_type", label: "Type", type: "text", span: 4, placeholder: "e.g. Tower crane" }),
                { key: "asset_ref", label: "Asset no.", type: "text", span: 2 },
                { key: "hours_working", label: "Working h", type: "number", span: 2 },
                { key: "hours_idle", label: "Idle h", type: "number", span: 2 },
                { key: "hours_breakdown", label: "Breakdown h", type: "number", span: 2 },
              ]}
            />
            <div className="mt-2">
              <RuleList results={results.filter((r) => !r.target.line_id)} forSection="equipment" />
            </div>
          </SectionCard>
          <SectionCard title={SECTION_LABELS.materials} locked={!canEdit("materials")}>
            <LineList
              section="materials"
              lines={payload.materials}
              onChange={(materials) => patch({ materials })}
              makeLine={() => ({ line_id: newLineId(), description: "", qty_delivered: null, qty_used: null, uom: null, delivery_note_ref: null })}
              addLabel="Add material"
              results={results}
              canEditLine={(id) => canEdit("materials", id)}
              canAdd={canAddTo("materials")}
              emptyText="No materials recorded."
              columns={[
                col<DrPayload["materials"][number]>({ key: "description", label: "Material", type: "text", span: 4 }),
                { key: "qty_delivered", label: "Delivered", type: "number", span: 2 },
                { key: "qty_used", label: "Used", type: "number", span: 2 },
                { key: "uom", label: "Unit", type: "text", span: 2 },
                { key: "delivery_note_ref", label: "Delivery note", type: "text", span: 2 },
              ]}
            />
            <div className="mt-2">
              <RuleList results={results.filter((r) => !r.target.line_id)} forSection="materials" />
            </div>
          </SectionCard>
        </>
      ) : null}

      {/* ── Step: events ──────────────────────────────────────────────────── */}
      {current === "Events" ? (
        <>
          <SectionCard title={SECTION_LABELS.delays} locked={!canEdit("delays")}>
            <LineList
              section="delays"
              lines={payload.delays}
              onChange={(delays) => patch({ delays })}
              makeLine={() => ({ line_id: newLineId(), cause_category: "OTHER" as const, description: "", hours_lost: null, task_id: null, notice_required: false })}
              addLabel="Add delay event"
              results={results}
              canEditLine={(id) => canEdit("delays", id)}
              canAdd={canAddTo("delays")}
              emptyText="No delays today."
              columns={[
                col<DrPayload["delays"][number]>({ key: "cause_category", label: "Cause", type: "select", span: 3, options: DELAY_CAUSES.map((c) => ({ value: c, label: DELAY_CAUSE_LABELS[c] })) }),
                { key: "description", label: "What happened", type: "text", span: 5 },
                { key: "hours_lost", label: "Hours lost", type: "number", span: 2 },
                { key: "notice_required", label: "Notice required", type: "checkbox", span: 2 },
                { key: "task_id", label: "Affected activity", type: "select", span: 6, options: taskOptions },
                { key: "start_at", label: "From", type: "datetime", span: 3 },
                { key: "end_at", label: "To", type: "datetime", span: 3 },
              ]}
            />
          </SectionCard>
          <SectionCard title={SECTION_LABELS.issues} locked={!canEdit("issues")}>
            <LineList
              section="issues"
              lines={payload.issues}
              onChange={(issues) => patch({ issues })}
              makeLine={() => ({ line_id: newLineId(), issue_type: null, severity: "MEDIUM" as const, description: "", action_required_from: null })}
              addLabel="Add issue"
              results={results}
              canEditLine={(id) => canEdit("issues", id)}
              canAdd={canAddTo("issues")}
              emptyText="No issues or constraints."
              columns={[
                col<DrPayload["issues"][number]>({ key: "description", label: "Issue", type: "text", span: 6 }),
                { key: "severity", label: "Severity", type: "select", span: 2, options: ISSUE_SEVERITIES.map((s) => ({ value: s, label: s })) },
                { key: "action_required_from", label: "Action needed from", type: "text", span: 4 },
              ]}
            />
          </SectionCard>
          <SectionCard title={SECTION_LABELS.instructions} locked={!canEdit("instructions")}>
            <LineList
              section="instructions"
              lines={payload.instructions}
              onChange={(instructions) => patch({ instructions })}
              makeLine={() => ({ line_id: newLineId(), instruction_type: "VERBAL" as const, given_by: null, reference: null, description: "" })}
              addLabel="Add instruction"
              results={results}
              canEditLine={(id) => canEdit("instructions", id)}
              canAdd={canAddTo("instructions")}
              emptyText="No instructions received."
              columns={[
                col<DrPayload["instructions"][number]>({ key: "instruction_type", label: "Type", type: "select", span: 2, options: [{ value: "VERBAL", label: "Verbal" }, { value: "WRITTEN", label: "Written" }] }),
                { key: "given_by", label: "Given by", type: "text", span: 3 },
                { key: "reference", label: "Reference", type: "text", span: 2 },
                { key: "description", label: "Instruction", type: "text", span: 5 },
              ]}
            />
          </SectionCard>
          <SectionCard title={SECTION_LABELS.inspections} locked={!canEdit("inspections")}>
            <LineList
              section="inspections"
              lines={payload.inspections}
              onChange={(inspections) => patch({ inspections })}
              makeLine={() => ({ line_id: newLineId(), reference: null, status: null })}
              addLabel="Add inspection request"
              results={results}
              canEditLine={(id) => canEdit("inspections", id)}
              canAdd={canAddTo("inspections")}
              emptyText="No inspection requests raised."
              columns={[
                col<DrPayload["inspections"][number]>({ key: "reference", label: "Reference", type: "text", span: 6 }),
                { key: "status", label: "Status", type: "text", span: 6 },
              ]}
            />
          </SectionCard>
          <SectionCard title={SECTION_LABELS.area_access} locked={!canEdit("area_access")}>
            <LineList
              section="area_access"
              lines={payload.area_access}
              onChange={(area_access) => patch({ area_access })}
              makeLine={() => ({ line_id: newLineId(), access_state: "BLOCKED" as const, note: null })}
              addLabel="Add area"
              results={results}
              canEditLine={(id) => canEdit("area_access", id)}
              canAdd={canAddTo("area_access")}
              emptyText="No access changes."
              columns={[
                col<DrPayload["area_access"][number]>({ key: "note", label: "Area / work front", type: "text", span: 8 }),
                { key: "access_state", label: "State", type: "select", span: 4, options: ACCESS_STATES.map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() })) },
              ]}
            />
          </SectionCard>
        </>
      ) : null}

      {/* ── Step: safety & next day ───────────────────────────────────────── */}
      {current === "Safety & next day" ? (
        <>
          <SectionCard title={SECTION_LABELS.safety} locked={!canEdit("safety")}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Toolbox talk held?">
                <select
                  className={inputClass}
                  disabled={!canEdit("safety")}
                  value={payload.safety?.toolbox_talk_held === true ? "yes" : payload.safety?.toolbox_talk_held === false ? "no" : ""}
                  onChange={(e) => patch({ safety: { ...payload.safety, toolbox_talk_held: e.target.value === "" ? null : e.target.value === "yes" } })}
                >
                  <option value="">Select…</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              <Field label="Incidents" hint="Any incident notifies HSE immediately.">
                <input type="number" inputMode="numeric" className={inputClass} disabled={!canEdit("safety")} value={payload.safety?.incident_count ?? ""} onChange={(e) => patch({ safety: { ...payload.safety, incident_count: e.target.value === "" ? null : Number(e.target.value) } })} />
              </Field>
              <Field label="Near misses">
                <input type="number" inputMode="numeric" className={inputClass} disabled={!canEdit("safety")} value={payload.safety?.near_miss_count ?? ""} onChange={(e) => patch({ safety: { ...payload.safety, near_miss_count: e.target.value === "" ? null : Number(e.target.value) } })} />
              </Field>
            </div>
            <Field label="Observations" className="mt-3">
              <textarea className={textareaClass} disabled={!canEdit("safety")} value={payload.safety?.observations ?? ""} onChange={(e) => patch({ safety: { ...payload.safety, observations: e.target.value || null } })} />
            </Field>
            <div className="mt-2">
              <RuleList results={results} forSection="safety" />
            </div>
          </SectionCard>
          <SectionCard title={SECTION_LABELS.next_day} locked={!canEdit("next_day")}>
            <LineList
              section="next_day"
              lines={payload.next_day}
              onChange={(next_day) => patch({ next_day })}
              makeLine={() => ({ line_id: newLineId(), task_id: null, description: null, planned_manpower: null, planned_qty: null })}
              addLabel="Add planned activity"
              results={results}
              canEditLine={(id) => canEdit("next_day", id)}
              canAdd={canAddTo("next_day")}
              emptyText="No plan for tomorrow yet."
              columns={[
                col<DrPayload["next_day"][number]>({ key: "task_id", label: "Activity", type: "select", span: 5, options: taskOptions }),
                { key: "description", label: "Note", type: "text", span: 3 },
                { key: "planned_manpower", label: "Manpower", type: "number", span: 2 },
                { key: "planned_qty", label: "Quantity", type: "number", span: 2 },
              ]}
            />
            <div className="mt-2">
              <RuleList results={results.filter((r) => !r.target.line_id)} forSection="next_day" />
            </div>
          </SectionCard>
        </>
      ) : null}

      {/* ── Step: review & submit ─────────────────────────────────────────── */}
      {current === "Review & submit" ? (
        <>
          {noWork ? (
            <SectionCard title="No work today">
              <Field label="Reason" hint="For example: weather, public holiday, access not released.">
                <textarea className={textareaClass} value={payload.no_work_reason ?? ""} onChange={(e) => patch({ no_work_reason: e.target.value || null })} />
              </Field>
            </SectionCard>
          ) : (
            <SectionCard title="Before you submit">
              <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Manpower</dt>
                  <dd className="text-lg font-semibold">{payload.manpower.reduce((s, m) => s + (m.reported_count ?? 0), 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Activities</dt>
                  <dd className="text-lg font-semibold">{payload.activities.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Delay events</dt>
                  <dd className="text-lg font-semibold">{payload.delays.length}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Photos</dt>
                  <dd className="text-lg font-semibold">{allEvidence.length}</dd>
                </div>
              </dl>
            </SectionCard>
          )}

          {!noWork ? (
            <SectionCard
              title={SECTION_LABELS.evidence}
              action={
                <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
                  <Paperclip className="h-4 w-4" /> Attach
                  <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => { void attach(e.target.files, "evidence"); e.target.value = ""; }} />
                </label>
              }
            >
              {mode !== "new" && (ctx.existing_evidence.length ?? 0) > 0 ? (
                <p className="mb-2 text-xs text-muted-foreground">{ctx.existing_evidence.length} file(s) already on this report stay attached.</p>
              ) : null}
              {evidence.length === 0 ? (
                <p className="text-sm text-muted-foreground">No new files attached.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {evidence.map((e) => (
                    <li key={e.storage_key} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1">
                      <span className="truncate">
                        {e.name} <span className="text-xs text-muted-foreground">· {SECTION_LABELS[e.target_section]}</span>
                      </span>
                      <button type="button" aria-label={`Remove ${e.name}`} onClick={() => setEvidence((list) => list.filter((x) => x.storage_key !== e.storage_key))}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {uploading > 0 ? <p className="mt-2 text-xs text-muted-foreground">Uploading {uploading} file(s)…</p> : null}
              <div className="mt-2">
                <RuleList results={results} forSection="evidence" />
              </div>
            </SectionCard>
          ) : null}

          {mode === "amend" || mode === "correct" || replacingNoWork ? (
            <SectionCard title={mode === "amend" ? "Reason for amendment" : mode === "correct" ? "Reply to the Project Manager" : "Reason for replacing the No Work report"}>
              <textarea
                className={textareaClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={mode === "correct" ? "What did you change? (optional)" : "Required"}
              />
            </SectionCard>
          ) : null}

          <SectionCard title={errors.length > 0 ? `${errors.length} error(s) to fix` : warns.length > 0 ? `${warns.length} item(s) will be flagged for the PM` : "Checks passed"}>
            {results.length === 0 ? <p className="text-sm text-muted-foreground">No problems found.</p> : <RuleList results={results} />}
            {errors.length === 0 && warns.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Warnings do not block submission. The Project Manager will see them.</p>
            ) : null}
          </SectionCard>
        </>
      ) : null}

      {/* Navigation */}
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-background py-3">
        <Button type="button" variant="outline" disabled={noWork || step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        {current === "Review & submit" ? (
          <Button type="button" disabled={submitting || uploading > 0 || errors.length > 0 || blockedByExisting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            {offline ? "Save and send when online" : mode === "new" ? "Submit report" : mode === "correct" ? "Resubmit" : "Send amendment for approval"}
          </Button>
        ) : (
          <Button type="button" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>
            Next <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
