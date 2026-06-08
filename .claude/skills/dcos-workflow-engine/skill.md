# DCOS Workflow Engine Skill

## Purpose

Use this skill when designing, reviewing, or generating workflow logic for the Digital Construction Operating System (DCOS).

This skill helps Claude Code create enterprise-grade construction workflows that are consistent, auditable, configurable, role-aware, WBS-linked, and suitable for real project execution.

DCOS principle:

> One unified construction operating system + shared WBS spine + shared workflow engine + modular discipline workflows.

## When to Use This Skill

Use this skill for requests involving:

- Task status workflows
- Document approval workflows
- RFI workflows
- Submittal workflows
- Procurement PR / RFQ / PO workflows
- QA/QC inspection workflows
- NCR workflows
- HSE permit workflows
- Timesheet and leave approval workflows
- Payment request workflows
- Variation order workflows
- Claims and EOT workflows
- Workflow status design
- Approval matrix design
- Notification trigger design
- Audit trail integration
- Database schema for workflow engines
- Supabase / PostgreSQL workflow tables
- Workflow UI screen design
- Workflow edge-case handling

## Core DCOS Workflow Rule

Every workflow record must answer these questions:

1. Which tenant / company?
2. Which project?
3. Which WBS node, if applicable?
4. Which module?
5. Which record type?
6. Who created it?
7. Who owns the current action?
8. What is the current status?
9. What is the next allowed action?
10. What audit and notification events must be created?

## Standard Workflow Design Output

When asked to design a workflow, produce the following structure:

```markdown
# [Module Name] Workflow Design

## 1. Purpose
## 2. Users and Roles
## 3. Status Flow
## 4. Workflow Steps
## 5. Permission Matrix
## 6. Approval Rules
## 7. Notification Rules
## 8. Audit Log Rules
## 9. Data Model
## 10. API Endpoints
## 11. UI Screens
## 12. Edge Cases
## 13. Reports and KPIs
## 14. MVP Scope
## 15. Future Enhancement
```

## Shared Workflow Engine Concept

Do not design each workflow as hard-coded logic inside each module.

Preferred architecture:

```text
Business Module
→ Workflow Template
→ Workflow Instance
→ Workflow Step
→ Approval Action
→ Status Transition
→ Notification Event
→ Audit Log Event
```

## Recommended Core Tables

Use these tables as the shared workflow foundation:

```text
workflow_templates
workflow_template_steps
workflow_instances
workflow_instance_steps
workflow_actions
workflow_status_transitions
approval_rules
approval_delegations
notification_events
audit_logs
```

## Suggested Table Fields

### workflow_templates

| Field | Purpose |
|---|---|
| id | Unique workflow template ID |
| tenant_id | Company / tenant ID |
| module_code | TASK, DOC, RFI, PR, PO, QA, HSE, HR, FIN |
| workflow_code | Unique workflow code |
| workflow_name | Human-readable workflow name |
| record_type | Related record type |
| is_active | Enable / disable |
| version | Workflow version |
| created_at | Created date |
| updated_at | Updated date |

### workflow_template_steps

| Field | Purpose |
|---|---|
| id | Unique step ID |
| workflow_template_id | Parent workflow template |
| step_order | Sequence order |
| step_code | DRAFT, REVIEW, APPROVAL, CLOSE |
| step_name | Human-readable step name |
| assigned_role | Role responsible for this step |
| assigned_user_strategy | Role, creator manager, project role, fixed user |
| allow_approve | Whether approve action is allowed |
| allow_reject | Whether reject action is allowed |
| allow_return | Whether return for correction is allowed |
| sla_hours | Expected response time |
| escalation_role | Role to notify when overdue |

### workflow_instances

| Field | Purpose |
|---|---|
| id | Unique workflow instance ID |
| tenant_id | Company / tenant ID |
| project_id | Related project |
| wbs_node_id | Related WBS node |
| module_code | Module code |
| entity_type | Record type |
| entity_id | Related business record ID |
| workflow_template_id | Template used |
| current_step_id | Current workflow step |
| current_status | Current workflow status |
| created_by | User who started workflow |
| current_assignee_id | User currently responsible |
| started_at | Workflow start date |
| completed_at | Workflow completed date |

### workflow_actions

| Field | Purpose |
|---|---|
| id | Unique action ID |
| workflow_instance_id | Related workflow instance |
| action_by | User who performed action |
| action_type | SUBMIT, APPROVE, REJECT, RETURN, CANCEL, CLOSE |
| status_from | Previous status |
| status_to | New status |
| comment | Reason or approval comment |
| attachment_id | Optional attachment evidence |
| created_at | Action time |

## Standard Status Patterns

### Simple Approval Flow

```text
Draft
→ Submitted
→ Under Review
→ Approved
→ Closed
```

Rejection path:

```text
Under Review
→ Rejected
→ Revised
→ Resubmitted
```

### Task Workflow

```text
Open
→ Assigned
→ In Progress
→ Pending Approval
→ Approved / Completed
→ Closed
```

Rework path:

```text
Pending Approval
→ Rejected
→ In Progress
```

On-hold path:

```text
Any active status
→ On Hold
→ Resume to previous status
```

### Document Workflow

```text
Draft
→ Submitted
→ Under Review
→ Approved / Approved with Comment / Rejected
→ Issued for Construction
→ Superseded
→ Archived
```

### RFI Workflow

```text
Draft
→ Submitted
→ Assigned
→ Response in Progress
→ Response Submitted
→ Closed
```

Reopen path:

```text
Closed
→ Reopened
→ Assigned
```

### Procurement PR Workflow

```text
Draft PR
→ Submitted PR
→ Under Review
→ Approved PR / Rejected PR
→ Converted to RFQ / PO
→ Closed
```

### QA Inspection Workflow

```text
Draft
→ Submitted
→ Scheduled
→ Inspected
→ Passed / Failed
→ Closed
```

Failed path:

```text
Failed
→ NCR Created
→ Corrective Action
→ Reinspection
→ Passed
→ Closed
```

## Permission Design Rule

Workflow permission is not only role-based. It must combine:

```text
User permission = role permission + project access + discipline access + workflow responsibility + record ownership
```

Always define who can:

- Create
- Edit draft
- Submit
- Review
- Approve
- Reject
- Return for correction
- Cancel
- Reopen
- Close
- Export
- Configure workflow

## Notification Rules

Every workflow should define notification triggers.

Minimum triggers:

| Trigger | Notify |
|---|---|
| Record submitted | Next reviewer / approver |
| Record approved | Creator / responsible user |
| Record rejected | Creator / previous submitter |
| Record returned for correction | Responsible user |
| Record overdue | Current assignee + manager |
| Record escalated | Higher approval role |
| Workflow completed | Creator + project manager if major record |

Priority rules:

```text
Normal = status update only
High = action required
Critical = overdue, safety, finance, legal, claim, or major delay impact
```

## Audit Log Rules

Every workflow transition must create an audit log.

Always audit:

- CREATE
- UPDATE
- SUBMIT
- APPROVE
- REJECT
- RETURN
- REASSIGN
- ESCALATE
- CANCEL
- CLOSE
- REOPEN
- OVERRIDE

Audit details must include:

- User
- Role snapshot
- Project
- WBS node
- Module
- Entity ID
- Status from
- Status to
- Comment / reason
- Timestamp
- Source channel

## Workflow UI Pattern

Every workflow-enabled record should include:

```text
Header: Record code, title, status badge, responsible user
Main: Form or record detail
Right Panel: Current workflow step, action buttons, approver list
Bottom / Tab: Activity timeline, comments, attachments, audit history
```

Recommended UI tabs:

```text
Details | Workflow | Comments | Attachments | Audit History
```

## Action Button Rules

Show action buttons only when the user is allowed to act.

Examples:

- Submit: visible to creator when status is Draft
- Approve: visible to current approver only
- Reject: visible to current approver only and requires reason
- Return: visible to reviewer / approver and requires comment
- Reopen: visible to PM / admin depending permission
- Cancel: visible to creator before approval or admin override

## Validation Rules

Before submit:

- Required fields completed
- Project selected
- WBS selected if module requires WBS
- Attachment uploaded if required
- Approver exists
- Workflow template active

Before approve:

- User is current approver
- Required review comment completed if configured
- Mandatory checklist completed if applicable

Before reject:

- Rejection reason required
- Next responsible user defined

Before close:

- All required approval steps completed
- No open corrective actions
- Required documents attached

## Edge Cases to Consider

Always check these when designing a workflow:

- Approver is inactive
- Approver is on leave
- Duplicate submission
- User tries to approve own submission
- Record edited during review
- Attachment changed after approval
- Workflow template changed while instance is active
- Project is archived
- WBS node is inactive
- Record is deleted but workflow exists
- External stakeholder needs limited access
- Emergency override required
- Escalation after overdue

## DCOS-Specific Workflow Priorities

For MVP, prioritize these workflows:

1. Task assignment and approval
2. Document review and approval
3. RFI submission and response
4. Daily report submission
5. Basic PR approval
6. QA inspection result workflow
7. NCR corrective action workflow
8. Timesheet approval

Do not overbuild complex workflow engines before core project, WBS, task, and document modules are stable.

## Code Generation Guidance

When generating implementation code:

- Prefer TypeScript.
- Prefer Supabase PostgreSQL for MVP.
- Use UUID primary keys.
- Include `tenant_id` in all workflow tables.
- Include `project_id` and `wbs_node_id` where applicable.
- Use enum-like check constraints or lookup tables for status/action types.
- Add indexes on tenant_id, project_id, entity_id, current_status, current_assignee_id.
- Add RLS policies for tenant isolation.
- Avoid hardcoding approval chains in frontend.
- Keep workflow rules configurable in database.

## Review Checklist

Before finalizing a workflow design, verify:

- Is it connected to tenant, project, and WBS?
- Are statuses clear and not duplicated?
- Is rejection path defined?
- Is rework path defined?
- Is escalation defined?
- Are notifications defined?
- Are audit logs defined?
- Are permissions role-aware and responsibility-aware?
- Are UI actions conditionally visible?
- Are edge cases handled?
- Can the workflow be configured without code changes?

## Preferred Tone and Output Style

Be practical and construction-focused.

Avoid vague software language.

Use real construction examples:

- Drawing approval
- RFI response
- PR approval
- Inspection failed
- NCR corrective action
- Task rejected due to missing photo evidence
- PO approval pending over SLA

Always explain workflow as something real project teams can use, not just a technical state machine.
