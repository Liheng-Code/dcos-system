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

// ─── Cambodia compliance exports ───────────────────────────────────────────────
// See docs/04-Business-Modules/17-HR/17-5-Payroll/DCOS-Payroll-Cambodia-Compliance-Plan.md
// for the statutory background. These are data exports for manual upload/re-entry
// into the LACMS, GDT, and NSSF portals — not automated filings.

interface EnterpriseLedgerEntry {
  full_name: string;
  department: string;
  basic_wage: number;
  working_days: number;
  present_days: number;
  ot_150_pay: number;
  ot_200_pay: number;
  ot_holiday_pay: number;
  other_components: number;
  gross_salary: number;
}

/** MLVT/LACMS enterprise payroll ledger. "Weekly holiday pay" is left blank — not calculated (see plan doc). */
export function buildEnterprisePayrollLedgerCsv(periodLabel: string, entries: EnterpriseLedgerEntry[]): string {
  return toCsv(
    ["Employee", "Department", "Basic Wage", "Working Days", "Present Days", "OT 1.5x Pay", "OT 2.0x Pay", "Holiday OT Pay", "Weekly Holiday Pay (manual)", "Other Wage Components", "Gross Salary", "Period"],
    entries.map((e) => [
      e.full_name,
      e.department,
      e.basic_wage.toFixed(2),
      e.working_days,
      e.present_days,
      e.ot_150_pay.toFixed(2),
      e.ot_200_pay.toFixed(2),
      e.ot_holiday_pay.toFixed(2),
      "",
      e.other_components.toFixed(2),
      e.gross_salary.toFixed(2),
      periodLabel,
    ]),
  );
}

interface GdtTosEntry {
  full_name: string;
  gross_salary: number;
  tax_relief_khr: number;
  taxable_income: number;
  total_tos: number;
  exchange_rate: number;
}

/** GDT monthly Tax-on-Salary return, per employee. */
export function buildGdtTosReturnCsv(periodLabel: string, entries: GdtTosEntry[]): string {
  return toCsv(
    ["Employee", "Gross Salary (USD)", "Dependent Relief (KHR)", "Taxable Income (USD)", "Tax on Salary Withheld (USD)", "Exchange Rate (KHR/USD)", "Period"],
    entries.map((e) => [
      e.full_name,
      e.gross_salary.toFixed(2),
      e.tax_relief_khr.toFixed(0),
      e.taxable_income.toFixed(2),
      e.total_tos.toFixed(2),
      e.exchange_rate.toFixed(2),
      periodLabel,
    ]),
  );
}

interface NssfD03Entry {
  full_name: string;
  wage_base: number;
  nssf_ee: number;
  nssf_er: number;
}

/** NSSF Form D03 monthly contribution declaration, per employee. */
export function buildNssfD03Csv(periodLabel: string, entries: NssfD03Entry[]): string {
  return toCsv(
    ["Employee", "Contribution Wage Base (USD)", "Employee Contribution (USD)", "Employer Contribution (USD)", "Total Contribution (USD)", "Period"],
    entries.map((e) => [
      e.full_name,
      e.wage_base.toFixed(2),
      e.nssf_ee.toFixed(2),
      e.nssf_er.toFixed(2),
      (e.nssf_ee + e.nssf_er).toFixed(2),
      periodLabel,
    ]),
  );
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
