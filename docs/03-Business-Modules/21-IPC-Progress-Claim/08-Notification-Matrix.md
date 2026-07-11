# 08 — Notification Matrix
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-NOTIF-001 | **Rev:** R0
Inherits platform notification engine rules (priorities, channels, escalation,
anti-spam). This document only defines module-specific events.

---

| Event | Notify | Priority | Channels | Escalation |
|---|---|---|---|---|
| IPC cut-off approaching (3 days) | QS Engineer | Normal | In-app, Telegram | – |
| IPC not created by cut-off | QS Engineer, QS Manager | High | In-app, Telegram | +1 day → PM |
| IPC submitted for internal review | QS Manager | High | In-app, Email | 1 day → PM |
| IPC returned to draft | QS Engineer | High | In-app, Email | – |
| PM endorsement pending | PM | High | In-app, Telegram | 1 day → Project Director |
| IPC submitted to client | PM, Project Director, Accountant | Normal | In-app, Email | – |
| Contract submission deadline at risk (time-bar) | QS Manager, PM | **Critical** | In-app, Email, Telegram | Immediate → Director |
| Certification overdue (per contract days) | QS Engineer, QS Manager | High | In-app, Email | 3 days → PM |
| Certification recorded | PM, Accountant, Project Director | High | In-app, Email | – |
| Variance > threshold (e.g. 5% of claim) | QS Manager, PM, Commercial Manager | **Critical** | In-app, Email, Telegram | – |
| IPC recalled after submission | PM, QS Manager, Project Director | **Critical** | In-app, Email | – |
| Payment received | Accountant, PM, QS Manager | Normal | In-app | – |
| Payment overdue vs contract terms | Accountant, PM, Project Director | High | In-app, Email | Weekly until resolved |
| Retention rule manually overridden | Commercial Manager, Company Admin | **Critical** | In-app, Email | – |

Digest rules: payment-received and cut-off reminders may be grouped into the
daily digest; all Critical events bypass digest per platform rules.

Templates: use platform variables — {{ipc_number}}, {{project_name}},
{{net_claim}}, {{certified_net}}, {{variance_total}}, {{deadline_date}}.
