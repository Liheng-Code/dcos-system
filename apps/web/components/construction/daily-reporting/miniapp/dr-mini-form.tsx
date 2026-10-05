"use client";

// Module 10-01 Daily Reporting — the one-page report form shown inside
// Telegram. A subcontractor foreman fills this on a phone, so it asks only for
// what the day needs: where, what, how many people, how far, any issue,
// tomorrow's plan, the unit's own custom fields and photos. It builds the same
// payload as the full form and goes through the same rules and gateway.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, CloudOff, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { blockingErrors, evaluateRules, warnings } from "@/lib/construction/daily-reporting/rules";
import {
  answerInfoRequest,
  DrApiError,
  fetchFormContext,
  newIdempotencyKey,
  saveDraft,
  submitReport,
  uploadEvidence,
} from "@/lib/construction/daily-reporting/service";
import { derivedLabel } from "@/lib/construction/daily-reporting/status";
import {
  blankLine,
  blankState,
  buildPayload,
  newId,
  OTHER_LOCATION,
  stateFromPayload,
  type Line,
  type MiniFormState,
} from "@/lib/construction/daily-reporting/mini-form";
import type { EvidenceRef, FormContext, RuleResult } from "@/lib/construction/daily-reporting/types";
import { DrCustomFieldInputs } from "../dr-custom-fields";

const WEATHER = ["Sunny", "Cloudy", "Light rain", "Heavy rain", "Storm", "Flooded"];
interface Photo extends EvidenceRef {
  name: string;
}

const label = "mb-1 block text-xs text-muted-foreground";
const input =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const card = "rounded-xl border border-border bg-card p-4";

function Problems({ results }: { results: RuleResult[] }) {
  if (results.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {results.map((r, i) => (
        <li key={i} className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {r.message}
        </li>
      ))}
    </ul>
  );
}

export function DrMiniForm({
  unitId,
  date,
  onDone,
  onCorrect,
  readOnly = false,
}: {
  unitId: string;
  date: string;
  /** An approver or administrator looking at the form: nothing can be saved or sent. */
  readOnly?: boolean;
  /** Called with the report number once the report is accepted. */
  onDone: (reportNo: string) => void;
  /** The day's report was returned: open the correction form for the returned items. */
  onCorrect: () => void;
}) {
  const [ctx, setCtx] = useState<FormContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<MiniFormState>(blankState);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [queued, setQueued] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverResults, setServerResults] = useState<RuleResult[]>([]);
  const [answer, setAnswer] = useState("");
  const idempotencyKey = useRef(newIdempotencyKey());
  const localKey = `dcos_dr_mini_${unitId}_${date}`;

  const byTask = useMemo(() => new Map((ctx?.activities ?? []).map((a) => [a.task_id, a])), [ctx]);

  useEffect(() => {
    let cancelled = false;
    fetchFormContext(unitId, date)
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        const tasks = new Map(c.activities.map((a) => [a.task_id, a]));
        let restored: MiniFormState | null = null;
        try {
          const raw = localStorage.getItem(localKey);
          restored = raw ? ({ ...blankState(), ...(JSON.parse(raw) as MiniFormState) } as MiniFormState) : null;
        } catch {
          restored = null;
        }
        if (restored) setState(restored);
        else if (c.draft) setState(stateFromPayload(c.draft, tasks));
        else {
          // Offer the activities planned for today, like the full form does.
          const planned = c.activities.filter((a) => a.planned_today).slice(0, 5);
          if (planned.length > 0) {
            setState((s) => ({
              ...s,
              lines: planned.map((a) => ({ id: newId(), location: a.location ?? OTHER_LOCATION, taskId: a.task_id, manpower: "", progress: String(a.current_progress) })),
            }));
          }
        }
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [unitId, date, localKey]);

  const change = (changes: Partial<MiniFormState>) => {
    setServerResults([]);
    setQueued(false);
    setState((s) => {
      const next = { ...s, ...changes };
      try {
        localStorage.setItem(localKey, JSON.stringify(next));
      } catch {
        /* storage unavailable: Save Draft still stores it on the server */
      }
      return next;
    });
  };
  const changeLine = (id: string, changes: Partial<Line>) =>
    change({ lines: state.lines.map((l) => (l.id === id ? { ...l, ...changes } : l)) });

  const locations = useMemo(() => {
    const set = new Set((ctx?.activities ?? []).map((a) => a.location ?? OTHER_LOCATION));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [ctx]);

  const discipline = useMemo(() => {
    const fromActivity = state.lines.map((l) => byTask.get(l.taskId)?.discipline).find(Boolean);
    return fromActivity ?? ctx?.unit.discipline_scope?.[0] ?? "";
  }, [state.lines, byTask, ctx]);

  const payload = useMemo(() => buildPayload(state, byTask, discipline), [state, byTask, discipline]);

  const liveResults = useMemo<RuleResult[]>(() => {
    if (!ctx) return [];
    return evaluateRules({
      payload,
      reportKind: state.noWork ? "NO_WORK" : "WORK",
      reportDate: date,
      todayLocal: ctx.today_local,
      unit: ctx.unit,
      activities: ctx.activities,
      evidence: photos,
      rules: ctx.rules,
      previousNextDay: ctx.previous_next_day,
      approvedProgress: ctx.approved_progress,
      knownUom: ctx.known_uom,
      customFields: ctx.custom_fields?.fields,
    });
  }, [ctx, payload, state.noWork, date, photos]);

  const results = serverResults.length > 0 ? serverResults : liveResults;
  const errors = blockingErrors(results);
  const warns = warnings(results);

  // Short signal loss: keep trying while the page is open; the key makes a repeat harmless.
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

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    const lineId = state.lines.find((l) => l.taskId)?.id ?? null;
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const storage_key = await uploadEvidence(unitId, date, file);
        setPhotos((list) => [
          ...list,
          { storage_key, target_section: "activities", target_line_id: lineId, captured_at_device: new Date(file.lastModified).toISOString(), name: file.name },
        ]);
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function saveAsDraft() {
    setSavingDraft(true);
    try {
      await saveDraft(unitId, date, payload);
      toast.success("Draft saved.");
    } catch {
      toast.message("No connection. The draft is kept on this phone.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function submit() {
    if (!ctx) return;
    setTried(true);
    if (blockingErrors(liveResults).length > 0) return;
    setSubmitting(true);
    try {
      const res = await submitReport(
        unitId,
        date,
        {
          payload,
          evidence: photos.map(({ storage_key, target_section, target_line_id, captured_at_device }) => ({
            storage_key,
            target_section,
            target_line_id,
            captured_at_device,
          })),
          report_kind: state.noWork ? "NO_WORK" : "WORK",
          reason: null,
        },
        idempotencyKey.current,
      );
      try {
        localStorage.removeItem(localKey);
      } catch {
        /* nothing to clear */
      }
      onDone(res.receipt.report_no);
    } catch (e) {
      if (e instanceof DrApiError) {
        setQueued(false);
        if (e.results.length > 0) setServerResults(e.results);
        toast.error(e.message);
      } else {
        if (!queued) toast.message("No connection. The report is kept on this phone and will be sent when the signal returns. Keep this page open.");
        setQueued(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="p-4 text-sm text-red-600">{loadError}</p>;
  if (!ctx) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const header = (
    <div className={cn(card, "flex items-start justify-between gap-2")}>
      <div className="min-w-0">
        <h1 className="text-base font-semibold">Daily Site Report</h1>
        <p className="truncate text-xs text-muted-foreground">
          {[ctx.project?.code, ctx.project?.name, ctx.unit.display_name].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{date}</span>
    </div>
  );

  // A report for the day already exists: show where it stands instead of a second form.
  const existing = ctx.existing && ctx.existing.submission_state !== "WITHDRAWN" ? ctx.existing : null;
  const replacingNoWork = existing?.report_kind === "NO_WORK";
  if (existing && !replacingNoWork) {
    const returned = existing.review_state === "RETURNED";
    const infoRequested = existing.review_state === "INFO_REQUESTED";
    return (
      <div className="space-y-3 p-3">
        {header}
        <div className={cn(card, "space-y-3 text-sm")}>
          <p>
            <span className="font-semibold">{existing.report_no}</span> for {date}: {derivedLabel(existing)}.
          </p>
          {ctx.correction?.message ? <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{ctx.correction.message}</p> : null}
          {returned ? (
            <button type="button" className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground" onClick={onCorrect}>
              Fix the returned items
            </button>
          ) : null}
          {infoRequested ? (
            <>
              <textarea
                className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm"
                placeholder="Your answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <button
                type="button"
                disabled={submitting || answer.trim() === ""}
                className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    await answerInfoRequest(existing.id, answer.trim());
                    onDone(existing.report_no);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not send the answer.");
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                Send answer
              </button>
            </>
          ) : null}
          {!returned && !infoRequested ? <p className="text-muted-foreground">Nothing more to do for today.</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 pb-28">
      {header}
      {readOnly ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          You are viewing this form as an approver. Only the reporters of {ctx.unit.display_name} can submit the report.
        </p>
      ) : null}

      <div className={cn(card, "space-y-3")}>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide">Standard fields</h2>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={state.noWork} onChange={(e) => change({ noWork: e.target.checked })} /> No work today
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Report date</span>
            <input className={input} value={date} disabled />
          </div>
          <div>
            <span className={label}>Contractor</span>
            <input className={input} value={ctx.unit.display_name} disabled />
          </div>
        </div>

        {state.noWork ? (
          <div>
            <span className={label}>Reason there was no work *</span>
            <input
              className={input}
              placeholder="Rain, holiday, area not released…"
              value={state.noWorkReason}
              onChange={(e) => change({ noWorkReason: e.target.value })}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className={label}>Discipline</span>
                <input className={input} value={discipline || "—"} disabled />
              </div>
              <div>
                <span className={label}>Weather *</span>
                <select className={input} value={state.weather} onChange={(e) => change({ weather: e.target.value })}>
                  <option value="">Select…</option>
                  {WEATHER.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>

            {state.lines.map((line, index) => {
              const taken = new Set(state.lines.filter((l) => l.id !== line.id).map((l) => l.taskId));
              const options = ctx.activities.filter((a) => (a.location ?? OTHER_LOCATION) === line.location && !taken.has(a.task_id));
              const activity = byTask.get(line.taskId);
              return (
                <div key={line.id} className={cn("space-y-3", state.lines.length > 1 && "rounded-lg border border-border p-3")}>
                  {state.lines.length > 1 ? (
                    <div className="flex items-center justify-between text-xs font-medium">
                      Activity {index + 1}
                      <button
                        type="button"
                        aria-label={`Remove activity ${index + 1}`}
                        className="text-muted-foreground"
                        onClick={() => change({ lines: state.lines.filter((l) => l.id !== line.id) })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  <div>
                    <span className={label}>Location *</span>
                    <select className={input} value={line.location} onChange={(e) => changeLine(line.id, { location: e.target.value, taskId: "", progress: "" })}>
                      <option value="">Select…</option>
                      {locations.map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={label}>Activity *</span>
                    <select
                      className={input}
                      disabled={!line.location}
                      value={line.taskId}
                      onChange={(e) => changeLine(line.id, { taskId: e.target.value, progress: String(byTask.get(e.target.value)?.current_progress ?? "") })}
                    >
                      <option value="">{line.location ? "Select…" : "Choose a location first"}</option>
                      {options.map((a) => (
                        <option key={a.task_id} value={a.task_id}>
                          {a.task_name}
                          {a.planned_today ? " (planned today)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className={label}>Manpower (workers) *</span>
                      <input
                        className={input}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={line.manpower}
                        onChange={(e) => changeLine(line.id, { manpower: e.target.value })}
                      />
                    </div>
                    <div>
                      <span className={label}>Progress % (total so far) *</span>
                      <input
                        className={input}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        value={line.progress}
                        onChange={(e) => changeLine(line.id, { progress: e.target.value })}
                      />
                      {activity ? <span className="mt-1 block text-xs text-muted-foreground">Was {activity.current_progress}%</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="flex h-10 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border text-sm text-muted-foreground"
              onClick={() => change({ lines: [...state.lines, blankLine()] })}
            >
              <Plus className="h-4 w-4" /> Add another activity
            </button>

            <div>
              <span className={label}>Toolbox talk held today? *</span>
              <div className="grid grid-cols-2 gap-3">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    aria-pressed={state.toolbox === v}
                    className={cn("h-11 rounded-lg border text-sm", state.toolbox === v ? "border-primary bg-primary/10 font-semibold text-primary" : "border-input")}
                    onClick={() => change({ toolbox: v })}
                  >
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Issue / constraint</span>
              <input className={input} placeholder="No issue" value={state.issue} onChange={(e) => change({ issue: e.target.value })} />
            </div>
            <div>
              <span className={label}>Tomorrow plan *</span>
              <input className={input} placeholder="Continue L06 blockwork" value={state.tomorrow} onChange={(e) => change({ tomorrow: e.target.value })} />
            </div>
          </>
        )}
      </div>

      {!state.noWork && (ctx.custom_fields?.fields.length ?? 0) > 0 ? (
        <div className={cn(card, "space-y-3")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide">Custom fields</h2>
            <span className="truncate rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{ctx.unit.display_name}</span>
          </div>
          <DrCustomFieldInputs fields={ctx.custom_fields?.fields ?? []} values={state.custom} onChange={(custom) => change({ custom })} />
        </div>
      ) : null}

      {!state.noWork ? (
        <div className={cn(card, "space-y-3")}>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4" /> Evidence
          </h2>
          {photos.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {photos.map((p) => (
                <li key={p.storage_key} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="truncate">{p.name}</span>
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPhotos((list) => list.filter((x) => x.storage_key !== p.storage_key))}>
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            {uploading > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {uploading > 0 ? "Uploading…" : "Add photos / documents"}
            <input
              type="file"
              disabled={readOnly}
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                void addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}

      {tried || serverResults.length > 0 ? <Problems results={errors} /> : null}
      {warns.length > 0 && (tried || serverResults.length > 0) ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          You can still submit. The project manager will see: {warns.map((w) => w.message).join(" ")}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background p-3">
        {queued ? (
          <p className="mb-2 flex items-center gap-1 text-xs text-amber-700">
            <CloudOff className="h-3.5 w-3.5" /> Saved on device — not yet sent
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <button type="button" disabled={readOnly || savingDraft || submitting} className="h-12 px-3 text-sm font-medium disabled:opacity-60" onClick={saveAsDraft}>
            {savingDraft ? "Saving…" : "Save Draft"}
          </button>
          <button
            type="button"
            disabled={readOnly || submitting || uploading > 0}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
            onClick={submit}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {submitting ? "Sending…" : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
