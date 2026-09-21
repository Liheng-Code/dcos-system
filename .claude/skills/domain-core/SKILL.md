---
name: domain-core
description: Cross-department DCOS governance: agent rules, permission matrix, approval matrix and evidence policy. Load when a task touches approvals, who-can-do-what across departments, or what evidence an agent must cite. Complements dcos-rbac-permission (code-level RBAC).
---

# Core Governance Skill

No dedicated agent; shared by all department agents.

Keep this file short. Load only the reference file the task needs; do not read the whole `references/` folder.

## References

| File | Load when |
|---|---|
| [Agent Governance](references/agent-governance.md) | _TODO: when to load_ |
| [Permission Matrix](references/permission-matrix.md) | _TODO: when to load_ |
| [Approval Matrix](references/approval-matrix.md) | _TODO: when to load_ |
| [Evidence Policy](references/evidence-policy.md) | _TODO: when to load_ |

## Rules

- Follow `domain-core` (evidence policy, approval matrix) for anything that changes money, status or approvals.
- Never invent figures, rates, quantities or dates; cite the source record or say it is missing.
