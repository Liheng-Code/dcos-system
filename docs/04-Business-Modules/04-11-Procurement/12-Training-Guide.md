# DCOS — Module 04-11 Procurement
## Document 12 — Training Guide

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-TRN |
| Version | R1 |
| Audience | Trainers, module champions, all procurement-touching roles |
| Delivery | Instructor-led + sandbox practice + on-the-job coaching |
| Prerequisite | DCOS Platform Induction (login, WBS navigation, notifications) |
| Status | For Issue |

---

## 1. Training Philosophy

Procurement is the module where users are most likely to revert to old habits, because the old habit — phoning a supplier and sorting the paperwork later — is faster in the moment and only expensive later. Training therefore has two jobs, not one:

1. **Teach the mechanics** — where to click, what the fields mean.
2. **Teach why the controls exist** — because a user who understands why bids are sealed will protect the control; a user who does not will find it an obstacle and route around it.

Every session in this guide spends time on the second job. Skipping it produces users who can operate the system and still lose the company money.

**Guiding rule for trainers:** never demonstrate a workaround, even to explain why it fails. Users remember the workaround and forget the explanation.

---

## 2. Learning Paths by Role

| Role | Path | Total Duration | Certification Required |
|---|---|---|---|
| Site Engineer / Supervisor | T1 | 1.5 hours | Basic |
| Discipline Lead | T1 + T2 | 2.5 hours | Basic |
| Procurement Officer | T1 + T3 + T4 + T5 | 8 hours | **Full — mandatory** |
| Procurement Manager | T1 + T3 + T4 + T5 + T6 | 10 hours | **Full — mandatory** |
| QS / Cost Engineer | T1 + T3 + T7 | 6 hours | **Full — mandatory** |
| Project Manager | T1 + T6 + T8 | 3 hours | Approver |
| Project Director / Commercial Manager | T6 + T8 | 2 hours | Approver |
| Storekeeper | T1 + T9 | 3 hours | Basic |
| QA/QC Inspector | T9 (receipt section) | 1 hour | Basic |
| Accountant / Finance | T10 | 3 hours | **Full — mandatory** |
| Supplier (external) | T11 | 45 minutes, self-serve | None |
| Company Admin | All + T12 | 14 hours | **Full + Admin** |

**Mandatory** means the user account is not granted the module permission until the assessment is passed. This is enforced in RBAC, not by a spreadsheet — an untrained Procurement Officer cannot raise a PR because the permission is not there yet.

---

## 3. Course Modules

### T1 — Procurement Foundations (45 min, all roles)

**Objectives.** By the end, the learner can explain the requisition-to-payment chain, name the five entities, and state why every line needs a WBS node and a BOQ item.

| Topic | Time | Key Message |
|---|---|---|
| Why DCOS procurement exists | 10 min | The failure it prevents: 40% complete, 60% committed, nobody knows |
| The chain: MR → PR → RFQ → PO → GRN → Invoice | 10 min | Walk one real purchase end to end on screen |
| WBS and BOQ linkage | 10 min | Every purchase has a *place* and a *budget line*. Both, always |
| Commitment vs actual cost | 5 min | Money is spent at PO approval, not at invoice |
| Where you fit | 5 min | Role-specific one-slide map of the learner's touchpoints |
| Q&A | 5 min | |

**Exercise T1-E1.** Given a printed PO, trace it backwards in the sandbox to the originating MR and name every person who touched it. *Expected: learner finds the chain via the Activity tab in under 3 minutes.*

---

### T2 — Requisition Review (1 hour, Discipline Leads)

| Topic | Time |
|---|---|
| Reading an MR against the issued-for-construction drawing | 15 min |
| Specification adequacy — what makes a spec buyable | 15 min |
| Return vs reject: when to use which | 10 min |
| Writing a useful return comment | 10 min |
| Working the review queue and the 1-day target | 10 min |

**Exercise T2-E1.** Review four sandbox MRs: one correct, one with the wrong WBS node, one with a vague specification, one with a quantity error against the drawing. *Expected: approve one, return three with specific comments. Learner who rejects rather than returns is corrected on the spot.*

---

### T3 — Purchase Requisition and Budget Control (2 hours, Procurement Officer, Procurement Manager, QS)

**The most important session in the programme.**

| Topic | Time | Notes |
|---|---|---|
| Consolidating MRs into packages | 15 min | Group by trade and supplier market, not by date received |
| BOQ linkage in practice | 25 min | Live search, UoM conversion factors, when the BOQ item genuinely doesn't exist |
| Non-BOQ reason codes and QS endorsement | 15 min | All four codes with a real example each |
| Reading the live budget panel | 20 min | Allowable / committed / actual / available — what each number is and where it comes from |
| WITHIN, MARGINAL, EXCEEDED | 15 min | What the system does at each, and why MARGINAL warns rather than blocks |
| The override process | 25 min | Check linkage → check quantity → *then* override. Writing the narrative for a reader in three years |
| Recovery plans and the VO link | 15 min | A claim not raised at the time is a claim not recoverable later |

**Exercise T3-E1.** Consolidate six sandbox MRs into two sensible packages and justify the split.
**Exercise T3-E2.** Submit a PR that fails the budget check. Diagnose the cause — it is a mis-linked BOQ item, not a genuine overspend. Fix it without an override.
**Exercise T3-E3.** Submit a PR with a genuine overspend. Raise a complete override with a narrative that would survive an audit. *Trainer reads two narratives aloud, anonymised, and the group grades them.*

**Teaching point to make explicitly:** roughly half of all budget overrides on live projects turn out to be mis-linked BOQ items and take-off errors. Checking those two things first is not bureaucracy; it is the fastest route to getting the material ordered.

---

### T4 — Sourcing, RFQ and Bid Integrity (2 hours, Procurement Officer, Procurement Manager)

| Topic | Time |
|---|---|
| Building a bidder list from approved suppliers | 15 min |
| PQ status, categories, and expiry warnings | 10 min |
| Minimum bidder counts by value band | 10 min |
| Setting terms that produce comparable quotes | 20 min |
| Clarifications and the broadcast rule | 15 min |
| **Sealed bids — what the system does and why** | 25 min |
| **Dual-custody opening — the procedure** | 20 min |
| Late bids, failed RFQs, extensions, re-tender | 15 min |

**The bid integrity block is not optional and is not delivered as a slide.** Cover, in this order: what the padlock means on screen; that Super Admin cannot see the values either; that any attempt to read them is logged as CRITICAL and notifies the Company Admin within seconds; that the opening requires two people on two accounts; that the opening is irreversible; and that late bids are kept, marked, and never opened.

**Exercise T4-E1.** Issue a sandbox RFQ to four suppliers, one of whom has an expired PQ. *Expected: learner notices the expiry warning and substitutes before issuing.*
**Exercise T4-E2.** Answer a bidder clarification. *Expected: learner selects broadcast. A learner who answers privately is stopped and the consequence explained.*
**Exercise T4-E3.** Paired opening. Learners pair up, each on their own account, and open a sandbox RFQ. Then review the opening event record together and identify what an auditor would see.

**Scenario discussion (10 min, no slides).** *"A supplier calls you the day before closing and asks what the other bids look like. What do you say, what do you do next, and what does the system already know?"*

---

### T5 — Evaluation, Award and Purchase Orders (2 hours, Procurement Officer, Procurement Manager)

| Topic | Time |
|---|---|
| Technical evaluation before looking at price | 20 min |
| Reading normalisation: freight, duty, discounts, incoterms | 25 min |
| The CBA screen — as-quoted vs normalised vs BOQ | 25 min |
| Lowest compliant, and what "compliant" means | 15 min |
| Non-lowest awards and writing the justification | 15 min |
| Split awards | 10 min |
| Generating the PO and the seven pre-issue gates | 20 min |
| Amendments, versions, and what must never be amended | 10 min |

**Exercise T5-E1.** Evaluate a five-bidder sandbox RFQ where the cheapest as-quoted bid becomes the most expensive after normalisation. *Expected: learner opens the adjustment breakdown and can explain the reversal to the group.*
**Exercise T5-E2.** A PO is blocked by the MAR gate. Diagnose from the pre-issue check panel and resolve it correctly rather than by removing the line.
**Exercise T5-E3.** Amend a PO from 45,000 to 55,000. *Expected: learner anticipates re-approval at the higher band before submitting.*

**Teaching point:** the supplier's bank details are never changed on a PO or by email request. State plainly that this is the single most common fraud vector in construction procurement and that the request will look completely routine when it arrives.

---

### T6 — Approving (45 min, PM, Project Director, Commercial Manager, Procurement Manager)

Short by design. Approvers will not attend a half-day course, and the approval bottleneck is the largest single driver of procurement cycle time — so the session's real objective is behavioural, not technical.

| Topic | Time |
|---|---|
| The approval card: what to check in 15 seconds | 10 min |
| When to open the full record instead | 10 min |
| Approve / reject / return — and always a comment | 5 min |
| Step-up authentication: check the value on the challenge screen | 5 min |
| Bulk approval: what it is permitted for and what it is not | 5 min |
| Delegation before leave | 5 min |
| Your approval time is measured and reported by name | 5 min |

**Exercise T6-E1.** Clear a queue of eight sandbox approvals within five minutes, including one carrying a budget override and one single-source. *Expected: the two flagged items are opened individually; the others are handled from the card.*

**Say this out loud:** *"An unapproved PR does not know you are on site, and neither does the concrete pour that depends on it. Set your delegation."*

---

### T7 — Cost Control and Commitment (1.5 hours, QS, Cost Engineer)

| Topic | Time |
|---|---|
| Where committed cost comes from and when it posts | 20 min |
| Relief at match, release at close-out | 20 min |
| Why open POs distort the committed position | 15 min |
| Reading the Committed Cost report and drilling down | 20 min |
| Reconciling R-01 to the Open PO Register | 15 min |

**Exercise T7-E1.** A project shows committed cost 8% higher than the sum of open POs. Find the cause in the sandbox. *Answer: fourteen fully delivered POs were never closed, so their residual commitment was never released.*

**Teaching point:** if the Committed Cost report and the Open PO Register ever disagree, one of them is wrong and both stop being trusted within a week. Reconcile monthly.

---

### T8 — Delivery Risk and the Programme (45 min, PM, Project Director)

| Topic | Time |
|---|---|
| The delivery status report and reading it by float | 15 min |
| The long-lead register and order-by dates | 15 min |
| What happens when the schedule moves | 10 min |
| Escalations that reach you and what they mean | 5 min |

**Exercise T8-E1.** A schedule activity is pulled forward four weeks. Identify which long-lead items breach as a result and what action each requires today.

---

### T9 — Receiving Material (1.5 hours, Storekeeper, Site Engineer, QA/QC)

Delivered at the store or gate, on the actual devices, not in a classroom.

| Topic | Time |
|---|---|
| Finding the PO before unloading | 15 min |
| No open PO = do not accept. Practising the refusal | 15 min |
| Counting, condition, and photographing | 15 min |
| Short, over, and damaged deliveries | 20 min |
| Quarantine and missing test certificates | 15 min |
| Offline receipt and sync | 10 min |

**Exercise T9-E1.** Three simulated deliveries: one clean, one 12% over-delivered, one with no matching PO. *Expected: accept, escalate, refuse. The refusal is rehearsed aloud, because it is socially hard to do to a driver who is already unloading.*
**Exercise T9-E2.** Receive a delivery in aeroplane mode, then reconnect and confirm the sync.

**Say this out loud:** *"Never sign a delivery note 'received unchecked'. It transfers the risk to us and removes any basis for a later claim."*

---

### T10 — Invoice Matching (1.5 hours, Accountant, Finance)

| Topic | Time |
|---|---|
| The three-way match and its tolerances | 20 min |
| Exception types and what each usually means | 25 min |
| Resolution routes: correct invoice, credit note, amendment, reject | 20 min |
| Variance acceptance — approval, justification, and the monthly register | 15 min |
| "No PO" invoices — the escalation, not the workaround | 10 min |

**Exercise T10-E1.** Resolve four exceptions: a rate increase applied unilaterally by the supplier, a quantity mismatch caused by a GRN error, a duplicate invoice, and an invoice with no PO. *Expected: only the GRN error is corrected in DCOS; the rate increase goes back to the supplier; the no-PO invoice escalates to the Procurement Manager.*

**Teaching point:** the temptation with a no-PO invoice is to raise a retrospective PO and make it disappear. That converts an unauthorised commitment into an authorised-looking one and removes the only signal that a control was bypassed.

---

### T11 — Supplier Portal (45 min, self-serve, external — Phase 3)

Video and PDF, no instructor. Covers: accessing the portal, responding to an RFQ line by line, uploading documents, asking a clarification, the countdown and what "sealed" means for them, acknowledging a PO, submitting an ASN, submitting an invoice, and what to do when access is expiring.

Ends with one screen: *"We will never ask you to change your bank details by email, and you should never accept such a request from us. Call your buyer."*

---

### T12 — Administration (2 hours, Company Admin)

Approval value bands and their downstream effects · tolerances · reason codes · enforcement toggles (`enforce_pq_gate`, `enforce_mar_gate`) · notification rule configuration · SoD exception grants and why each one must be time-bounded · reading the monthly governance exception pack · responding to a sealed-bid access alert.

**Exercise T12-E1.** A two-person site office cannot satisfy segregation of duties. Configure the correct response. *Expected: a time-bounded SoD exception with a review date and a register entry — not a permanent role change and not switching the control off.*

---

## 4. Sandbox Environment

| Item | Detail |
|---|---|
| Tenant | `TRAIN-CO` — isolated, reset nightly at 02:00 |
| Projects | `T001` Tower B (BOQ loaded, 40 items, one at 95% committed, one at 100%) · `T002` (no BOQ, interim mode) |
| Suppliers | 6 approved · 1 PQ expired · 1 suspended · 1 wrong trade category |
| Pre-seeded records | 20 MRs at mixed statuses · 8 PRs · 3 open RFQs at different stages · 12 POs including one blanket, one emergency pending regularisation, one blocked by MAR · 6 invoices including 4 exceptions |
| Learner accounts | One per role, named `train.buyer1`, `train.qs1`, etc.; paired accounts available for dual-custody exercises |
| Notifications | Routed to a training inbox, never to real suppliers |
| Reset | Nightly; learners are told their work will not persist |

**Rule:** no training is ever conducted in the production tenant, including "just to show you". A demonstration PO in production is a real commitment with a real audit entry.

---

## 5. Assessment

### 5.1 Basic Certification (Site, Stores, QA/QC)

Ten questions, 80% pass, one retake permitted same day.

Sample items:

1. Where do you set the WBS node on an MR — the storage location or the work location?
2. A delivery arrives with no matching open PO. What do you do?
3. What does the padlock icon on a quotation value mean?
4. Your MR is returned with a comment. What is the difference between returned and rejected?
5. When must material be received to quarantine?

### 5.2 Full Certification (Procurement, QS, Finance)

Twenty questions plus three practical tasks in the sandbox, 85% pass, assessed by the module champion.

Practical tasks:

- **P1.** Take a PR from consolidation to submission including a correctly diagnosed budget failure. *(Assessed on: correct BOQ linkage, whether the learner checks linkage and quantity before reaching for the override.)*
- **P2.** Run an RFQ from bidder list to award, including a paired bid opening and a non-lowest recommendation with justification. *(Assessed on: bid integrity handling, quality of the written justification.)*
- **P3.** Resolve two invoice match exceptions correctly. *(Assessed on: whether the no-PO invoice is escalated rather than papered over.)*

**Automatic fail conditions**, regardless of score: attempting to open bids single-handed; answering a clarification privately to one bidder; raising a retrospective PO to clear a no-PO invoice; approving a record they prepared using another person's device.

### 5.3 Approver Certification

Five questions plus one timed queue exercise (T6-E1). Pass is the correct handling of the flagged items, not the speed.

### 5.4 Records

Certification results are recorded against the DCOS user account. Full-certification permissions are granted by RBAC on pass and revoked if refresher training lapses.

---

## 6. Competency Matrix

| Competency | Site | Disc. Lead | Proc. Officer | Proc. Mgr | QS | Approver | Store | Finance |
|---|---|---|---|---|---|---|---|---|
| Raise an MR with correct WBS | ✔ | ✔ | ✔ | ✔ | | | | |
| Review spec and quantity | | ✔ | | | | | | |
| Consolidate into a PR | | | ✔ | ✔ | ✔ | | | |
| Link BOQ items and reason codes | | | ✔ | ✔ | ✔ | | | |
| Interpret the budget panel | | | ✔ | ✔ | ✔ | ✔ | | |
| Raise a compliant override | | | ✔ | ✔ | ✔ | | | |
| Build a bidder list | | | ✔ | ✔ | | | | |
| Conduct a dual-custody opening | | | ✔ | ✔ | ✔ | | | |
| Evaluate and normalise bids | | | ✔ | ✔ | ✔ | | | |
| Justify a non-lowest award | | | ✔ | ✔ | | | | |
| Clear pre-issue gates | | | ✔ | ✔ | | | | |
| Amend a PO correctly | | | ✔ | ✔ | | | | |
| Expedite and log contacts | | | ✔ | ✔ | | | | |
| Receive and raise a GRN | | | | | | | ✔ | |
| Handle short/over/damaged | | | | | | | ✔ | |
| Approve within band | | | | ✔ | | ✔ | | |
| Reconcile committed cost | | | | ✔ | ✔ | | | ✔ |
| Resolve match exceptions | | | ✔ | ✔ | | | | ✔ |
| Recognise a fraud signal | | | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

---

## 7. Rollout Plan

| Week | Activity | Audience |
|---|---|---|
| −4 | Train the trainers: module champions per project | 2 per project |
| −3 | Full certification for Procurement, QS, Finance | Central + project commercial teams |
| −2 | Approver sessions, scheduled around site meetings | PM, Directors |
| −1 | Site and stores sessions, delivered on site in local language | Site teams |
| 0 | **Go-live.** Champion present on site daily | All |
| +1 to +2 | Floor-walking support; daily 15-minute stand-up clinic | All |
| +4 | First-month review: exception pack read together with the team | Champions, PM |
| +12 | Refresher for anyone whose exception rate is above threshold | Targeted |
| Annual | Refresher for all certified roles; mandatory reissue on any change to approval bands | All certified |

**Parallel running.** Run DCOS alongside the existing process for one month maximum. Beyond that, people work the old way and treat DCOS as data entry. Set the cut-off date before go-live and hold it.

---

## 8. Common Mistakes and How to Teach Against Them

| Mistake | Root Cause | Teaching Counter |
|---|---|---|
| WBS set to the store, not the work location | "Where the material goes" seems logical | Ask: *"Whose budget does this consume?"* The answer is the work location |
| Required date set to today | Habit from a system with no consequences | Show the long-lead register and a breached order-by date |
| Free text for existing items | Item master search is unfamiliar | Ten minutes of search practice; show the free-text ratio report |
| Override raised before checking linkage | Faster in the moment | Show that half of overrides are mis-links; show the monthly register with names on it |
| Quotation entered after seeing the others | Convenience | Show the audit entry that records entry timestamps and the gap it creates |
| Answering one bidder privately | Helpfulness | Frame it as what it is: giving one bidder an advantage. Show the broadcast toggle |
| Bulk approving flagged items | Queue pressure | Show that the system blocks it, and why it does |
| Signing a delivery note unchecked | Social pressure from the driver | Rehearse the refusal out loud in T9 |
| Leaving POs open after final delivery | No visible consequence | Run T7-E1 — the 8% distortion — with their own project's data |
| Retrospective PO for a no-PO invoice | Tidiness instinct | Explain it removes the only signal a control was bypassed |
| Emergency route used weekly | Planning failure disguised as urgency | Show the emergency rate report by person |

---

## 9. Trainer Notes

- **Use the learner's own project data** in the sandbox where possible. Generic "Widget A" examples do not transfer to a rebar delivery at 06:30.
- **Deliver site and stores training on site**, on the devices they will actually use, in the language they actually speak. A classroom session in English for a Khmer-speaking store team produces attendance, not competence.
- **Never demonstrate a workaround.** If asked "what if I just…", answer with what the system does and what the audit records, not with a demonstration.
- **Let the system say no.** Learners remember a blocked submission far better than a slide saying it will be blocked. Build the failures into the exercises deliberately.
- **Name the reports that name people.** Approval time, emergency rate, and override rate are all reported by individual. Say so in training rather than letting people discover it in the first monthly pack.
- **Budget 30% of every session for hands-on.** Sessions that run out of time should cut content, never the exercises.
- **Watch for the quiet objection.** The user who says nothing and takes notes is usually the one planning to keep using the old method. Ask them directly what would make the DCOS route faster than what they do now — and feed the answer back to the product team.

---

## 10. Support After Go-Live

| Need | Route | Response Target |
|---|---|---|
| "How do I…" | Project module champion | Same day |
| Blocked and cannot proceed | Champion → Procurement Manager | 2 hours |
| System fault | IT support ticket | Per platform SLA; use the emergency route meanwhile |
| Permission missing | Company Admin | 1 working day |
| Suspected bid integrity issue | Company Admin **directly** | Immediate |
| Suspected fraud | Company Admin **only** | Immediate |
| Training refresher | Champion | Next scheduled session |

**Champion role.** Each project nominates two champions — typically the Procurement Officer and the QS. They are the first line of support, they attend the monthly exception pack review, and they feed recurring confusion back to the product team. A module without champions is a module with a help desk queue.

---

## 11. Glossary for Learners

| Term | Plain Meaning |
|---|---|
| MR | Material Requisition — "I need this here by then" |
| PR | Purchase Requisition — the budget-checked request to buy |
| RFQ | Request for Quotation — asking suppliers to price it |
| CBA | Comparative Bid Analysis — the comparison table and recommendation |
| PO | Purchase Order — the binding contract to buy |
| POA | PO Amendment — a versioned change to an issued PO |
| Call-off | A drawdown against a blanket PO at agreed rates |
| ASN | Advance Shipping Notice — "it has left, arriving on this date" |
| GRN | Goods Receipt Note — the record that it physically arrived |
| MAR | Material Approval Request — consultant approval before permanent-works material can be bought |
| BOQ | Bill of Quantities — the priced schedule the project was sold on |
| Allowable | What the BOQ says we can spend on this item |
| Committed | Money promised via approved POs, not yet paid |
| Actual | Money recognised against matched invoices |
| Available | Allowable + approved VOs − committed − actual |
| Three-way match | PO + GRN + Invoice agreeing before payment |
| Sealed | Bid values invisible to everyone until the dual-custody opening |
| Step-up | A fresh authentication challenge for high-value actions |
| SoD | Segregation of Duties — you cannot approve what you prepared |
| Long-lead | An item whose lead time means it must be ordered far ahead |
| Order-by date | The last date an item can be ordered and still arrive on time |
| Quarantine | Received but not released for use, usually pending a certificate |

---

*Digital Construction Operating System — Procurement — Training Guide — Internal Controlled Document*
