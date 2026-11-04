# DCOS — Module 04-11 Procurement
## Document 07 — Permission Matrix

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-07 |
| Version | R1 |
| Depends On | 03-02 RBAC, 03-01 Authentication |
| Status | For Development |

---

## 1. Permission Model

Effective permission is the intersection of four dimensions, per R0 §9.4:

```text
Effective = Role permission
          ∩ Project access
          ∩ Discipline / WBS scope
          ∩ Workflow responsibility (am I the current approver?)
          ∩ Value band (am I authorised for this amount?)
```

A Procurement Manager on Project A has no visibility of Project B. A Project Manager who is not in the approval chain for a specific PR can view it but cannot approve it. A user authorised to 50,000 cannot approve 50,001 — the band is a hard ceiling, not a guideline.

**Two controls override every grant in this document:**

- **Segregation of duties (BR-18):** the preparer of a record is removed from its approver list regardless of role.
- **Sealed bids (BR-07):** no role, including Super Admin, can read commercial quotation data before the dual-custody opening. This is the only permission in DCOS that Super Admin does not hold.

---

## 2. Permission Codes

| Code | Description |
|---|---|
| `proc.mr.*` | Material requisition |
| `proc.pr.*` | Purchase requisition |
| `proc.budget.override.*` | Budget override request / endorse / approve |
| `proc.rfq.*` | RFQ lifecycle |
| `proc.rfq.open` | Participate in dual-custody bid opening |
| `proc.quote.*` | Quotation entry and evaluation |
| `proc.cba.*` | Comparative bid analysis |
| `proc.po.*` | Purchase order |
| `proc.po.approve.band{N}` | Approve PO within value band N |
| `proc.amendment.*` | PO amendment |
| `proc.calloff.*` | Blanket call-off |
| `proc.expedite.*` | Expediting log |
| `proc.receipt.*` | Gate receipt |
| `proc.match.*` | Three-way match exception handling |
| `proc.config.*` | Module configuration |
| `proc.report.*` | Reports and exports |

Action suffixes: `view` · `create` · `edit` · `submit` · `approve` · `reject` · `cancel` · `close` · `export`.

---

## 3. Core Permission Matrix

Legend: **F** Full · **C** Create · **E** Edit own/draft · **V** View · **A** Approve (within band) · **—** No access · **S** Scoped (own records or own WBS/discipline only)

| Role | MR | PR | Budget Override | RFQ | Bid Open | Quote Eval | CBA | PO | PO Approve | Amend | Call-Off | Expedite | Receipt | Match | Config | Reports |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Super Admin | V | V | V | V | — | V | V | V | — | V | V | V | V | V | F | F |
| Company Admin | V | V | A | V | ✔ | V | V | V | A (band 5) | A | V | V | V | V | F | F |
| Project Director | V | A | A | V | ✔ | V | A | V | A (band 4) | A | V | V | V | A | E | F |
| Commercial Manager | V | A | A | V | ✔ | V | A | V | A (band 4) | A | V | V | V | A | — | F |
| Project Manager | V | A | V | V | ✔ | V | A | V | A (band 3) | A | A | V | V | A | E (project) | F |
| Procurement Manager | C | C E A | V | F | ✔ | F | F | F | A (band 2) | C E A | A | F | V | A | E (project) | F |
| Procurement Officer | C | C E | C | C E | ✔ | C E | C E | C E | — | C E | C | F | V | E | — | V S |
| QS / Cost Engineer | V | C E | C, endorse | V | ✔ | V (comm.) | E, endorse | V | — | V | V | V | V | A | — | F |
| Discipline Lead (ARC/STR/MEP) | A S | V S | — | V S | — | E S (tech) | V S | V S | — | V S | — | V S | V | — | — | V S |
| Engineer | C S | V S | — | V S | — | — | — | V S | — | — | C S | V S | C | — | — | V S |
| Site Supervisor | C S | V S | — | — | — | — | — | V S | — | — | C S | V S | C | — | — | V S |
| Storekeeper | V | V | — | — | — | — | — | V | — | — | V | V | F | V | — | V S |
| QA/QC Inspector | V | — | — | — | — | E (tech) | V | V | — | — | — | V | E | — | — | V S |
| Accountant | V | V | V | V | — | V | V | V | — | V | V | V | V | F | — | F |
| Finance Manager | V | V | V | V | — | V | V | V | — | V | V | V | V | A | — | F |
| HSE Officer | — | — | — | — | — | E (HSE docs) | — | V | — | — | — | — | — | — | — | V S |
| Document Controller | V | V | — | V | — | — | V | V | — | V | — | — | — | — | — | V |
| Subcontractor User | — | — | — | — | — | — | — | V (own) | — | — | — | — | — | — | — | — |
| Supplier User (portal) | — | — | — | V (own RFQ) | — | C (own quote) | — | V (own PO) | — | V (own) | V (own) | E (own ASN) | — | V (own) | — | — |
| Client / Consultant | — | — | — | — | — | — | — | V ¹ | — | — | — | — | — | — | — | V ¹ |
| Viewer | V | V | — | V | — | — | V | V | — | V | V | V | V | — | — | V |

¹ Client/Consultant visibility of POs is **off by default** and enabled per project only where the contract requires open-book or cost-plus disclosure. Turning it on is a project-level configuration change with a CRITICAL audit event.

---

## 4. Value Band Authority

| Band | PO Value (base currency) | Permission Code | Default Holders |
|---|---:|---|---|
| 1 | ≤ 1,000 | `proc.po.approve.band1` | Procurement Manager |
| 2 | 1,001 – 10,000 | `proc.po.approve.band2` | Procurement Manager, Project Manager |
| 3 | 10,001 – 50,000 | `proc.po.approve.band3` | Project Manager, QS Manager, Project Director |
| 4 | 50,001 – 250,000 | `proc.po.approve.band4` | Project Director, Commercial Manager, Company Admin |
| 5 | > 250,000 | `proc.po.approve.band5` | Company Admin, Board Approver |

**Rules:**

- Holding band N implies bands 1 through N−1.
- A record carrying a budget override, single-source flag, or non-lowest award requires the band **plus one**.
- Band 5 approval requires step-up authentication (AAL 3) without exception.
- Bands are evaluated on the **base-currency** value at the FX rate on the approval date, not on the transaction currency.
- Delegation of a band (holiday, site absence) is time-bounded, recorded as a delegation grant, and audited. A delegate cannot sub-delegate.

---

## 5. Data Scope Rules

| Scope | Rule |
|---|---|
| Tenant | Enforced by RLS on `company_id` from the `tid` claim. Not enforceable in application code alone. |
| Project | Enforced by RLS on `project_id` against the `prj` claim. Out-of-scope records return 404. |
| WBS | Roles marked **S** see only records whose `wbs_node_id` falls within their `wbs_scope` subtree. A drywall subcontractor sees Level 3–7 Zone B, not the tower. |
| Discipline | Discipline Leads see records tagged to their discipline plus any record they are named on. |
| Own records | Engineers and Site Supervisors see MRs they raised or that are attached to a task assigned to them. |
| Supplier | Portal users see only rows where `supplier_id` matches their organisation, enforced by RLS policy, not by query filter. |
| Commercial data | Rates, totals, and margins are hidden from `Engineer`, `Site Supervisor`, and `Storekeeper` roles by default — they see quantity and delivery status, not price. Configurable per company. |

That last rule is a deliberate choice. A storekeeper needs to know 4,200 kg arrived. A storekeeper does not need to know what the company paid per kilogram, and neither does the supplier's driver standing next to the screen.

---

## 6. Field-Level Restrictions

| Field | Restricted From | Reason |
|---|---|---|
| `quotation.quoted_total_txn` and all quote line rates | **Everyone** before opening | BR-07 bid integrity |
| `purchase_order_line.unit_rate_txn` | Engineer, Site Supervisor, Storekeeper, Subcontractor | Commercial confidentiality |
| `boq_allowable_rate` | All roles except QS, Procurement Manager+, Commercial, Finance, Directors | Reveals tender margin |
| `cba.estimated_saving_base` | All roles except QS, Commercial, Directors | Commercial sensitivity |
| Supplier bank details | All roles except Finance Manager and Company Admin; change requires dual approval | Fraud control |
| `pr_budget_override.narrative` | Supplier, Client, Subcontractor | Internal commercial reasoning |
| `po_expediting_log.notes` | Supplier portal users | Contains internal risk assessment of that supplier |

---

## 7. Actions Requiring Step-Up Authentication (AAL 3)

Per 03-01 §6.2, a fresh challenge within the last five minutes:

| Action | Threshold |
|---|---|
| Approve PO | Value ≥ configured threshold (default 50,000 base) |
| Approve PO amendment | New total ≥ threshold, or any value increase ≥ 20% |
| Confirm bid opening (second authoriser) | Always |
| Approve budget override | Always |
| Approve single-source award | Always |
| Approve non-lowest award | Value ≥ band 3 |
| Change approval value bands | Always |
| Bulk export of PO or quotation data | > 500 records |
| Approve emergency PO retrospectively | Always |

The step-up assertion id is written onto the approval record. Without it, an approval is a database row. With it, it is evidence.

---

## 8. Segregation of Duties Matrix

Enforced by the system, not by policy. Each row is a combination the system rejects for the **same record**.

| Cannot Do Both | Enforcement |
|---|---|
| Prepare PR + Approve that PR | `CHECK (prepared_by <> approved_by)` + approver list filter |
| Prepare PO + Approve that PO | Same, `trg_po_sod_check` |
| Enter a quotation + Evaluate that quotation commercially | Evaluator list excludes the entering user |
| Initiate bid opening + Confirm bid opening | `CHECK (initiated_by <> confirmed_by)` |
| Raise budget override + Approve that override | Approver list filter |
| Confirm gate receipt + Confirm the GRN for the same delivery | Enforced across module boundary via 04-12 |
| Resolve a match exception + Approve the resulting variance | Approver list filter |
| Create a supplier record + Issue the first PO to that supplier | Enforced across module boundary via 04-10 |

Where a project team is too small to satisfy a rule (a two-person site office), the exception must be granted at company level, is time-bounded, and appears on the monthly control exception report. It is never silently waived.

---

## 9. Permission Inheritance and Delegation

| Mechanism | Rule |
|---|---|
| Role stacking | A user holding multiple roles receives the union of grants and the **maximum** value band |
| Project override | A project-level role assignment overrides the company default for that project only |
| Delegation | Time-bounded (`valid_from` / `valid_to`), single-level, audited on grant and on every use |
| Acting-up | A temporary band elevation requires Company Admin approval and expires automatically |
| External expiry | Supplier and consultant grants inherit `access_valid_to` from the contract end date (03-01 D8) |
| Deactivation | On user deactivation, pending approvals and open PRs must be reassigned before the account closes (03-01 §8.6) |

---

## 10. Audit of Permission Use

| Event | Severity |
|---|---|
| Approval performed | HIGH |
| Approval performed at delegated authority | HIGH — records both delegate and delegator |
| Band ceiling rejection (attempted over-band approval) | HIGH |
| SoD rejection | HIGH |
| Sealed-bid read attempt before opening | **CRITICAL** |
| Bid opening executed | **CRITICAL** |
| Commercial field access by a restricted role | HIGH |
| Value band configuration change | **CRITICAL** |
| SoD exception granted | **CRITICAL** |
| Client/Consultant PO visibility enabled on a project | **CRITICAL** |
| Bulk export > 500 records | HIGH |

---

## 11. Default Role Bundles for Deployment

| Bundle | Roles Included | Typical Company Size |
|---|---|---|
| Minimal | Procurement Officer, Procurement Manager, PM, QS, Storekeeper | < 50 staff, one project |
| Standard | Above + Project Director, Discipline Leads, QA/QC, Accountant, Document Controller | 50–300 staff |
| Full | Above + Commercial Manager, Finance Manager, HSE, supplier portal, client visibility | 300+ staff, multi-project |

The Minimal bundle inevitably breaks segregation of duties on small projects. Deploy it with the SoD exception register switched on from day one, so the exceptions are visible rather than discovered during the first audit.

---

*Digital Construction Operating System — Procurement — Doc 07 Permission Matrix — Internal Controlled Document*
