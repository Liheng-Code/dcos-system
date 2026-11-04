# DCOS — Module 04-11 Procurement
## Document 12 — Standard Operating Procedure

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-12 |
| Version | R1 |
| Audience | Site teams, Procurement, QS, Stores, Approvers, Finance |
| Review Cycle | Annual, or on any change to approval bands |
| Status | For Issue |

---

## 1. Purpose and Scope

This SOP defines how procurement is carried out in DCOS. It applies to every purchase of materials, consumables, services, and plant hire on every project.

**The governing principle:** if it was not raised in DCOS, it was not procured. An invoice arriving for something with no PO is not a paperwork problem — it is an unauthorised commitment, and it will be treated as one.

Subcontract packages are procured under the Subcontractor Management SOP, not this one.

---

## 2. Roles and Responsibilities

| Role | Responsible For |
|---|---|
| Site Engineer / Supervisor | Raising accurate Material Requisitions with correct location and realistic dates |
| Discipline Lead | Confirming specification and quantity are technically correct before the MR proceeds |
| Procurement Officer | Consolidating requisitions, sourcing, running the RFQ, preparing the comparison, expediting |
| QS / Cost Engineer | BOQ linkage, budget validation, endorsing non-BOQ lines and overrides |
| Procurement Manager | Bidder lists, evaluation integrity, award recommendation, approval within band |
| Project Manager | Approving requisitions and orders within band; resolving delivery risk to the programme |
| Project Director | High-value approvals, budget overrides, single-source decisions, escalations |
| Storekeeper | Receiving, GRN, stock accuracy, quarantine discipline |
| QA/QC Inspector | Inspecting incoming materials, certificates, rejecting non-conforming material |
| Accountant | Three-way match, exception resolution, payment scheduling |

---

## 3. SOP-01 — Raising a Material Requisition

**Who:** Site Engineer, Site Supervisor, Discipline Engineer
**When:** As soon as the need is known — not when the material runs out.

| Step | Action |
|---|---|
| 1 | Open Procurement → Material Requisitions → New (mobile or web) |
| 2 | Select the WBS location where the material will be **used**, not where it will be stored |
| 3 | Enter the required-on-site date. Work backwards from the task start date, not forwards from today |
| 4 | Add items. Use the item master wherever possible; free text only when no code exists |
| 5 | Check the stock indicator. If free stock exists, raise a stock issue request instead |
| 6 | Review any duplicate warning before continuing — someone may already have ordered it |
| 7 | Attach a photo where the item is a replacement, a repair, or hard to describe |
| 8 | Submit |

**Rules**

- Do not round quantities up "for safety". Wastage allowances belong in the BOQ, not in the requisition.
- Do not mark an MR as Urgent to jump the queue. Urgency requires a written justification and is reported weekly by requester.
- One MR per location per material type. Do not combine three floors into one line and expect the delivery to sort itself out.

**Common mistakes:** selecting the storage WBS node instead of the work location; entering today's date as required-on-site; using free text for an item that already exists in the master under a different name.

---

## 4. SOP-02 — Reviewing a Material Requisition

**Who:** Discipline Lead
**Target:** within 1 working day.

| Step | Action |
|---|---|
| 1 | Open the MR from your action queue |
| 2 | Confirm the specification matches the current issued-for-construction drawing and specification |
| 3 | Confirm the quantity is reasonable against the drawing take-off |
| 4 | Confirm the WBS location is correct |
| 5 | Approve, or return with a specific comment |

**Return, do not reject,** where the requisition is sound but incomplete. Rejection ends the record; return keeps the requester working. Reject only where the material should not be purchased at all.

---

## 5. SOP-03 — Preparing a Purchase Requisition

**Who:** Procurement Officer, with QS support.

| Step | Action |
|---|---|
| 1 | Select approved MRs to consolidate. Group by trade and supplier market, not by date received |
| 2 | Name the package meaningfully — "Rebar Tower B L1-8", not "PR August" |
| 3 | Link every line to a BOQ item. Where none exists, select a non-BOQ reason code and request QS endorsement |
| 4 | Enter an estimated rate. Use the historical rate library or a recent quotation, not a guess |
| 5 | Watch the budget panel as you work. Do not reach the Submit button and discover the problem there |
| 6 | If the budget is exceeded, follow SOP-04 before submitting |
| 7 | Submit |

**Consolidation guidance:** consolidate enough to obtain a competitive price, but not so much that one late line holds up the whole package. A rebar package should not wait for a door handle.

---

## 6. SOP-04 — Budget Override

**Who:** Requester → QS Manager → Project Director.
**When:** Only when the purchase is genuinely necessary and the budget genuinely will not cover it.

| Step | Action |
|---|---|
| 1 | Confirm the BOQ linkage is correct. Half of all overrides are actually mis-linked BOQ items |
| 2 | Confirm the quantity is correct. The other half are take-off errors |
| 3 | If both are correct, raise the override with the true reason code |
| 4 | Write the narrative for someone reading it in three years with no context. State what changed, by how much, and why |
| 5 | State the recovery plan: VO claim, value engineering, or absorb into contingency. "Absorb" is a decision, not a default |
| 6 | Where the reason is `VO_PENDING`, link or create the Variation Order entry immediately — a claim not raised at the time is a claim not recoverable later |
| 7 | Submit for QS endorsement, then Director approval |

Every override appears on the monthly board pack. That is intentional. An override is a controlled decision, and controlled decisions are visible ones.

---

## 7. SOP-05 — Approving a Requisition or Order

**Who:** Any approver in the chain.
**Target:** within 1 working day. This is not a courtesy target — it is the largest single driver of procurement cycle time.

| Step | Action |
|---|---|
| 1 | Open the approval card. Check value, BOQ position, required date, and any override or single-source flag |
| 2 | For anything unusual, open the full record before deciding |
| 3 | Approve, reject, or return with a comment |
| 4 | Complete the step-up authentication challenge where prompted, checking the value shown matches what you intend to approve |

**Do not:**

- Approve a record you prepared. The system will stop you; do not ask a colleague to work around it.
- Bulk-approve anything carrying an override, single-source, or emergency flag.
- Leave items in your queue while on site or on leave. Set a delegation with an end date.

**Before you go on leave:** set your delegation in DCOS. An unapproved PR does not know you are away, and neither does the concrete pour that depends on it.

---

## 8. SOP-06 — Running an RFQ

**Who:** Procurement Officer, Procurement Manager.

| Step | Action |
|---|---|
| 1 | Build the bidder list from approved suppliers in the correct trade category. Meet the minimum for the value band |
| 2 | Check the PQ expiry indicator on each supplier before inviting |
| 3 | Set the closing datetime. Give bidders a realistic window — a 24-hour window produces 24-hour prices |
| 4 | Define delivery terms, payment terms, and required documents precisely. Vague RFQs produce non-comparable quotes |
| 5 | Issue |
| 6 | Answer clarifications through the system. **Broadcast every substantive answer to all bidders** — answering one bidder privately compromises the whole exercise |
| 7 | Chase non-responders before closing, not after |

**Never:**

- Discuss a bidder's price with another bidder, in any forum, at any time.
- Extend the closing time to accommodate one bidder without extending it for all and recording the reason.
- Accept a quotation by WhatsApp and enter it after seeing the others. Enter every quotation into the sealed form as it arrives.

---

## 9. SOP-07 — Opening Bids

**Who:** Two authorised users, typically Procurement Manager and QS Manager.
**When:** After the closing datetime, as soon as practical.

| Step | Action |
|---|---|
| 1 | Both users present, each logged into their own account. Not one account, not one screen shared with a password |
| 2 | User A initiates the opening |
| 3 | User B confirms within 10 minutes, completing their own authentication challenge |
| 4 | The system records both identities, the time, the bid count, and a hash of each quotation |
| 5 | Values become visible to the evaluation team |

**This step is irreversible and permanently logged.** If you are asked to open bids alone, decline and escalate. If you discover values are visible before the scheduled opening, stop and report it immediately to the Company Admin — the system will already have logged the access, and the report protects you.

Late bids stay in the record, marked late, and are not considered. Do not delete them and do not open them.

---

## 10. SOP-08 — Evaluating and Awarding

**Who:** Procurement Officer (commercial), Discipline Lead (technical), Procurement Manager (recommendation).

| Step | Action |
|---|---|
| 1 | Technical evaluation first, before looking at the ranking. Mark each line compliant, deviation, or non-compliant with a comment |
| 2 | Review the normalisation adjustments. Open the calculation and check the freight, duty, and discount figures are right |
| 3 | Compare against the BOQ column, not only against each other. Winning the comparison while losing against the BOQ is still losing |
| 4 | Check delivery lead time against the required date before deciding on price |
| 5 | Recommend. If not recommending the lowest compliant bid, write the justification properly — it will be read by an auditor, not by a colleague |
| 6 | Route for approval |

**Split awards** are permitted and often sensible. Award each line to the best offer for that line and let the system produce the separate POs.

---

## 11. SOP-09 — Issuing a Purchase Order

**Who:** Procurement Officer, after approval.

| Step | Action |
|---|---|
| 1 | Open the Pre-Issue Checks tab and confirm every gate is green |
| 2 | Where a gate is blocked, resolve the cause — do not seek a workaround |
| 3 | Confirm delivery address, site contact, and delivery window are correct and current |
| 4 | Issue. The system generates the PDF and sends it to the supplier |
| 5 | Chase acknowledgement within 2 working days |

**The PO is a contract.** Do not send a supplier a "provisional" order, a verbal instruction to start, or an email saying "proceed, PO to follow". If work must start before the PO, use the emergency route (SOP-12) so the commitment is recorded.

---

## 12. SOP-10 — Expediting

**Who:** Procurement Officer.
**When:** From PO acknowledgement until delivery. Weekly minimum; more often for critical items.

| Step | Action |
|---|---|
| 1 | Work the expediting board from the left column and from the shortest float |
| 2 | Contact the supplier. Confirm production status, dispatch date, and any risk |
| 3 | **Log the contact immediately** — date, person spoken to, what they said, next action date |
| 4 | Update the expediting status |
| 5 | Where a delay threatens the programme, notify the PM the same day. Do not wait for the delivery date to pass |

The expediting log is the contemporaneous record that supports a delay claim. Write it as though it will be read out in a hearing, because it might be. "Called supplier, all OK" is not a record. "Called Mr Sok 14:20, rolling scheduled 18 Aug, dispatch 20 Aug, confirmed no delay to 14 Sep site date" is.

---

## 13. SOP-11 — Receiving a Delivery

**Who:** Storekeeper; Site Engineer at the gate outside store hours.

| Step | Action |
|---|---|
| 1 | Ask for the delivery note and check the PO number **before** unloading |
| 2 | Search the PO in DCOS. **No open PO means do not accept the delivery.** Call Procurement |
| 3 | Count and check condition against the PO lines |
| 4 | Enter received quantities. Photograph the delivery note and the material |
| 5 | Record condition: good, damaged, or partial |
| 6 | Where a test certificate is required and not supplied, receive to **quarantine** — do not release to site |
| 7 | Submit. The storekeeper confirms the GRN in Inventory |
| 8 | Notify QA/QC where inspection is required |

**Never sign a delivery note "received unchecked".** It transfers the risk to the company and removes the basis for any later claim on quantity or condition.

Short deliveries: accept what arrived, record the shortfall, do not amend the quantity to match. The gap is the record.

---

## 14. SOP-12 — Emergency Purchases

**Who:** Site Supervisor or PM, with Project Director awareness.
**When:** Genuine operational emergency only — safety, immediate work stoppage, or critical plant failure.

| Step | Action |
|---|---|
| 1 | Obtain verbal authorisation from the PM or Project Director |
| 2 | Raise the Emergency Purchase Request in DCOS **before** or immediately after the purchase — not next week |
| 3 | State the emergency plainly. "Needed urgently" is not a justification; "tower crane hydraulic failure, all lifting stopped" is |
| 4 | The emergency PO issues immediately, flagged pending regularisation |
| 5 | **Within 3 working days:** create the retrospective PR, link the BOQ item, run the budget check |
| 6 | Obtain the normal approvals retrospectively |

Failure to regularise by day 3 escalates to the Project Director and suspends the buyer's emergency authority. Emergency purchase rates are reported monthly by person. A buyer with a weekly emergency is not managing emergencies; they are managing their planning badly.

---

## 15. SOP-13 — Resolving a Match Exception

**Who:** Procurement Officer (owner), Accountant, approver by value.

| Step | Action |
|---|---|
| 1 | Open the exception. Identify the variance type: quantity, rate, total, no GRN, no PO |
| 2 | Check the physical facts first — what was actually received |
| 3 | **Rate variance:** the PO rate is the agreed rate. Ask the supplier for a corrected invoice; do not accept a unilateral increase |
| 4 | **Quantity variance:** verify against the GRN and delivery note. If the GRN is wrong, correct it in Inventory with a reason |
| 5 | **No PO:** treat as an unauthorised commitment. Escalate to the Procurement Manager. Regularise or reject; do not quietly raise a retrospective PO to make it disappear |
| 6 | Where a variance is genuinely acceptable, obtain approval by value band with a written justification |
| 7 | Resolve within 5 working days |

An accepted variance is a payment decision. It is recorded, reported monthly, and attributed to the person who approved it.

---

## 16. SOP-14 — Closing a Purchase Order

**Who:** Procurement Officer, verified by QS.

| Step | Action |
|---|---|
| 1 | Confirm all lines are fully delivered and invoiced, or agree a short close with a reason |
| 2 | Confirm no outstanding quality issues or credit notes |
| 3 | Capture the warranty start date where applicable |
| 4 | Close the PO |
| 5 | Confirm the residual commitment has been released and the budget position updated |

**Close POs promptly.** An open PO with 5% undelivered holds 5% of committed budget hostage indefinitely, and a hundred of them will make the committed cost report wrong in a direction nobody notices until final account.

---

## 17. Prohibited Practices

| Practice | Why |
|---|---|
| Buying off-system and raising the paperwork later | Uncontrolled commitment; no budget check; no audit trail |
| Splitting a purchase across multiple POs to stay under an approval band | Circumvention of delegated authority; detected automatically and reported |
| Approving your own requisition or order through a colleague's account | Fraud, and traceable to the session that did it |
| Discussing bid prices with any bidder before or during evaluation | Destroys the tender's integrity and the company's legal position |
| Opening bids alone or with a shared login | Voids the dual-custody control and the evidence it produces |
| Accepting a delivery without an open PO | Creates an unauthorised liability |
| Signing a delivery note unchecked | Waives the company's right to dispute quantity or condition |
| Amending supplier bank details on a PO or by email request | The most common fraud vector in construction procurement |
| Deleting or backdating any procurement record | Not possible in DCOS; the attempt itself is logged |
| Using the emergency route for routine purchases | Bypasses competitive pricing and budget control |

Suspected breaches are reported to the Company Admin and Project Director. Suspected fraud is reported to the Company Admin only — including where the suspicion involves the Project Director.

---

## 18. Escalation Contacts

| Situation | First Contact | Escalate To |
|---|---|---|
| Approval overdue | The named approver | Project Manager → Project Director |
| Budget exceeded | QS | Commercial Manager → Project Director |
| Delivery late, programme at risk | Procurement Officer | Procurement Manager → Project Manager |
| Long-lead order date passed | Procurement Manager | Project Manager → Project Director |
| Supplier default or non-performance | Procurement Manager | Project Director |
| Material rejected at inspection | QA/QC Inspector | QA/QC Manager → Procurement Manager |
| Match exception unresolved > 10 days | Accountant | Finance Manager |
| Bid integrity concern | Company Admin | Company Admin only |
| Suspected fraud | Company Admin | Company Admin only |
| System fault blocking a purchase | IT support | Procurement Manager (use emergency route meanwhile) |

---

## 19. Quick Reference Card

| I need to… | Go to | Target time |
|---|---|---|
| Request material | Procurement → New MR (mobile) | Immediately when known |
| Check where my material is | WBS Workspace → Procurement tab | — |
| Approve something | Notification or Dashboard → Awaiting My Approval | Within 1 working day |
| See my budget position | PR screen budget panel, or Reports → Committed Cost | — |
| Chase a supplier | PO → Expediting tab → Log contact | Weekly, or as the risk requires |
| Receive a delivery | Deliveries → Incoming (mobile) | At the gate, before unloading |
| Report a bid integrity concern | Company Admin, directly | Immediately |
| Buy something in an emergency | Procurement → Emergency Request | Then regularise within 3 days |

---

## 20. Document Control

| Version | Date | Change | Approved By |
|---|---|---|---|
| R1 | 2026-08 | Initial issue with module go-live | — |

This SOP is reviewed annually and reissued immediately on any change to approval value bands, tolerances, or the emergency purchase policy. The version in DCOS is the controlled copy. A printed copy in the site office is a reference, not an authority.

---

*Digital Construction Operating System — Procurement — Doc 12 Standard Operating Procedure — Internal Controlled Document*
