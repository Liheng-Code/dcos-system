# DCOS RBAC Permission Skill

## Purpose

Use this skill when designing, reviewing, or implementing role-based access control for the Digital Construction Operating System (DCOS).

DCOS access control must not be treated as simple page hiding. It must control who can view, create, edit, submit, review, approve, reject, delete, export, configure, and audit records across projects, WBS nodes, disciplines, modules, workflows, and external stakeholder boundaries.

Core rule:

```text
Effective Permission = Role Permission + Project Access + Discipline Access + Workflow Responsibility + Record Ownership + Tenant Boundary
```

Never design DCOS permissions as only `admin` and `user`. Construction systems need layered authority.

---

## When To Use This Skill

Use this skill for:

- Role and permission matrix design
- Supabase Row Level Security policy design
- Project-level access control
- Module-level permissions
- Workflow approval permission checks
- Internal vs external stakeholder access
- Client / consultant / subcontractor portal permissions
- Audit log access rules
- Document access rules
- Task assignment and approval rules
- Permission test cases
- Access-control database schema review

---

## DCOS RBAC Design Principles

### 1. Tenant isolation is mandatory

Every business table must be scoped by `tenant_id` or indirectly linked to a tenant through project/company ownership.

A user from Company A must never read, update, approve, export, or download Company B records.

### 2. Role alone is not enough

A Project Manager role does not mean the user can access every project. The user must also be assigned to the project.

Bad rule:

```text
If role = Project Manager, allow all projects.
```

Good rule:

```text
If role = Project Manager AND user is assigned to project, allow project-level actions.
```

### 3. Workflow responsibility controls approval

A user may have permission to review documents, but they can only approve a specific document if they are the current assigned approver or belong to the configured approval role for that workflow step.

### 4. External access must be gated

External stakeholders must only see records formally issued or assigned to them.

Examples:

- Client sees approved documents issued through transmittal.
- Consultant sees review tasks assigned to consultant role.
- Subcontractor sees only their own work package, inspections, NCRs, RFIs, and submitted documents.
- Supplier sees only RFQs, POs, deliveries, and invoices linked to them.

### 5. Permissions must be auditable

Every sensitive permission event must create an audit log.

Audit these actions:

```text
ROLE_ASSIGNED
ROLE_REMOVED
PERMISSION_CHANGED
PROJECT_ACCESS_GRANTED
PROJECT_ACCESS_REVOKED
DISCIPLINE_ACCESS_CHANGED
EXTERNAL_ACCESS_GRANTED
WORKFLOW_APPROVER_CHANGED
ADMIN_OVERRIDE_USED
```

---

## Recommended DCOS Roles

| Role | Main Purpose |
|---|---|
| Super Admin | Platform-level control, tenant management, emergency support |
| Company Admin | Company setup, users, roles, permissions, master data |
| Director / CEO | Portfolio visibility, executive approvals, high-level reports |
| Project Director | Multi-project or major-project control |
| Project Manager | Full project control for assigned projects |
| Discipline Lead | Department or discipline control within assigned projects |
| Engineer | Create and update tasks, documents, RFIs, reports |
| Site Supervisor | Site task execution, daily reports, manpower/equipment logs |
| Document Controller | Document register, revision, transmittal, distribution |
| QS / Cost Engineer | BOQ, IPC, cost, variation, claim preparation |
| Procurement Officer | PR, RFQ, PO, supplier communication |
| Store Keeper | GRN, stock receiving, issue, transfer, inventory count |
| QA/QC Inspector | Inspection, ITP, NCR, punch list |
| HSE Officer | Safety permits, toolbox talks, incidents, inspections |
| HR Officer | Employee records, attendance, leave, timesheets |
| Accountant | Invoice, payment, ledger, financial review |
| Client / Consultant | External review and approval access |
| Subcontractor User | Limited subcontract/task/inspection access |
| Supplier User | RFQ, PO, delivery, invoice access only |
| Viewer | Read-only access based on assigned scope |

---

## Standard Permission Actions

Every module should use a consistent permission vocabulary.

```text
view
create
edit
delete
submit
review
approve
reject
assign
reassign
close
reopen
export
download
upload
configure
admin_override
view_audit
```

Use consistent action names in database, API, frontend guards, and tests.

---

## Recommended Permission Model

### Permission dimensions

```text
tenant_id
project_id
module_code
discipline_code
wbs_scope
record_owner
stakeholder_id
role_id
permission_action
workflow_step
```

### Core modules requiring permissions

```text
ADMIN
PROJECT
STAKEHOLDER
WBS
TASK
DOCUMENT
RFI
DESIGN_ARC
DESIGN_STR
DESIGN_MEP
PROCUREMENT
STOCK
CONSTRUCTION
QAQC
HSE
HR
ACCOUNT
BOQ
IPC
CONTRACT
CLAIM
REPORT
AUDIT
NOTIFICATION
```

---

## Recommended Database Tables

### `roles`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Null only for platform system roles if needed |
| role_code | text | Example: PROJECT_MANAGER |
| role_name | text | Human readable name |
| role_level | int | Higher number = higher authority |
| role_type | text | internal, external, system |
| is_system_role | boolean | Prevent accidental deletion |
| is_active | boolean | Soft disable |
| created_at | timestamptz | Created date |
| updated_at | timestamptz | Updated date |

### `permissions`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| permission_code | text | Example: TASK_APPROVE |
| module_code | text | Example: TASK |
| action_code | text | Example: approve |
| description | text | Human explanation |
| risk_level | text | low, medium, high, critical |
| is_active | boolean | Soft disable |

### `role_permissions`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant scope |
| role_id | uuid | FK to roles |
| permission_id | uuid | FK to permissions |
| allow | boolean | Usually true; use deny carefully |
| conditions | jsonb | Optional constraints |
| created_at | timestamptz | Created date |

### `user_roles`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant scope |
| user_id | uuid | FK to users |
| role_id | uuid | FK to roles |
| assigned_by | uuid | User who assigned |
| start_date | date | Optional |
| end_date | date | Optional |
| is_active | boolean | Active flag |

### `project_members`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant scope |
| project_id | uuid | FK to projects |
| user_id | uuid | FK to users |
| project_role_code | text | PM, ENGINEER, QAQC, etc. |
| access_level | text | view, contribute, manage, approve |
| is_active | boolean | Active flag |

### `user_discipline_access`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant scope |
| user_id | uuid | FK to users |
| project_id | uuid | Optional project-specific access |
| discipline_code | text | ARC, STR, MEP, QS, CON, QAQC, HSE |
| access_level | text | view, contribute, manage, approve |
| is_active | boolean | Active flag |

### `external_stakeholder_users`

| Field | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| tenant_id | uuid | Tenant scope |
| user_id | uuid | External user |
| stakeholder_id | uuid | Their company/stakeholder |
| project_id | uuid | Project assignment |
| stakeholder_role | text | client, consultant, subcontractor, supplier |
| access_status | text | invited, active, suspended |

---

## Permission Evaluation Algorithm

When checking access, follow this order:

```text
1. Confirm user is authenticated.
2. Confirm user belongs to tenant.
3. Confirm tenant matches the record tenant.
4. Check if user role has the requested module/action permission.
5. Check project membership if the record is project-scoped.
6. Check discipline access if the record is discipline-scoped.
7. Check WBS access if WBS restrictions are enabled.
8. Check workflow responsibility if action is review/approve/reject.
9. Check external stakeholder gate if user is external.
10. Log denied sensitive actions if needed.
11. Allow or deny.
```

---

## Supabase RLS Guidance

Always enable RLS on tenant-owned tables.

Example pattern:

```sql
alter table public.projects enable row level security;

create policy "Users can view projects in their tenant and membership scope"
on public.projects
for select
to authenticated
using (
  tenant_id = auth.jwt() ->> 'tenant_id'
  and exists (
    select 1
    from public.project_members pm
    where pm.project_id = projects.id
      and pm.user_id = auth.uid()
      and pm.is_active = true
  )
);
```

For admin-level users, use a helper function instead of repeating long logic everywhere.

Example helper intent:

```sql
public.has_permission(user_id uuid, tenant_id uuid, module_code text, action_code text)
```

Recommended helper functions:

```text
has_role(user_id, role_code)
has_permission(user_id, module_code, action_code)
has_project_access(user_id, project_id, access_level)
has_discipline_access(user_id, project_id, discipline_code, access_level)
is_current_approver(user_id, workflow_instance_id)
is_external_user(user_id)
can_access_external_record(user_id, entity_type, entity_id)
```

---

## Frontend Guard Pattern

Use permissions in UI, but never trust UI only.

Frontend can hide buttons:

```text
Can user see Approve button?
- Has DOCUMENT approve permission
- Is current approver
- Document status = Under Review
```

Backend and RLS must still enforce the same rule.

Never rely only on hidden buttons. Hidden buttons are decoration; backend permission is law.

---

## Module Permission Matrix Template

Use this matrix for every module.

| Module | Role | View | Create | Edit | Submit | Review | Approve | Reject | Delete | Export | Configure |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| TASK | Project Manager | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Limited | Yes | No |
| TASK | Engineer | Assigned only | Yes | Own/assigned | Yes | No | No | No | No | No | No |
| DOCUMENT | Document Controller | Yes | Yes | Yes | Yes | Route only | No | No | Limited | Yes | Limited |
| DOCUMENT | Consultant | Issued only | No | Comment only | No | Yes | If assigned | If assigned | No | Limited | No |

---

## Critical DCOS Permission Rules

### Task rules

```text
- Creator can edit task while status = Open.
- Assignee can update progress after status = Assigned or In Progress.
- Receiver cannot approve own submitted task unless admin override is enabled.
- Project Manager can reassign tasks within assigned project.
- Closed tasks cannot be edited except by admin reopen workflow.
```

### Document rules

```text
- Draft document visible to creator and internal document team only.
- Submitted document visible to reviewers/approvers.
- External parties only see documents issued through transmittal or assigned review workflow.
- Superseded documents remain visible in history but not as current revision.
- Download and export should be audited.
```

### Procurement rules

```text
- Requester can create PR.
- Procurement can issue RFQ only after PR approval.
- PO approval requires commercial authority.
- Supplier can only view RFQ/PO assigned to their stakeholder record.
- Account can view approved PO for invoice/payment matching.
```

### QA/QC rules

```text
- Site engineer can request inspection.
- QA/QC inspector records result.
- Failed inspection can create NCR.
- Responsible party can update corrective action.
- QA/QC manager closes NCR after verification.
```

### Finance rules

```text
- Financial data requires explicit finance/report permission.
- Payment approval should require high-risk permission.
- Budget override must require admin or director-level authority.
- Financial exports must be audited.
```

### Admin rules

```text
- Role changes are critical audit events.
- Company Admin cannot modify platform Super Admin.
- External users cannot receive internal admin permissions.
- Permission template changes should be logged and optionally require confirmation.
```

---

## Required Test Cases

Generate tests for every permission design.

Minimum tests:

```text
1. User cannot access another tenant's project.
2. User cannot access project unless assigned.
3. Engineer can view assigned tasks only.
4. Engineer cannot approve own submitted task.
5. PM can approve task inside assigned project.
6. PM cannot approve task outside assigned project.
7. Consultant can view issued documents only.
8. Supplier cannot view other supplier's PO.
9. Subcontractor cannot view internal cost data.
10. Role change creates audit log.
11. Permission removal immediately blocks access.
12. Closed records cannot be edited without reopen permission.
13. Export action requires export permission and creates audit log.
14. RLS blocks direct database access even if API bug exists.
```

---

## Codex Output Requirements

When asked to design RBAC for DCOS, produce:

1. Permission concept summary
2. Role list
3. Permission matrix
4. Database tables
5. RLS policy examples
6. Backend access-check logic
7. Frontend guard logic
8. Workflow-specific rules
9. Audit events
10. Test cases

Keep the answer practical. Prefer tables, SQL examples, and implementation-ready logic.

---

## Common Mistakes To Avoid

Do not:

- Use only `admin` and `user` roles.
- Trust frontend button hiding as security.
- Allow project access by role alone.
- Let external users browse internal project data.
- Allow approval without workflow-step responsibility.
- Forget audit logging for permission changes.
- Build tenant isolation later.
- Put tenant_id in request body and trust it.
- Delete audit logs when a record is deleted.
- Give finance export access to normal project users.

---

## Best Default Recommendation

For the first DCOS MVP, implement:

```text
Tenant RLS
+ project_members
+ user_roles
+ role_permissions
+ user_discipline_access
+ workflow approver check
+ audit log on permission changes
```

Do not overcomplicate with object-level custom permission for every record at the beginning. Start with tenant + project + module + discipline + workflow responsibility. Add WBS-level restrictions later when the core is stable.
