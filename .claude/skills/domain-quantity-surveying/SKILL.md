---
name: domain-quantity-surveying
description: Quantity surveying knowledge for DCOS: tender, QTO, BOQ, cost estimation, rate analysis, procurement, variations, cost control, IPC/payment, claims, final account and QS reporting. Load for any BOQ, IPC, retention, VO or cost-control question.
---

# Quantity Surveying Skill

Owning agent: `qs-manager` (see `.claude/agents/qs-manager.md`).

Keep this file short. Load only the reference file the task needs; do not read the whole `references/` folder.

## References

| File | Load when |
|---|---|
| [Governance](references/00-governance.md) | _TODO: when to load_ |
| [Core Knowledge](references/01-core-knowledge.md) | _TODO: when to load_ |
| [Research](references/02-research.md) | _TODO: when to load_ |
| [Tender](references/03-tender.md) | _TODO: when to load_ |
| [Qto](references/04-qto.md) | _TODO: when to load_ |
| [Boq](references/05-boq.md) | _TODO: when to load_ |
| [Cost Estimation](references/06-cost-estimation.md) | _TODO: when to load_ |
| [Procurement](references/07-procurement.md) | _TODO: when to load_ |
| [Contract Variation](references/08-contract-variation.md) | _TODO: when to load_ |
| [Cost Control](references/09-cost-control.md) | _TODO: when to load_ |
| [Ipc Payment](references/10-ipc-payment.md) | _TODO: when to load_ |
| [Claims](references/11-claims.md) | _TODO: when to load_ |
| [Final Account](references/12-final-account.md) | _TODO: when to load_ |
| [Reporting](references/13-reporting.md) | _TODO: when to load_ |
| [Data Model](references/14-data-model.md) | _TODO: when to load_ |
| [Workflows](references/15-workflows.md) | _TODO: when to load_ |
| [Reference](references/17-reference.md) | _TODO: when to load_ |
| [Templates](references/16-templates/) | _TODO: when to load_ |

## Migration notes

Absorbs former agents: qs-research, qs-tender, qs-qto, qs-qto-verification (-> 04-qto), qs-boq, qs-cost-estimate, qs-rate-analysis (-> 06-cost-estimation), qs-procurement, qs-contract-variation, qs-cost-control, qs-ipc-payment, qs-claims, qs-final-account, qs-reporting.

## Rules

- Follow `domain-core` (evidence policy, approval matrix) for anything that changes money, status or approvals.
- Never invent figures, rates, quantities or dates; cite the source record or say it is missing.
