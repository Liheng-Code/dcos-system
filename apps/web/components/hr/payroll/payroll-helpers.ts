import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Notifications ────────────────────────────────────────────────────────────

export type PayrollEventType =
  | "period_created"
  | "payroll_calculated"
  | "submitted_to_finance"
  | "submitted_to_director"
  | "director_approved"
  | "payroll_locked"
  | "payroll_exported"
  | "payroll_paid"
  | "payroll_rejected";

/**
 * Queue payroll notifications for all users holding any of the given role codes
 * (e.g. ["HR"], ["AC"], ["L0","L1","L2"]).
 */
export async function notifyPayrollRoles(
  supabase: SupabaseClient,
  periodId: string,
  eventType: PayrollEventType,
  roleCodes: string[],
  subject: string,
  body: string,
) {
  const { data: roleUsers } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role_code", roleCodes);
  const userIds = [...new Set((roleUsers ?? []).map((r) => r.user_id as string))];
  if (userIds.length === 0) return;

  const { data: recipients } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  const rows = (recipients ?? []).map((p) => ({
    period_id: periodId,
    event_type: eventType,
    recipient_id: p.id,
    recipient_email: p.email,
    recipient_name: p.full_name,
    subject,
    body,
  }));
  if (rows.length > 0) await supabase.from("payroll_notifications").insert(rows);
}

/**
 * Queue a payroll notification for specific employees (e.g. "your salary was paid").
 */
export async function notifyPayrollEmployees(
  supabase: SupabaseClient,
  periodId: string,
  eventType: PayrollEventType,
  employeeIds: string[],
  subject: string,
  body: string,
) {
  if (employeeIds.length === 0) return;
  const { data: recipients } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", employeeIds);

  const rows = (recipients ?? []).map((p) => ({
    period_id: periodId,
    event_type: eventType,
    recipient_id: p.id,
    recipient_email: p.email,
    recipient_name: p.full_name,
    subject,
    body,
  }));
  if (rows.length > 0) await supabase.from("payroll_notifications").insert(rows);
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface BankCsvEntry {
  full_name: string;
  net_salary: number;
  bank_name: string;
  account_number: string;
  account_name: string;
}

/** Bank transfer file: one row per employee with net pay and bank details. */
export function buildBankTransferCsv(periodLabel: string, entries: BankCsvEntry[]): string {
  return toCsv(
    ["Employee", "Bank", "Account Number", "Account Name", "Net Salary (USD)", "Period"],
    entries.map((e) => [
      e.full_name,
      e.bank_name,
      e.account_number,
      e.account_name,
      e.net_salary.toFixed(2),
      periodLabel,
    ]),
  );
}

interface JournalEntry {
  full_name: string;
  department: string;
  gross_salary: number;
  total_tos: number;
  total_nssf_ee: number;
  total_nssf_er: number;
  total_deductions: number;
  net_salary: number;
}

/** Payroll journal: debit/credit lines per employee for accounting import. */
export function buildPayrollJournalCsv(periodLabel: string, entries: JournalEntry[]): string {
  const rows: (string | number)[][] = [];
  for (const e of entries) {
    rows.push([periodLabel, e.full_name, e.department, "Salary Expense", "DR", e.gross_salary.toFixed(2)]);
    rows.push([periodLabel, e.full_name, e.department, "NSSF Expense (Employer)", "DR", e.total_nssf_er.toFixed(2)]);
    if (e.total_tos > 0) rows.push([periodLabel, e.full_name, e.department, "Tax on Salary Payable", "CR", e.total_tos.toFixed(2)]);
    if (e.total_nssf_ee > 0) rows.push([periodLabel, e.full_name, e.department, "NSSF Payable (Employee)", "CR", e.total_nssf_ee.toFixed(2)]);
    if (e.total_nssf_er > 0) rows.push([periodLabel, e.full_name, e.department, "NSSF Payable (Employer)", "CR", e.total_nssf_er.toFixed(2)]);
    const otherDeductions = e.total_deductions - e.total_tos - e.total_nssf_ee;
    if (otherDeductions > 0.005) rows.push([periodLabel, e.full_name, e.department, "Other Deductions Payable", "CR", otherDeductions.toFixed(2)]);
    rows.push([periodLabel, e.full_name, e.department, "Salaries Payable (Net)", "CR", e.net_salary.toFixed(2)]);
  }
  return toCsv(["Period", "Employee", "Department", "Account", "DR/CR", "Amount (USD)"], rows);
}

// ─── Seniority ────────────────────────────────────────────────────────────────

export interface SeniorityRule {
  days_per_payment: number;
  payment_months: number[];
  min_service_months: number;
}

export function monthsOfService(joinDate: Date, asOf: Date): number {
  return (asOf.getFullYear() - joinDate.getFullYear()) * 12 + (asOf.getMonth() - joinDate.getMonth());
}

/**
 * Cambodia seniority payment for a period month.
 * Returns the payment in the same currency as dailyRate, or 0 if not due/eligible.
 */
export function calculateSeniorityPay(
  rule: SeniorityRule | null,
  periodMonth: number,
  joinDate: string | null,
  periodEnd: Date,
  dailyRate: number,
): number {
  if (!rule || !rule.payment_months.includes(periodMonth)) return 0;
  if (!joinDate) return 0;
  if (monthsOfService(new Date(joinDate), periodEnd) < rule.min_service_months) return 0;
  return Math.round(dailyRate * rule.days_per_payment * 100) / 100;
}
