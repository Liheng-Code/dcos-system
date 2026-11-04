# DCOS — WBS Management Module
## 07 — RBAC Matrix

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-RBAC-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Senior System Architect + Security Engineer |
| Status | Issued for Review |
| Base References | DCOS-WBS-FS-001, DCOS-WBS-DB-001, R0 §9 |

---

## 1. Permission Model

```
Effective permission =
      Role permission            (does this role hold the code at all?)
  AND Project access             (is the user on this project's roster?)
  AND WBS scope                  (is this node inside the user's granted scope?)
  AND Discipline filter          (does the node's discipline match the grant?)
  AND Workflow responsibility    (for approval actions: is this user the assigned approver?)
```

Five gates, evaluated in that order, **deny wins at every gate without exception** — including Super Admin, who must impersonate explicitly and be audited rather than bypass silently.

WBS scope **narrows, never widens**. A SUBTREE grant on Level 05 cannot give access to a project the user is not on, and cannot grant a permission code the role does not hold.

## 2. Permission Catalogue

| Code | Description | Risk | Default holders |
|---|---|---|---|
| `WBS.VIEW_TREE` | View project tree | Low | All internal roles + external (scoped) |
| `WBS.VIEW_NODE` | View node detail | Low | As above |
| `WBS.VIEW_COST_ROLLUP` | See cost aggregates | **High** (commercial) | PD, PM, QS, Accountant, Company Admin, Director |
| `WBS.CREATE_NODE` | Create node | Medium | Planner, PM, Discipline Mgr (own discipline), Company Admin |
| `WBS.EDIT_NODE` | Edit name/attrs/method | Medium | Planner, PM, Discipline Mgr |
| `WBS.EDIT_CODE` | Change code segment | **High** | Planner, PM (+CR post-baseline) |
| `WBS.MOVE_NODE` | Re-parent subtree | **High** | Planner, PM |
| `WBS.REORDER_NODE` | Sibling order | Low | Planner, PM, Discipline Mgr |
| `WBS.DUPLICATE_NODE` | Copy subtree | Medium | Planner, PM |
| `WBS.DELETE_NODE` | Soft delete | **High** | Planner, PM |
| `WBS.ARCHIVE_NODE` | Archive | Medium | PM, PD, Planner |
| `WBS.RESTORE_NODE` | Restore archived | Medium | PM, PD, Company Admin |
| `WBS.CHANGE_STATUS` | Status transition | Medium | PM, PD, Planner, Discipline Mgr (own subtree) |
| `WBS.CASCADE_STATUS` | Subtree status change | **High** | PM, PD |
| `WBS.BULK_IMPORT` | Import structure | **High** | Planner, PM, Company Admin |
| `WBS.ROLLBACK_IMPORT` | Reverse a batch | **Critical** | Planner (own batch), Company Admin |
| `WBS.EXPORT` | Export tree | Medium | All internal above Engineer; external denied |
| `WBS.APPLY_TEMPLATE` | Apply template | Medium | Planner, PM, Company Admin |
| `WBS.MANAGE_TEMPLATE` | Maintain templates | **High** | Company Admin, Super Admin |
| `WBS.CONFIGURE_RULES` | Types/rules/segments | **Critical** | Company Admin, Super Admin |
| `WBS.SET_BASELINE` | Create baseline | **Critical** | PM, PD |
| `WBS.RAISE_CHANGE` | Raise CR | Low | Planner, PM, Discipline Mgr, Engineer, QS |
| `WBS.APPROVE_CHANGE` | Approve/reject CR | **Critical** | PM, PD |
| `WBS.ASSIGN_RESPONSIBLE` | Assign node owner | Medium | PM, PD, Discipline Mgr (own discipline) |
| `WBS.OVERRIDE_PROGRESS` | Manual override | **Critical** | PM, PD |
| `WBS.RECALCULATE_ROLLUP` | Full rebuild | **High** | Company Admin, Super Admin |

## 3. Role × Permission Matrix

Legend: **Y** = granted · **N** = denied · **C**n = conditional, see footnote.

| Permission | Super Admin | Company Admin | Project Director | Project Manager | Discipline Manager | Engineer | BIM Coordinator | QA/QC Inspector | HSE Officer | Procurement Officer | QS Engineer | Site Supervisor | Document Controller | HR Officer | Accountant | Subcontractor | Supplier | Client | Consultant | Viewer |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| VIEW_TREE | C1 | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | Y | C2 | C2 | C2 | C2 | Y |
| VIEW_NODE | C1 | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | Y | N | Y | C2 | C2 | C2 | C2 | Y |
| VIEW_COST_ROLLUP | C1 | Y | Y | Y | C3 | N | N | N | N | C4 | Y | N | N | N | Y | N | N | N | N | N |
| CREATE_NODE | C1 | Y | Y | Y | C3 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| EDIT_NODE | C1 | Y | Y | Y | C3 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| EDIT_CODE | C1 | Y | Y | C5 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| MOVE_NODE | C1 | Y | Y | C5 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| REORDER_NODE | C1 | Y | Y | Y | C3 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| DUPLICATE_NODE | C1 | Y | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| DELETE_NODE | C1 | Y | C6 | C6 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| ARCHIVE_NODE | C1 | Y | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| RESTORE_NODE | C1 | Y | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| CHANGE_STATUS | C1 | Y | Y | Y | C3 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| CASCADE_STATUS | C1 | Y | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| BULK_IMPORT | C1 | Y | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| ROLLBACK_IMPORT | C1 | Y | C7 | C7 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| EXPORT | C1 | Y | Y | Y | Y | C8 | C8 | C8 | C8 | C8 | Y | C8 | Y | N | Y | N | N | N | N | N |
| APPLY_TEMPLATE | C1 | Y | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| MANAGE_TEMPLATE | C1 | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| CONFIGURE_RULES | C1 | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| SET_BASELINE | C1 | N | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| RAISE_CHANGE | C1 | Y | Y | Y | Y | Y | Y | Y | N | N | Y | Y | Y | N | N | N | N | N | N | N |
| APPROVE_CHANGE | C1 | N | Y | C9 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| ASSIGN_RESPONSIBLE | C1 | Y | Y | Y | C3 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| OVERRIDE_PROGRESS | C1 | N | Y | Y | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |
| RECALCULATE_ROLLUP | C1 | Y | N | C10 | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N | N |

**Footnotes**

- **C1 — Super Admin:** holds nothing by default on tenant data. Access requires explicit impersonation of a tenant with a stated reason; every action is audited as `is_impersonation=true` and time-limited to 4 hours (§9).
- **C2 — External roles (Subcontractor, Supplier, Client, Consultant):** view only, and only within an explicit SUBTREE or LINKED_RECORDS_ONLY grant. Never PROJECT_ALL by default.
- **C3 — Discipline Manager:** only on nodes whose `discipline_code` matches the manager's discipline, or on nodes they created within their discipline subtree. Cannot act on structural spine nodes (PROJECT_ROOT, PHASE, BUILDING, LEVEL).
- **C4 — Procurement Officer:** cost roll-up limited to `budget_value` and `committed_value` (needed for budget-availability checks); `actual_value` and `forecast_value` masked.
- **C5 — PM on EDIT_CODE / MOVE_NODE:** freely before baseline; after baseline only via an approved change request applied by the system (FR-029). The permission is held; the baseline lock is a separate gate.
- **C6 — DELETE_NODE:** permitted only when `wbs_node_links` count = 0 and node has no children (FR-016). The permission never overrides the guard.
- **C7 — ROLLBACK_IMPORT:** own batches only, within 7 days of commit; older batches require Company Admin.
- **C8 — EXPORT for operational roles:** limited to their WBS scope, and cost columns omitted unless `WBS.VIEW_COST_ROLLUP` is also held.
- **C9 — PM APPROVE_CHANGE:** yes, except where the PM is the raiser (`requested_by <> decided_by` DB constraint) — then it routes to the Project Director.
- **C10 — PM RECALCULATE_ROLLUP:** project-scoped rebuild only; tenant-wide rebuild is Company Admin.

## 4. WBS Data Scope Model

| Scope Type | Meaning | Typical holder |
|---|---|---|
| `PROJECT_ALL` | Every node in the project | PM, PD, Planner, QS, DC |
| `SUBTREE` | A named node and all descendants | Site Supervisor (a level), Subcontractor (a zone) |
| `DISCIPLINE_FILTERED` | Project-wide but only nodes with matching `discipline_code` (plus their ancestor context) | Discipline Manager, discipline engineers |
| `RESPONSIBLE_ONLY` | Nodes where the user holds a current responsibility, plus descendants | Area engineers |
| `LINKED_RECORDS_ONLY` | Nodes that carry a record the user owns (their tasks, their submittals) | Supplier, occasional external |

**Storage:** grants live in the platform's access table as `(user_id, project_id, scope_type, scope_node_id?, discipline_code?)`. Multiple grants union.

**Inheritance:** a grant on Level 05 implies every descendant. It never implies siblings (Level 06) and never implies ancestors as *content*.

**Ancestor visibility rule:** ancestors of a granted node are returned as **context rows** — visible name, code, and type, not expandable, no detail panel, no children beyond the granted path. This prevents the two classic failures: blank gaps that make the tree unnavigable, and accidental disclosure of sibling scope.

**Discipline interaction:** a STR engineer with `SUBTREE` on Building B01 and `DISCIPLINE_FILTERED=STR` sees B01's levels and zones (spine nodes are discipline-neutral and always visible as structure) but only STR discipline branches and their work packages beneath them.

**Cost masking is orthogonal:** scope decides *which nodes*; `WBS.VIEW_COST_ROLLUP` decides *which columns*. A QS with PROJECT_ALL sees cost everywhere; a supervisor with PROJECT_ALL sees no cost anywhere.

## 5. External Party Rules

1. No external role (Subcontractor, Supplier, Client, Consultant) holds **any** of CREATE, EDIT, EDIT_CODE, MOVE, REORDER, DUPLICATE, DELETE, ARCHIVE, RESTORE, CHANGE_STATUS, CASCADE_STATUS, BULK_IMPORT, ROLLBACK_IMPORT, APPLY_TEMPLATE, MANAGE_TEMPLATE, CONFIGURE_RULES, SET_BASELINE, APPROVE_CHANGE, ASSIGN_RESPONSIBLE, OVERRIDE_PROGRESS, RECALCULATE_ROLLUP. **This is absolute and not configurable.**
2. External roles hold no `WBS.EXPORT` — bulk structure leaves the platform only through an internal user's controlled transmittal.
3. External roles never receive `PROJECT_ALL`. Provisioning UI refuses the combination.
4. Client and Consultant may hold read access to a wider subtree than a Subcontractor, but the mutation prohibition is identical.

## 6. Permission Evaluation Algorithm

```
1. Authenticate → tenant_id, user_id, roles from JWT.        Fail → 401
2. Tenant gate:   record.tenant_id == jwt.tenant_id?         Fail → 404 (not 403 — do not confirm existence)
3. Role gate:     any role holds the permission code?        Fail → 403 WBS_PERMISSION_DENIED
4. Project gate:  user on project roster (active)?           Fail → 403
5. Scope gate:    node ∈ union(grants) OR ancestor-context
                  (context ⇒ read metadata only)             Fail → 403 WBS_SCOPE_DENIED
6. Discipline gate (if DISCIPLINE_FILTERED grant applies)    Fail → 403
7. Workflow gate (approval actions only): is assigned
   approver AND requested_by ≠ decided_by                    Fail → 403
8. State gate:    baseline lock, status guard, link guard    Fail → 409 with domain error code
→ Allow
```

Short-circuit: any failure stops evaluation; no partial data is returned. Deny wins over every grant, including impersonation. State gates (step 8) are business rules, not permissions — they return 409, never 403, so the UI can offer the change-request path.

## 7. RLS Mapping

| Scope type | PostgreSQL predicate (inside `dcos_wbs_scope_permits`) |
|---|---|
| PROJECT_ALL | `dcos_user_has_project_access(project_id)` |
| SUBTREE | `EXISTS (SELECT 1 FROM wbs_closure c JOIN user_wbs_grants g ON g.scope_node_id = c.ancestor_id WHERE c.descendant_id = wbs_nodes.id AND g.user_id = auth.uid())` |
| Ancestor context | `EXISTS (SELECT 1 FROM wbs_closure c JOIN user_wbs_grants g ON g.scope_node_id = c.descendant_id WHERE c.ancestor_id = wbs_nodes.id AND g.user_id = auth.uid())` — returns ancestors; app layer marks them `context_only = true` |
| DISCIPLINE_FILTERED | `(wbs_nodes.discipline_code IS NULL OR wbs_nodes.discipline_code IN (SELECT discipline_code FROM user_wbs_grants WHERE user_id = auth.uid() AND project_id = wbs_nodes.project_id))` |
| RESPONSIBLE_ONLY | `EXISTS (SELECT 1 FROM wbs_node_responsibilities r JOIN wbs_closure c ON c.ancestor_id = r.node_id WHERE c.descendant_id = wbs_nodes.id AND r.user_id = auth.uid() AND r.valid_to IS NULL)` |
| LINKED_RECORDS_ONLY | `EXISTS (SELECT 1 FROM wbs_node_links l WHERE l.node_id = wbs_nodes.id AND dcos_user_owns_entity(l.entity_type, l.entity_id))` |

Cost columns are additionally masked by exposing `v_wbs_rollup_public` (progress only) to roles lacking `WBS.VIEW_COST_ROLLUP`, with the full `wbs_rollup_cache` reachable only through the permission-checked API projection. Defence in depth: even a mis-scoped API cannot leak cost through the view.

## 8. Elevated and Break-Glass Access

- Super Admin impersonation requires: target tenant, stated reason, and produces `AUDIT.IMPERSONATION.STARTED` (CRITICAL) plus `is_impersonation=true` on every subsequent event.
- Session capped at 4 hours; auto-expiry audited.
- Impersonation cannot be used to bypass baseline lock, delete guard, or the `requested_by <> decided_by` constraint — those are data-layer rules.
- Company Admin cannot grant themselves `SET_BASELINE`, `APPROVE_CHANGE`, or `OVERRIDE_PROGRESS`; those are project-governance permissions held by PM/PD only, by design (separation of duties between platform administration and commercial decision-making).

## 9. Permission Change Audit

Every grant change writes `ROLE_CHANGE` / `PERMISSION_CHANGE` (CRITICAL, R0 §24.4.6) with: target user, project, scope type, scope node, discipline, granted by, before/after, reason. WBS scope grants additionally emit a notification to Company Admin (Part 4.12 admin-change row).

## 10. Test Assertions

| # | Assertion |
|---|---|
| A-01 | Viewer with PROJECT_ALL attempting `POST /wbs/nodes` → 403; role lacks CREATE_NODE. |
| A-02 | Site Supervisor with SUBTREE(L05) requesting node under L06 → 403 `WBS_SCOPE_DENIED`. |
| A-03 | Site Supervisor with SUBTREE(L05) requesting L05's parent (B01) → 200 with `context_only=true`, children omitted. |
| A-04 | Subcontractor with SUBTREE(Z03-STR) calling move → 403; external mutation prohibition. |
| A-05 | Subcontractor holding a forged token claiming PM role but tenant B, requesting tenant A node → 404. |
| A-06 | Discipline Manager (MEP) editing an STR work package → 403 (C3). |
| A-07 | Discipline Manager (MEP) editing an MEP work package in own subtree → 200. |
| A-08 | Discipline Manager attempting to rename Level 05 (spine node) → 403 (C3). |
| A-09 | PM moving a baseline-locked node → 409 `WBS_BASELINE_LOCKED`, not 403. |
| A-10 | PM moving a non-locked node pre-baseline → 200. |
| A-11 | Planner raising CR then approving it → 403 (C9 / DB constraint). |
| A-12 | PM approving a CR raised by the same PM → 403; routes to PD. |
| A-13 | PD approving a PM-raised CR → 200. |
| A-14 | Company Admin attempting SET_BASELINE → 403 (separation of duties). |
| A-15 | Company Admin attempting CONFIGURE_RULES → 200. |
| A-16 | Site Supervisor requesting `/rollup?measures=budget` → 200 with cost fields absent, `progress_percent` present. |
| A-17 | Procurement Officer requesting rollup → budget and committed present; actual and forecast masked (C4). |
| A-18 | QS with PROJECT_ALL requesting rollup → all measures present. |
| A-19 | Engineer attempting DELETE on an unlinked node → 403 (role lacks DELETE_NODE). |
| A-20 | Planner attempting DELETE on a node with 1 link → 409 `WBS_NODE_HAS_LINKS`, audit `WBS.NODE.DELETE_BLOCKED`. |
| A-21 | Planner rolling back own 3-day-old batch → 200; 10-day-old batch → 403 (C7). |
| A-22 | Client requesting `/export` → 403; export prohibited for external roles. |
| A-23 | Super Admin querying tenant data without impersonation → 404. |
| A-24 | Super Admin with active impersonation reading a node → 200, event carries `is_impersonation=true`. |
| A-25 | User with RESPONSIBLE_ONLY on Zone 03 reading a Zone 04 node → 403; reading a Zone 03 descendant → 200. |
| A-26 | User with LINKED_RECORDS_ONLY reading a node where their submittal is linked → 200; sibling node with no owned records → 403. |
| A-27 | Deactivated project roster member with a valid SUBTREE grant → 403 at step 4 (project gate precedes scope). |
| A-28 | PM with PROJECT_ALL applying override without reason code → 422 `WBS_OVERRIDE_REASON_REQUIRED` (validation, not permission). |

## 11. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should Consultant hold `WBS.RAISE_CHANGE` on client-instructed restructures, or continue routing through the PM? (Current: routed through PM.) |
| OQ-02 | Is a project-level toggle wanted to let a Discipline Manager create spine nodes on discipline-led projects (design-only contracts)? |

## 12. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
