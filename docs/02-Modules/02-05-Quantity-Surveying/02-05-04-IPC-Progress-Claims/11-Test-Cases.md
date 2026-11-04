# 11 — Test Cases
**Doc Code:** DCOS-MOD21-TC-001 | **Rev:** R0
Format: each case = Given / When / Then. Full regression suite lives in the
test repo; this document is the acceptance baseline a QS can verify manually.

---

| # | Case | Given | When | Then |
|---|---|---|---|---|
| TC01 | Block IPC without BOQ | Project BOQ not approved | QS creates IPC | Creation blocked with prerequisite message |
| TC02 | Single open IPC | IPC-07 in Draft | QS creates IPC-08 | Blocked: one open IPC per project |
| TC03 | Retention auto-calc | Contract: 5% reducing to 2.5% at 50% | Cumulative passes 50% mid-claim | Retention this period uses correct split rule; rule popover shows calculation |
| TC04 | Overrun control | BOQ qty 100, cum 95 | QS enters this-period 10 | ⚠ overrun flag, comment required, save blocked until comment |
| TC05 | Negative re-measure | Cum qty 50 | QS enters −60 | Blocked: cumulative cannot go below 0 |
| TC06 | VO gating | VO-004 status = Submitted | QS adds VO-004 line | Blocked: only Approved VOs claimable |
| TC07 | Lock on submit | IPC Submitted | QS edits line qty via API | 403 + audit row; UI shows read-only |
| TC08 | Certified snapshot | IPC Submitted, claimed 118.5 | Client certifies 110.0 | Both values stored; claimed unchanged; variance −8.5 with reason code |
| TC09 | Recall audit | IPC Submitted | QS Manager recalls | Status→Draft, Critical audit row, PM+Director notified |
| TC10 | Idempotent payment | Payment posted | Same request retried with same Idempotency-Key | No duplicate payment row |
| TC11 | Rounding | 3 lines at 0.005 boundary | Totals computed | Line-level half-up rounding; total = Σ rounded lines |
| TC12 | Tenant isolation | User of Tenant B | GET Tenant A IPC by id | 404 (not 403 — no existence leak) |
| TC13 | Time-bar alert | Submission deadline in 2 days, IPC in Draft | Scheduler runs | Critical notification to QS Mgr + PM |
| TC14 | Advance recovery cap | Advance balance $5,000 | Recovery formula yields $8,000 | Recovery capped at $5,000; balance_after = 0 |
