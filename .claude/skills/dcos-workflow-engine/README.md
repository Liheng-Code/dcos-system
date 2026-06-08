# DCOS Workflow Engine Skill

This Claude Code skill helps design and implement workflow logic for the Digital Construction Operating System.

## Install

Copy this folder into your project:

```text
.claude/skills/dcos-workflow-engine/
```

## Best Use Cases

Use it when asking Claude Code to design or generate:

- Task workflow
- Document approval workflow
- RFI workflow
- PR / PO workflow
- QA inspection workflow
- NCR workflow
- HSE permit workflow
- Timesheet workflow
- Approval matrix
- Notification triggers
- Audit trail events
- Supabase workflow tables
- Workflow UI screens

## Example Prompts

```text
Use the dcos-workflow-engine skill to design the task assignment workflow for DCOS.
```

```text
Use the dcos-workflow-engine skill to create Supabase tables for workflow_templates, workflow_instances, and workflow_actions with RLS.
```

```text
Use the dcos-workflow-engine skill to review this document approval flow and find missing edge cases.
```

```text
Use the dcos-workflow-engine skill to design the RFI workflow from draft to close, including notifications and audit logs.
```

## DCOS Rule

Every workflow should be:

```text
Tenant-scoped
Project-linked
WBS-aware
Role-aware
Status-controlled
Approval-driven
Notification-enabled
Audit-logged
```
