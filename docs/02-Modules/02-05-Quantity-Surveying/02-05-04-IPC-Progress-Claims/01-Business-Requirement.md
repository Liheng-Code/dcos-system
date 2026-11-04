# 01 — Business Requirement
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-BR-001 | **Rev:** R0 | **Status:** Draft
**Author:** ____ | **Reviewed by:** ____ | **Approved by:** ____ | **Date:** ____

---

## 1. Purpose

The IPC (Interim Payment Certificate) module manages the monthly progress claim
cycle from measurement of completed work through submission, client certification,
and payment tracking. It is the formal mechanism by which the company converts
completed work into revenue.

## 2. Business Context

In construction contracts, the contractor is paid monthly against work completed,
not on project completion. Each month the QS measures completed quantities against
the Contract BOQ, adds approved variations, deducts retention and advance recovery,
and submits a formal claim to the client/consultant. The client certifies (often a
different value than claimed) and pays against the certified amount.

Today this process lives in Excel. Problems:
- No link between site progress data and claimed quantities — double entry.
- Claimed vs certified differences are not tracked — no negotiation history.
- Retention balances are computed manually — errors and disputes.
- No visibility of cumulative claim position per project for management.

## 3. Key Stakeholders

| Role | Involvement |
|---|---|
| QS Engineer | Prepares draft IPC, measures quantities |
| QS Manager / Commercial Manager | Reviews and approves internal IPC |
| Project Manager | Endorses claim before submission |
| Client / Consultant (PMC) | Reviews, adjusts, certifies |
| Accountant | Records receivable, matches payment |
| Project Director | Views cumulative claim position |

## 4. Business Objectives

1. Produce a complete, accurate IPC in < 2 working days (currently 5–7).
2. Zero manual retention calculation — system-computed per contract terms.
3. Full claimed-vs-certified history per BOQ item for negotiation evidence.
4. Real-time cumulative contract position: original + variations + certified to date.
5. Automatic feed to Accounting (AR invoice) and Retention module.

## 5. Scope

**In scope:** head-contract IPC (claim to client); claim preparation, internal
approval, submission, certification recording, payment status; retention deduction
(calculated by Retention module, displayed here); advance recovery; back-charges;
approved variation inclusion.

**Out of scope (other modules):** subcontractor IPC (Module 19); retention release
workflow (Module 22); variation valuation (Module 34/Contract Admin); cash receipt
posting (Module 23 Accounting).

## 6. Dependencies

| Depends on | Why |
|---|---|
| BOQ Engine (Module 20) | Contract BOQ items + rates are the basis of measurement |
| WBS Engine | Quantities measured per WBS location roll up to BOQ items |
| Variation Order | Approved VOs added to claim at certified value |
| Retention Module | Retention % rules and running balance |
| Approval Workflow Engine | Internal review chain |
| Document Control | Submitted IPC package is a controlled document |

## 7. Success Criteria

- First live project produces 3 consecutive monthly IPCs in the system with no
  parallel Excel run.
- Certified-vs-claimed variance report accepted by Commercial Manager as audit
  evidence.
- Retention balance in system matches client statement within 1 cycle.

## 8. Assumptions & Constraints

- One IPC per project per period (monthly default; configurable).
- Contract BOQ must be locked (approved) before first IPC can be created.
- Currency = contract currency; FX handled by Module 43 when active.

## 9. Open Questions

| # | Question | Owner | Due |
|---|---|---|---|
| 1 | Do we support milestone-based (non-BOQ) claims in v1? | Commercial Mgr | ____ |
| 2 | Is client certification entered manually or via client portal access? | PM | ____ |
