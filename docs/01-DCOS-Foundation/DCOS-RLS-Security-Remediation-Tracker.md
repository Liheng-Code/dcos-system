# RLS Security Remediation Tracker

**Status:** 🟡 Owned, scope/priority confirmed — remediation phases themselves not yet started
**Opened:** 2026-07-21
**Origin:** Discovered during the QS-SOP-003 DWL↔BOQ integration session while investigating the `/api/procurement/[resource]` authorization gap. See [12-Quantity-Surveying/09-Session-Status-DWL-BOQ-Integration.md](../03-Business-Modules/12-Quantity-Surveying/09-Session-Status-DWL-BOQ-Integration.md).
**Owner of this tracker:** lihengpouth@gmail.com — confirmed 2026-07-21 as the tracker's decision-maker, and the domain-risk priority ordering in §5 (Finance/Contracts/Tender/HSE/HR first) as the accepted sequencing. **Not yet triggered:** the ADR (system-architect) and the per-domain remediation phases are still unstarted — owning the tracker is not the same as authorizing that work to begin; it needs an explicit go-ahead the same way the procurement-proxy fix did.

This is deliberately a *tracking* document, not a remediation PR. The scope is too large and cross-cutting to fold into any single module's work stream — it needs its own scoped effort, sequenced by risk.

---

## 1. Finding

Many Supabase RLS policies across the schema are written as:

```sql
CREATE POLICY "..." ON public.some_table FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

This grants any authenticated user full read/write/delete on the table, regardless of project, role, or ownership — RLS is enabled (satisfying the "RLS is on" checklist item) but enforces nothing. Combined with service-role API proxies (like the procurement route fixed in this session), permissive RLS removes the last line of defense: if a proxy route's own permission check is wrong or missing, the database was never going to stop it either.

## 2. Measured scope (direct grep against `supabase/migrations`, 2026-07-21)

- **48** migration files contain at least one `USING (true)` policy
- **377** individual `CREATE POLICY ... USING (true)` statements
- **231** distinct tables affected

This refines the earlier estimate from the session doc ("282+ occurrences across 56+ migration files" — an approximation made while investigating the procurement route). The numbers above come from a direct regex scan of `CREATE POLICY ... ON public.<table> ... USING (true)` and should be treated as the current source of truth; re-run the scan before starting remediation in case new migrations landed since.

## 3. Important nuance — not all 231 are equally risky

Two different things are bundled under "`USING (true)`":

- **Reference/lookup/config tables** (e.g. `building_codes`, `discipline_codes`, `zone_type_codes`, `currencies`, `leave_types`, `stage_master`, `level_naming_templates`) — permissive **read** access to org-wide reference data is often a reasonable design choice, not a vulnerability. The risk there is mainly on the write side (any authenticated user can also insert/update/delete these).
- **Transactional, financial, contractual, and PII-bearing tables** (finance/`account_*`, `contract_*`, `qs_*`/`tender_*` commercial data, HSE incidents, HR/leave/overtime, subcontracts) — here `USING (true)` means any authenticated user can read or mutate rows belonging to any project or any other user, which is a real cross-tenant/cross-project exposure.

Remediation should prioritize the second group and can defer (or even intentionally keep, with a documented exception) permissive **read** policies on genuine reference tables.

## 4. Tables by domain (appendix, grouped for assigning remediation owners)

| Domain | Table count | Representative tables |
|---|---|---|
| Finance / Accounts (`account_*`) | 13 | account_ap_invoices, account_journal_entries, account_payment_vouchers, account_bank_accounts |
| Currency / FX | 4 | currencies, exchange_rates, fx_transactions, currency_exposure_ledger |
| Contracts | 5 | contract_register, contract_employer_instructions, contractual_notices, entitlement_register |
| QS / Commercial / BOQ (`qs_*`) | 18 | qs_boq_items, qs_variation_orders, qs_progress_claims, qs_retention_ledger, qs_cost_transactions |
| Tender (`tender_*`) | 21 | tender_boq_items, tender_bid_summaries, tender_award_records, tender_price_list |
| Bid evaluation | 2 | bid_evaluations, bid_evaluation_scores |
| Rate libraries | 6 | unit_rate_library, rate_libraries, company_rate_library(_lines), prelim_library_items/components |
| Budgeting | 4 | budget_codes, budget_code_groups, budget_package_sections, budget_running_numbers |
| Suppliers (pre-qual/performance) | 4 | supplier_pq_records, supplier_pq_documents, supplier_performance_scores, supplier_approved_trades |
| Procurement (`procurement_*`) | 13 | procurement_prs, procurement_pos, procurement_rfqs, procurement_quotations |
| Design & BIM | 23 | design_rfi, design_drawings, design_mep_*, design_str_*, design_arc_*, bim_models |
| Site execution / QA-QC | 12 | site_daily_reports, inspection_requests, itps, ncrs, delay_register |
| HSE | 5 | hse_incidents, hse_permits, hse_risk_assessments, hse_toolbox_talks |
| Subcontracts | 7 | subcontracts, subcontract_ipcs, subcontract_variations, subcontract_back_charges |
| Documents / Transmittals / Markups | 14 | documents, transmittals, drawing_markups, markup_annotations |
| WBS / Planning / Tasks / Reporting | 24 | wbs_nodes, wbs_tasks, task_constraints, weekly_plans, kpi_snapshots, report_schedules |
| Stakeholders / Project setup / Config | 31 | stakeholders, projects, project_team_members, role_permissions, user_roles, profiles |
| HR / Leave / Overtime / Attendance | 24 | employee_master_lists, leave_types, overtime_requests, attendance_types |

Total ≈ 231 tables (see §2). Full per-table list is reproducible with the grep in §2 — not duplicated here to avoid this doc going stale.

## 5. Recommended remediation sequencing

1. **ADR: canonical RLS pattern** — `system-architect` to define the standard scoping predicate(s) DCOS should use going forward (project membership via `project_team_members`/`stakeholder` mappings, role-based CRUD via `role_permissions`, org/tenant isolation). One decision record, reused by every domain below, so 231 tables don't each get a bespoke policy design.
2. **Prioritize by risk**, not by file order:
   - **First:** Finance/Accounts, Contracts, Tender/Bid (pre-award confidentiality), HSE incidents, HR/Leave/Overtime — sensitive, financial, or legally exposed data.
   - **Then:** QS/Commercial, Procurement, Subcontracts, Design/BIM, Site execution, Documents.
   - **Last, or deferred entirely:** genuine reference/lookup/config tables (see §3) — narrow the write policies but reads can likely stay permissive.
3. **`database-engineer` implements per-domain**, as separate migrations/PRs — not one 231-table migration. Each PR should be independently testable and revertable.
4. **Add a regression guard** — a CI check or test that fails when a new migration introduces `USING (true)` (or `WITH CHECK (true)`) without an explicit `-- reference-table: permissive read is intentional` style comment, so this doesn't silently recur.
5. **Revisit other service-role proxy routes** — the procurement route wasn't necessarily unique; grep for other `createAdminClient()` usages gated only on "is logged in". *Update 2026-07-21: the procurement route itself is now fully retired (not narrowed — deleted), since its one real caller didn't need the service-role indirection at all. If another proxy route is found, prefer deleting it in favor of the caller using the RLS-governed client directly, same as here, over narrowing its allow-list.*

## 6. Status

| Step | Owner | Status |
|---|---|---|
| Confirm this tracker's scope/priority with stakeholder | You | ✅ Done (2026-07-21) |
| ADR: canonical RLS pattern | system-architect | ⬜ Not started |
| Finance/Contracts/Tender/HSE/HR remediation (high priority) | database-engineer | ⬜ Not started |
| QS/Procurement/Subcontracts/Design/Site remediation | database-engineer | ⬜ Not started |
| Documents/WBS/Stakeholders/reference-table remediation | database-engineer | ⬜ Not started |
| CI guard against future `USING (true)` | database-engineer | ⬜ Not started |
| Audit other service-role proxy routes | backend-engineer | ⬜ Not started |

---

*This tracker should be updated in place as phases complete — don't create a new dated copy per session.*
