# DCOS — Module 04: Task Management
## 07 — RBAC Matrix

| Field | Value |
|---|---|
| Document Code | DCOS-M04-RBAC-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Enforcement | JWT claims → application guard → PostgreSQL Row-Level Security |

---

## 1. Access Model

```text
Effective permission =
      Role permission          (what the role may do)
  ∩   Project access           (which projects the user is a member of)
  ∩   Discipline scope         (which disciplines the user covers, if restricted)
  ∩   WBS scope                (optional branch restriction)
  ∩   Record relationship      (assignee / supervisor / approver / watcher / creator)
  ∩   Tenant isolation         (absolute, non-overridable)
```

Every check is evaluated in that order. Tenant isolation is evaluated first and can never be satisfied by any role, including Super Admin, without an explicit, audited impersonation session.

### 1.1 Scope Qualifiers

| Qualifier | Meaning |
|---|---|
| **ALL** | Any task in scope of the user's project access |
| **DISC** | Only tasks whose `discipline` is in the user's assigned disciplines |
| **WBS** | Only tasks under WBS branches assigned to the user |
| **OWN** | Only tasks where the user is assignee, collaborator or creator |
| **TEAM** | Tasks assigned to users reporting to this supervisor, or to their crew |
| **ORG** | Only tasks where `subcontractor_id` = the user's stakeholder organisation |
| **PART** | Only tasks where the external party is an explicit approval or distribution participant |
| **—** | Not permitted |

---

## 2. Permission Catalogue

| Permission Key | Description |
|---|---|
| `task.view` | View task records and detail |
| `task.view_financial` | See `budget_value`, cost code, BOQ linkage on a task |
| `task.view_internal_comment` | See comments marked internal |
| `task.create` | Create a task |
| `task.create_bulk` | Bulk generate tasks from template |
| `task.edit` | Edit descriptive/scheduling fields |
| `task.edit_planned_dates` | Change planned start/finish after publish |
| `task.assign` | Set the initial assignee |
| `task.reassign` | Change an existing assignee |
| `task.start` | Transition ASSIGNED → IN_PROGRESS |
| `task.progress_update` | Add a progress log entry |
| `task.correct_progress` | Enter a decreasing/corrective progress entry |
| `task.authorise_overrun` | Accept actual quantity above planned quantity |
| `task.hold` | Place a task on hold |
| `task.resume` | Release a hold |
| `task.complete` | Transition IN_PROGRESS → COMPLETED |
| `task.submit` | Submit for approval |
| `task.recall` | Withdraw a submission before first decision |
| `task.approve` | Approve at an assigned approval step |
| `task.reject` | Reject at an assigned approval step |
| `task.close` | Transition APPROVED → CLOSED |
| `task.reopen` | Reopen a CLOSED task |
| `task.cancel` | Cancel a task |
| `task.delete_draft` | Delete a task that has never left DRAFT |
| `task.archive` | Archive tasks on project closure |
| `task.dependency_manage` | Create/remove dependencies |
| `task.override_dependency` | Start a BLOCKED task with reason |
| `task.checklist_respond` | Answer checklist items |
| `task.checklist_manage` | Add/remove checklist items on a task |
| `task.resource_log` | Log manpower / equipment / material |
| `task.resource_view` | View resource logs |
| `task.attachment_upload` | Upload evidence |
| `task.attachment_delete` | Soft-delete an attachment |
| `task.comment` | Add comments |
| `task.comment_internal` | Add internal-only comments |
| `task.link_manage` | Create/remove links to documents, RFIs, BOQ etc. |
| `task.export` | Export task data |
| `task.bulk_action` | Perform bulk operations |
| `task.view_audit` | View the full activity timeline |
| `task.config` | Configure task types, hold reasons, templates, numbering |

---

## 3. Role × Permission Matrix

### 3.1 Read and Create

| Role | view | view_financial | view_internal_comment | create | create_bulk | edit | edit_planned_dates |
|---|---|---|---|---|---|---|---|
| Super Admin | ALL* | ALL* | ALL* | ALL* | ALL* | ALL* | ALL* |
| Company Admin | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Project Director | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Project Manager | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Discipline Manager | ALL | DISC | DISC | DISC | DISC | DISC | DISC |
| Planner / Scheduler | ALL | — | ALL | ALL | ALL | ALL | ALL |
| Engineer | ALL | — | ALL | DISC | — | OWN | — |
| Site Supervisor | ALL | — | ALL | WBS | WBS | TEAM | TEAM |
| BIM Coordinator | ALL | — | ALL | DISC | — | OWN | — |
| QA/QC Inspector | ALL | — | ALL | DISC | — | OWN | — |
| HSE Officer | ALL | — | ALL | DISC | — | OWN | — |
| Procurement Officer | ALL | ALL | ALL | DISC | — | OWN | — |
| QS / Cost Engineer | ALL | ALL | ALL | DISC | — | OWN | — |
| Document Controller | ALL | — | ALL | — | — | — | — |
| Storekeeper | WBS | — | — | — | — | — | — |
| HR Officer | — | — | — | — | — | — | — |
| Accountant | ALL | ALL | — | — | — | — | — |
| Subcontractor User | ORG | — | — | — | — | — | — |
| Supplier User | — | — | — | — | — | — | — |
| Client | PART | — | — | — | — | — | — |
| Consultant | PART | — | — | — | — | — | — |
| Viewer | ALL | — | — | — | — | — | — |

\* Super Admin access to tenant data requires an explicit impersonation session recorded as a CRITICAL audit event.

### 3.2 Assignment and Execution

| Role | assign | reassign | start | progress_update | correct_progress | authorise_overrun | hold | resume | complete |
|---|---|---|---|---|---|---|---|---|---|
| Company Admin | ALL | ALL | — | — | ALL | ALL | ALL | ALL | — |
| Project Director | ALL | ALL | — | — | ALL | ALL | ALL | ALL | — |
| Project Manager | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Discipline Manager | DISC | DISC | DISC | DISC | DISC | DISC | DISC | DISC | DISC |
| Planner / Scheduler | ALL | ALL | — | — | — | — | — | — | — |
| Engineer | — | — | OWN | OWN | — | — | OWN | OWN | OWN |
| Site Supervisor | WBS | TEAM | TEAM | TEAM | TEAM | — | TEAM | TEAM | TEAM |
| BIM Coordinator | — | — | OWN | OWN | — | — | OWN | OWN | OWN |
| QA/QC Inspector | — | — | OWN | OWN | — | — | OWN | OWN | OWN |
| HSE Officer | — | — | OWN | OWN | — | — | ALL¹ | ALL¹ | OWN |
| Procurement Officer | — | — | OWN | OWN | — | — | OWN | OWN | OWN |
| QS / Cost Engineer | — | — | — | — | — | — | — | — | — |
| Subcontractor User | — | — | ORG | ORG | — | — | ORG² | — | ORG |
| Client / Consultant | — | — | — | — | — | — | — | — | — |

¹ HSE may place any task on hold for safety reasons (`HR-SAF`) and release it. This is a deliberate safety override.
² Subcontractor may *request* a hold; it takes effect only after the site supervisor confirms.

### 3.3 Governance and Lifecycle

| Role | submit | recall | approve | reject | close | reopen | cancel | delete_draft | archive |
|---|---|---|---|---|---|---|---|---|---|
| Company Admin | — | — | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Project Director | — | — | ALL | ALL | ALL | ALL | ALL | — | ALL |
| Project Manager | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Discipline Manager | DISC | DISC | DISC | DISC | DISC | — | DISC | DISC | — |
| Site Supervisor | TEAM | TEAM | TEAM³ | TEAM³ | — | — | — | WBS | — |
| Engineer | OWN | OWN | — | — | — | — | — | OWN | — |
| QA/QC Inspector | OWN | OWN | DISC⁴ | DISC⁴ | — | — | — | OWN | — |
| BIM Coordinator | OWN | OWN | — | — | — | — | — | OWN | — |
| HSE Officer | OWN | OWN | DISC⁴ | DISC⁴ | — | — | — | OWN | — |
| Procurement Officer | OWN | OWN | — | — | — | — | — | OWN | — |
| Subcontractor User | ORG | ORG | — | — | — | — | — | — | — |
| Client / Consultant | — | — | PART⁵ | PART⁵ | — | — | — | — | — |

³ Supervisor approval applies to first-line task types only, as configured in the approval template.
⁴ Approval limited to inspection and safety task types within their discipline.
⁵ Only where the client/consultant is defined as an approval step in the contract-driven approval template.

### 3.4 Supporting Actions

| Role | dependency_manage | override_dependency | checklist_respond | resource_log | attachment_upload | attachment_delete | comment_internal | link_manage | export | bulk_action | view_audit | config |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Company Admin | ALL | ALL | — | — | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Project Director | ALL | ALL | — | — | ALL | ALL | ALL | ALL | ALL | ALL | ALL | — |
| Project Manager | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL | — |
| Discipline Manager | DISC | DISC | DISC | DISC | DISC | DISC | DISC | DISC | DISC | DISC | DISC | — |
| Planner / Scheduler | ALL | — | — | — | — | — | ALL | ALL | ALL | ALL | ALL | — |
| Engineer | OWN | — | OWN | OWN | OWN | OWN⁶ | ALL | OWN | DISC | — | OWN |— |
| Site Supervisor | WBS | — | TEAM | TEAM | TEAM | TEAM⁶ | ALL | TEAM | WBS | WBS | TEAM | — |
| QA/QC Inspector | — | — | DISC | — | DISC | OWN⁶ | ALL | DISC | DISC | — | DISC | — |
| HSE Officer | — | — | DISC | — | DISC | OWN⁶ | ALL | DISC | DISC | — | DISC | — |
| QS / Cost Engineer | — | — | — | — | — | — | ALL | ALL | ALL | — | ALL | — |
| Document Controller | — | — | — | — | ALL | — | ALL | ALL | ALL | — | ALL | — |
| Storekeeper | — | — | — | WBS | WBS | — | — | — | WBS | — | — | — |
| Subcontractor User | — | — | ORG | ORG | ORG | — | — | — | ORG | — | ORG | — |
| Client / Consultant | — | — | — | — | PART | — | — | — | PART | — | PART | — |
| Viewer | — | — | — | — | — | — | — | — | ALL | — | — | — |

⁶ Attachment deletion is a soft delete, permitted only within 24 hours of upload and only by the uploader, except for PM and above.

---

## 4. Field-Level Restrictions

| Field | Restricted From | Rule |
|---|---|---|
| `budget_value`, `cost_code`, `boq_item_id` | All roles without `task.view_financial` | Field omitted from API response, not merely hidden in the UI |
| `total_float_d`, `free_float_d`, `is_critical_path` | All roles | Read-only; written only by the Planning module service account |
| `baseline_start`, `baseline_finish`, `baseline_id` | All roles | Read-only; written only via `planning.applyBaseline` |
| `task_code` | All roles | System-generated; immutable after publish |
| `rejection_count`, `reopen_count`, `hold_total_days` | All roles | System-maintained counters |
| Internal comments | Client, Consultant, Subcontractor, Supplier | Filtered at the query layer by `is_internal = false` |
| Resource logs (manpower rates) | All except PM, QS, Accountant, Admin | Hours visible; cost rates never exposed in this module |
| GPS coordinates on photos | Subcontractor, Supplier, Client | Metadata stripped from external-facing responses |

---

## 5. Separation of Duties

| Rule | Enforcement |
|---|---|
| Submitter cannot approve their own task | Blocked unless `allow_self_approval = true` on the task type; attempt logged at HIGH severity |
| Creator may not be the sole approver on inspection-gated tasks | Approval template must resolve to a different user; otherwise `NO_ROUTE` and admin alert |
| Progress corrections require a different permission from progress entry | `task.correct_progress` is not granted to Engineer by default |
| Dependency override is never granted to the assignee role by default | Requires PM or Discipline Manager |
| Task configuration is separated from task execution | `task.config` sits with Company Admin only |
| Reopening a closed task is separated from approving it | `task.reopen` limited to PM and above; audited as CRITICAL |
| Subcontractor cannot approve their own work | Self-approval permanently disabled for external assignees regardless of task type configuration |

---

## 6. Delegation

| Aspect | Rule |
|---|---|
| Who can delegate | Any user holding an approval permission, for a defined date range |
| What is delegated | Approval authority only — never create, edit, cancel or configure rights |
| Constraints | Delegate must hold the same or higher role tier and have access to the same project |
| Visibility | The approval record shows "Approved by X on behalf of Y"; both identities are stored |
| Audit | Delegation creation, use and expiry are all audited; delegation cannot be backdated |
| Maximum duration | 30 days per delegation, renewable |

---

## 7. External Party Rules

| Party | Rules |
|---|---|
| Subcontractor User | Sees only tasks where `subcontractor_id` matches their organisation. Cannot see other subcontractors, internal comments, cost data, or the full WBS tree beyond their assigned branches. Cannot approve. Their submissions always require internal verification. |
| Supplier User | No task access in Phase 1. Interacts through Procurement only. |
| Client | Read-only progress and milestone visibility. Approval rights only where the contract-driven approval template names them. Cannot see resource logs, costs, internal comments, subcontractor identity or rework flags. |
| Consultant | As Client, plus visibility of design task deliverables and inspection outcomes where they are a participant. |

All external access is additionally gated by an explicit **project participation record** — being an external user of the tenant is not sufficient.

---

## 8. Enforcement Implementation

### 8.1 Layers

| Layer | Responsibility |
|---|---|
| JWT | Carries `tenant_id`, `user_id`, `roles[]`, `user_scope` (INTERNAL/EXTERNAL), `stakeholder_id` |
| API Guard | Declarative permission decorator per endpoint; rejects before controller logic |
| Service Layer | Relationship checks (OWN / TEAM / DISC / WBS) and separation-of-duty rules |
| Database RLS | Final backstop — tenant and project scope enforced in PostgreSQL policies |
| UI | Hides unavailable actions, but is never the enforcement point |

### 8.2 Permission Function

```sql
CREATE OR REPLACE FUNCTION fn_has_task_permission(
  p_user uuid, p_task uuid, p_permission text
) RETURNS boolean AS $$
DECLARE t tasks%ROWTYPE; v_scope text;
BEGIN
  SELECT * INTO t FROM tasks WHERE id = p_task;
  IF t.tenant_id <> (auth.jwt() ->> 'tenant_id')::uuid THEN RETURN false; END IF;

  SELECT scope INTO v_scope
  FROM role_permissions rp
  JOIN user_roles ur ON ur.role_id = rp.role_id
  WHERE ur.user_id = p_user AND rp.permission_key = p_permission
  ORDER BY CASE scope WHEN 'ALL' THEN 1 WHEN 'DISC' THEN 2 WHEN 'WBS' THEN 3
                      WHEN 'TEAM' THEN 4 WHEN 'OWN' THEN 5 WHEN 'ORG' THEN 6 ELSE 7 END
  LIMIT 1;

  RETURN CASE v_scope
    WHEN 'ALL'  THEN fn_is_project_member(p_user, t.project_id)
    WHEN 'DISC' THEN fn_is_project_member(p_user, t.project_id)
                     AND t.discipline = ANY (fn_user_disciplines(p_user, t.project_id))
    WHEN 'WBS'  THEN fn_user_covers_wbs(p_user, t.wbs_node_id)
    WHEN 'TEAM' THEN fn_is_supervisor_of(p_user, t.assignee_id) OR t.supervisor_id = p_user
    WHEN 'OWN'  THEN t.assignee_id = p_user OR t.created_by = p_user
                     OR EXISTS (SELECT 1 FROM task_assignments a
                                 WHERE a.task_id = t.id AND a.user_id = p_user
                                   AND a.removed_at IS NULL)
    WHEN 'ORG'  THEN t.subcontractor_id = (auth.jwt() ->> 'stakeholder_id')::uuid
    ELSE false
  END;
END $$ LANGUAGE plpgsql STABLE;
```

### 8.3 Denial Handling

| Situation | Response |
|---|---|
| Permission missing, record visible | `403 Forbidden` with `permission_required` in the body |
| Permission missing, record not visible in scope | `404 Not Found` — existence is not disclosed |
| Cross-tenant attempt | `404 Not Found` + CRITICAL audit event + security alert to Company Admin |
| Repeated denials (≥ 5 in 10 minutes) | Rate-limited and flagged in the security report |

---

## 9. Audit Requirements for Access Events

| Event | Severity |
|---|---|
| Task viewed | Not logged (volume) — except tasks flagged confidential |
| Task exported | HIGH — with filter criteria and row count |
| Permission denied | MEDIUM |
| Cross-tenant attempt | CRITICAL |
| Dependency override used | HIGH |
| Self-approval used (where permitted) | HIGH |
| Delegation used | MEDIUM |
| Task reopened | CRITICAL |
| Role change affecting task access | CRITICAL (owned by RBAC module) |

---

## 10. Default Role Bundles (seed)

| Bundle | Included Permissions |
|---|---|
| `TASK_VIEWER` | view, export |
| `TASK_EXECUTOR` | TASK_VIEWER + start, progress_update, checklist_respond, attachment_upload, comment, hold, resume, complete, submit, recall |
| `TASK_SUPERVISOR` | TASK_EXECUTOR + create, assign, reassign, resource_log, approve, reject, bulk_action, view_audit |
| `TASK_MANAGER` | TASK_SUPERVISOR + create_bulk, edit_planned_dates, dependency_manage, override_dependency, correct_progress, authorise_overrun, close, cancel, reopen, link_manage |
| `TASK_ADMIN` | TASK_MANAGER + config, archive, attachment_delete (unrestricted) |
| `TASK_EXTERNAL_SUB` | view(ORG), start(ORG), progress_update(ORG), attachment_upload(ORG), checklist_respond(ORG), submit(ORG), comment (external only) |
| `TASK_EXTERNAL_CLIENT` | view(PART), approve(PART), reject(PART), comment (external only), export(PART) |

---

**End of Document — DCOS-M04-RBAC-001**
