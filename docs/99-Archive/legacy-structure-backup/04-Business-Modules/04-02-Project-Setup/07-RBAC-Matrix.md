# DCOS — Project Setup Module
## 07 — RBAC Matrix

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-RBAC-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | Security Architect |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-FS-001 |

---

## 1. Permission Model

```
User permission = Role permission + Project access + Discipline access + Workflow responsibility
```

Project Setup has a dual relationship with this formula: it **consumes** it (who may edit a project) and **produces** its second dimension (the team roster in `project_team_members` *is* the project-access grant consumed by every other module). Assigning a user to a project here is a security action, not an HR convenience — which is why roster changes are High-severity audit events.

## 2. Permission Catalogue

| Permission | Description |
|---|---|
| `project.create` | Create project shell / run wizard |
| `project.edit` | Edit project profile fields |
| `project.status.request` | Request a status transition |
| `project.status.approve` | Approve a status transition |
| `project.team.manage` | Add/remove team members, change roles |
| `project.contract.edit` | Create/edit contract header (draft) |
| `project.contract.revise` | Submit contract revisions |
| `project.contract.revise.approve` | Approve contract revisions |
| `project.numbering.configure` | Create/edit numbering rules (pre-lock) |
| `project.numbering.lock` | System-level; humans never unlock |
| `project.calendar.edit` | Edit calendar and holidays |
| `project.milestone.manage` | CRUD milestones, record achieve/miss |
| `project.archive` | Move CLOSED → ARCHIVED |
| `tender.manage` | Register/edit tenders |
| `bid.record` | Record bid submissions and results |
| `project.view.full` | Full project detail view |
| `project.view.summary` | Summary card only (external parties) |

## 3. Role × Permission Matrix

Legend: ✓ granted · — denied · **C** conditional (footnoted)

| Permission | Super Admin | Company Admin | Director | PM | Discipline Mgr | QS | Doc Controller | Engineer | Client/Consultant | Viewer |
|---|---|---|---|---|---|---|---|---|---|---|
| project.create | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| project.edit | ✓ | ✓ | ✓ | C¹ | — | — | — | — | — | — |
| project.status.request | ✓ | ✓ | ✓ | C¹ | — | — | — | — | — | — |
| project.status.approve | ✓ | C² | ✓ | — | — | — | — | — | — | — |
| project.team.manage | ✓ | ✓ | ✓ | C¹ | — | — | — | — | — | — |
| project.contract.edit | ✓ | ✓ | ✓ | C¹ | — | C¹ | — | — | — | — |
| project.contract.revise | ✓ | ✓ | ✓ | — | — | C¹ | — | — | — | — |
| project.contract.revise.approve | ✓ | — | ✓ | — | — | — | — | — | — | — |
| project.numbering.configure | ✓ | ✓ | — | — | — | — | C¹ | — | — | — |
| project.calendar.edit | ✓ | ✓ | — | C¹ | — | — | — | — | — | — |
| project.milestone.manage | ✓ | ✓ | ✓ | C¹ | — | C¹ | — | — | — | — |
| project.archive | ✓ | ✓ | — | — | — | — | — | — | — | — |
| tender.manage | ✓ | ✓ | ✓ | — | — | C³ | — | — | — | — |
| bid.record | ✓ | ✓ | ✓ | — | — | C³ | — | — | — | — |
| project.view.full | ✓ | ✓ | ✓ | C¹ | C¹ | C¹ | C¹ | C¹ | — | C⁴ |
| project.view.summary | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C⁵ | C⁴ |

**Footnotes:**
1. **C¹ — Assigned project only.** Grant applies only to projects where the user has an active `project_team_members` row (start ≤ today ≤ end/null).
2. **C² — Company Admin approval scope.** May approve status transitions except COMPLETED/CANCELLED on projects above a configurable contract-value threshold, which require Director.
3. **C³ — Tender team membership.** QS with tender-team department assignment.
4. **C⁴ — Granted projects only,** read-only.
5. **C⁵ — Own projects only:** external stakeholder linked as client/consultant on that project sees the summary card exclusively.

## 4. Row-Level Rules

| Rule | Enforcement |
|---|---|
| Tenant isolation | RLS `tenant_id` policy on all 15 tables; tenant from JWT, never request body |
| Assigned-project scoping | View/edit queries join `project_team_members` for C¹ roles at API layer + RLS-assisted predicate |
| Client summary scope | External users resolve through `project_stakeholders` link; API serves the summary projection only — no raw table access |
| Super Admin cross-tenant | Requires explicit impersonation session; every action audited with `impersonation_id` |
| Archived projects | Visible to Super Admin / Company Admin only |

## 5. Status-Dependent Permission Overrides

Permissions are suspended by project status regardless of role grants (except Super Admin recovery actions, which are audited Critical):

| Status | Suspended |
|---|---|
| DRAFT | Nothing (wizard in progress); child-record creation blocked platform-wide by gate |
| TENDER / BID_SUBMITTED | `project.contract.revise`; execution-record creation via gate |
| LOST / CANCELLED | Everything except view + archive |
| ON_HOLD | `project.edit` (profile), `project.milestone.manage` (create), all child-record creation via gate; status.request (resume/cancel) remains |
| COMPLETED | Team additions except DLP roles; contract edit (revisions still allowed for final account) |
| CLOSED | Everything except view, `project.archive`, and DLP-module actions |
| ARCHIVED | View by admins only |

## 6. Segregation of Duties

| SoD Rule | Mechanism |
|---|---|
| Status change requester ≠ approver (BR-PRJ-024) | Workflow Engine excludes requester from approver resolution |
| Contract revision submitter ≠ approver | Same mechanism on the revision chain |
| Numbering configurer cannot bypass lock | `project.numbering.lock` is a system permission; no human role holds unlock |
| Roster self-grant prevention | A user cannot add **themselves** to a project roster; requires another `project.team.manage` holder (Company Admin exempt, audited High) |

## 7. JWT Claims and Enforcement Points

| Layer | Enforcement |
|---|---|
| JWT | `tenant_id`, `user_id`, `role`; short-lived access token |
| API middleware | Permission check (catalogue) + C-condition resolution + status-override matrix |
| PostgreSQL RLS | Tenant isolation backstop — even a middleware bug cannot leak cross-tenant |
| UI | Buttons/fields hidden or read-only per same catalogue (defence in depth, never sole control) |

## 8. Test Hooks (consumed by 09-Test-Plan)

1. Every ✓/—/C cell in §3 asserted per role.
2. C¹ boundary: access flips exactly on roster start/end dates.
3. Status-override matrix: each suspended permission returns 403 in that status.
4. Cross-tenant probes on all 15 tables (API + direct PostgREST).
5. SoD: requester-as-approver attempt rejected on all four chains.
6. Self-grant to roster rejected for PM; allowed-with-audit for Company Admin.
7. Client external user: summary endpoint 200, detail endpoints 403, raw table 0 rows.

## 9. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | Security Architect |
