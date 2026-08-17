# DCOS Payroll — Cambodia Statutory Compliance: Filing-Ready Exports

## 1. Why this document exists

A question about matching the employee payslip's print layout to an "official format" led to research into what Cambodian law actually requires. That research surfaced three real employer obligations the Payroll module didn't support, which this document scopes and records. It is a working reference for HR/Finance and future engineering work, not a legal opinion — see §5.

## 2. The three obligations

### 2.1 MLVT Enterprise Payroll Book (Prakas No. 111/25 & 113/25, issued 6 May 2025)

Replaces October 2001 rules. Employers must maintain a monthly payroll ledger using the **official MLVT template**, downloaded from the **Labor Automated Central Management System (LACMS)** portal (`lacms.mlvt.gov.kh`).

- **Required fields**: basic wage, number of normal working days, overtime pay, weekly holiday pay, other wage components.
- **QR code**: the filled ledger must be printed, **signed and stamped** with the company seal, then re-uploaded to LACMS to receive a legal-verification QR code, which is attached to the book.
- **Deadline**: monthly, by the **20th of the following month**.
- **Retention**: 3 years after the book is closed.
- **Penalty**: noncompliance risks monetary penalties under Labour Law Article 16.

### 2.2 GDT Tax-on-Salary (TOS) monthly return

Employers are the withholding agent for progressive TOS (0–20%). A monthly return reporting total salaries paid and tax withheld per employee must be filed with the General Department of Taxation.

- **Deadline**: ~20 days after month-end.
- **Retention**: 10 years.

### 2.3 NSSF monthly contribution declaration (Form D03)

Employee and employer NSSF contributions (pension, healthcare, occupational risk) must be declared monthly via NSSF's employer portal.

- **Deadline**: by the **15th of the following month**.
- **Wage base cap**: contributions above a statutory wage-base ceiling are not owed (ceiling configured in this system's NSSF Config screen, `nssf_rules.max_wage_base`).

## 3. Scope boundary — why this is an export feature, not an integration

None of LACMS, GDT, or NSSF expose a public API. LACMS in particular requires a manual human step (print → sign → stamp → re-upload → receive QR code) that cannot be automated. Attempting to script against a government portal without a sanctioned integration would be inappropriate and fragile.

**DCOS's role is therefore to generate correctly-shaped data exports from figures the payroll engine already calculates**, which HR/Finance then upload or re-key into each portal themselves. It is not, and should not be represented as, an automated filing or submission system.

## 4. What was built

Three CSV export builders in `apps/web/components/hr/payroll/payroll-helpers.ts`, surfaced as a **"Compliance Exports" tab** on the existing Payroll Reports page (`apps/web/app/dashboard/hr/payroll/reports/page.tsx`):

| Export | Builder | Source data |
|---|---|---|
| Enterprise Payroll Ledger (MLVT/LACMS) | `buildEnterprisePayrollLedgerCsv()` | `payroll_entries` (working days, present days, gross) joined to `payroll_entry_lines`/`payroll_component_types` for basic wage and OT split by type (`OT_150`, `OT_200`, `OT_HOLIDAY`) |
| GDT Tax-on-Salary Return | `buildGdtTosReturnCsv()` | `payroll_entries.gross_salary`, `tax_relief_khr`, `taxable_income`, `total_tos`, `exchange_rate` |
| NSSF Form D03 | `buildNssfD03Csv()` | `payroll_entries.total_nssf_ee`/`total_nssf_er`, wage base computed as `min(gross_salary, nssf_rules.max_wage_base)` from the active NSSF config |

A deadline reminder banner on the same tab shows the next LACMS/GDT/NSSF due dates for the selected period.

## 5. Explicit non-goals and open items

- **No automated submission** to LACMS, GDT, or NSSF. Exports are for manual upload/re-entry only.
- **Column mappings are based on published secondary guidance (KPMG, Tilleke & Gibbins, and other legal-update articles), not the actual official MLVT/GDT/NSSF template files** — those require a portal login this system doesn't have. HR/Finance should verify column order and labels against the real templates before relying on the export for a live filing.
- **Weekly holiday pay is not calculated.** This is a distinct statutory concept from `OT_HOLIDAY` (overtime *worked* on a holiday, which the system already tracks) — it's pay for the statutory weekly rest day itself. No reliable source for its exact entitlement/calculation rules was found during this research, and getting statutory pay math wrong carries real compliance risk, so the ledger export leaves this column blank for manual entry. If the company needs this computed automatically, it should be scoped separately with proper legal/payroll-policy input — not folded into an export-formatting change.
- **Record retention** (3 years for the LACMS book, 10 years for GDT records) requires no new engineering work — Supabase already retains `payroll_periods`/`payroll_entries` indefinitely unless someone manually deletes them.

## 6. Sources

- [MLVT: New payroll & enterprise book regulations — KPMG Cambodia](https://kpmg.com/kh/en/insights/2025/07/cambodia-labor-compliance-updates-kpmg-july2025.html)
- [Cambodia Issues New Requirements for Enterprise Payroll Books — Tilleke & Gibbins](https://www.tilleke.com/insights/cambodia-issues-new-requirements-for-enterprise-payroll-books/)
- [Cambodia: Mandatory Digital Payroll System Introduced — Library of Congress](https://www.loc.gov/item/global-legal-monitor/2025-06-16/cambodia-mandatory-digital-payroll-system-introduced)
- [Reminder on the MLVT's Requirements on Computerized Payroll Systems — Andersen in Cambodia](https://kh.andersen.com/publications/reminder-on-the-mlvts-requirements-on-computerized-payroll-systems/)
- [Payroll & HR Requirements in Cambodia — Acclime](https://cambodia.acclime.com/guides/payroll-hr-requirements/)
- [Cambodia Payroll Guide | Taxes & Compliance — Multiplier](https://www.usemultiplier.com/cambodia/payroll)
