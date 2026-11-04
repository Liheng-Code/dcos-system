# 09 — Audit Requirements
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-AUD-001 | **Rev:** R0
Inherits the platform Audit Engine (append-only, snapshots, severity model).
This document defines module events, severity, and retention only.

---

## 1. Logged Events

| Action | module_code | Severity | Notes |
|---|---|---|---|
| IPC created | IPC | Medium | |
| Line qty updated | IPC | Low | old/new qty in changed_fields |
| Overrun flag triggered | IPC | High | comment captured |
| VO line added/removed | IPC | High | VO reference |
| Back-charge added/edited | IPC | High | |
| Submitted (internal) | IPC | Medium | |
| Returned to draft | IPC | Medium | comment mandatory |
| Approved (each step) | IPC | **High** | approver snapshot |
| Submitted to client | IPC | **High** | package document ID linked |
| Recalled after submission | IPC | **Critical** | comment mandatory |
| Certification recorded | IPC | **High** | per-line variance stored |
| Certification edited after save | IPC | **Critical** | requires Commercial Manager |
| Retention manual override | IPC | **Critical** | comment + rule snapshot |
| Marked invoiced / payment recorded | IPC | **High** | finance linkage |
| Package exported / downloaded | IPC | Medium | always log exports (platform rule) |

## 2. Snapshot Rules

- On Submit: full line-level snapshot stored (claimed state is legal evidence).
- On Certify: certified values stored separately — claimed snapshot never mutated.
- Deleting a draft IPC keeps audit rows with record snapshot (platform rule).

## 3. Retention

Financial event category → **7–10 years** per platform Data Retention Policy.
IPC audit history must survive project archive (claims/disputes may arise in DLP
and beyond — latent defect window).

## 4. Access

Audit timeline tab visible on every IPC to: QS Manager, PM, Project Director,
Accountant, Company Admin. QS Engineer sees own actions + status history.
Client portal: status history only (no internal comments).
