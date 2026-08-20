"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, isAfter, isSunday, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, FileWarning, Users, Plus, X, Paperclip } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useMiniApp } from "@/lib/telegram/miniapp-context";
import {
  computeLeaveDays,
  getDefaultDaySelections,
  getSelectedDates,
  type DaySelection,
} from "@/lib/hr/leave-day-calculation";

// ── Reference payload shapes ────────────────────────────────────────────────
// Mirror the response built by
// apps/web/app/api/telegram/miniapp/leave/reference/route.ts (lines 47-58),
// which in turn mirrors the return types of the lib/hr/leave.ts helpers it
// calls. Cited per-type below.

// Mirrors ApplicableLeaveType (apps/web/lib/hr/leave.ts:473-488).
interface LeaveType {
  id: string;
  leave_code: string;
  leave_name: string;
  max_days_per_year: number;
  is_paid: boolean;
  half_day_allowed: boolean;
  skip_team_capacity: boolean;
  max_days_per_request: number;
  advance_notice_days: number;
  probation_required: boolean;
  gender_restriction: string;
  is_replacement_leave: boolean;
  requires_document: boolean;
  is_active: boolean;
}

// Mirrors LeaveBalanceSummaryRow (apps/web/lib/hr/leave.ts:33-39). Keyed by
// `leave_name`, NOT `leave_type_id` — this is a pre-existing shape
// limitation in getLeaveBalanceSummary (leave.ts:41-65, which joins
// leave_types(leave_name) but never selects the type id), so balances must
// be matched to a LeaveType by `leave_name`, not id.
interface LeaveBalance {
  leave_name: string;
  allocated_days: number;
  used_days: number;
  carried_over_days: number;
  remaining_days: number;
}

// Mirrors LeaveDateRange (apps/web/lib/hr/leave.ts:531-534).
interface OccupiedRange {
  start_date: string;
  end_date: string;
}

// Mirrors LeaveEmploymentPolicy (apps/web/lib/hr/leave.ts:504-511). Fetched
// as part of the reference payload but not currently surfaced in this
// screen's UI — kept here for shape accuracy / future use (see report).
interface EmploymentPolicy {
  leave_type_id: string;
  allowed: boolean;
  requires_hr: boolean;
  requires_attachment: boolean;
  monthly_accrual: boolean;
  usable: boolean;
}

// Mirrors the `applicant` object built in reference/route.ts:53-57.
interface Applicant {
  gender: string | null;
  probationStatus: string | null;
  employmentType: string | null;
}

// Mirrors the `teammates` field built in reference/route.ts:45-49/58 — a
// plain profiles query (everyone except the current user), used to power
// the CC "add teammate" picker below. UI-parity only: CC selections are
// kept in local state and are never sent to the apply endpoint (see
// leave-request-form.tsx, which never persists them either).
interface Teammate {
  id: string;
  full_name: string | null;
  department: string | null;
}

interface ReferenceData {
  leaveTypes: LeaveType[];
  balances: LeaveBalance[];
  publicHolidays: string[];
  occupiedRanges: OccupiedRange[];
  employmentPolicies: EmploymentPolicy[];
  teammates: Teammate[];
  applicant: Applicant;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per file, enforced client-side (see report)

const DAY_OPTIONS: { value: DaySelection; label: string }[] = [
  { value: "full", label: "Full" },
  { value: "morning", label: "AM" },
  { value: "afternoon", label: "PM" },
  { value: "skip", label: "Skip" },
];

export default function LeaveApplyForm() {
  const router = useRouter();
  const { initData } = useMiniApp();

  // ── Reference data fetch ──────────────────────────────────────────────
  const [reference, setReference] = useState<ReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchReference = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/miniapp/leave/reference", {
        headers: { Authorization: `tma ${initData}` },
      });
      if (!res.ok) throw new Error("Request failed");
      const body = await res.json();
      setReference(body);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    fetchReference();
  }, [fetchReference]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    fetchReference();
  };

  // ── Form state ─────────────────────────────────────────────────────────
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // Sparse map of explicit per-day overrides the user has tapped. Stale
  // entries from a previous date range are harmless — `dayRows`,
  // `effectiveSelections`, and `computeLeaveDays` all derive from the
  // current `allDays`/range, so a key outside that range is simply never
  // looked up.
  const [overrides, setOverrides] = useState<Record<string, DaySelection>>({});
  const [reason, setReason] = useState("");

  // ── CC state (UI-parity only — never sent to the apply endpoint; mirrors
  // leave-request-form.tsx:117-133) ───────────────────────────────────────
  const [ccTeammates, setCcTeammates] = useState<Teammate[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");

  // Teammate picker overlay
  const [showTeammatePicker, setShowTeammatePicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSelected, setPickerSelected] = useState<Teammate[]>([]);

  // Attachments (UI-parity only — never uploaded; mirrors
  // leave-request-form.tsx:132-133)
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Submission state ──────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);

  // ── Derived values ────────────────────────────────────────────────────
  const applicantGender = reference?.applicant.gender ?? "all";

  // Mirrors `selectableTypes` in leave-request-form.tsx:143-150.
  const selectableTypes = useMemo(
    () =>
      (reference?.leaveTypes ?? []).filter(
        (lt) => lt.gender_restriction === "all" || lt.gender_restriction === applicantGender,
      ),
    [reference, applicantGender],
  );

  const selectedType = selectableTypes.find((t) => t.id === leaveTypeId);
  const selectedBalance = reference?.balances.find((b) => b.leave_name === selectedType?.leave_name);

  const holidaysSet = useMemo(() => new Set(reference?.publicHolidays ?? []), [reference]);

  // Client-side reconstruction of getOccupiedLeaveDateSet (leave.ts:554-563,
  // not exported) from the raw ranges the reference endpoint returns.
  const occupiedDatesSet = useMemo(() => {
    const set = new Set<string>();
    for (const range of reference?.occupiedRanges ?? []) {
      for (const day of getSelectedDates(range.start_date, range.end_date)) {
        set.add(format(day, "yyyy-MM-dd"));
      }
    }
    return set;
  }, [reference]);

  const rangeInvalid = Boolean(startDate && endDate && isAfter(parseISO(startDate), parseISO(endDate)));

  const allDays = useMemo(() => getSelectedDates(startDate, endDate), [startDate, endDate]);

  const dayRows = useMemo(
    () =>
      allDays.map((date) => {
        const key = format(date, "yyyy-MM-dd");
        const isSundayOrHoliday = isSunday(date) || holidaysSet.has(key);
        const selection = overrides[key] ?? (isSundayOrHoliday ? "skip" : "full");
        return { key, date, isSundayOrHoliday, selection };
      }),
    [allDays, holidaysSet, overrides],
  );

  const effectiveSelections = useMemo(
    () => getDefaultDaySelections(startDate, endDate, overrides, holidaysSet),
    [startDate, endDate, overrides, holidaysSet],
  );

  const dayCalc = useMemo(
    () => computeLeaveDays(startDate, endDate, effectiveSelections, holidaysSet),
    [startDate, endDate, effectiveSelections, holidaysSet],
  );

  const daysRequested = dayCalc.daysRequested;

  const isBalanceTracked = Boolean(selectedType && !selectedType.is_replacement_leave);
  const remainingBalance = selectedBalance?.remaining_days ?? 0;
  const balanceWarning =
    isBalanceTracked && daysRequested > remainingBalance
      ? `Insufficient balance. You have ${remainingBalance} day${remainingBalance !== 1 ? "s" : ""} remaining.`
      : null;

  // Mirrors the conflict check in leave-request-form.tsx:338-347 — only
  // days that are actually being requested (not explicitly skipped) count
  // as a conflict.
  const conflictKeys = useMemo(
    () =>
      dayCalc.requestableDateKeys.filter((key) => {
        const selection = effectiveSelections[key] ?? "full";
        return selection !== "skip" && occupiedDatesSet.has(key);
      }),
    [dayCalc.requestableDateKeys, effectiveSelections, occupiedDatesSet],
  );
  const conflictWarning =
    conflictKeys.length > 0
      ? `You already have a leave request on: ${conflictKeys
          .map((key) => format(parseISO(key), "dd MMM yyyy"))
          .join(", ")}. Please select different dates.`
      : null;

  const canSubmit = Boolean(
    !submittedRequestId &&
      leaveTypeId &&
      startDate &&
      endDate &&
      !rangeInvalid &&
      daysRequested > 0 &&
      reason.trim().length > 0,
  );

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!leaveTypeId || !startDate || !endDate || !reason.trim() || rangeInvalid || daysRequested <= 0) return;

    setSubmitting(true);
    setSubmitError(null);
    window.Telegram?.WebApp?.MainButton.showProgress();

    try {
      const res = await fetch("/api/telegram/miniapp/leave/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `tma ${initData}`,
        },
        body: JSON.stringify({
          leave_type_id: leaveTypeId,
          start_date: startDate,
          end_date: endDate,
          day_selections: effectiveSelections,
          reason: reason.trim(),
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          (body && typeof body.message === "string" && body.message) ||
          (body?.error === "invalid_body" && "Please check the form and try again.") ||
          "Something went wrong. Please try again.";
        setSubmitError(message);
        return;
      }

      setSubmittedRequestId(typeof body?.requestId === "string" ? body.requestId : "submitted");
    } catch {
      setSubmitError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
      window.Telegram?.WebApp?.MainButton.hideProgress();
    }
  }, [submitting, leaveTypeId, startDate, endDate, reason, rangeInvalid, daysRequested, effectiveSelections, initData]);

  // Keep the latest handler in a ref so the onClick effect below doesn't
  // need to re-subscribe (offClick/onClick) on every keystroke that changes
  // handleSubmit's identity.
  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    const onClick = () => handleSubmitRef.current();
    webApp.MainButton.onClick(onClick);
    return () => webApp.MainButton.offClick(onClick);
  }, []);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    webApp.MainButton.setText("Submit Request");
    if (canSubmit) {
      webApp.MainButton.show();
    } else {
      webApp.MainButton.hide();
    }
  }, [canSubmit]);

  // Hide the MainButton on unmount so it doesn't leak into whatever screen
  // the user navigates to next.
  useEffect(() => {
    return () => {
      window.Telegram?.WebApp?.MainButton.hide();
    };
  }, []);

  // BackButton: shown for this page's whole lifetime, always returns to the
  // leave menu.
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    const onBack = () => router.push("/telegram-app/leave");
    webApp.BackButton.show();
    webApp.BackButton.onClick(onBack);
    return () => {
      webApp.BackButton.offClick(onBack);
      webApp.BackButton.hide();
    };
  }, [router]);

  // ── CC & Attachments (UI-parity only) ───────────────────────────────────
  // Seed the picker's selection with the current CC list, and clear the
  // search box, each time the overlay opens. Mirrors
  // leave-request-form.tsx:275-287, minus the profiles fetch — the
  // teammate list here already came from the reference payload.
  useEffect(() => {
    if (!showTeammatePicker) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPickerQuery("");
    setPickerSelected(ccTeammates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTeammatePicker]);

  const removeTeammate = useCallback((id: string) => {
    setCcTeammates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addEmail = useCallback(() => {
    const trimmed = emailInput.trim();
    if (trimmed && !ccEmails.includes(trimmed)) {
      setCcEmails((prev) => [...prev, trimmed]);
    }
    setEmailInput("");
  }, [emailInput, ccEmails]);

  const removeEmail = useCallback((email: string) => {
    setCcEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  // Mirrors handleFileChange (leave-request-form.tsx:480-487) — same 5-file
  // cap via `.slice(0, 5)`. The desktop form's helper text claims a 10 MB
  // per-file limit but never actually checks it; we add that check here
  // client-side since it's cheap and avoids silently accepting a file that
  // will never go anywhere anyway.
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    const oversized = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
    const accepted = picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES);
    setFileError(oversized.length > 0 ? `${oversized.map((f) => f.name).join(", ")} exceeds 10 MB and wasn't added.` : null);
    setFiles((prev) => [...prev, ...accepted].slice(0, 5));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  if (submittedRequestId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-4 pt-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <div>
          <p className="text-base font-semibold">Request submitted</p>
          <p className="mt-1 text-sm text-[var(--tg-hint-color)]">
            Your leave request has been sent for approval. You can track its status from My Requests.
          </p>
        </div>
        <Button onClick={() => router.push("/telegram-app/leave")}>Back to Leave</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4 pb-24">
      <h1 className="px-1 text-lg font-semibold">Apply for Leave</h1>

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-[var(--tg-hint-color)]">Couldn&apos;t load the leave application form.</p>
            <Button size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && reference && selectableTypes.length === 0 && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <FileWarning className="h-8 w-8 text-[var(--tg-hint-color)]" />
            <p className="text-sm text-[var(--tg-hint-color)]">No leave types are available for you to apply for.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && reference && selectableTypes.length > 0 && (
        <>
          {/* Leave type */}
          <Card gradient={false}>
            <CardContent className="flex flex-col gap-1.5 py-1">
              <label className="text-xs font-medium text-[var(--tg-hint-color)]" htmlFor="leave-type">
                Leave type
              </label>
              <select
                id="leave-type"
                className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-[var(--tg-text-color)] focus:outline-none focus:ring-2 focus:ring-ring"
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
              >
                <option value="">Select leave type</option>
                {selectableTypes.map((lt) => {
                  const bal = reference.balances.find((b) => b.leave_name === lt.leave_name);
                  return (
                    <option key={lt.id} value={lt.id}>
                      {lt.leave_name}
                      {lt.is_paid ? "" : " (Unpaid)"}
                      {bal ? ` – ${bal.remaining_days} remaining` : ""}
                    </option>
                  );
                })}
              </select>
              {selectedType?.requires_document && (
                <p className="text-xs text-amber-600">Document required for this leave type.</p>
              )}
            </CardContent>
          </Card>

          {/* Dates */}
          <Card gradient={false}>
            <CardContent className="grid grid-cols-2 gap-2 py-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--tg-hint-color)]" htmlFor="start-date">
                  Start date
                </label>
                <input
                  id="start-date"
                  type="date"
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-[var(--tg-text-color)] focus:outline-none focus:ring-2 focus:ring-ring"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--tg-hint-color)]" htmlFor="end-date">
                  End date
                </label>
                <input
                  id="end-date"
                  type="date"
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-[var(--tg-text-color)] focus:outline-none focus:ring-2 focus:ring-ring"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              {rangeInvalid && (
                <p className="col-span-2 text-xs text-red-600">End date cannot be before start date.</p>
              )}
            </CardContent>
          </Card>

          {/* Per-day breakdown */}
          {!rangeInvalid && dayRows.length > 0 && (
            <Card gradient={false}>
              <CardContent className="flex flex-col py-1">
                <p className="pb-1.5 text-xs font-medium text-[var(--tg-hint-color)]">Day breakdown</p>
                {dayRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-center justify-between gap-2 border-b border-[var(--tg-secondary-bg-color)] py-1.5 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{format(row.date, "EEE, dd MMM")}</p>
                      {row.isSundayOrHoliday && (
                        <p className="text-[10px] text-[var(--tg-hint-color)]">
                          {isSunday(row.date) ? "Sunday" : "Public holiday"}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {DAY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setOverrides((prev) => ({ ...prev, [row.key]: opt.value }))}
                          className={cn(
                            "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                            row.selection === opt.value
                              ? "bg-[var(--tg-button-color)] text-[var(--tg-button-text-color)]"
                              : "bg-[var(--tg-secondary-bg-color)] text-[var(--tg-hint-color)]",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          {!rangeInvalid && dayRows.length > 0 && (
            <Card gradient={false}>
              <CardContent className="flex flex-col gap-2 py-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Days requested</p>
                  <p className="text-base font-semibold">{daysRequested}</p>
                </div>
                {isBalanceTracked && (
                  <div className="flex items-center justify-between text-xs text-[var(--tg-hint-color)]">
                    <span>Remaining balance</span>
                    <span>
                      {remainingBalance} day{remainingBalance !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {balanceWarning && (
                  <p className="rounded-md bg-amber-100 px-2 py-1.5 text-xs text-amber-800">{balanceWarning}</p>
                )}
                {conflictWarning && (
                  <p className="rounded-md bg-red-100 px-2 py-1.5 text-xs text-red-700">{conflictWarning}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Reason */}
          <Card gradient={false}>
            <CardContent className="flex flex-col gap-1.5 py-1">
              <label className="text-xs font-medium text-[var(--tg-hint-color)]" htmlFor="reason">
                Reason
              </label>
              <textarea
                id="reason"
                className="min-h-[80px] w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm text-[var(--tg-text-color)] focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Why are you taking this leave?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* CC (optional) */}
          <Card gradient={false}>
            <CardContent className="flex flex-col gap-3 py-1">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-[var(--tg-hint-color)]" />
                  <span className="text-xs font-medium text-[var(--tg-text-color)]">
                    CC <span className="font-normal text-[var(--tg-hint-color)]">(optional)</span>
                  </span>
                </div>
                <p className="text-[10px] text-[var(--tg-hint-color)]">
                  Keep teammates or external contacts in the loop
                </p>
              </div>

              {/* Teammates */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-hint-color)]">
                  Teammates
                </p>
                {ccTeammates.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ccTeammates.map((tm) => (
                      <span
                        key={tm.id}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--tg-secondary-bg-color)] px-2.5 py-0.5 text-xs font-medium text-[var(--tg-text-color)]"
                      >
                        {tm.full_name}
                        {tm.department ? ` · ${tm.department}` : ""}
                        <button
                          type="button"
                          onClick={() => removeTeammate(tm.id)}
                          className="ml-0.5 hover:opacity-70"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowTeammatePicker(true)}
                  className="h-8 w-fit gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Add teammate
                </Button>
              </div>

              {/* External emails */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tg-hint-color)]">
                  External emails
                </p>
                {ccEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ccEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--tg-secondary-bg-color)] px-2.5 py-0.5 text-xs text-[var(--tg-text-color)]"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          className="ml-0.5 hover:opacity-70"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addEmail();
                      }
                    }}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm text-[var(--tg-text-color)] focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={addEmail} className="h-9 shrink-0">
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attachments (optional) */}
          <Card gradient={false}>
            <CardContent className="flex flex-col gap-2 py-1">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-[var(--tg-hint-color)]" />
                  <span className="text-xs font-medium text-[var(--tg-text-color)]">
                    Attachments <span className="font-normal text-[var(--tg-hint-color)]">(optional)</span>
                  </span>
                </div>
                <p className="text-[10px] text-[var(--tg-hint-color)]">Up to 5 files - 10 MB each</p>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 w-full items-center gap-2 rounded-lg border border-input px-3 text-sm font-medium text-[var(--tg-text-color)] transition-colors hover:border-ring"
              >
                <Paperclip className="h-4 w-4" />
                Choose files (PDF, image, doc)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                className="hidden"
                onChange={handleFileChange}
              />

              {fileError && <p className="text-xs text-red-600">{fileError}</p>}

              {files.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {files.map((f) => (
                    <div
                      key={f.name}
                      className="flex items-center justify-between gap-2 rounded-md bg-[var(--tg-secondary-bg-color)] px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Paperclip className="h-3 w-3 shrink-0 text-[var(--tg-hint-color)]" />
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 text-[var(--tg-hint-color)]">
                          ({(f.size / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(f.name)}
                        className="shrink-0 text-[var(--tg-hint-color)] hover:text-red-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {submitError && (
            <Card gradient={false}>
              <CardContent className="flex items-start gap-2 py-2 text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-sm">{submitError}</p>
              </CardContent>
            </Card>
          )}

          {submitting && <p className="px-1 text-center text-xs text-[var(--tg-hint-color)]">Submitting…</p>}
        </>
      )}

      {/* ── Teammate picker overlay ─────────────────────────────────────── */}
      {showTeammatePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowTeammatePicker(false)}
        >
          <div
            className="flex max-h-[70vh] w-[90vw] max-w-sm flex-col rounded-xl bg-[var(--tg-bg-color)] p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--tg-text-color)]">Select teammates</h3>
              <button
                type="button"
                onClick={() => setShowTeammatePicker(false)}
                className="text-[var(--tg-hint-color)] hover:text-[var(--tg-text-color)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              autoFocus
              placeholder="Search by name or department..."
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              className="mb-3 h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-[var(--tg-text-color)] focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="max-h-[60vh] flex-1 space-y-0.5 overflow-y-auto">
              {(reference?.teammates ?? [])
                .filter(
                  (p) =>
                    (p.full_name ?? "").toLowerCase().includes(pickerQuery.toLowerCase()) ||
                    (p.department ?? "").toLowerCase().includes(pickerQuery.toLowerCase()),
                )
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-[var(--tg-secondary-bg-color)]"
                  >
                    <Checkbox
                      checked={pickerSelected.some((s) => s.id === p.id)}
                      onCheckedChange={(checked) =>
                        setPickerSelected((prev) =>
                          checked ? [...prev, p] : prev.filter((s) => s.id !== p.id),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--tg-text-color)]">{p.full_name}</span>
                      {p.department && (
                        <span className="block truncate text-[10px] text-[var(--tg-hint-color)]">
                          {p.department}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              {(reference?.teammates ?? []).length === 0 && (
                <p className="px-2 py-3 text-xs text-[var(--tg-hint-color)]">No teammates found.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-[var(--tg-secondary-bg-color)] pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowTeammatePicker(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setCcTeammates(pickerSelected);
                  setShowTeammatePicker(false);
                }}
              >
                Add selected ({pickerSelected.length})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
