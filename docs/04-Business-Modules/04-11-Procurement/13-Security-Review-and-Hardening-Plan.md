# Procurement — Security Review and Hardening Plan

| | |
|---|---|
| Document | 04-11 / 13 |
| Revision | R0 — 2026-10-22 |
| Status | Decisions D1–D6 taken 2026-10-22 (section 6: all as recommended). **P0+P1 built** 2026-10-22 on `feat/procurement-hardening`: migrations `20261022130910`, `…130911`, `…134300`, `…140500`; SQL suite `tests/13-p1-hardening-tests.sql` (153 pass). **P2 built** 2026-10-22: migrations `20261022150000`, `…150100`, `…151500`, `…153000`; SQL suite `tests/13-p2-business-rules-tests.sql` (123 pass) + `tests/13-p2-numbering-parallel.sh`. Bands convert at the approval-date rate from the procurement-owned `procurement_fx_rates` (decision R2). Remaining gaps are listed in the migration headers (`…140500`, `…151500`) |
| Basis | Local DB (`pg_policies`, `pg_proc`, columns, row counts) and code as of commit `17c5e24`; as-built map `.claude/skills/dcos-architecture/references/procurement.md`; business rules in `01-Business-Requirement.md` and `07-Permission-Matrix.md` |

## 1. Verdict

Procurement works end to end in the UI (PR → RFQ → quotation → award → PO → GRN → invoice match). It is **not safe to release**. Every business rule except the RFQ award runs in the browser, and the database lets any signed-in user read, change or delete any procurement record. A user with a browser console can approve their own PR, rewrite a PO amount after approval, delete an RFQ, or read sealed quotations before the closing date. Fixing this is a database-first job: lock the tables down, then move every status change into server-side functions.

## 2. The tenancy model this design assumes

DCOS runs as **one dedicated deployment per customer**: its own Supabase project and its own Vercel app (licensing design, `DCOS-Licensing-Control-Plane-Design.md`). There is no shared multi-tenant database.
- `projects` has no `tenant_id` or `company_id`.
- Only `procurement_suppliers` carries a `tenant_id`.
- There is one company in `profiles`.

So the isolation boundary inside a deployment is **permission + project access**, not `tenant_id`. Checklist item C ("every table has `tenant_id`") does not apply. Adding `tenant_id` to procurement tables would be work with no protection gained, and it is excluded from this plan. The stray `tenant_id` filter in `lib/inventory/inv-service.ts` is a bug to remove (P0), not a pattern to copy.

## 3. Findings

Severity: **Critical** = exploitable now by any signed-in user; **High** = breaks a stated business rule; **Medium** = integrity or maintainability.

| # | Sev | Finding | Evidence | Rule |
|---|---|---|---|---|
| F1 | Critical | 15 of 17 procurement tables have `using (true)` / `with check (true)` for select, insert, update and delete for any authenticated user. | `pg_policies`; first migration says "MVP; tighten later" | 07 §1 |
| F2 | Critical | PR, PO and budget-confirmation approvals are plain client `update`s of `approval_status` / `status` / `approved_by`. Anyone can approve anything, including their own. | `pr-detail.tsx`, `po-detail.tsx`; no server function | BR-18, 07 |
| F3 | Critical | Records can be hard-deleted by anyone (delete policy `true`). | `pg_policies` | BR-16 |
| F4 | High | Sealed bids aren't sealed. Quotation amounts are readable by every user before the RFQ closes. | `procurement_quotations` / `_items` select `true` | BR-07 |
| F5 | High | The award function checks the rules, but the same award columns (`status`, `awarded_supplier_id`, `is_awarded`) can be written directly, bypassing it. | award RPC is `security invoker`; rfq update policy `true` | BR-09 |
| F6 | High | The award reason length doesn't match the business rule. BR-09 requires ≥ 50 characters when the award isn't to the lowest compliant bidder; the function requires 20 for an override and 50 only for a single source. | `20261022101310_procurement_rfq_comparison.sql` | BR-09 |
| F7 | High | Anyone can insert into `procurement_audit_log` (with check `true`), so the audit trail can be forged. The real entries come from `proc_audit_trigger`, a security definer function, so clients don't need insert. | `pg_policies` | Audit, 09 |
| F8 | High | No value-band authority. Any approver can approve a PO of any value. | no band check in code or DB | BR-05, 07 §4 |
| F9 | High | PO numbers are generated client-side as max+1 (`po-form.tsx`), so two buyers can get the same number. The award function uses another scheme (`PO-YYYY-<hex>`). Neither matches the documented `{PROJ}-PO-{YYYY}-{NNNN}`. PRs have the same problem. | `po-form.tsx`, `pr-form.tsx`, award RPC | 02 numbering |
| F10 | High | A PO can be issued to a supplier without PQ approval for the trade. No check was found. | award RPC, `po-detail.tsx` | BR-06 |
| F11 | Medium | Records aren't scoped to projects. A site engineer on project A sees project B's POs. Only 3 `project_members` rows exist (2 of 14 projects), so strict project scoping today would lock most users out. | `project_members` counts | 07 §1 |
| F12 | Medium | Confirmed column bugs: `inv-service.ts` filters `procurement_pos.tenant_id` (doesn't exist); `account-service.ts:221` selects `procurement_suppliers.company_name` (it's `supplier_name`). | local DB columns | — |
| F13 | Medium | Procurement writes `qs_boq_items` / `qs_boq_sections` directly, bypassing QS. | `procurement-queries.ts` | Boundaries |
| F14 | Medium | Budget confirmations have no audit trigger. | `information_schema.triggers` | 09 |

**What's already right (keep it):**
- `has_permission(module, action, field)` and the `role_permissions` rows for procurement (pr, po, rfq, supplier, goods_receipt, invoice, inventory, notifications, audit_log).
- `proc_audit_trigger` on 13 tables.
- The PR over-requisition trigger.
- The award function's checks (permission, creator ≠ awarder, valid quotation, atomic PO creation).

## 4. Target design

Three layers. Each one is enforced by the database, so a modified client can't skip it.

### 4.1 Table access (RLS): who may see or touch a row at all
Replace every `true` policy with permission checks. Wrap the call in a sub-select so Postgres evaluates it once per query, not once per row:

```sql
create policy proc_prs_select on public.procurement_prs for select to authenticated
  using ((select has_permission('procurement','pr','view')));
create policy proc_prs_insert on public.procurement_prs for insert to authenticated
  with check ((select has_permission('procurement','pr','can_create')));
create policy proc_prs_update on public.procurement_prs for update to authenticated
  using ((select has_permission('procurement','pr','edit')));
-- no delete policy: delete is refused (BR-16). Cancel through the transition function.
```

| Table group | Resource for `has_permission` | Notes |
|---|---|---|
| `procurement_prs`, `_pr_items`, budget confirmations (+ items) | `pr` | |
| `procurement_rfqs`, `_rfq_suppliers` | `rfq` | |
| `procurement_quotations`, `_quotation_items` | `rfq` | select also needs the RFQ closing time to have passed, or the user to have `rfq.approve` (BR-07, sealed bids) |
| `procurement_pos`, `_po_items`, `_po_revisions` | `po` | |
| `procurement_delivery_notes`, `_goods_receipts` | `goods_receipt` | |
| `procurement_invoice_matches` | `invoice` | |
| `procurement_suppliers` | `supplier` | master data, not project-scoped |
| `procurement_audit_log` | `audit_log` view only | **no insert policy**: the security definer trigger writes it |
| `procurement_notifications` | unchanged (`recipient_id = auth.uid()`) | insert only from the definer notify triggers |

Item tables take their parent's rule. Admins pass because `has_permission` returns true for `is_admin`.

### 4.2 State changes: how status moves
- **Every status, approval and award column becomes writable only inside server functions.** One guard trigger per workflow table, the same pattern as `tender_lock_guard`:

```sql
create or replace function public.proc_transition_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('dcos.proc_transition', true), '') <> 'on' and (
       to_jsonb(new) ->> 'status'          is distinct from to_jsonb(old) ->> 'status'
    or to_jsonb(new) ->> 'approval_status' is distinct from to_jsonb(old) ->> 'approval_status'
    or to_jsonb(new) ->> 'approved_by'     is distinct from to_jsonb(old) ->> 'approved_by'
    or to_jsonb(new) ->> 'is_awarded'      is distinct from to_jsonb(old) ->> 'is_awarded'
    or to_jsonb(new) ->> 'awarded_supplier_id' is distinct from to_jsonb(old) ->> 'awarded_supplier_id')
  then
    raise exception 'PROC_TRANSITION_RPC_ONLY: change % status through its procurement function', tg_table_name
      using errcode = 'P0001';
  end if;
  return new;
end $$;
```

- **One `security definer` function per document type**: `procurement_transition_pr(p_id, p_to, p_reason)`, `…_po`, `…_budget_confirmation`, `…_invoice_match`. Each one:
  1. checks the allowed transition (a table in the function, mirroring `tender-lifecycle.ts`), with a compare-and-set on the current status;
  2. checks the permission field for that step: submit → `submit`, approve → `approve`, reject → `reject`, cancel → `edit`;
  3. enforces **segregation of duties**: the approver ≠ `created_by` and ≠ the submitter (BR-18). PRs and POs need a `created_by uuid default auth.uid()` and `submitted_by` column, added additively;
  4. for PO approval, checks the **value band** (F8, BR-05): a new `procurement_approval_bands` config table (band, min, max, permission action such as `po_band3`), checked against the PO total in base currency. Role stacking gives the maximum band (07 §184);
  5. requires a reason for reject and cancel;
  6. sets `set_config('dcos.proc_transition','on', true)`, performs the update, and writes the event.
- **The award function** becomes `security definer` behind the same guard, keeping its checks. Its override reason minimum goes to **50** to match BR-09, unless the user decides otherwise (D3).
- **Numbering:** `procurement_next_number(p_kind, p_project_id)` (security definer) uses a `procurement_number_seq` table (kind, project_id, year, last_no) with `update … returning` inside the transaction, so it can't race. Format `{PROJ}-PO-{YYYY}-{NNNN}`, same for PR and RFQ. Existing numbers stay as they are. The `po_number` unique index already exists.
- **Supplier eligibility:** PO approve and issue checks the supplier's PQ is approved for the trade and not expired (BR-06), behind a feature flag in config until the PQ data is complete (D4).

### 4.3 Project scope: whose projects (later phase)
- Add `project_id` to RFQs (copied from the PR by trigger) so every workflow row resolves to a project. Quotations and items resolve through their RFQ, POs through their own `project_id`.
- Select policy becomes `has_permission(...) and (is_project_member(project_id) or has_permission('procurement','<res>','configure'))`. Procurement HQ staff with `configure` see all projects.
- This only goes live after `project_members` is populated. Today 2 of 14 projects have members. That needs a separate core decision (D1).

## 5. Phased plan

Every migration is add-only, uses a timestamped name, is dry-run first, and is run in a Procurement lane (`/lanes start procurement:hardening`). P1 changes behaviour for every procurement screen, so it ships with the client changes in the same lane.

| Phase | What | DB | Code | Done when |
|---|---|---|---|---|
| **P0** Bug fixes (small, now) | F12 column bugs; F7 audit-log insert; F14 audit on budget confirmations | drop `procurement_audit_log` insert policy; add `proc_audit_trigger` on budget confirmation tables | `inv-service.ts`: remove the `tenant_id` filter on POs (Inventory core request); `account-service.ts`: `supplier_name` (Account core request) | GRN against a PO works; AP supplier list loads; a client insert into the audit log is refused |
| **P1** Lock writes (critical) | F1–F3, F5 | permission RLS (4.1) without project scope; no delete policies; `proc_transition_guard` on prs, pos, budget confirmations, invoice matches, rfqs, quotations; transition functions with SoD; award → definer; `created_by` / `submitted_by` columns | `pr-detail`, `po-detail`, budget confirmation and invoice-match screens call the transition functions; delete buttons become Cancel with reason | Direct status `update` from the console fails with `PROC_TRANSITION_RPC_ONLY`; a creator can't approve their own PR/PO; delete fails; every screen still works for a user with the right role |
| **P2** Business rules | F4, F6, F8, F9 | sealed-bid select rule; award override minimum 50; `procurement_approval_bands` + band check; `procurement_next_number` | award dialog text and validation; PR/PO forms get their number from the server; band settings page (Administration, core request) | Quotes are hidden before closing; a PO above the approver's band is refused; two simultaneous POs get different numbers |
| **P3** Project scope | F11 | `project_id` on RFQs; project-scoped select | — | Needs D1 first |
| **P4** Boundaries and eligibility | F10, F13 | PQ eligibility check behind a flag | Procurement → QS writes through a `lib/qs/public.ts` function (QS core request; cross-module, so an Agent Team or the main window) | Procurement no longer writes `qs_boq_*` directly |

**Rollback:** each phase is one migration plus its client change on one lane branch. Before merging, take `scripts/db-backup.ps1`. The guard trigger can be disabled in an emergency (`alter table … disable trigger …`) without dropping data.

## 6. Decisions (taken 2026-10-22: all as recommended)

| # | Decision | Decided |
|---|---|---|
| D1 | Project scoping (P3): who fills `project_members` for the 12 projects without members, and should procurement be project-scoped at all? | Defer P3. Ship P0–P2 permission-only (still a large improvement), and decide membership as a core (Project module) task. |
| D2 | Hard delete: allow deleting a **draft** by its creator, or never delete (BR-16)? | Never delete; cancel with a reason, as BR-16 says. |
| D3 | Award override reason: 50 characters (BR-09) or keep 20? | 50, to follow the approved business rule. |
| D4 | Supplier PQ eligibility (BR-06): enforce now or behind a flag? | Behind a flag, off until supplier PQ records are complete. |
| D5 | Value bands (BR-05): use the 07 §4 bands as the default config? | Yes, seeded as config and editable by admins (audit severity CRITICAL per 07 §204). |
| D6 | Step-up authentication for large PO approvals (BR-17, AAL 3) | Out of scope here; it needs platform auth work first. |

## 7. Tests

- **SQL (run in a rolled-back transaction, as `authenticated` with a test user's JWT claims):**
  - direct status update → error;
  - creator approves own PR → error;
  - delete → refused;
  - insert into the audit log → refused;
  - quotation select before closing → no rows;
  - PO above the approver's band → error;
  - 50 parallel `procurement_next_number` calls → no duplicates.
- **Vitest:** transition tables and band selection as pure functions in `lib/procurement/` (mirroring the SQL, like `rfq-comparison.ts`).
- **Manual:** each procurement screen with a role that has view only, create only, approve only, and admin.

## 8. Handoff

Start with P0 and P1 in one Procurement lane: `/lanes start procurement:hardening`, with this document as the task. Its two core requests (Inventory `inv-service.ts`, Account `account-service.ts`) are one-line fixes for the main window at merge time. After merging, update `.claude/skills/dcos-architecture/references/procurement.md` §2, §4 and §6.
