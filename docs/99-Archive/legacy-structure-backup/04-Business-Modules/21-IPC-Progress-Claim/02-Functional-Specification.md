# 02 — Functional Specification
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-FS-001 | **Rev:** R0 | **Status:** Draft

---

## 1. Feature List

| # | Feature | Priority |
|---|---|---|
| F1 | Create IPC for a project + claim period (one open IPC per project) | Must |
| F2 | Auto-load Contract BOQ items with previous cumulative quantities | Must |
| F3 | Enter this-period quantity per BOQ item (or % complete) | Must |
| F4 | Pull measured quantities from site progress (WBS roll-up) as suggestion | Should |
| F5 | Add approved Variation Orders as claim lines | Must |
| F6 | Auto-calculate retention deduction per contract rules | Must |
| F7 | Auto-calculate advance recovery per recovery schedule | Must |
| F8 | Add/deduct back-charges with reference | Must |
| F9 | Internal approval workflow (QS → QS Manager → PM) | Must |
| F10 | Generate submission package (PDF summary + measurement sheets) | Must |
| F11 | Record client certification per line (certified qty/value + reason) | Must |
| F12 | Track payment status against certified IPC | Must |
| F13 | Cumulative contract position dashboard | Must |
| F14 | Claimed vs certified variance report | Must |
| F15 | Revise & resubmit a rejected IPC (revision tracking) | Must |

## 2. Business Rules

| # | Rule |
|---|---|
| BR1 | An IPC can only be created if the project has an approved (locked) Contract BOQ. |
| BR2 | Only one IPC may be in Draft/Submitted state per project at a time. |
| BR3 | This-period quantity cannot make cumulative quantity exceed BOQ quantity unless flagged as overrun with mandatory comment (links to potential VO). |
| BR4 | Retention is never edited manually on the IPC; it is computed by the Retention module rules and displayed read-only. Manual override requires Commercial Manager approval + audit comment. |
| BR5 | A VO line can only be claimed after the VO status = Approved; claimable value ≤ approved VO value. |
| BR6 | Once Submitted, claim lines are locked. Changes require client-rejection or internal recall (audit-logged). |
| BR7 | Certified values are entered against the submitted snapshot — the system stores both claimed and certified, never overwrites. |
| BR8 | IPC numbering: {PROJECT}-IPC-{NN} sequential, no gaps, no reuse. |

## 3. Calculations

```
Gross value this period      = Σ (this-period qty × BOQ rate)  [BOQ lines]
                             + Σ (VO claimed value this period) [VO lines]
Cumulative gross             = previous cumulative + gross this period
Retention this period        = per Retention module rule
                               e.g. 5% of cumulative gross, reducing to 2.5%
                               when cumulative ≥ 50% of contract sum;
                               capped at retention limit if contract defines one
Advance recovery this period = per recovery schedule
                               e.g. (advance amount × this-period gross /
                               contract sum), starting after threshold
Back-charges                 = Σ agreed back-charge lines this period
Net claim this period        = gross this period
                               − retention this period
                               − advance recovery this period
                               − back-charges
                               (+/− previous certification adjustments)
```

Worked example (Attachments/IPC-worked-example.md) must be kept current with
any rule change.

## 4. Edge Cases

- **Negative this-period quantity** (re-measurement down): allowed, requires
  comment; cumulative cannot go below zero.
- **Certified < 0 adjustment by client**: recorded as certification adjustment
  line with reason code.
- **Period with no progress**: IPC may still be required for VO-only or
  back-charge-only claims.
- **Contract sum changes mid-project** (VO): retention threshold (50%) is
  evaluated against revised contract sum.

## 5. Non-Functional Requirements

- IPC with 2,000 BOQ lines loads < 3 s (paginated by BOQ section).
- All money stored as numeric(18,2) in contract currency; rounding half-up at
  line level; totals are sums of rounded lines (matches QS practice).
- Submission PDF generated asynchronously; user notified when ready.
