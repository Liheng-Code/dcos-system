# 10 — Reports & KPI
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-RPT-001 | **Rev:** R0

---

## 1. Reports

| Report | Audience | Content | Frequency |
|---|---|---|---|
| IPC Summary (submission package) | Client, PM | Header totals, section summary, retention/advance/back-charge breakdown, signature block | Per IPC |
| Measurement Detail Sheets | Client QS | Line-level quantities with WBS references and photos links | Per IPC |
| Claimed vs Certified Variance | QS Manager, Commercial Mgr | Per-line variance with reason codes, cumulative variance trend | Per IPC |
| Contract Position Statement | PM, Director, Board | Original sum, VOs, revised sum, certified to date, retention held, advance balance, paid, receivable | Monthly |
| Receivable Aging (certified-not-paid) | Accountant, Director | Certified IPCs by aging bucket | Weekly |
| Claim Cycle Performance | Commercial Mgr | Days draft→submit, submit→certify, certify→paid per project | Monthly |

## 2. KPIs (feed Reporting Engine)

| KPI | Formula | Target |
|---|---|---|
| Claim preparation time | submit_date − period_end | ≤ 5 days |
| Certification ratio | certified_net / net_claim | ≥ 95% |
| Average certification delay | certified_at − submitted_at | ≤ contract days |
| Receivable aging > 60 days | Σ certified-not-paid older than 60d | → 0 |
| Variance by reason code | grouped sum | trend ↓ |

Dashboard placement: Contract Position card on Project Dashboard; certification
ratio and receivable aging on Executive Dashboard.
