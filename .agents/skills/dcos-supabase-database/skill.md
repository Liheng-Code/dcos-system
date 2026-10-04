# dcos-supabase-database Skill

## Purpose

Use this skill when working on the DCOS Supabase/PostgreSQL database layer.

This skill helps Codex design, review, generate, and improve database structures for the Digital Construction Operating System (DCOS), including project setup, WBS, tasks, document control, approval workflows, notifications, audit logs, procurement, construction execution, HR, finance, and other construction modules.

The main goal is to keep the database practical, scalable, secure, and construction-ready.

---

## When To Use This Skill

Use this skill when the user asks to:

- Design Supabase tables for a DCOS module
- Create SQL migration files
- Create seed data
- Review an existing database schema
- Add Row Level Security policies
- Design tenant isolation
- Connect tables across Project, WBS, Tasks, Documents, Approval, Audit, and Notification
- Convert a business workflow into database tables
- Debug Supabase schema, RLS, or relationship issues
- Prepare database prompt instructions for Lovable, Codex, or another coding agent

---

## DCOS Database Principles

### 1. Tenant-first design

DCOS is a multi-company system. Most business tables must include:

```sql
tenant_id uuid not null
```

Never trust `tenant_id` from a frontend request body. It should come from the authenticated user context or secure server logic.

Recommended rule:

```text
Every project, WBS, task, document, approval, notification, procurement, cost, and report record must be tenant-scoped.
```

### 2. WBS is the project spine

Most project records should link to:

```sql
project_id uuid not null
wbs_node_id uuid null
```

Use `wbs_node_id` when the record belongs to a location, element, work package, or project breakdown node.

Use `project_id` only when the record is project-level and not location-specific.

### 3. Shared engines before module tables

Before building advanced modules, keep these core shared tables strong:

```text
companies / tenants
users / profiles
roles
permissions
projects
project_members
stakeholders
project_stakeholders
wbs_nodes
tasks
documents
approval_workflows
approval_steps
approval_actions
notifications
audit_logs
comments
attachments
```

### 4. Status must be controlled

Do not scatter random status text everywhere. Prefer controlled status fields with agreed values.

Example task status:

```text
Open
Assigned
In Progress
On Hold
Completed
Submitted for Approval
Approved
Rejected
Closed
Cancelled
```

Example document status:

```text
Draft
Submitted
Under Review
Approved
Approved with Comment
Rejected
Issued for Construction
Superseded
Archived
```

### 5. Auditability is mandatory

Important actions must create audit logs:

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
ROLE_CHANGE
PERMISSION_CHANGE
STATUS_CHANGE
CONFIG_CHANGE
NOTIFICATION_SENT
NOTIFICATION_FAILED
```

Audit logs should be append-only. Do not design normal update/delete access for audit logs.

### 6. Soft delete over hard delete

For construction records, prefer:

```sql
is_active boolean default true,
deleted_at timestamptz null,
deleted_by uuid null
```

Hard delete should be rare because project records may be legal evidence.

### 7. Use UUID primary keys

Recommended primary key pattern:

```sql
id uuid primary key default gen_random_uuid()
```

### 8. Use timestamps consistently

Most tables should include:

```sql
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
created_by uuid null,
updated_by uuid null
```

Use triggers for `updated_at` where possible.

---

## Recommended Core Table Pattern

When creating a new business table, start from this pattern:

```sql
create table if not exists public.example_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid null,
  wbs_node_id uuid null,

  code text not null,
  title text not null,
  description text null,
  status text not null default 'Draft',

  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint example_records_code_project_unique unique (project_id, code)
);
```

Then add foreign keys, indexes, RLS, and module-specific fields.

---

## Supabase RLS Rules

### Always enable RLS for tenant business tables

```sql
alter table public.example_records enable row level security;
```

### Basic tenant isolation policy pattern

Use this only after confirming the project has a reliable user profile table linking auth users to tenant/company.

Assumed profile pattern:

```sql
public.profiles (
  id uuid primary key references auth.users(id),
  tenant_id uuid not null,
  full_name text,
  role_code text,
  is_active boolean default true
)
```

Example policy:

```sql
create policy "Tenant members can view example records"
on public.example_records
for select
using (
  tenant_id in (
    select tenant_id
    from public.profiles
    where id = auth.uid()
      and is_active = true
  )
);
```

Insert policy:

```sql
create policy "Tenant members can insert example records"
on public.example_records
for insert
with check (
  tenant_id in (
    select tenant_id
    from public.profiles
    where id = auth.uid()
      and is_active = true
  )
);
```

Update policy:

```sql
create policy "Tenant members can update example records"
on public.example_records
for update
using (
  tenant_id in (
    select tenant_id
    from public.profiles
    where id = auth.uid()
      and is_active = true
  )
)
with check (
  tenant_id in (
    select tenant_id
    from public.profiles
    where id = auth.uid()
      and is_active = true
  )
);
```

Avoid broad delete policies. Prefer soft delete through update.

---

## Indexing Rules

Add indexes for fields used in filters, joins, and dashboards.

Common indexes:

```sql
create index if not exists idx_table_tenant_id on public.table_name (tenant_id);
create index if not exists idx_table_project_id on public.table_name (project_id);
create index if not exists idx_table_wbs_node_id on public.table_name (wbs_node_id);
create index if not exists idx_table_status on public.table_name (status);
create index if not exists idx_table_created_at on public.table_name (created_at desc);
```

For task/dashboard tables, also consider:

```sql
create index if not exists idx_tasks_assigned_to on public.tasks (assigned_to);
create index if not exists idx_tasks_due_date on public.tasks (planned_finish);
create index if not exists idx_tasks_project_status on public.tasks (project_id, status);
```

---

## DCOS Core Table Groups

### Group A — Security and Tenant

```text
tenants
profiles
roles
permissions
role_permissions
user_roles
project_members
```

### Group B — Project Core

```text
projects
stakeholders
project_stakeholders
wbs_nodes
disciplines
departments
project_calendars
project_settings
```

### Group C — Task Core

```text
tasks
task_assignments
task_dependencies
task_progress_logs
task_comments
task_attachments
```

### Group D — Document Core

```text
documents
document_types
document_revisions
document_transmittals
document_comments
document_access_logs
```

### Group E — Workflow Core

```text
approval_workflows
approval_steps
approval_actions
notifications
notification_rules
notification_templates
notification_delivery_logs
audit_logs
```

### Group F — Construction Execution

```text
daily_reports
manpower_logs
equipment_logs
material_usage_logs
site_photos
inspection_requests
ncrs
```

### Group G — Procurement and Stock

```text
purchase_requisitions
purchase_requisition_items
purchase_orders
purchase_order_items
suppliers
stock_items
stock_transactions
material_receipts
```

### Group H — Commercial and Finance

```text
boq_sections
boq_items
budget_lines
cost_commitments
progress_claims
ipc_items
variation_orders
retention_records
payment_requests
invoices
cost_codes
```

---

## Output Format Rules

When generating database work, provide these sections:

1. Purpose
2. Tables to create or change
3. SQL migration
4. RLS policies
5. Indexes
6. Seed data if useful
7. Integration with other DCOS modules
8. Risks or assumptions
9. Next implementation step

For code generation, prefer complete SQL blocks that can be copied into Supabase SQL Editor or migration files.

---

## Review Checklist

Before finalizing any schema, check:

- Does the table include `tenant_id` where needed?
- Does it link to `project_id` and `wbs_node_id` where relevant?
- Are status values controlled?
- Are foreign keys clear?
- Are indexes added for common queries?
- Is RLS enabled?
- Are insert/update policies safe?
- Is delete avoided or soft delete used?
- Does the table support audit logging?
- Does the table support future reporting/KPI use?
- Are names consistent and easy for developers to understand?

---

## Naming Conventions

Use snake_case for database names.

Good:

```text
project_id
wbs_node_id
approval_status
created_at
updated_by
```

Avoid:

```text
projectID
WBSNodeId
ApprovalStatus
CreatedAt
```

Table names should be plural:

```text
projects
tasks
documents
audit_logs
purchase_orders
```

---

## Common DCOS Relationships

### Project to WBS

```text
projects.id → wbs_nodes.project_id
```

### WBS parent-child

```text
wbs_nodes.id → wbs_nodes.parent_id
```

### Task to Project and WBS

```text
projects.id → tasks.project_id
wbs_nodes.id → tasks.wbs_node_id
```

### Document to Project and WBS

```text
projects.id → documents.project_id
wbs_nodes.id → documents.wbs_node_id
```

### Approval to Any Record

Use polymorphic reference carefully:

```text
entity_type
entity_id
```

Example:

```text
entity_type = 'task'
entity_id = task uuid
```

### Audit to Any Record

Use:

```text
module_code
entity_type
entity_id
action_type
```

---

## Example Prompt Patterns

### Design a new module database

```text
Use the dcos-supabase-database skill.
Design Supabase tables for the DCOS [module name] module.
Include SQL migration, RLS policies, indexes, seed data, relationships to project_id and wbs_node_id, and audit log integration.
```

### Review existing schema

```text
Use the dcos-supabase-database skill.
Review this schema for DCOS enterprise readiness.
Check tenant isolation, RLS, WBS linkage, indexes, auditability, naming consistency, and reporting readiness.
```

### Generate RLS policies

```text
Use the dcos-supabase-database skill.
Create safe Supabase RLS policies for these tables.
Assume profiles.id references auth.users(id), and profiles.tenant_id controls company access.
```

---

## Important Warnings

- Do not design DCOS as single-project only. Multi-project and multi-tenant must be supported from the beginning.
- Do not create isolated module tables without `project_id` or `wbs_node_id` when the record belongs to project work.
- Do not let frontend users send arbitrary `tenant_id` without validation.
- Do not allow normal users to delete audit logs.
- Do not overuse JSONB for structured construction data. Use JSONB only for flexible metadata, snapshots, or changing configurations.
- Do not skip indexes. Dashboards will become slow quickly.
- Do not hard-code workflows that should be configurable through approval workflow tables.

---

## Final Behavior

When this skill is active, Codex should act like a senior Supabase/PostgreSQL database architect for a construction enterprise platform.

It should be strict, practical, and skeptical. A clean database foundation beats fancy UI. If the schema is weak, the whole DCOS will wobble like bad formwork before concrete pour.
