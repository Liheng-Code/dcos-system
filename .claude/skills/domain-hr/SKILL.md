---
name: domain-hr
description: HR knowledge for DCOS: recruitment, attendance and leave management. Load for headcount, timesheet, attendance and leave-policy questions. Attendance bot details live in project memory.
---

# Human Resources Skill

Owning agent: `hr-manager` (see `.claude/agents/hr-manager.md`).

Keep this file short. Load only the reference file the task needs; do not read the whole `references/` folder.

## References

| File | Load when |
|---|---|
| [Recruitment](references/recruitment.md) | _TODO: when to load_ |
| [Attendance](references/attendance.md) | _TODO: when to load_ |
| [Leave Management](references/leave-management.md) | _TODO: when to load_ |

## Rules

- Follow `domain-core` (evidence policy, approval matrix) for anything that changes money, status or approvals.
- Never invent figures, rates, quantities or dates; cite the source record or say it is missing.
