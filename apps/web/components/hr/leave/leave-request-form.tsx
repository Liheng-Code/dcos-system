"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resolveApprovalChain } from "@/lib/hr/approval-chain";
import { insertLeaveTaskAlert } from "@/lib/hr/leave";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  format,
  eachDayOfInterval,
  isBefore,
  isAfter,
  isSunday,
  getYear,
} from "date-fns";
import { CalendarDays, FileText, Users, Paperclip, Plus, X, Info, Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getLeaveEmploymentPolicyByEmploymentTypeAndProbationStatusAndLeaveTypeId, getProfileById, insertLeaveNotification, insertLeaveRequest, listLeaveBalancesByEmployeeIdAndFiscalYear, listLeavePublicHolidaysByYearsWithIsActive, listLeaveRequestsByEmployeeIdWithStatusSubmittedApprovedPendingCancellation, listLeaveTypesWithIsActive, listProfilesByExceptId } from "@/lib/hr/hr-queries";

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

interface LeaveBalance {
  leave_type_id: string;
  remaining_days: number;
  carried_over_days: number;
}

interface Profile {
  id: string;
  full_name: string;
  department?: string;
}

interface CurrentUser extends Profile {
  email?: string;
  join_date?: string;
  department?: string;
  gender?: string;
  probation_status?: string;
  probation_end_date?: string;
  employment_type?: string;
}

interface EmploymentPolicy {
  allowed: boolean;
  requires_hr: boolean;
  requires_attachment: boolean;
  monthly_accrual: boolean;
  usable: boolean;
}

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
  title?: string;
  description?: string;
}

type ValidationError = string | null;
type DaySelection = "full" | "morning" | "afternoon" | "skip";

function getSelectedDates(startDate: string, endDate: string) {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isAfter(start, end)) return [];
  return eachDayOfInterval({ start, end });
}

function getDefaultDaySelections(
  startDate: string,
  endDate: string,
  previous: Record<string, DaySelection> = {},
  holidays: Record<string, string> = {},
) {
  const next: Record<string, DaySelection> = {};
  getSelectedDates(startDate, endDate).forEach((day) => {
    const key = format(day, "yyyy-MM-dd");
    if ((isSunday(day) || key in holidays) && previous[key] == null) return;
    next[key] = previous[key] ?? "full";
  });
  return next;
}

export default function LeaveRequestForm({ onSuccess, onCancel, title, description }: Props) {
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [employmentPolicy, setEmploymentPolicy] = useState<EmploymentPolicy | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [publicHolidays, setPublicHolidays] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Form fields
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [daySelections, setDaySelections] = useState<Record<string, DaySelection>>({});
  const [reason, setReason] = useState("");

  // CC state
  const [ccTeammates, setCcTeammates] = useState<Profile[]>([]);
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");

  // Teammate picker dialog
  const [showTeammatePicker, setShowTeammatePicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [pickerSelected, setPickerSelected] = useState<Profile[]>([]);

  // Existing leave dates (to detect overlaps)
  const [existingLeaveDates, setExistingLeaveDates] = useState<Set<string>>(new Set());

  // Attachments
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [conflictDates, setConflictDates] = useState<string[]>([]);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const balanceModalDismissed = useRef(false);
  const [validationError, setValidationError] = useState<ValidationError>(null);
  const [submitting, setSubmitting] = useState(false);

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const userGender = currentUser?.gender ?? null;
  const selectableTypes = useMemo(
    () =>
      leaveTypes.filter((lt) => {
        const r = lt.gender_restriction;
        return r === "all" || r === userGender;
      }),
    [leaveTypes, userGender],
  );
  const selectedType = selectableTypes.find((t) => t.id === selectedTypeId);
  const selectedBalance = balances.find((b) => b.leave_type_id === selectedTypeId);
  const selectedDates = useMemo(() => getSelectedDates(startDate, endDate), [startDate, endDate]);
  const requestableDates = useMemo(
    () =>
      selectedDates.filter((day) => {
        const key = format(day, "yyyy-MM-dd");
        const skip = isSunday(day) || key in publicHolidays;
        return !skip || daySelections[key] != null;
      }),
    [daySelections, selectedDates, publicHolidays],
  );
  const halfDaySelections = requestableDates.filter((day) => {
    const value = daySelections[format(day, "yyyy-MM-dd")];
    return value === "morning" || value === "afternoon";
  });
  const isHalfDay = halfDaySelections.length > 0;
  const halfDayPeriod =
    halfDaySelections.length === 1
      ? (daySelections[format(halfDaySelections[0], "yyyy-MM-dd")] as "morning" | "afternoon")
      : null;
  const daysRequested = useMemo(
    () =>
      requestableDates.reduce((sum, day) => {
        const selection = daySelections[format(day, "yyyy-MM-dd")] ?? "full";
        if (selection === "skip") return sum;
        if (selection === "morning" || selection === "afternoon") return sum + 0.5;
        return sum + 1;
      }, 0),
    [daySelections, requestableDates],
  );
  const isSingleHalfDayRequest = halfDaySelections.length === 1 && daysRequested === 0.5;
  const isBalanceTracked = !!selectedType && !selectedType.is_replacement_leave;
  const availableBalance = selectedBalance?.remaining_days ?? selectedType?.max_days_per_year ?? 0;
  const isOverBalance = isBalanceTracked && daysRequested > availableBalance;
  const balanceShortfall = isOverBalance ? daysRequested - availableBalance : 0;
  const balanceRatio = isBalanceTracked && availableBalance > 0
    ? Math.min(daysRequested / availableBalance, 1)
    : 0;

  // ── Auto-show balance modal when balance exceeded ─────────
  useEffect(() => {
    if (isOverBalance && !balanceModalDismissed.current) {
      setShowBalanceModal(true);
    }
    if (!isOverBalance) {
      balanceModalDismissed.current = false;
    }
  }, [isOverBalance]);

  // ── Initial data load ─────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    const nextYear = currentYear + 1;
    Promise.all([
      supabase.auth.getUser(),
      listLeaveTypesWithIsActive("id, leave_code, leave_name, max_days_per_year, is_paid, half_day_allowed, skip_team_capacity, max_days_per_request, advance_notice_days, probation_required, gender_restriction, is_replacement_leave, requires_document, is_active"),
      listLeavePublicHolidaysByYearsWithIsActive([currentYear, nextYear]),
    ]).then(async ([userRes, typesRes, holidaysRes]) => {
      if (userRes.data.user) {
        const { data: profile } = await getProfileById(userRes.data.user.id, "id, full_name, email, join_date, department, gender, probation_status, probation_end_date, employment_type");
        setCurrentUser(profile);

        const [{ data: balData }, { data: existingReqs }] = await Promise.all([
          listLeaveBalancesByEmployeeIdAndFiscalYear(userRes.data.user.id, currentYear),
          listLeaveRequestsByEmployeeIdWithStatusSubmittedApprovedPendingCancellation(userRes.data.user.id),
        ]);
        setBalances(balData || []);

        // Build set of occupied dates from active leave requests
        const occupied = new Set<string>();
        for (const req of (existingReqs || []) as { start_date: string; end_date: string }[]) {
          const days = eachDayOfInterval({ start: new Date(req.start_date), end: new Date(req.end_date) });
          for (const d of days) occupied.add(format(d, "yyyy-MM-dd"));
        }
        setExistingLeaveDates(occupied);
      }
      if (holidaysRes.data) {
        const map: Record<string, string> = {};
        for (const h of holidaysRes.data as { holiday_date: string; holiday_name: string }[]) {
          map[h.holiday_date] = h.holiday_name;
        }
        setPublicHolidays(map);
      }
      if (typesRes.data) setLeaveTypes(typesRes.data);
      setLoading(false);
    });
  }, [currentYear]);

  // ── Days calculation ──────────────────────────────────────
  function checkDateConflicts(start: string, end: string): string[] {
    if (!start || !end || existingLeaveDates.size === 0) return [];
    return eachDayOfInterval({ start: new Date(start), end: new Date(end) })
      .filter((d) => existingLeaveDates.has(format(d, "yyyy-MM-dd")))
      .map((d) => format(d, "dd MMM yyyy"));
  }

  function updateDateRange(nextStartDate: string, nextEndDate: string) {
    setDaySelections((previous) => getDefaultDaySelections(nextStartDate, nextEndDate, previous, publicHolidays));
    const conflicts = checkDateConflicts(nextStartDate, nextEndDate);
    if (conflicts.length > 0) setConflictDates(conflicts);
  }

  // ── Teammate picker ───────────────────────────────────────
  useEffect(() => {
    if (!showTeammatePicker) return;
    setPickerQuery("");
    setPickerSelected(ccTeammates);
    const supabase = createClient();
    listProfilesByExceptId(currentUser?.id ?? "")
      .then(({ data }) => setAllProfiles(data || []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTeammatePicker]);

  // ── Employment policy fetch (probation check) ─────────────
  useEffect(() => {
    if (!currentUser || !selectedTypeId) { setEmploymentPolicy(null); return; }
    const supabase = createClient();
    getLeaveEmploymentPolicyByEmploymentTypeAndProbationStatusAndLeaveTypeId(currentUser.employment_type ?? "permanent", currentUser.probation_status ?? "not_applicable", selectedTypeId)
      .then(({ data }) => setEmploymentPolicy(data || null));
  }, [currentUser, selectedTypeId]);

  // ── Validation ────────────────────────────────────────────
  const validate = (): ValidationError => {
    if (!selectedType) return "Please select a leave type.";
    if (!startDate) return "Please select a start date.";
    if (!endDate) return "Please select an end date.";
    if (isBefore(new Date(endDate), new Date(startDate))) return "End date cannot be before start date.";
    if (daysRequested <= 0) return "Days requested must be greater than 0.";

    if (selectedType.gender_restriction !== "all") {
      const userGender = currentUser?.gender || "all";
      if (userGender !== selectedType.gender_restriction)
        return `This leave type is only available for ${selectedType.gender_restriction} employees.`;
    }

    if (currentUser?.probation_status === "active" && employmentPolicy) {
      if (!employmentPolicy.allowed)
        return `${selectedType.leave_name} cannot be used during probation period. Please contact HR.`;
      if (employmentPolicy.requires_hr)
        return `${selectedType.leave_name} requires HR approval during probation period. Your request will be flagged for HR review.`;
    }

    if (!selectedType.is_replacement_leave) {
      const effectiveRemaining = selectedBalance?.remaining_days ?? 0;
      if (daysRequested > effectiveRemaining)
        return `Insufficient balance. You have ${effectiveRemaining} day${effectiveRemaining !== 1 ? 's' : ''} remaining.`;
    }

    if (selectedType.max_days_per_request > 0 && daysRequested > selectedType.max_days_per_request)
      return `Maximum ${selectedType.max_days_per_request} days per request allowed.`;

    if (isHalfDay && !selectedType.half_day_allowed)
      return "Half-day leave is not allowed for this leave type.";

    if (!reason.trim()) return "Please provide a reason for your leave request.";

    // Check for overlap with existing active leave requests
    const conflictDays = requestableDates
      .filter((day) => {
        const key = format(day, "yyyy-MM-dd");
        const sel = daySelections[key] ?? "full";
        return sel !== "skip" && existingLeaveDates.has(key);
      })
      .map((day) => format(day, "dd MMM yyyy"));
    if (conflictDays.length > 0)
      return `You already have a leave request on: ${conflictDays.join(", ")}. Please select different dates.`;

    return null;
  };

  // ── Approver resolution ───────────────────────────────────
  const resolveApprovers = async (): Promise<{ a1: string | null; a2: string | null }> => {
    if (!currentUser) return { a1: null, a2: null };
    const supabase = createClient();

    const result = await resolveApprovalChain(supabase, currentUser.id);
    return {
      a1: result.firstApprover?.id ?? null,
      a2: result.finalApprover?.id ?? null,
    };
  };

  // ── Notify an approver ────────────────────────────────────
  const notifyApprover = async (
    requestId: string,
    approverId: string,
  ) => {
    if (!currentUser) return;
    const supabase = createClient();
    const { data: approverProfile } = await getProfileById(approverId, "full_name, email");

    const body = `${currentUser.full_name} has submitted a leave request for ${daysRequested} day(s) from ${format(new Date(startDate), "dd MMM yyyy")} to ${format(new Date(endDate), "dd MMM yyyy")}. Reason: ${reason}`;

    await insertLeaveNotification({
      leave_request_id: requestId,
      event_type: "request_submitted",
      recipient_id: approverId,
      recipient_email: approverProfile?.email,
      recipient_name: approverProfile?.full_name,
      subject: `Leave Request from ${currentUser.full_name}`,
      body,
    });

    await insertLeaveTaskAlert(supabase, {
      recipientId: approverId,
      alertType: "leave_pending_approval",
      title: `Leave Request from ${currentUser.full_name}`,
      body,
      leaveRequestId: requestId,
    });
  };

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) { setValidationError("Unable to identify current user. Please refresh and try again."); return; }
    const error = validate();
    if (error) { setValidationError(error); return; }
    setValidationError(null);
    setSubmitting(true);

    const supabase = createClient();
    try {
      const { a1, a2 } = await resolveApprovers();

      const { data: request, error: insertError } = await insertLeaveRequest({
          employee_id: currentUser.id,
          requested_by_id: currentUser.id,
          leave_type_id: selectedTypeId,
          start_date: startDate,
          end_date: endDate,
          days_requested: daysRequested,
          is_half_day: isSingleHalfDayRequest,
          half_day_period: isSingleHalfDayRequest ? halfDayPeriod : null,
          reason,
          status: "submitted",
          submission_date: new Date().toISOString(),
          approver_1_id: a1,
          approver_1_status: a1 ? "pending" : null,
          approver_2_id: a2 && a2 !== a1 ? a2 : null,
          approver_2_status: a2 && a2 !== a1 ? "pending" : null,
        });

      if (insertError) throw insertError;

      if (request && a1) {
        // Notify only the first approver in the chain
        // The second approver will be notified when the first approves
        await notifyApprover(request.id, a1);
      }

      onSuccess();
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : "Failed to submit request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────
  function setDaySelection(dateKey: string, selection: DaySelection) {
    setDaySelections((previous) => ({ ...previous, [dateKey]: selection }));
    setValidationError(null);
  }

  function resetDaySelection(dateKey: string) {
    setDaySelections((previous) => {
      const next = { ...previous };
      delete next[dateKey];
      return next;
    });
    setValidationError(null);
  }

  function removeTeammate(id: string) {
    setCcTeammates((prev) => prev.filter((t) => t.id !== id));
  }

  function addEmail() {
    const trimmed = emailInput.trim();
    if (trimmed && !ccEmails.includes(trimmed)) {
      setCcEmails((prev) => [...prev, trimmed]);
    }
    setEmailInput("");
  }

  function removeEmail(email: string) {
    setCcEmails((prev) => prev.filter((e) => e !== email));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => {
      const merged = [...prev, ...picked];
      return merged.slice(0, 5);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  if (loading) {
    return <div className="py-12 text-center text-muted-foreground">Loading leave types...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Page header (full width, above both columns) ─── */}
      {title && (
        <div className="leave-page-header">
          <div className="-ml-56">
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            {description && <p className="text-muted-foreground">{description}</p>}
          </div>
        </div>
      )}

      {/* ── Two-column grid: cards start flush at the same row ── */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      {/* ── LEFT: main form ──────────────────────────────── */}
      <div className="min-w-0 space-y-5">

        {/* 1. Request details */}
        <Card className="rounded-xl py-0 shadow-sm">
          <CardContent className="px-5 py-5 space-y-5">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <FileText className="h-4 w-4 text-slate-500" />
              <span className="font-medium">Request details</span>
            </div>

            {/* Period year + Leave type */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-900">Period year</Label>
                <Input
                  value={currentYear}
                  disabled
                  className="h-10 bg-slate-50 text-slate-500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-900">
                  Leave type <span className="text-red-500">*</span>
                </Label>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedTypeId}
                  onChange={(e) => { setSelectedTypeId(e.target.value); setValidationError(null); }}
                  required
                >
                  <option value="">Select leave type</option>
                  {selectableTypes.map((lt) => {
                    const bal = balances.find((b) => b.leave_type_id === lt.id);
                    return (
                      <option key={lt.id} value={lt.id}>
                        {lt.leave_name}{lt.is_paid ? "" : " (Unpaid)"}
                        {bal ? ` - ${bal.remaining_days} remaining` : ""}
                      </option>
                    );
                  })}
                </select>
                {selectedType?.requires_document && (
                  <p className="text-xs text-amber-600">Document required for this leave type.</p>
                )}
              </div>
            </div>

            {/* Start + End date */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-900">
                  Start date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const nextStartDate = e.target.value;
                    const nextEndDate =
                      !endDate || isBefore(new Date(endDate), new Date(nextStartDate))
                        ? nextStartDate
                        : endDate;
                    setStartDate(nextStartDate);
                    setEndDate(nextEndDate);
                    updateDateRange(nextStartDate, nextEndDate);
                    setValidationError(null);
                  }}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-900">
                  End date <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => {
                    const nextEndDate = e.target.value;
                    setEndDate(nextEndDate);
                    updateDateRange(startDate, nextEndDate);
                    setValidationError(null);
                  }}
                  required
                  className="h-10"
                />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-900">Reason</Label>
              <textarea
                className="min-h-[88px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Why are you taking this leave?"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setValidationError(null); }}
              />
            </div>
          </CardContent>
        </Card>

        {/* 2. Per-day selection */}
        <Card className="rounded-xl py-0 shadow-sm">
          <CardContent className="px-5 py-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <CalendarDays className="h-4 w-4 text-slate-500" />
                <span className="font-medium">Per-day selection</span>
              </div>
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                {requestableDates.length} {requestableDates.length === 1 ? "day" : "days"} in range
              </span>
            </div>

            <div className="flex items-start gap-2 text-xs text-slate-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Sundays and public holidays are auto-excluded. Click Override to include one.</span>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              {selectedDates.length === 0 ? (
                <div className="px-4 py-5 text-sm text-muted-foreground">
                  Select a start and end date to choose each day.
                </div>
              ) : (
                selectedDates.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const isSundayDay = isSunday(day);
                  const isHoliday = key in publicHolidays;
                  const excluded = (isSundayDay || isHoliday) && daySelections[key] == null;
                  const selection = daySelections[key] ?? "full";
                  return (
                    <div
                      key={key}
                      className={`flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 last:border-b-0${isHoliday ? " border border-red-300 rounded-md" : ""}`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {format(day, "EEE, MMM d, yyyy")}
                        </p>
                        {excluded && (
                          <p className={`text-xs ${isHoliday ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
                            {isHoliday ? `Public Holiday: ${publicHolidays[key]}` : "Auto-excluded Sunday"}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {isSundayDay || isHoliday ? (
                          daySelections[key] == null ? (
                            <Button
                              type="button"
                              variant="default"
                              size="xs"
                              onClick={() => setDaySelection(key, "full")}
                            >
                              Override
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => resetDaySelection(key)}
                            >
                              Reset
                            </Button>
                          )
                        ) : null}
                        {([
                          ["full", "Full"],
                          ["morning", "AM"],
                          ["afternoon", "PM"],
                          ["skip", "Skip"],
                        ] as [DaySelection, string][]).map(([value, label]) => {
                          const isDisabled = (isSundayDay || isHoliday) && daySelections[key] == null && value !== "skip";
                          return (
                            <Button
                              key={value}
                              type="button"
                              variant={selection === value ? "default" : "outline"}
                              size="xs"
                              disabled={isDisabled}
                              onClick={() => setDaySelection(key, value)}
                              className="min-w-10"
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. CC (optional) */}
        <Card className="rounded-xl py-0 shadow-sm">
          <CardContent className="px-5 py-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">
                  CC{" "}
                  <span className="font-normal text-muted-foreground text-xs">(optional)</span>
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Keep teammates or external contacts in the loop
              </span>
            </div>

            {/* Teammates */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Teammates
              </p>
              {ccTeammates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {ccTeammates.map((tm) => (
                    <span
                      key={tm.id}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
                    >
                      {tm.full_name}{tm.department ? ` · ${tm.department}` : ""}
                      <button
                        type="button"
                        onClick={() => removeTeammate(tm.id)}
                        className="hover:opacity-70 ml-0.5"
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
                className="gap-1 h-8 text-xs"
              >
                <Plus className="h-3 w-3" />
                Add teammate
              </Button>
            </div>

            {/* External emails */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                External emails
              </p>
              {ccEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {ccEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground px-2.5 py-0.5 text-xs"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeEmail(email)}
                        className="hover:opacity-70 ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                  className="text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addEmail} className="shrink-0">
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Attachments (optional) */}
        <Card className="rounded-xl py-0 shadow-sm">
          <CardContent className="px-5 py-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">
                  Attachments{" "}
                  <span className="font-normal text-muted-foreground text-xs">(optional)</span>
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Up to 5 files - 10 MB each</span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-10 w-full items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-slate-800 transition-colors hover:border-primary hover:text-foreground"
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

            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        ({(f.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.name)}
                      className="ml-2 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Balance indicator */}
        {isBalanceTracked && daysRequested > 0 && (
          <Card className={`rounded-xl py-0 shadow-sm ${isOverBalance ? 'border-red-300' : ''}`}>
            <CardContent className="px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Leave Balance
                </p>
                <p className={`text-xs font-medium ${isOverBalance ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {employmentPolicy?.monthly_accrual && !employmentPolicy?.usable ? (
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3 text-amber-600" />
                      {availableBalance} day{availableBalance !== 1 ? 's' : ''} accrued (locked)
                    </span>
                  ) : (
                    <>{availableBalance} day{availableBalance !== 1 ? 's' : ''} remaining</>
                  )}
                </p>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isOverBalance ? 'bg-red-500' : balanceRatio > 0.75 ? 'bg-amber-500' : 'bg-primary'}`}
                  style={{ width: `${balanceRatio * 100}%` }}
                />
              </div>
              {isOverBalance && (
                <p className="mt-1.5 text-xs text-red-600 font-medium">
                  Requesting {daysRequested} day{daysRequested !== 1 ? 's' : ''} — exceeds your balance by {balanceShortfall} day{balanceShortfall !== 1 ? 's' : ''}. Reduce your date range or contact HR.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Validation error */}
        {validationError && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {validationError}
          </div>
        )}
      </div>

      {/* ── RIGHT: summary panel ──────────────────────────── */}
      <div className="min-w-0 self-stretch">
        <div className="sticky top-3 space-y-3">
          <Card className="rounded-xl py-0 shadow-sm">
            <CardContent className="px-5 py-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                Summary
              </p>

              {/* Leave type */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-0.5">Leave type</p>
                <p className="text-sm font-medium text-slate-900">
                  {selectedType?.leave_name ?? <span className="text-muted-foreground">-</span>}
                </p>
              </div>

              {/* Date range */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-0.5">Date range</p>
                <p className="text-sm font-medium text-slate-900">
                  {startDate && endDate
                    ? `${format(new Date(startDate), "EEE, MMM d, yyyy")} - ${format(new Date(endDate), "EEE, MMM d, yyyy")}`
                    : <span className="text-muted-foreground">Pick a date range</span>}
                </p>
              </div>

              {/* Days requested + Remaining */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-xl border border-border bg-slate-50 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Days requested</p>
                  <p className="text-2xl font-bold leading-none text-primary">{daysRequested}</p>
                </div>
                <div className="rounded-xl border border-border bg-slate-50 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Remaining</p>
                  <p className="text-2xl font-bold leading-none">
                    {selectedType ? (
                      <span className={(availableBalance - daysRequested) < 0 ? "text-red-500" : "text-muted-foreground"}>
                        {availableBalance - daysRequested}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </p>
                </div>
              </div>

              <Button type="submit" disabled={submitting || isOverBalance} className="w-full mb-2">
                {submitting ? "Submitting..." : isOverBalance ? "Insufficient Balance" : "Submit request"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={submitting}
                className="w-full"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground shadow-sm">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
            <span>CC&apos;d teammates get an in-app notification. External emails are recorded with the request for reference.</span>
          </div>
        </div>
      </div>
      </div>{/* end two-column grid */}

      {/* ── Conflict alert dialog ─────────────────────────── */}
      {conflictDates.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-xl w-96 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <X className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Leave Date Conflict</h3>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              You already have an active leave request on the following date(s):
            </p>
            <ul className="mb-4 space-y-1 rounded-lg bg-red-50 px-4 py-3">
              {conflictDates.map((d) => (
                <li key={d} className="text-sm font-medium text-red-600">• {d}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mb-5">
              Please select different dates, or mark the conflicting days as <strong>Skip</strong> in the per-day selection below.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setConflictDates([])}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Insufficient balance dialog ──────────────────── */}
      {showBalanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-xl w-96 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <X className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Insufficient Leave Balance</h3>
            </div>
            <p className="text-sm text-slate-600 mb-5">
              Apply leave days exceeding leave balance. Contact HR.
            </p>
            <div className="flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => { setShowBalanceModal(false); balanceModalDismissed.current = true; }}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Teammate picker modal ──────────────────────────── */}
      {showTeammatePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTeammatePicker(false)}>
          <div className="bg-background rounded-xl shadow-xl w-80 max-h-[70vh] flex flex-col p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Select teammates</h3>
              <button type="button" onClick={() => setShowTeammatePicker(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Input
              autoFocus
              placeholder="Search by name or department..."
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              className="mb-3 h-9 text-sm"
            />
            <div className="overflow-y-auto flex-1 space-y-0.5">
              {allProfiles
                .filter((p) =>
                  p.full_name.toLowerCase().includes(pickerQuery.toLowerCase()) ||
                  (p.department && p.department.toLowerCase().includes(pickerQuery.toLowerCase()))
                )
                .map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted cursor-pointer text-sm"
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
                      <span className="block truncate">{p.full_name}</span>
                      {p.department && (
                        <span className="block text-[10px] text-muted-foreground truncate">{p.department}</span>
                      )}
                    </div>
                  </label>
                ))}
              {allProfiles.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-3">Loading staff list...</p>
              )}
            </div>
            <div className="mt-4 flex gap-2 justify-end pt-3 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowTeammatePicker(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => { setCcTeammates(pickerSelected); setShowTeammatePicker(false); }}
              >
                Add selected ({pickerSelected.length})
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
