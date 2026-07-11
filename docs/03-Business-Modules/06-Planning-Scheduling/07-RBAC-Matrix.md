# 07 — RBAC Matrix
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/07-RBAC-Matrix.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## 1. Role Definitions (PLN-Relevant Roles)

| Role Code | Role Name | Description |
|---|---|---|
| PLANNER | Planner / Scheduler | Owns the programme. Full create/edit/submit access. |
| PM | Project Manager | Approves and monitors. Cannot create activities but approves workflow steps. |
| SITE_ENG | Site Engineer | Submits progress updates. Read-only programme access except progress entry. |
| CONS_MGR | Construction Manager | Reads programme and lookahead. No data modification. |
| QS | QS / Commercial Manager | Reads certified progress for IPC. No programme modification. |
| DOC_CTRL | Document Controller | Handles transmittal and client submission response only. |
| CLIENT | Client / PMC Representative | Read-only portal view of approved_client revisions only. |
| ADMIN | System Administrator | Full read access; can archive programmes. No data entry. |

---

## 2. Feature-Level Permission Matrix

Legend: **C** = Create | **R** = Read | **U** = Update | **D** = Delete/Soft-delete | **—** = No access

### 2.1 Programme Management

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| View programme list | R | R | R | R | R | R | R (approved only) | R |
| Create programme | C | — | — | — | — | — | — | — |
| Edit programme (name, dates) | U | — | — | — | — | — | — | — |
| Soft-delete programme | D | D | — | — | — | — | — | — |
| View programme dashboard (PLN-02) | R | R | R | R | R | R | R (approved only) | R |

### 2.2 Activity Management

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| View activities | R | R | R | R | R | — | R (approved only) | R |
| Create activity | C | — | — | — | — | — | — | — |
| Edit activity (dates, name, responsible) | U | — | — | — | — | — | — | — |
| Drag Gantt bar to change dates | U | — | — | — | — | — | — | — |
| Cancel activity | U | U | — | — | — | — | — | — |
| Put activity on hold | U | U | — | — | — | — | — | — |
| Mark activity complete | U | U | — | — | — | — | — | — |
| Revert completed to in_progress | U | U | — | — | — | — | — | — |
| View CPM results (read-only) | R | R | R | R | — | — | — | R |

### 2.3 Dependency Management

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| View dependencies | R | R | R | R | — | — | — | R |
| Create / edit / delete dependency | C U D | — | — | — | — | — | — | — |

### 2.4 Baseline Management

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| View baselines | R | R | — | — | R | — | R (client_accepted only) | R |
| Set contract baseline | C | C | — | — | — | — | — | — |
| Create revised baseline | C | C | — | — | — | — | — | — |
| Activate a baseline | U | U | — | — | — | — | — | — |
| Export baseline snapshot | R | R | — | — | R | — | — | R |

### 2.5 Progress Updates

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| Submit progress update | C | — | C | — | — | — | — | — |
| View pending updates (PLN-05) | R | R | R (own only) | — | — | — | — | — |
| Confirm progress update | U | — | — | — | — | — | — | — |
| Reject progress update | U | — | — | — | — | — | — | — |
| Submit correction request | C | C | C | — | — | — | — | — |
| Advance data date | U | U | — | — | — | — | — | — |

### 2.6 Lookahead

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| View lookahead | R | R | R | R | — | — | — | R |
| Generate new lookahead | C | — | — | — | — | — | — | — |
| Publish lookahead | U | — | — | — | — | — | — | — |
| Mark lookahead item complete | U | — | U | — | — | — | — | — |
| Close lookahead (record PCR) | U | U | — | — | — | — | — | — |

### 2.7 Delay Events

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| View delay events | R | R | — | — | — | — | R (agreed/under_review only) | R |
| Create delay event | C | C | — | — | — | — | — | — |
| Edit delay event | U | U | — | — | — | — | — | — |
| Transition delay event status | U | U | — | — | — | — | — | — |

### 2.8 Programme Workflow

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| Submit for internal review | U | — | — | — | — | — | — | — |
| Approve internal | — | U | — | — | — | — | — | — |
| Reject internal | — | U | — | — | — | — | — | — |
| Submit to client | U | — | — | — | — | — | — | — |
| Record client acceptance | — | U | — | — | — | U | — | — |
| Record client rejection | — | U | — | — | — | U | — | — |
| Activate programme (draft → active) | U | U | — | — | — | — | — | — |
| Archive programme | — | — | — | — | — | — | — | U |

### 2.9 S-Curve and Reports

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| View S-curve (PLN-09) | R | R | — | — | R | — | R (approved only) | R |
| Export S-curve PDF/CSV | R | R | — | — | R | — | — | R |
| View monthly progress report | R | R | — | — | R | — | — | R |

### 2.10 Programme Import

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| Run dry-run import | C | — | — | — | — | — | — | — |
| Confirm import | C | — | — | — | — | — | — | — |

### 2.11 IPC Integration Endpoint

| Action | PLANNER | PM | SITE_ENG | CONS_MGR | QS | DOC_CTRL | CLIENT | ADMIN |
|---|---|---|---|---|---|---|---|---|
| Read IPC progress endpoint | — | R | — | — | R | — | — | — |

---

## 3. Four-Eyes Principle Enforcement

The following actions enforce the four-eyes rule — the approver must be a different user from the submitter. This is enforced at the API layer, not just the UI:

| Action | Submitter | Approver | System Check |
|---|---|---|---|
| Programme internal approval | PLANNER | PM | `approver_id ≠ submitted_by` on pln_programmes |
| Progress update confirmation | SITE_ENG or PLANNER | PLANNER | `reviewed_by ≠ created_by` on pln_progress_updates |
| Baseline activation | PLANNER (creates) | PM (activates — if different from creator) | Not strictly enforced in Phase 2 if Planner and PM are the same person on small projects; flag as exception in audit log |

---

## 4. Client Portal Scope

**Confirmed decision (OQ-4):** Client/PMC Representatives have an in-app read-only view scoped strictly to `approved_client` programme revisions.

**What the CLIENT role can see:**
- Programmes with status `approved_client` or `active` (if the active programme has a `client_accepted` baseline)
- S-curve for the approved baseline only
- Gantt chart (read-only, no interaction)
- Delay events with status `agreed` or `under_review`
- Programme dashboard KPI tiles (planned vs actual progress, schedule status, data date)

**What the CLIENT role cannot see:**
- Draft or internally-submitted revisions
- Pending progress updates
- Internal rejection reasons
- Delay events with status `open` or `disputed`
- Cost or resource data
- Baseline detail beyond the `client_accepted` baseline

**RLS enforcement:** A Supabase RLS policy on `pln_programmes` includes the condition:
```sql
(status in ('approved_client', 'active')) AND auth.jwt()->>'role' = 'CLIENT'
```
Combined with tenant_id check. Applied similarly to pln_activities and pln_baselines for CLIENT role.

---

## 5. Role Assignment

Roles are assigned at the project level in `project_team_members.role`. A user may have different roles on different projects. The PLN module reads role from the JWT claims enriched by the project membership lookup.

A user with the ADMIN role at the organisation level has read access to all project PLN data regardless of project team membership, but cannot modify data.
