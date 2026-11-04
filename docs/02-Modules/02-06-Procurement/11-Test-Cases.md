# DCOS — Module 04-11 Procurement
## Document 11 — Test Cases

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-11 |
| Version | R1 |
| Coverage Target | 100% of business rules BR-01…BR-18; 100% of state transitions; 90% code coverage on services |
| Status | For Development |

---

## 1. Test Strategy

| Layer | Scope | Tooling |
|---|---|---|
| Unit | Budget calculation, normalisation, band resolution, tolerance logic | Jest |
| Integration | Service + database, triggers, RLS policies | Jest + test Postgres |
| Contract | API request/response schemas, error codes | Pact / OpenAPI validation |
| E2E | Full MR → PR → RFQ → PO → GRN → match journeys | Playwright |
| Security | RLS isolation, sealed bids, SoD, band ceilings | Dedicated suite, **CI blocking** |
| Performance | Report and list load under volume | k6 |
| Mobile | Offline capture, sync, conflict | Detox |

**CI gates that block merge:** any failing security test, any tenant-scoped table without RLS, any `DELETE` grant on a procurement table, any endpoint returning sealed commercial data before opening.

---

## 2. Test Data Set

| Fixture | Content |
|---|---|
| Companies | 2 (`ACME`, `BETA`) — for cross-tenant isolation testing |
| Projects | `P001` (BOQ loaded), `P002` (no BOQ — interim mode), `P003` (BETA tenant) |
| BOQ items | 40 across concrete, rebar, MEP; one at 95% committed, one at 100% |
| Suppliers | 6 approved, 1 expired PQ, 1 suspended, 1 wrong trade category |
| Users | Buyer A, Buyer B, Proc Manager, PM, QS Mgr, Project Director, Storekeeper, Site Engineer, Supplier User, BETA Buyer |
| Value bands | Default per Doc 02 §4.4; step-up threshold 50,000 |
| WBS | 3-level tree under P001, one archived node |

---

## 3. Business Rule Test Cases

### BR-01 — WBS mandatory on PR line

| ID | Case | Steps | Expected |
|---|---|---|---|
| TC-001 | Submit PR with a line missing `wbs_node_id` | Create PR, clear WBS on line 2, submit | 422 `PROC_WBS_REQUIRED`, line 2 identified, no state change |
| TC-002 | Direct API bypass | POST submit with `wbs_node_id: null` | Rejected at trigger level even if service layer is bypassed |
| TC-003 | WBS node archived | Reference an archived node | 422, node status reported |
| TC-004 | WBS node in another project | Cross-project WBS reference | 404 (existence not leaked) |

### BR-02 — BOQ item or reason code

| ID | Case | Expected |
|---|---|---|
| TC-005 | Line with neither BOQ nor reason code | 422 `PROC_BOQ_OR_REASON_REQUIRED` |
| TC-006 | Line with reason code but no QS endorsement | Submission blocked, endorsement task created |
| TC-007 | Line with invalid reason code | 422, valid codes listed |
| TC-008 | Line with BOQ item from another project | 422 |
| TC-009 | Project with no BOQ loaded (P002) | PR submits with `budget_status = NO_BUDGET_LINE`, project banner shown |

### BR-03/BR-04 — Budget check and commitment timing

| ID | Case | Setup | Expected |
|---|---|---|---|
| TC-010 | Within budget | Available 20,000; PR 12,000 | `WITHIN`, submit succeeds |
| TC-011 | Marginal | Available 12,000; PR 13,000 (8.3% over) | `MARGINAL`, warning, submit succeeds |
| TC-012 | Exceeded | Available 8,320; PR 12,500 | `EXCEEDED`, 422, override path offered |
| TC-013 | Commitment timing | Approve PR only | Committed cost **unchanged**; soft reservation only |
| TC-014 | Commitment posted | Approve PO | `cost_commitment` row created per line, BOQ committed incremented |
| TC-015 | Multi-line, mixed BOQ items | 3 lines, 3 items, one exceeded | Header `EXCEEDED`, only the failing line flagged |
| TC-016 | Approved VO increases allowable | Add VO 20,000, re-run check | Previously exceeded line now `WITHIN` |
| TC-017 | Check is recorded even on pass | Run check returning `WITHIN` | `pr_budget_check` row exists |
| TC-018 | Currency conversion | PR in KHR, budget in USD | Converted at snapshot rate; both values stored |
| TC-019 | Concurrent PRs against one BOQ item | Two buyers submit simultaneously, each within, together exceeding | Second submission fails; no double-spend |

### BR-05 — Value band authority

| ID | Case | Expected |
|---|---|---|
| TC-020 | PO 9,999 approved by band-2 holder | Success |
| TC-021 | PO 10,001 approved by band-2 holder | 403 `PROC_STEP_UP_REQUIRED`/band rejection, audit `PROC.BAND_CEILING_REJECTED` |
| TC-022 | Band evaluated in base currency | PO 45,000 USD at rate making 51,000 base | Band 4 required, not band 3 |
| TC-023 | Delegated band | Delegate approves within delegator's band | Success; audit records both identities |
| TC-024 | Expired delegation | Delegate approves after `valid_to` | 403 |
| TC-025 | Sub-delegation | Delegate attempts to delegate onward | Rejected |

### BR-06 — Supplier qualification gate

| ID | Case | Expected |
|---|---|---|
| TC-026 | PO to approved supplier, correct category | Gate PASS |
| TC-027 | PO to supplier with expired PQ | Gate FAIL, `PROC_SUPPLIER_NOT_QUALIFIED` |
| TC-028 | PO to supplier approved for a different trade | Gate FAIL with category mismatch detail |
| TC-029 | PO to suspended supplier | Gate FAIL |
| TC-030 | RFQ invitation to unqualified supplier | Blocked at invitation, not at PO |
| TC-031 | Supplier suspended after PO issued | Existing PO unaffected; N-79 notification fires; new POs blocked |
| TC-032 | `enforce_pq_gate = false` (Phase 2) | Gate returns N/A with a warning, PO proceeds |

### BR-07/BR-08 — Sealed bids and dual custody

**These are the highest-priority tests in the module.**

| ID | Case | Expected |
|---|---|---|
| TC-033 | GET quotations before closing, as Procurement Officer | Commercial fields `null`, `sealed: true` |
| TC-034 | Same, as Company Admin | Identical — no elevated visibility |
| TC-035 | Same, as **Super Admin** | Identical — the one permission Super Admin lacks |
| TC-036 | `?include=commercial` before opening | 403 `PROC_BIDS_SEALED`, audit `CRITICAL`, notification N-80 |
| TC-037 | Direct table SELECT bypassing the safe view | Denied by revoked grant |
| TC-038 | Raw database read of encrypted column | Ciphertext only; no key in application config |
| TC-039 | Open bids with one user twice | 409 `PROC_DUAL_CUSTODY_REQUIRED` |
| TC-040 | Second authoriser lacks `proc.rfq.open` | 403 |
| TC-041 | Confirmation after the 10-minute window | 409, must reinitiate |
| TC-042 | Successful dual opening | Both identities recorded, hashes stored, values visible, status irreversible |
| TC-043 | Attempt to reverse an opening | Rejected — no endpoint, no state path |
| TC-044 | Submission after closing | Recorded `is_late = true`, excluded from evaluation, **not deleted** |
| TC-045 | Extend closing after some bids received | Allowed with reason; all bidders notified; existing bids remain sealed |
| TC-046 | Quotation document altered post-submission | Hash mismatch detected and reported at opening |

### BR-09 — Non-lowest award justification

| ID | Case | Expected |
|---|---|---|
| TC-047 | Award to lowest compliant | No justification required |
| TC-048 | Award to second lowest, no justification | 422 `PROC_JUSTIFICATION_REQUIRED` |
| TC-049 | Justification of 30 characters | 422, minimum stated |
| TC-050 | Valid justification + reason code | Success; one extra approval level added; N-77 fires |
| TC-051 | Lowest bidder is non-compliant | Second lowest becomes lowest *compliant*; no justification required |
| TC-052 | Split award across bidders | Each award evaluated independently for lowest-compliant status |

### BR-10/BR-11 — Amendments and blanket ceiling

| ID | Case | Expected |
|---|---|---|
| TC-053 | Amend a closed PO | 409 `PROC_PO_CLOSED` |
| TC-054 | Amendment increasing value across a band boundary | Re-approval at the **new** band |
| TC-055 | Amendment reducing value | One approval level; commitment released |
| TC-056 | Date-only amendment | Version increment, no commitment change, supplier notified |
| TC-057 | Amendment attempting bank detail change | Rejected by `CHECK` constraint |
| TC-058 | Call-off within ceiling | Success; drawdown updated |
| TC-059 | Call-off exceeding ceiling | 422 `PROC_CEILING_EXCEEDED` |
| TC-060 | Call-off at 80% of ceiling | Success + N-48 notification |
| TC-061 | Call-off at a rate differing from the blanket rate | Rejected |
| TC-062 | Call-off after validity expiry | Rejected with expiry date stated |

### BR-12/BR-13 — Tolerances

| ID | Case | Setup | Expected |
|---|---|---|---|
| TC-063 | Delivery within tolerance | Ordered 100, delivered 103, tolerance 5% | Accepted silently |
| TC-064 | Delivery beyond tolerance | Delivered 112 | PM approval required; N-59 fires |
| TC-065 | Short delivery | Delivered 60 | Line `Partially Delivered`, expediting reopens |
| TC-066 | Cumulative over-delivery | Two partials totalling 108 | Tolerance evaluated on cumulative, not per delivery |
| TC-067 | Invoice within tolerance | Variance 1.5% | Auto-matched |
| TC-068 | Invoice beyond tolerance | Variance 4% | Exception raised, never auto-posted |
| TC-069 | Invoice with no GRN | — | Exception `NO_GRN` |
| TC-070 | Invoice quantity exceeding received | — | Exception; no partial auto-post |
| TC-071 | Rate mismatch, zero tolerance | Invoice rate ≠ PO rate | Exception regardless of amount |

### BR-14 — MAR gate

| ID | Case | Expected |
|---|---|---|
| TC-072 | Permanent-works line, MAR approved | Gate PASS |
| TC-073 | Permanent-works line, MAR under review | Gate FAIL, `PROC_MAR_NOT_APPROVED`, MAR ref named |
| TC-074 | Permanent-works line, no MAR | Gate FAIL |
| TC-075 | Temporary works / consumable | Gate N/A |
| TC-076 | MAR approved after PO blocked | `material.mar.approved` event clears the gate without manual intervention |
| TC-077 | MAR rejected after PO issued | Alert raised; PO flagged for review |

### BR-15 — Emergency regularisation

| ID | Case | Expected |
|---|---|---|
| TC-078 | Emergency PO issued | Status `Issued (Pending Regularisation)`, flag on dashboards, N-73 fires |
| TC-079 | Regularised day 2 | Flag cleared, normal settlement |
| TC-080 | Not regularised day 3 | Escalation to Project Director, buyer's emergency authority suspended |
| TC-081 | Suspended buyer raises another emergency PO | Blocked |
| TC-082 | Retrospective PR fails budget check | Override path required; PO stays flagged until resolved |

### BR-16 — No deletion

| ID | Case | Expected |
|---|---|---|
| TC-083 | DELETE on any procurement endpoint | 405 `PROC_DELETE_FORBIDDEN` |
| TC-084 | Direct SQL `DELETE FROM purchase_order` | Trigger raises exception |
| TC-085 | Cancel a PO | Record retained, status `Cancelled`, reason stored, audit snapshot written |
| TC-086 | Cancelled PO number reuse | New PO gets the next sequence; cancelled number never reissued |

### BR-17 — Step-up authentication

| ID | Case | Expected |
|---|---|---|
| TC-087 | Approve PO below threshold | No challenge |
| TC-088 | Approve PO above threshold, no assertion | 403 `PROC_STEP_UP_REQUIRED` |
| TC-089 | Assertion older than 5 minutes | 403 |
| TC-090 | Assertion bound to a different action | 403 |
| TC-091 | Valid assertion | Success; `step_up_assertion_id` written to the PO record |
| TC-092 | Bid opening confirmation without step-up | 403 |

### BR-18 — Segregation of duties

| ID | Case | Expected |
|---|---|---|
| TC-093 | Preparer attempts to approve own PR | 403 `PROC_SOD_VIOLATION`, audit HIGH |
| TC-094 | Preparer attempts to approve own PO | Blocked at service and at `trg_po_sod_check` |
| TC-095 | Preparer's name absent from the approver picker | UI does not offer the invalid option |
| TC-096 | Quotation enterer evaluates commercially | Blocked |
| TC-097 | Bid opening initiator confirms | Blocked (TC-039 duplicate coverage, DB level) |
| TC-098 | Gate receiver confirms the GRN | Blocked across module boundary |
| TC-099 | Approved SoD exception in place | Permitted; appears on the exception register |

---

## 4. State Transition Tests

| ID | Entity | Case | Expected |
|---|---|---|---|
| TC-100 | PR | Approve a Draft PR directly | 409 `PROC_STATE_INVALID` |
| TC-101 | PR | Edit an Approved PR | Blocked; cancel and reraise |
| TC-102 | PO | Issue an unapproved PO | 409 |
| TC-103 | PO | Rejected → Approved directly | 409; must return to Draft |
| TC-104 | PO | Close with undelivered lines | Requires short-close reason + PM approval |
| TC-105 | PO | Cancel with delivered quantities | Permitted with reason; delivered qty remains payable |
| TC-106 | RFQ | Award before opening | 409 |
| TC-107 | RFQ | Issue with zero bidders | 422 |
| TC-108 | MR | Cancel after consolidation into PR | Blocked; cancel at PR level |
| TC-109 | All | Every invalid transition in the Doc 03 §8 matrix | 409 with current and attempted status named |

---

## 5. Security Tests (CI-Blocking)

| ID | Case | Expected |
|---|---|---|
| TC-110 | BETA user requests ACME PO by id | 404 |
| TC-111 | BETA user lists POs | Only BETA rows; verified at DB level with RLS enabled |
| TC-112 | `company_id` supplied in request body | 400; tenant taken only from token |
| TC-113 | User requests a project outside `prj` claim | 404, not 403 |
| TC-114 | Supplier portal user lists POs | Only their own `supplier_id` |
| TC-115 | Supplier portal user requests another supplier's quotation | 404 |
| TC-116 | Subcontractor with WBS scope L3–L7 Zone B | Sees only matching records |
| TC-117 | Site Engineer views PO | Commercial fields absent from the payload, not merely hidden in the UI |
| TC-118 | New table added without RLS | **CI build fails** |
| TC-119 | Application role holds DELETE grant | **CI build fails** |
| TC-120 | Sealed values appear in application logs | **CI build fails** |
| TC-121 | Expired token on any endpoint | 401 |
| TC-122 | Deactivated user with a valid token | 401 within the 15-minute TTL bound |

---

## 6. Integration Tests

| ID | Scenario | Expected |
|---|---|---|
| TC-123 | GRN confirmed in Inventory | PO `delivered_qty` updated; expediting → Received; requester notified |
| TC-124 | Procurement attempts to write `delivered_qty` directly | Rejected — Inventory service role only |
| TC-125 | Invoice matched in Finance | Commitment relieved, actual posted, BOQ actual incremented |
| TC-126 | PO closed | Residual commitment released; available budget increases by exactly the residual |
| TC-127 | BOQ item revised by VO | Open PRs recalculated; affected lines flagged |
| TC-128 | Supplier suspended in 04-10 | Open POs flagged; new POs blocked; N-79 fires |
| TC-129 | Schedule activity moved earlier | Long-lead order-by dates recalculated; N-66 fires |
| TC-130 | User deactivated in 03-01 | Pending approvals surfaced for reassignment before account closure |
| TC-131 | Correlation id | MR → PR → RFQ → PO → GRN → invoice all share one `correlation_id` |
| TC-132 | Event replay | Duplicate `inventory.grn.confirmed` processed idempotently, no double-count |

---

## 7. Mobile and Offline Tests

| ID | Case | Expected |
|---|---|---|
| TC-133 | Create MR offline | Stored locally, queued, badge shown |
| TC-134 | Sync on reconnect | MR created server-side, `device_timestamp` preserved separately from `created_at` |
| TC-135 | Duplicate sync of the same `client_ref` | Idempotent; one MR only |
| TC-136 | Approve a PR offline | **Not permitted** — approvals require live AAL per 03-01 D10 |
| TC-137 | Gate receipt offline | Captured with photo, queued, pending GRN created on sync |
| TC-138 | User access revoked while offline | Queued records still submitted, flagged `REQUIRES_REVIEW`, not discarded |
| TC-139 | Sync conflict on the same record | Server wins on approvals; device wins on field data |
| TC-140 | Photo upload on cellular | Compressed; full resolution deferred to WiFi |
| TC-141 | 48-hour offline period | Assertion valid within 72h grace; sync succeeds |

---

## 8. Performance Tests

| ID | Scenario | Volume | Target |
|---|---|---|---|
| TC-142 | PR list load | 1,000 PRs | < 1.5 s |
| TC-143 | Budget check on submit | 50-line PR | < 800 ms |
| TC-144 | CBA generation | 5 bidders × 200 lines | < 3 s |
| TC-145 | Committed cost report, project | 5,000 BOQ items | < 3 s |
| TC-146 | Committed cost report, company | 100,000 rows | Async, job returned < 1 s |
| TC-147 | PO PDF generation | 100-line PO | < 4 s |
| TC-148 | Concurrent approvals | 200 approvers | No lock contention, no lost updates |
| TC-149 | Bulk MR sync | 200 offline records | < 30 s |
| TC-150 | Delivery board | 3,000 open lines | < 2 s |

---

## 9. End-to-End Journeys

| ID | Journey | Assertions |
|---|---|---|
| TC-151 | **Happy path:** MR → PR → RFQ (4 bidders) → dual opening → CBA → award lowest → PO → ASN → gate receipt → GRN → invoice → match → close | Every state correct; commitment posted then relieved then released to zero; full audit chain retrievable by `correlation_id` |
| TC-152 | **Budget override path:** exceeded → override → endorse → approve → proceed to PO | Override recorded HIGH; extra approval level applied; register entry created |
| TC-153 | **Single source:** PR flagged → Director approval → direct PO | No RFQ required; N-76 fires; appears on governance pack |
| TC-154 | **Emergency:** emergency PO → delivery → retrospective PR day 2 → regularised | Flag cleared; audit shows the full sequence including the out-of-order approval |
| TC-155 | **Split award:** one RFQ, lines awarded to two bidders | Two POs; PR lines correctly allocated; no quantity double-counted |
| TC-156 | **Amendment:** PO 45,000 → amend to 55,000 | Re-approval at band 4; step-up required; commitment adjusted by exactly 10,000 |
| TC-157 | **Rejection at inspection:** delivery rejected → NCM → debit note → replacement delivery | PO line reopens; supplier score updated; original receipt retained |
| TC-158 | **Blanket:** blanket PO → 12 call-offs → ceiling 80% alert → ceiling reached → amendment | Drawdown accurate throughout; blocked at ceiling; resumed after amendment |
| TC-159 | **Long-lead breach:** schedule pulled forward → order-by date passes → escalation | N-64/65 fire; item shown black on register; not suppressible |
| TC-160 | **Supplier default:** PO issued → supplier fails to deliver → short close → re-tender | Residual released; supplier score penalised; new RFQ traceable to the original PR |

---

## 10. Regression Suite and Acceptance

**Regression pack** (runs on every release): TC-001, 010, 012, 014, 021, 027, 033–036, 039, 042, 048, 059, 064, 068, 073, 083, 088, 093, 110, 111, 118, 123, 126, 151.

**UAT sign-off requires:**

| Requirement | Gate |
|---|---|
| All BR test cases pass | 100% |
| All security tests pass | 100% — no waivers |
| E2E journeys TC-151 to TC-160 pass | 100% |
| Performance targets met | All within target on production-scale data |
| Committed cost reconciles to open PO register | Exact, on three consecutive month-end simulations |
| QS sign-off on budget and commitment logic | Named individual |
| Procurement Manager sign-off on workflow | Named individual |
| Internal audit sign-off on Doc 09 reconstruction questions | All twelve answerable from audit data alone |

The last row is the one to hold firm on. A procurement module that works but cannot explain itself has only deferred the problem to the first dispute.

---

*Digital Construction Operating System — Procurement — Doc 11 Test Cases — Internal Controlled Document*
