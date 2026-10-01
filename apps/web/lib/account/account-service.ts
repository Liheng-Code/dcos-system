// Data access for the Account / Finance module: every query and write its
// screens make goes through here. Functions return the Supabase query itself,
// so callers await it (or call .then) and read `{ data, error }` as usual.
//
// Access is enforced in the database: see the account_* policies in
// supabase/migrations/20261001000001_account_permissions_and_rls.sql. A call
// the signed-in user is not permitted to make returns no rows or an error.

import { createClient } from "@/lib/supabase/client";

type Row = Record<string, unknown>;

const db = () => createClient();

// ── Chart of accounts ────────────────────────────────────────────────────────

export function listCoaAccounts() {
  return db().from("account_coa").select("*").order("sort_order");
}

/** Accounts offered as a parent in the account form. */
export function listCoaParentOptions() {
  return db().from("account_coa").select("id, code, name, type").order("sort_order");
}

/** Accounts offered on a journal line. */
export function listCoaPostingOptions() {
  return db().from("account_coa").select("id, code, name").order("code");
}

export function createCoaAccount(payload: Row) {
  return db().from("account_coa").insert([payload]);
}

export function updateCoaAccount(id: string, payload: Row) {
  return db().from("account_coa").update(payload).eq("id", id);
}

export function deleteCoaAccount(id: string) {
  return db().from("account_coa").delete().eq("id", id);
}

// ── AP invoices ──────────────────────────────────────────────────────────────

export function listApInvoices() {
  return db().from("account_ap_invoices").select("*").order("created_at", { ascending: false });
}

export function createApInvoice(payload: Row) {
  return db().from("account_ap_invoices").insert([payload]);
}

export function updateApInvoice(id: string, payload: Row) {
  return db().from("account_ap_invoices").update(payload).eq("id", id);
}

// ── AR invoices ──────────────────────────────────────────────────────────────

export function listArInvoices() {
  return db().from("account_ar_invoices").select("*").order("created_at", { ascending: false });
}

export function createArInvoice(payload: Row) {
  return db().from("account_ar_invoices").insert([payload]);
}

export function updateArInvoice(id: string, payload: Row) {
  return db().from("account_ar_invoices").update(payload).eq("id", id);
}

// ── Payment vouchers ─────────────────────────────────────────────────────────

export function listPaymentVouchers() {
  return db().from("account_payment_vouchers").select("*").order("created_at", { ascending: false });
}

export function createPaymentVoucher(payload: Row) {
  return db().from("account_payment_vouchers").insert([payload]);
}

export function updatePaymentVoucher(id: string, payload: Row) {
  return db().from("account_payment_vouchers").update(payload).eq("id", id);
}

// ── Journal entries ──────────────────────────────────────────────────────────

export function listJournalEntries() {
  return db().from("account_journal_entries").select("*").order("entry_date", { ascending: false });
}

/** Creates the entry header and returns it (its id is needed for the lines). */
export function createJournalEntry(payload: Row) {
  return db().from("account_journal_entries").insert([payload]).select().single();
}

export function updateJournalEntry(id: string, payload: Row) {
  return db().from("account_journal_entries").update(payload).eq("id", id);
}

export function createJournalLines(lines: Row[]) {
  return db().from("account_journal_lines").insert(lines);
}

export function deleteJournalLines(entryId: string) {
  return db().from("account_journal_lines").delete().eq("entry_id", entryId);
}

// ── Bank accounts ────────────────────────────────────────────────────────────

export function listBankAccounts() {
  return db().from("account_bank_accounts").select("*").order("bank_name");
}

export function createBankAccount(payload: Row) {
  return db().from("account_bank_accounts").insert([payload]);
}

export function updateBankAccount(id: string, payload: Row) {
  return db().from("account_bank_accounts").update(payload).eq("id", id);
}

export function deleteBankAccount(id: string) {
  return db().from("account_bank_accounts").delete().eq("id", id);
}

// ── Payment runs ─────────────────────────────────────────────────────────────

export function listPaymentRuns() {
  return db().from("account_payment_runs").select("*").order("run_date", { ascending: false });
}

export function createPaymentRun(payload: Row) {
  return db().from("account_payment_runs").insert([payload]);
}

export function updatePaymentRun(id: string, payload: Row) {
  return db().from("account_payment_runs").update(payload).eq("id", id);
}

// ── Withholding tax ──────────────────────────────────────────────────────────

export function listWithholdingTax() {
  return db().from("account_withholding_tax").select("*").order("tax_date", { ascending: false });
}

export function createWithholdingTax(payload: Row) {
  return db().from("account_withholding_tax").insert([payload]);
}

export function updateWithholdingTax(id: string, payload: Row) {
  return db().from("account_withholding_tax").update(payload).eq("id", id);
}

// ── Cash forecast ────────────────────────────────────────────────────────────

export function listCashForecast() {
  return db().from("account_cash_forecast").select("*").order("forecast_date");
}

export function createCashForecast(payload: Row) {
  return db().from("account_cash_forecast").insert([payload]);
}

// ── Reports (database views) ─────────────────────────────────────────────────

export function getCashFlowSummary() {
  return db().from("account_cash_flow_summary").select("*").order("forecast_date");
}

export function getApAging() {
  return db().from("account_ap_aging").select("*").order("due_date");
}

export function getArAging() {
  return db().from("account_ar_aging").select("*").order("due_date");
}

export function getBalanceSheet() {
  return db().from("account_balance_sheet").select("*").order("sort_order");
}

export function getProfitLoss() {
  return db().from("account_profit_loss").select("*").order("sort_order");
}

export function getTrialBalance() {
  return db().from("account_trial_balance").select("*").order("code");
}

export function getBudgetVsActual() {
  return db().from("account_budget_vs_actual").select("*").order("project_name");
}

/** The 500 most recent general-ledger lines. */
export function getGeneralLedger() {
  return db().from("account_gl_ledger").select("*").order("entry_date", { ascending: false }).limit(500);
}

// ── Currencies and exchange rates ────────────────────────────────────────────

export function listCurrencies() {
  return db().from("currencies").select("*").order("code");
}

/** The 50 most recent exchange rates. */
export function listExchangeRates() {
  return db().from("exchange_rates").select("*").order("effective_date", { ascending: false }).limit(50);
}

export function createExchangeRate(payload: Row) {
  return db().from("exchange_rates").insert(payload);
}

// ── Pick-lists read from other modules ───────────────────────────────────────

export function listProjectOptions() {
  return db().from("projects").select("id, project_name, project_code").order("project_name");
}

export function listSupplierOptions() {
  return db().from("procurement_suppliers").select("id, company_name").order("company_name");
}

export function listClientOptions() {
  return db().from("stakeholders").select("id, organization_name, contact_person").order("organization_name");
}
