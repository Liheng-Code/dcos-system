# DCOS RBAC Permission Skill

This Claude Code skill helps design and review the access-control system for the Digital Construction Operating System.

## Install

Copy this folder to:

```text
.claude/skills/dcos-rbac-permission/
```

## Use it for

- Role and permission matrix
- Supabase RLS policies
- Project access control
- Discipline access control
- External stakeholder access
- Workflow approval checks
- Permission test cases
- Audit log events for permission changes

## Example prompts

```text
Use dcos-rbac-permission to design RBAC for Task Management.
```

```text
Use dcos-rbac-permission to create Supabase RLS policies for projects, tasks, documents, and project_members.
```

```text
Use dcos-rbac-permission to review this role-permission matrix and find security gaps.
```

```text
Use dcos-rbac-permission to design external consultant access for document review and RFI workflow.
```

## Main rule

```text
Effective Permission = Role Permission + Project Access + Discipline Access + Workflow Responsibility + Record Ownership + Tenant Boundary
```
