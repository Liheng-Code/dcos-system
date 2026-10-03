// Loads what HR has to look at: employees with gaps, attendance days flagged for review,
// Telegram users waiting to be linked, and leave changed after payroll. Admin client only.

import type { createAdminClient } from "@/lib/supabase/server";
import { getBusinessDate } from "./attendance";
import { classifyReviewReason, setupGaps, type ReviewKind, type SetupGap } from "./attention";

type Admin = ReturnType<typeof createAdminClient>;

const REVIEW_WINDOW_DAYS = 90;
const REVIEW_LIMIT = 500;

export interface SetupItem {
  employeeId: string;
  employeeCode: string | null;
  fullName: string | null;
  gaps: SetupGap[];
}

export interface ReviewItem {
  id: string;
  employeeId: string;
  employeeCode: string | null;
  fullName: string | null;
  workDate: string;
  status: string;
  reason: string;
  kinds: ReviewKind[];
}

export interface TelegramItem {
  id: string;
  telegramName: string | null;
  telegramUsername: string | null;
  phone: string | null;
  reason: string;
  createdAt: string;
  candidates: { id: string; fullName: string | null }[];
}

export interface LeaveItem {
  id: string;
  employeeId: string;
  fullName: string | null;
  leaveType: string | null;
  startDate: string;
  endDate: string;
  why: "cancelled_after_approval" | "approved_after_payroll_lock";
}

export interface AttentionData {
  setup: SetupItem[];
  reviews: ReviewItem[];
  reviewTotal: number;
  telegram: TelegramItem[];
  leave: LeaveItem[];
}

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function loadSetup(supabase: Admin): Promise<SetupItem[]> {
  const day = getBusinessDate();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, employee_id, full_name, employment_category, labor_category, report_to")
    .eq("status", "active")
    .order("full_name");
  fail("profiles", error);
  const list = profiles ?? [];
  const ids = list.map((p: { id: string }) => p.id);
  if (ids.length === 0) return [];

  const current = `effective_to.is.null,effective_to.gte.${day}`;
  const [payroll, tax, nssf, bank, salary, shift, reporting] = await Promise.all([
    supabase.from("employee_payroll_profiles").select("employee_id").in("employee_id", ids),
    supabase.from("employee_tax_profiles").select("employee_id").in("employee_id", ids),
    supabase.from("employee_nssf_profiles").select("employee_id").in("employee_id", ids),
    supabase.from("employee_bank_accounts").select("employee_id").in("employee_id", ids),
    supabase.from("employee_salary_structures").select("employee_id").in("employee_id", ids).or(current),
    supabase.from("employee_shift_assignments").select("employee_id").in("employee_id", ids).or(current),
    supabase.from("reporting_structure").select("employee_id").in("employee_id", ids).is("effective_to", null),
  ]);
  for (const [name, res] of [["payroll", payroll], ["tax", tax], ["nssf", nssf], ["bank", bank], ["salary", salary], ["shift", shift], ["reporting", reporting]] as const) fail(name, res.error);

  const setOf = (res: { data: { employee_id: string }[] | null }) => new Set((res.data ?? []).map((r) => r.employee_id));
  const has = { payroll: setOf(payroll), tax: setOf(tax), nssf: setOf(nssf), bank: setOf(bank), salary: setOf(salary), shift: setOf(shift), reporting: setOf(reporting) };

  return list
    .map((p: { id: string; employee_id: string | null; full_name: string | null; employment_category: string | null; labor_category: string | null; report_to: string | null }) => ({
      employeeId: p.id,
      employeeCode: p.employee_id,
      fullName: p.full_name,
      gaps: setupGaps({
        employmentCategory: p.employment_category,
        laborCategory: p.labor_category,
        hasReportingManager: has.reporting.has(p.id) || p.report_to !== null,
        hasShift: has.shift.has(p.id),
        hasPayrollProfile: has.payroll.has(p.id),
        hasTaxProfile: has.tax.has(p.id),
        hasNssfProfile: has.nssf.has(p.id),
        hasBankAccount: has.bank.has(p.id),
        hasSalaryStructure: has.salary.has(p.id),
      }),
    }))
    .filter((item: SetupItem) => item.gaps.length > 0);
}

async function loadReviews(supabase: Admin): Promise<{ items: ReviewItem[]; total: number }> {
  const from = addDays(getBusinessDate(), -REVIEW_WINDOW_DAYS);
  const { data, error, count } = await supabase
    .from("attendance_daily")
    .select("id, employee_id, work_date, status, review_reason, employee:profiles!attendance_daily_employee_id_fkey(full_name, employee_id)", { count: "exact" })
    .eq("needs_review", true)
    .is("review_resolved_at", null)
    .gte("work_date", from)
    .order("work_date", { ascending: false })
    .limit(REVIEW_LIMIT);
  fail("attendance_daily", error);
  const rows = (data ?? []) as unknown as {
    id: string; employee_id: string; work_date: string; status: string; review_reason: string | null;
    employee: { full_name: string | null; employee_id: string | null } | null;
  }[];
  return {
    total: count ?? rows.length,
    items: rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeCode: r.employee?.employee_id ?? null,
      fullName: r.employee?.full_name ?? null,
      workDate: r.work_date,
      status: r.status,
      reason: r.review_reason ?? "",
      kinds: classifyReviewReason(r.review_reason),
    })),
  };
}

async function loadTelegram(supabase: Admin): Promise<TelegramItem[]> {
  const { data, error } = await supabase
    .from("telegram_link_requests")
    .select("id, telegram_name, telegram_username, phone, reason, candidate_employee_ids, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  fail("telegram_link_requests", error);
  const rows = (data ?? []) as { id: string; telegram_name: string | null; telegram_username: string | null; phone: string | null; reason: string; candidate_employee_ids: string[]; created_at: string }[];
  const candidateIds = [...new Set(rows.flatMap((r) => r.candidate_employee_ids))];
  const names = new Map<string, string | null>();
  if (candidateIds.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", candidateIds);
    for (const p of (people ?? []) as { id: string; full_name: string | null }[]) names.set(p.id, p.full_name);
  }
  return rows.map((r) => ({
    id: r.id,
    telegramName: r.telegram_name,
    telegramUsername: r.telegram_username,
    phone: r.phone,
    reason: r.reason,
    createdAt: r.created_at,
    candidates: r.candidate_employee_ids.map((id) => ({ id, fullName: names.get(id) ?? null })),
  }));
}

async function loadLeave(supabase: Admin): Promise<LeaveItem[]> {
  const select = "id, employee_id, start_date, end_date, approver_1_date, approver_2_date, employee:profiles!leave_requests_employee_id_fkey(full_name), leave_type:leave_types(leave_name)";
  type Row = {
    id: string; employee_id: string; start_date: string; end_date: string; approver_1_date: string | null; approver_2_date: string | null;
    employee: { full_name: string | null } | null; leave_type: { leave_name: string | null } | null;
  };
  const [reversal, approved, locked] = await Promise.all([
    supabase.from("leave_requests").select(select).eq("payroll_reversal_needed", true).is("payroll_followup_handled_at", null),
    supabase.from("leave_requests").select(select).eq("status", "approved").is("payroll_followup_handled_at", null),
    supabase.from("payroll_periods").select("start_date, end_date, locked_at").not("locked_at", "is", null),
  ]);
  fail("leave_requests", reversal.error ?? approved.error);
  fail("payroll_periods", locked.error);

  const item = (r: Row, why: LeaveItem["why"]): LeaveItem => ({
    id: r.id, employeeId: r.employee_id, fullName: r.employee?.full_name ?? null, leaveType: r.leave_type?.leave_name ?? null,
    startDate: r.start_date, endDate: r.end_date, why,
  });
  const out = new Map<string, LeaveItem>();
  for (const r of (reversal.data ?? []) as unknown as Row[]) out.set(r.id, item(r, "cancelled_after_approval"));

  // Approved after the payroll that covers it was already locked: that payroll did not see it.
  const periods = (locked.data ?? []) as { start_date: string; end_date: string; locked_at: string }[];
  for (const r of (approved.data ?? []) as unknown as Row[]) {
    const approvedAt = [r.approver_1_date, r.approver_2_date].filter(Boolean).sort().pop();
    if (!approvedAt || out.has(r.id)) continue;
    if (periods.some((p) => r.start_date <= p.end_date && r.end_date >= p.start_date && approvedAt > p.locked_at)) {
      out.set(r.id, item(r, "approved_after_payroll_lock"));
    }
  }
  return [...out.values()];
}

export async function loadAttention(supabase: Admin): Promise<AttentionData> {
  const [setup, reviews, telegram, leave] = await Promise.all([
    loadSetup(supabase), loadReviews(supabase), loadTelegram(supabase), loadLeave(supabase),
  ]);
  return { setup, reviews: reviews.items, reviewTotal: reviews.total, telegram, leave };
}
