---
name: domain-finance
description: Finance knowledge for DCOS: accounting and financial reporting. Load for ledger, cash-flow, invoicing and financial statement questions.
---

# Finance Skill

Owning agent: `finance-manager` (see `.claude/agents/finance-manager.md`).

Keep this file short. Load only the reference file the task needs; do not read the whole `references/` folder.

## References

| File | Load when |
|---|---|
| [Accounting](references/accounting.md) | _TODO: when to load_ |
| [Financial Reporting](references/financial-reporting.md) | _TODO: when to load_ |

## Rules

- Follow `domain-core` (evidence policy, approval matrix) for anything that changes money, status or approvals.
- Never invent figures, rates, quantities or dates; cite the source record or say it is missing.
