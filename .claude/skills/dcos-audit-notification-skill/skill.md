# DCOS Audit + Notification Skill

## Purpose

Use this skill when designing or reviewing the **Audit Trail Engine** and **Notification Matrix Engine** for the Digital Construction Operating System (DCOS).

This skill helps Claude Code produce enterprise-grade audit logging, notification rules, escalation logic, anti-spam controls, delivery tracking, and Supabase/PostgreSQL-ready database structures for construction workflows.

The goal is simple:

> Nothing important should happen in DCOS without evidence, and no responsible person should miss a required action.

---

## When to Use This Skill

Use this skill for requests involving:

- Audit log design
- Notification matrix design
- Approval event logging
- Task/document/RFI/procurement/QA/HSE notification rules
- Escalation rules
- Delivery logs
- In-app notification center
- Telegram/email notification logic
- Supabase tables for audit and notification
- RLS policies for notification and audit visibility
- Activity timeline for records
- Before/after value tracking
- Workflow event tracking
- Security event logging
- Anti-spam notification control

---

## DCOS Architecture Rules

Always follow these DCOS principles:

1. DCOS is one unified construction operating system.
2. Every important record should link to `tenant_id`.
3. Project-related records should link to `project_id` when applicable.
4. WBS-related records should link to `wbs_node_id` when applicable.
5. Audit logs must be append-only.
6. Users must never edit audit logs.
7. Notifications must be rule-driven, not hardcoded.
8. Critical workflow events must generate both audit logs and notifications.
9. Notification delivery attempts must be recorded.
10. The system must avoid noise; notification should ring like a bell, not scream like a broken alarm.

---

## Audit Log Design Standard

### Audit Log Purpose

The audit log is the system black box recorder. It records who did what, when, where, from which device, and what changed.

Use audit logs for:

- Accountability
- Construction claim evidence
- Dispute support
- Approval traceability
- Financial control
- Security monitoring
- ISO-style quality management
- Internal investigation

---

## Required Audit Events

Log these actions by default:

```text
CREATE
UPDATE
DELETE
ARCHIVE
RESTORE
SUBMIT
APPROVE
REJECT
CLOSE
REOPEN
ASSIGN
REASSIGN
UPLOAD
DOWNLOAD
EXPORT
IMPORT
LOGIN
LOGOUT
FAILED_LOGIN
PASSWORD_CHANGE
ROLE_CHANGE
PERMISSION_CHANGE
STATUS_CHANGE
WORKFLOW_CHANGE
CONFIG_CHANGE
SYSTEM_TRIGGER
NOTIFICATION_SENT
NOTIFICATION_FAILED
```

---

## Audit Event Categories

Use these categories:

| Category | Purpose |
|---|---|
| SECURITY | Login, failed login, password, permission changes |
| DATA | Record create, update, delete |
| WORKFLOW | Status movement |
| APPROVAL | Approve, reject, return, delegate |
| DOCUMENT | Upload, download, revise, issue |
| FINANCIAL | Payment, invoice, BOQ, IPC, cost change |
| SYSTEM | Automated trigger, scheduled job |
| ADMIN | Configuration change |
| INTEGRATION | Telegram, email, API, webhook event |

---

## Audit Severity Rules

| Severity | Meaning | Example |
|---|---|---|
| LOW | Normal routine action | Comment added |
| MEDIUM | Important business action | Task reassigned |
| HIGH | Approval, rejection, document, financial action | PO approved |
| CRITICAL | Security, deletion, permission, major finance, safety | Role changed, payment deleted |

---

## Recommended Audit Table

Use this table as baseline:

```sql
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid null,
  wbs_node_id uuid null,
  module_code text not null,
  entity_type text not null,
  entity_id text not null,
  action_type text not null,
  action_label text not null,
  event_category text not null,
  severity text not null default 'LOW',
  user_id uuid null,
  user_name_snapshot text null,
  user_role_snapshot text null,
  department_snapshot text null,
  old_values jsonb null,
  new_values jsonb null,
  changed_fields jsonb null,
  status_from text null,
  status_to text null,
  comment text null,
  reason_code text null,
  ip_address text null,
  user_agent text null,
  device_type text null,
  source_channel text not null default 'WEB',
  is_system_generated boolean not null default false,
  correlation_id text null,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_tenant_created_at on audit_logs (tenant_id, created_at desc);
create index idx_audit_logs_project on audit_logs (project_id, created_at desc);
create index idx_audit_logs_entity on audit_logs (entity_type, entity_id, created_at desc);
create index idx_audit_logs_user on audit_logs (user_id, created_at desc);
create index idx_audit_logs_module on audit_logs (module_code, created_at desc);
```

---

## Audit Log Rules

When generating audit logic:

- Never store passwords, tokens, or secrets in `old_values` or `new_values`.
- Mask sensitive financial, HR, and personal fields where required.
- Capture snapshots of user name, role, and department because roles may change later.
- Keep audit records even if the business record is deleted.
- Use `correlation_id` to group related actions.
- Use record-level activity timeline for major records.
- Use before/after display for update actions.

---

## Notification Design Standard

### Notification Purpose

The notification matrix defines:

```text
Who should be notified
When they should be notified
Through which channel
With what priority
Whether escalation is required
```

---

## Notification Channels

| Channel | Use |
|---|---|
| IN_APP | Default notification center |
| EMAIL | Formal approvals and external/official actions |
| TELEGRAM | Fast construction operation alerts |
| PUSH | Future mobile field app |
| SMS | Emergency fallback only |
| DASHBOARD_BADGE | Passive management visibility |

---

## Notification Priorities

| Priority | Channel Rule |
|---|---|
| LOW | In-app only or digest |
| NORMAL | In-app, optional email |
| HIGH | In-app + email or Telegram |
| CRITICAL | In-app + email + Telegram + escalation |

---

## Notification Types

Use these notification types:

```text
INFO
ACTION_REQUIRED
REMINDER
ESCALATION
SYSTEM_ALERT
DIGEST
```

---

## Recommended Notification Tables

### notification_templates

```sql
create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null unique,
  module_code text not null,
  event_code text not null,
  title_template text not null,
  message_template text not null,
  default_priority text not null default 'NORMAL',
  supported_channels text[] not null default array['IN_APP'],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### notification_rules

```sql
create table notification_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid null,
  module_code text not null,
  event_code text not null,
  recipient_strategy text not null,
  recipient_roles text[] null,
  recipient_users uuid[] null,
  channels text[] not null default array['IN_APP'],
  priority text not null default 'NORMAL',
  delay_minutes integer not null default 0,
  escalation_enabled boolean not null default false,
  escalation_after_hours integer null,
  escalation_roles text[] null,
  quiet_hours_enabled boolean not null default false,
  digest_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### notifications

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid null,
  recipient_user_id uuid not null,
  module_code text not null,
  entity_type text not null,
  entity_id text not null,
  event_code text not null,
  title text not null,
  message text not null,
  priority text not null default 'NORMAL',
  type text not null default 'INFO',
  action_url text null,
  is_read boolean not null default false,
  read_at timestamptz null,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create index idx_notifications_recipient on notifications (recipient_user_id, is_read, created_at desc);
create index idx_notifications_project on notifications (project_id, created_at desc);
```

### notification_delivery_logs

```sql
create table notification_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  channel text not null,
  delivery_status text not null default 'PENDING',
  provider_response jsonb null,
  retry_count integer not null default 0,
  sent_at timestamptz null,
  failed_reason text null,
  created_at timestamptz not null default now()
);
```

---

## Recipient Strategies

Support these recipient strategies:

| Strategy | Example |
|---|---|
| ASSIGNED_USER | Task assignee |
| CREATED_BY | Record creator |
| CURRENT_APPROVER | Current approval step user |
| PROJECT_ROLE | Project Manager |
| DISCIPLINE_ROLE | Structural Lead for STR records |
| DEPARTMENT | Procurement department |
| STAKEHOLDER_TYPE | Consultant, supplier, subcontractor |
| WBS_RESPONSIBLE | Responsible engineer for WBS node |
| CUSTOM_USER | Fixed user selection |
| ESCALATION_CHAIN | PM → Project Director → Company Admin |

---

## Core DCOS Notification Matrix

Use these as MVP baseline:

| Event | Notify | Priority | Channel |
|---|---|---|---|
| TASK_ASSIGNED | Assignee, Discipline Manager | NORMAL | IN_APP, TELEGRAM |
| TASK_SUBMITTED_REVIEW | Reviewer / Supervisor | HIGH | IN_APP, TELEGRAM |
| TASK_REJECTED | Assignee, Discipline Manager | HIGH | IN_APP, EMAIL |
| TASK_OVERDUE | Assignee, Discipline Manager, PM | HIGH | IN_APP, EMAIL, TELEGRAM |
| CRITICAL_TASK_OVERDUE | Assignee, Discipline Manager, PM, Director | CRITICAL | IN_APP, EMAIL, TELEGRAM |
| DOCUMENT_SUBMITTED_REVIEW | Reviewer / Approver | HIGH | IN_APP, EMAIL |
| DOCUMENT_APPROVED | Originator, Document Controller | NORMAL | IN_APP, EMAIL |
| DOCUMENT_REJECTED | Originator, Document Controller | HIGH | IN_APP, EMAIL |
| DRAWING_ISSUED_IFC | PM, Discipline Manager, Site Team, Document Controller | HIGH | IN_APP, EMAIL, TELEGRAM |
| RFI_CREATED | Assigned responder, PM, Document Controller | HIGH | IN_APP, EMAIL |
| RFI_OVERDUE | Responder, PM, Project Director | CRITICAL | IN_APP, EMAIL, TELEGRAM |
| PR_SUBMITTED | Procurement Approver | HIGH | IN_APP, EMAIL |
| PO_APPROVED | Procurement, Account, Requester | HIGH | IN_APP, EMAIL |
| DELIVERY_RECEIVED | Procurement, Storekeeper, Requester, Site Engineer | NORMAL | IN_APP, TELEGRAM |
| INSPECTION_FAILED | Site Engineer, QA/QC Manager, PM | HIGH | IN_APP, EMAIL, TELEGRAM |
| NCR_CREATED | Responsible party, QA/QC Manager, PM | CRITICAL | IN_APP, EMAIL, TELEGRAM |
| SAFETY_INCIDENT_REPORTED | HSE, PM, Director | CRITICAL | IN_APP, EMAIL, TELEGRAM, SMS optional |
| TIMESHEET_SUBMITTED | Supervisor / Approver | NORMAL | IN_APP |
| TIMESHEET_REJECTED | Employee | HIGH | IN_APP, EMAIL optional |
| ROLE_PERMISSION_CHANGED | Company Admin / Security Owner | CRITICAL | IN_APP, EMAIL |
| FAILED_LOGIN_REPEATED | Company Admin / Security Owner | CRITICAL | IN_APP, EMAIL |
```

---

## Escalation Logic

Use this pattern:

```text
Action required notification generated
→ no action within configured time
→ reminder sent
→ still no action
→ escalation to manager
→ still no action
→ escalation to project director/company admin
```

Recommended timing:

| Event | Reminder | Escalation | Final Escalation |
|---|---:|---:|---:|
| Task overdue | Same day | 1 day | 3 days |
| RFI overdue | Same day | 1 day | 2 days |
| NCR overdue | Same day | 1 day | 2 days |
| PR approval pending | 1 day | 2 days | 4 days |
| PO approval pending | 1 day | 2 days | 3 days |
| Payment approval pending | 1 day | 2 days | 3 days |
| Safety incident | Immediate | 1 hour | 4 hours |

---

## Anti-Spam Rules

Always include anti-spam control:

- Group low-priority updates into daily digest.
- Do not send repeated alerts every few minutes.
- Critical events bypass digest.
- Users may mute low-priority information, but not critical workflow actions.
- Avoid duplicate delivery for the same event, same user, same channel.
- Combine similar notifications when possible.
- Quiet hours apply only to non-critical messages.

---

## Required UI Screens

When asked to design UI, include these screens:

### Audit Log UI

- Global audit log screen
- Record activity timeline tab
- Audit detail drawer
- Before/after value comparison
- User activity report
- Permission change report
- Deleted/archived record report

### Notification UI

- Notification bell
- Notification center
- Action required inbox
- Admin notification matrix screen
- Delivery failure monitor
- Escalation dashboard

---

## Supabase RLS Guidance

For `notifications`:

- Users can view only their own notifications.
- Project managers can view project notification statistics but not private message content unless permitted.
- Admins can configure rules for their tenant.

For `audit_logs`:

- Normal users can view activity history only for records they are allowed to access.
- Project managers can view audit logs for assigned projects.
- Company admins can view tenant audit logs.
- No user can update or delete audit logs from the frontend.

Example policy style:

```sql
alter table audit_logs enable row level security;

create policy "Company admins can view tenant audit logs"
on audit_logs
for select
using (
  tenant_id = auth.jwt() ->> 'tenant_id'::text
);
```

Always adapt policies to actual JWT claims and role helper functions.

---

## Output Format Standard

When responding to a DCOS audit/notification request, structure the answer like this:

```markdown
# [Module/Feature] Audit + Notification Design

## 1. Purpose
## 2. Trigger Events
## 3. Audit Events
## 4. Notification Rules
## 5. Escalation Rules
## 6. Data Model
## 7. UI Design
## 8. RLS / Permission Rules
## 9. Edge Cases
## 10. Test Cases
```

---

## Edge Cases to Always Check

- What happens when the assigned user is inactive?
- What happens when a reviewer is removed from the project?
- What happens when Telegram delivery fails?
- What happens when email succeeds but in-app fails?
- What happens when a task is reassigned after notification?
- What happens when approval is delegated?
- What happens when a document is superseded?
- What happens when an audit event contains sensitive fields?
- What happens if a notification rule is disabled?
- What happens if multiple users have the same project role?

---

## Test Case Standard

Always include test cases such as:

```text
Given a task is assigned
When the assignee is active
Then an in-app notification is created
And a Telegram delivery log is created
And an audit log records TASK_ASSIGNED
```

```text
Given an RFI is overdue
When the configured escalation time is reached
Then the PM and Project Director receive escalation notifications
And the escalation event is logged in audit_logs
```

```text
Given a user changes another user's role
When the change is saved
Then a CRITICAL audit event is created
And Company Admin receives a security notification
```

---

## Coding Style Preferences

When generating implementation code:

- Use TypeScript where possible.
- Use clear service names such as `AuditService`, `NotificationService`, `EscalationService`.
- Keep audit creation server-side only.
- Avoid direct frontend insert to `audit_logs`.
- Use transactions when a business action must create both record update and audit log.
- Use queue/background jobs for email, Telegram, push, and retry delivery.
- Return user-friendly errors.

---

## Final Reminder

Audit and notification are not decoration. They are control systems.

A DCOS workflow without audit is only a rumor.
A DCOS workflow without notification is only a hidden problem.
