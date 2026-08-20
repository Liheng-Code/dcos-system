"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, isAfter, isSunday, parseISO } from "date-fns";
import { AlertCircle, CheckCircle2, FileWarning } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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

interface ReferenceData {
  leaveTypes: LeaveType[];
  balances: LeaveBalance[];
  publicHolidays: string[];
  occupiedRanges: OccupiedRange[];
  employmentPolicies: EmploymentPolicy[];
  applicant: Applicant;
}

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
    </div>
  );
}
