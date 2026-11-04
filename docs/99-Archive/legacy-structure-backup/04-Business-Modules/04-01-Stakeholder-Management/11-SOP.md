# 11 — Standard Operating Procedures
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-SOP-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Use |
| Author Role | Construction Operations Consultant |
| Date | 2026-08-08 |
| Applies To | All DCOS users with stakeholder register responsibilities |
| Related Documents | DCOS-STK-FS-001, DCOS-STK-UC-001, DCOS-STK-RBAC-001, DCOS-STK-TRN-001 |

---

## 1. Purpose and Applicability

These procedures govern how the stakeholder register is created, maintained, and governed across the company. They apply to every project, every office, and every user who creates, assigns, or maintains stakeholder records.

The register is not an administrative list. It is the company's **evidence base for responsibility** — the record that answers, in a claim, an audit, or a dispute, who was engaged, what they were authorised to do, and when.

Two rules underpin every procedure in this document:

> **Rule 1.** No workflow can involve a party who is not registered and assigned. If somebody says "just send it to them and we'll set them up later," the answer is no. The record comes first.

> **Rule 2.** If an approval halts because no approver is configured, that is the system working correctly. Do not look for a way around it. Fix the configuration.

---

## 2. Roles and Responsibilities — RACI

| Activity | Company Admin | Project Director | Project Manager | Document Controller | Discipline Manager | Procurement Officer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Register a new organisation | A | I | C | **R** | I | R (suppliers/subs) |
| Verify and approve a registration | **R/A** | R | I | C | I | I |
| Maintain contacts | I | I | C | **R/A** | C | R (suppliers/subs) |
| Maintain compliance documents | A | I | I | **R** | I | R (suppliers/subs) |
| Assign a stakeholder to a project | I | A | **R** | C | C | I |
| Define approval authority | I | A | **R** | I | C | I |
| Define access and WBS scope | I | A | **R** | I | C | I |
| Configure workflow responsibility | I | I | **R/A** | I | R (own discipline) | I |
| Provision external logins | **R/A** | R | C | I | I | I |
| Suspend a stakeholder | A | I | C | **R** | I | R (suppliers/subs) |
| Blacklist a stakeholder | **R/A** | **R/A** | C | I | I | C |
| Terminate an assignment | I | A | **R** | C | C | I |
| Monthly compliance review | A | I | I | **R** | I | C |
| Monthly performance review | A | **R** | R | I | C | C |
| Quarterly register audit | **R/A** | I | I | **R** | I | C |
| Respond to an audit or claim request | A | R | R | **R** | I | I |

**R** = Responsible · **A** = Accountable · **C** = Consulted · **I** = Informed

---

## 3. Data Governance Policy

### 3.1 Ownership

| Data | Owner | Maintainer |
|---|---|---|
| Organisation master record | Company Admin | Document Controller |
| Contact persons | Document Controller | Document Controller |
| Compliance documents | Company Admin | Document Controller (Procurement for suppliers/subs, HSE for safety certificates) |
| Project assignments | Project Manager | Project Manager |
| Approval authority | Project Manager | Project Manager |
| Access and WBS scope | Project Manager | Project Manager |
| External logins | Company Admin | Company Admin |
| Performance scores | System — computed, never edited | — |

### 3.2 Organisation Naming Convention

Enter the **legal name exactly as it appears on the company registration certificate**, including punctuation and legal suffix. Do not abbreviate, do not standardise, do not tidy.

| Correct | Incorrect | Why |
|---|---|---|
| `Angkor Structural Consultants Co., Ltd.` | `Angkor Structural` | The legal name is the contractual identity |
| `Mekong Interior Solutions Co., Ltd.` | `Mekong Interiors` | Name variants defeat blacklist matching |
| `A.B.C. Trading Co., Ltd.` | `ABC Trading` | Duplicate detection normalises for you; you do not need to |

Use `trading_name` for the short form used in conversation. The system normalises names for duplicate detection automatically — stripping punctuation, case, and legal suffixes — so entering the exact legal name costs nothing and protects everything.

### 3.3 Mandatory Fields Before Activation

| Stakeholder Type | Mandatory Documents |
|---|---|
| Consultant, Architect/Designer | Company registration, trade licence, professional indemnity insurance, professional licence |
| Subcontractor | Company registration, trade licence, tax certificate, public liability insurance, employer liability insurance |
| Supplier / Vendor | Company registration, trade licence, tax certificate, public liability insurance |
| Testing Agency | Company registration, laboratory accreditation |
| Client, Authority, Utility, Insurance | Company registration only |

### 3.4 Review Frequency

| Activity | Frequency |
|---|---|
| Compliance expiry review | Monthly, working day 3 |
| Performance review | Monthly, working day 5 |
| External access review | Quarterly |
| Full register audit and de-duplication | Quarterly |
| Project matrix verification | At mobilisation, then monthly |

---

## 4. Standard Operating Procedures

---

### SOP-STK-01 — Register a New Stakeholder Organisation

| | |
|---|---|
| **Purpose** | Create an accurate, non-duplicate organisation record |
| **Trigger** | A new party is appointed, quoted, or nominated on any project |
| **Responsible** | Document Controller (suppliers and subcontractors: Procurement Officer) |
| **Frequency** | Daily during mobilisation; 2–5 per week at steady state |
| **Prerequisites** | Company registration certificate; at least one named contact with email; mandatory compliance documents per §3.3 |
| **Duration** | 5–10 minutes |

**Steps**

1. Search the register first. Type the organisation name in the search box. **Do not skip this.** More than half of all duplicates are created by somebody who did not search.
2. If found, open the existing record and add what is missing. Stop here.
3. If not found, select `+ Add Stakeholder`.
4. Step 1 — select the stakeholder type. If unsure, see the type descriptions on each card. A firm that designs is a Consultant; a firm that builds part of the works is a Subcontractor; a firm that only delivers goods is a Supplier.
5. Step 2 — enter the legal name exactly as registered, then the trading name, registration number, tax ID, country, and currency.
6. Wait for the duplicate check to complete after leaving the legal name field.
7. **Decision point — duplicate result:**
   - *Clear* → continue.
   - *Similar organisation found* → open the candidate. If it is the same firm, use it. If genuinely different, record the reason (usually a different registration number).
   - *Exact registration match* → stop. Use the existing record.
   - *Blocked* → stop. Contact the Company Admin. Do not attempt a different spelling.
8. Step 3 — add the primary contact. Enter the Khmer name in the local-script field where available; it matters for correspondence and for site staff recognising the name.
9. Step 4 — upload the mandatory documents with correct issue and expiry dates. Enter the expiry date from the certificate, not an estimate.
10. Save as `Draft`.
11. Select `Submit for verification`.
12. Inform the verifier if the record is needed urgently.

**Records produced:** stakeholder record in `Pending Approval`; audit entries for creation, document upload, and submission.

**Escalation:** verifier has not acted within 3 working days → remind. Within 5 → escalate to Company Admin.

**Common errors**

| Error | Prevention |
|---|---|
| Duplicate created because the register was not searched | Always search first. It takes 10 seconds. |
| Trading name entered in the legal name field | The legal name is on the registration certificate |
| Expiry date estimated rather than read from the certificate | Open the PDF and read it |
| Record left in `Draft` and forgotten | Submit immediately after creating |

---

### SOP-STK-02 — Verify and Approve a Stakeholder Registration

| | |
|---|---|
| **Purpose** | Ensure only verified organisations enter the active register |
| **Trigger** | A record reaches `Pending Approval` |
| **Responsible** | Company Admin or Project Director |
| **Frequency** | Daily check |
| **Duration** | 3–5 minutes per record |

**Steps**

1. Open the record from the notification or by filtering the register to `Pending Approval`.
2. Verify you did not create this record. If you did, route it to another verifier — the system will block you.
3. Check the legal name against the uploaded registration certificate. They must match.
4. Check the registration number against the certificate.
5. Open each compliance document. Confirm: the organisation named on the certificate is this organisation; the expiry date entered matches the certificate; the document is legible and complete.
6. Confirm at least one contact exists with a valid email.
7. **Decision point:**
   - All checks pass → `Approve`.
   - Anything is wrong or missing → `Reject` with a specific comment naming what must be corrected. "Incomplete" is not a useful comment; "Trade licence expiry entered as 2027-03-31 but certificate shows 2026-03-31" is.
8. The system notifies the creator either way.

**Records produced:** approval decision with comment; audit entry at High severity.

**Common errors:** approving without opening the certificates; rejecting without a specific reason, causing a second round trip.

---

### SOP-STK-03 — Assign a Stakeholder to a Project at Mobilisation

| | |
|---|---|
| **Purpose** | Establish the party's role, authority, and scope before work begins |
| **Trigger** | Appointment confirmed, or subcontract or purchase order awarded |
| **Responsible** | Project Manager |
| **Frequency** | 80–110 per project at mobilisation |
| **Prerequisites** | Stakeholder is `Active`; project and WBS exist; contract terms known |
| **Duration** | 5–8 minutes per party |

**Steps**

1. Open `Projects → [Project] → Stakeholders`, select `+ Assign`.
2. Select the organisation. If it is not `Active`, stop and resolve that first — see the specific reason shown.
3. Enter project role, discipline, contractual representative, contract reference, and engagement dates. The contractual representative is the person on whom contractual notices are validly served. Get this right; it has legal effect.
4. Set approval authority — see SOP-STK-04.
5. Set access level and module scope — see SOP-STK-05 for WBS restriction.
6. Enable workflow responsibilities. Enable only what this party actually does. Over-enabling causes notification noise and incorrect routing.
7. Review the readiness checklist in the footer. It shows exactly what remains.
8. Select `Activate`.
9. Confirm the contractual representative receives the activation notification.

**Records produced:** active assignment; authority, access, and responsibility records; audit entries.

**Escalation:** cannot activate because a required element is unclear (typically authority) → consult the Project Director before guessing. An incorrect authority configuration is worse than a delayed one.

**Common errors**

| Error | Consequence |
|---|---|
| Enabling all eight responsibilities "to be safe" | Party receives notifications for everything, reads none of them |
| Skipping the contractual representative | Contractual notices have no valid recipient |
| Leaving the assignment in `Draft` | Party cannot participate; workflows halt with no obvious cause |

---

### SOP-STK-04 — Define the Project Approval Matrix Before First Document Issue

| | |
|---|---|
| **Purpose** | Ensure every workflow step has an identified, authorised approver before work starts |
| **Trigger** | Project mobilisation, before any document is issued for construction |
| **Responsible** | Project Manager, consulted by Discipline Managers |
| **Frequency** | Once per project, reviewed monthly |
| **Prerequisites** | All primary parties assigned; contract approval provisions understood |
| **Duration** | 2–4 hours for a full project |

**This is the single most important procedure in this document.** A project that reaches construction with an incomplete approval matrix will halt unpredictably, and the halts will be blamed on the software rather than on the configuration.

**Steps**

1. Working from the contract, list every deliverable type requiring approval: drawings, shop drawings, material submittals, method statements, inspection requests, variations, progress claims.
2. For each, identify from the contract who reviews and who finally approves.
3. Open each assignment's Approval Authority screen.
4. Set the authority level, scoped by module and entity type where the party's authority differs by deliverable. A structural consultant approving structural submittals should not hold blanket authority over architectural finishes.
5. **Set a fallback approver for every party holding `Approve` or `Final Approval`.** A single named individual will take leave, resign, or be unreachable during a critical week. The fallback is what prevents a two-week halt.
6. Where the contract sets monetary limits on approval, enter the threshold.
7. Save. Review any gap warning the system returns.
8. Open the Project Stakeholder Matrix and confirm the defect count is zero.
9. Print or export the matrix for the project kick-off record and the quality plan.
10. **Gate:** no document may be issued for construction while the matrix shows unresolved defects.

**Decision point — a gap cannot be closed because the contract is silent:** escalate to the Project Director and the commercial team. Do not invent an approver. An approval given by somebody the contract does not authorise is worth nothing in a dispute.

**Records produced:** complete approval matrix; exported kick-off record; audit entries for every authority set.

**Common errors**

| Error | Consequence |
|---|---|
| No fallback approver configured | Approvals halt when one person is on leave — the most common cause of avoidable delay |
| Blanket `ALL/ALL` authority for convenience | A party approves things the contract does not authorise them to approve |
| Matrix completed after construction starts | Documents halt in week one and the cause takes days to find |

---

### SOP-STK-05 — Configure WBS-Restricted Access for a Subcontractor

| | |
|---|---|
| **Purpose** | Limit a subcontractor's visibility to their contracted scope |
| **Trigger** | Subcontract awarded for a defined portion of the works |
| **Responsible** | Project Manager |
| **Frequency** | 8–20 per project |
| **Prerequisites** | Subcontract scope defined by location; WBS built to the relevant depth |
| **Duration** | 5 minutes |

**Steps**

1. Open the assignment's Access Control section.
2. Set access level to `Limited Access`. `Full Access` is not available for external parties, by design.
3. Select only the modules the subcontractor needs: typically Tasks, Documents, Inspection Requests, and Daily Reports.
4. Set the confidentiality tier to 2 (Project internal) or lower. External parties cannot exceed tier 2.
5. Select `Restricted to selected nodes` in the WBS Scope section.
6. Tick the nodes matching the subcontract scope. **Understand inheritance:** ticking `B01-L03` grants every zone, room, and element beneath it. The tree shows inherited nodes greyed and labelled — read them before saving.
7. Confirm the coverage summary at the bottom matches the subcontract. If the subcontract covers levels 1 to 5, the summary should say 5 grants.
8. Save.
9. Spot-check by opening a record outside the scope as a test. It should return "not available".

**Decision point — scope spans two buildings:** add a separate grant for each. Grants do not imply each other.

**Records produced:** WBS scope grants; audit entry listing added and removed nodes.

**Common errors**

| Error | Consequence |
|---|---|
| Selecting the project root "temporarily" | The subcontractor sees the entire project including other subcontractors' work and rates |
| Not understanding inheritance | Scope is far wider than intended and nobody notices |
| Forgetting to extend scope when the subcontract is varied | The subcontractor cannot see work they are contracted to do; they report it as a system fault |

---

### SOP-STK-06 — Provision and Revoke an External User Account

| | |
|---|---|
| **Purpose** | Give an external party controlled access, and remove it promptly when the engagement ends |
| **Trigger** | Assignment activated and the party needs system access; or engagement ends |
| **Responsible** | Company Admin |
| **Frequency** | 30–80 per project |
| **Duration** | 3 minutes |

**Provisioning**

1. Open the assignment and select `Provision external user`.
2. Select the contact. Contacts without an email address cannot be provisioned — add the email first.
3. Select the external role matching the party type.
4. **Read the effective access preview.** It states exactly what this person will and will not see. If anything in the "will NOT see" list should be visible, or anything in the granted list should not be, fix the assignment scope before sending the invitation.
5. Send. The invitation is valid for 7 days and can be used once.
6. If the recipient does not act within 5 days, remind them. After 7 days, resend — the original token is dead.

**Revocation**

1. Access is revoked automatically when the assignment is terminated or the stakeholder is blacklisted.
2. To revoke manually: open the assignment, find the active link, select `Revoke access`, enter a reason.
3. Revocation is immediate and irreversible. Restoring access requires new provisioning.
4. Confirm the revocation appears in the audit trail.

**Records produced:** user link record; audit entries at Critical severity for both provisioning and revocation.

**Common errors:** provisioning before the assignment scope is correct, so the person sees more than intended on their first login; sharing one login between several people at the same firm, which destroys traceability — provision one login per named individual.

---

### SOP-STK-07 — Monthly Compliance Document Expiry Review

| | |
|---|---|
| **Purpose** | Ensure no active party holds expired mandatory documents |
| **Trigger** | Working day 3 of each month, plus system alerts at 60, 30, and 7 days |
| **Responsible** | Document Controller; Procurement Officer for suppliers and subcontractors |
| **Frequency** | Monthly, plus ad hoc on alert |
| **Duration** | 1–2 hours |

**Steps**

1. Filter the register: status `Active`, compliance expiring within 60 days.
2. Export the list.
3. For each, contact the organisation's primary contact requesting the renewed certificate. Use the template in the Training Guide.
4. Record the request date and expected renewal date.
5. On receipt, upload the renewed document with correct dates. The system supersedes the previous version automatically.
6. Follow up any not received by 14 days before expiry.
7. Escalate to the Project Manager any not received by 7 days before expiry.
8. **On expiry of a mandatory document, the system suspends the stakeholder automatically.** This blocks new assignments and new purchase orders.
9. If a suspension would block a business-critical delivery, request a time-boxed override from the Company Admin with a documented reason. Overrides are limited to 90 days and appear on the compliance exception report.

**Records produced:** compliance exposure report; upload audit entries; override records where applicable.

**Escalation:** repeated non-renewal by the same organisation → raise at the monthly performance review; consider suspension or removal from the approved list.

**Common errors:** requesting the renewal at 7 days rather than 60, leaving no time; uploading the renewal without updating the expiry date, so the alert never clears.

---

### SOP-STK-08 — Monthly Stakeholder Performance Review

| | |
|---|---|
| **Purpose** | Act on performance evidence rather than impression |
| **Trigger** | Working day 5 of each month |
| **Responsible** | Project Director, supported by Project Managers |
| **Frequency** | Monthly |
| **Duration** | 45–60 minutes |

**Steps**

1. Filter the register by reliability score below 80%.
2. For each, open the performance panel and review the four metrics.
3. Open the event ledger and identify where the delay concentrates. A score depressed by one bad month is a different problem from one depressed evenly across a year.
4. Check for context notes recorded against events — some delays are client-caused and should not be read as supplier failure.
5. **Decision point:**
   - 80% or above → no action.
   - 60–79% → Project Manager raises it with the party, references specific items, agrees an improvement expectation.
   - Below 60% for two consecutive months → formal performance warning through Subcontractor Management or the consultant's appointment; consider suspension.
6. Record the decision and the evidence referenced.
7. Feed conclusions into the approved-supplier list and future tender pricing.

**Records produced:** performance review minutes; warnings issued; updated preferred or approved status.

**Common errors:** treating the score as an absolute judgement rather than a prompt to investigate; acting on a score based on fewer than 10 events, which the system marks as insufficient data for exactly this reason.

---

### SOP-STK-09 — Handle an Approval Bottleneck

| | |
|---|---|
| **Purpose** | Restore flow when approvals stop moving |
| **Trigger** | Overdue approval escalation, or a workflow halt notification |
| **Responsible** | Project Manager |
| **Frequency** | As required |
| **Duration** | 15–30 minutes |

**Steps**

1. Identify which of the two situations applies:
   - **Halt** — the system reports no eligible approver. The workflow stopped because nothing could be routed.
   - **Delay** — an approver was identified but has not acted.
2. **If a halt:**
   - Open the notification. It names the module, entity type, and WBS branch, and states which filter emptied the list.
   - Open the Project Stakeholder Matrix and locate the defect.
   - Configure the missing authority (see SOP-STK-04).
   - The halted item resolves on the next attempt — halted results are never cached.
3. **If a delay:**
   - Check whether the approver's assignment is `Active`. If suspended or on hold, the item should have escalated to the fallback. If no fallback exists, configure one now.
   - Contact the approver directly. Record the contact.
   - If unavailable for an extended period, either configure a delegation with an end date, or reassign the authority.
4. If reassigning authority with items in flight, choose deliberately between keeping existing routing and re-routing. The system asks; answer intentionally.
5. Record the cause. Recurring bottlenecks at the same party are performance evidence.

**Never:** ask for the approval to be bypassed, approve on somebody else's behalf, or proceed on a verbal approval. If the work genuinely cannot wait, escalate to the Project Director for a documented commercial decision — recorded as such, not disguised as an approval.

---

### SOP-STK-10 — Terminate an Assignment and Hand Over Responsibilities

| | |
|---|---|
| **Purpose** | End an engagement without leaving orphaned obligations or live access |
| **Trigger** | Engagement complete, contract terminated, or party replaced |
| **Responsible** | Project Manager |
| **Frequency** | 10–30 per project |
| **Duration** | 20–45 minutes depending on open item count |

**Steps**

1. Before terminating, open `Open obligations` on the assignment to see what is outstanding.
2. Identify the incoming party. If a replacement is needed, assign and activate them first — you cannot transfer obligations to somebody who is not assigned.
3. Select `Terminate`, enter the reason and effective date.
4. The system lists every open obligation and blocks termination until each is handled.
5. For each item, either transfer it to another assignment with sufficient authority, or — for genuinely obsolete items — mark it orphaned with a reason.
6. Confirm. The system terminates the assignment, revokes external logins, and notifies both parties.
7. Verify within one hour that the external logins show as revoked.
8. Confirm the incoming party can see the transferred items.

**Decision point — no suitable transferee exists:** do not orphan the items to get past the block. Escalate to the Project Director. Orphaning is for obsolete items, not for inconvenient ones.

**Records produced:** termination record with the handover map; revocation audit entries at Critical severity.

---

### SOP-STK-11 — Suspend or Blacklist a Stakeholder

| | |
|---|---|
| **Purpose** | Remove a party from service temporarily or permanently, with evidence |
| **Trigger** | Compliance lapse, performance failure, contract default, fraud, or regulatory violation |
| **Responsible** | Suspend — Document Controller or Procurement Officer. Blacklist — Company Admin or Project Director only. |
| **Frequency** | Suspend: several per month. Blacklist: 1–4 per year. |

**Suspension**

1. Open the record, select `Suspend` from the actions menu.
2. Read the consequence list. It states how many assignments will freeze and how many approvals will escalate.
3. Select the reason category and enter the reason.
4. Confirm.
5. **Check the response.** If it reports halted approvals — items with no fallback approver — those items have stopped and need immediate attention. Deal with them the same day.
6. Notify the affected Project Managers if the system's notification is not sufficient context.

**Blacklisting** — a company-wide commercial decision, not a project-level one.

1. Confirm the grounds are documented: termination notice, fraud finding, regulatory determination, or safety determination. A commercial disagreement is not grounds.
2. Obtain agreement from the Project Director and Company Admin.
3. Open the record, select `Blacklist`.
4. Read the consequence list: assignments terminated across all projects, logins revoked, open items requiring reassignment.
5. Enter the reason category, a reason of at least 20 characters, and the evidence reference.
6. Type the organisation's legal name exactly to confirm.
7. Confirm.
8. Work with each affected Project Manager to reassign the surfaced open items.
9. Note that blacklisting does not resolve outstanding payment obligations — those remain with Account and Contract Administration.

**Lifting a blacklist** requires the same two roles, a written justification, and returns the record to `Inactive`. Re-verification through SOP-STK-02 is required before it can be used again.

---

### SOP-STK-12 — Quarterly Register Audit and De-Duplication

| | |
|---|---|
| **Purpose** | Keep the register accurate as it ages |
| **Trigger** | Quarterly, first week of the quarter |
| **Responsible** | Document Controller, accountable to Company Admin |
| **Duration** | Half a day |

**Steps**

1. Export the full register.
2. Sort by normalised name and scan for near-identical entries the fuzzy check may have been overridden on.
3. For each suspected duplicate, check registration numbers. Same number means the same entity.
4. Consolidate: move contacts and documents to the surviving record, archive the duplicate. Never delete.
5. Review all records in `Draft` older than 30 days — either complete or archive them.
6. Review all `Pending Approval` older than 10 days — verify or reject.
7. Review all `Suspended` records — either resolve the cause or archive.
8. Review `Active` records with no project assignment in 12 months — consider archiving.
9. Verify the type counts in the left panel against the export totals.
10. Produce an audit summary: total records, duplicates resolved, records archived, outstanding issues.

**Records produced:** quarterly register audit report, retained as a quality record.

---

### SOP-STK-13 — Quarterly External Access Review

| | |
|---|---|
| **Purpose** | Confirm no external party holds access beyond their contractual scope |
| **Trigger** | Quarterly |
| **Responsible** | Company Admin, consulted by Project Managers |
| **Duration** | 2 hours |

**Steps**

1. Generate the external access review report.
2. For each external assignment, confirm: the engagement is still current; the module scope matches the appointment; the WBS scope matches the contracted works; the authority level matches the contract; the confidentiality tier is 2 or lower.
3. For each active external login, confirm the named individual is still employed by that organisation and still working on this project.
4. Revoke any login for a person no longer engaged.
5. Correct any scope that has drifted wider than the contract.
6. Review the access-denial log for clusters — repeated denials from one external user may indicate either a misconfiguration or probing. Investigate either way.
7. Sign off the review.

**Escalation:** any access found materially wider than contracted → correct immediately, then report to the Project Director with an assessment of what may have been visible.

---

### SOP-STK-14 — Respond to an Audit or Claim Traceability Request

| | |
|---|---|
| **Purpose** | Produce evidence of who approved what, when, and under what authority |
| **Trigger** | Client audit, internal audit, ISO surveillance, claim, or dispute |
| **Responsible** | Document Controller, supported by the Project Manager |
| **Duration** | Under 15 minutes for a single record |

**Steps**

1. Obtain the specific reference: document number, inspection reference, or approval date.
2. Open the record in its owning module and select the Activity or History tab.
3. The timeline shows: who submitted and when; who it was routed to; **the authority level that party held at that moment** — not today's; every reminder and escalation issued; the decision, decision-maker, and time.
4. Open the stakeholder record to produce the assignment record covering the relevant period, and the compliance documents current at that date.
5. Export both.
6. Where the request concerns a party no longer engaged, the record remains complete — assignments are terminated, never deleted.

**This is why the register is maintained.** The evidence is a by-product of the work being done correctly, not something assembled afterwards.

---

## 5. Project Mobilisation Checklist

Complete before construction start. No document may be issued for construction until every item is signed off.

| # | Item | Responsible | Complete |
|---|---|---|---|
| 1 | Project created; WBS built to at least zone level | Project Manager | ☐ |
| 2 | Client registered, assigned, authority and access set | Project Manager | ☐ |
| 3 | PMC and all design consultants registered and assigned | Document Controller / PM | ☐ |
| 4 | Contractual representative named for every party | Project Manager | ☐ |
| 5 | Approval authority set for every deliverable type | Project Manager | ☐ |
| 6 | **Fallback approver set for every approval-bearing party** | Project Manager | ☐ |
| 7 | Access level and module scope set for every external party | Project Manager | ☐ |
| 8 | WBS scope set for every subcontractor | Project Manager | ☐ |
| 9 | Workflow responsibilities enabled and verified | Project Manager / Discipline Managers | ☐ |
| 10 | Mandatory compliance documents current for every party | Document Controller | ☐ |
| 11 | External logins provisioned and first logins confirmed | Company Admin | ☐ |
| 12 | **Project Stakeholder Matrix shows zero defects** | Project Manager | ☐ |
| 13 | Matrix exported to the project kick-off record and quality plan | Document Controller | ☐ |
| 14 | Regulatory authorities and utility authorities registered | Document Controller | ☐ |

Signed: Project Manager ________ Project Director ________ Date ________

---

## 6. Monthly Governance Calendar

| Working Day | Activity | Responsible |
|---|---|---|
| 1 | Review register additions from the previous month | Document Controller |
| 2 | Clear all `Pending Approval` records | Company Admin |
| **3** | **Compliance expiry review (SOP-STK-07)** | Document Controller |
| 4 | Request outstanding renewals | Document Controller |
| **5** | **Performance review (SOP-STK-08)** | Project Director |
| 6 | Issue performance warnings arising | Project Manager |
| 8 | Project matrix verification — all active projects | Project Manager |
| 10 | Resolve any matrix defects | Project Manager |
| 15 | Mid-month compliance follow-up | Document Controller |
| 20 | Review orphaned assignment report | Project Manager |
| Last | Archive stale drafts; confirm month-end register state | Document Controller |

Quarterly, in the first week: register audit (SOP-STK-12) and external access review (SOP-STK-13).

---

## 7. Quality Records and Retention

| Record | Retained | Location | Period |
|---|---|---|---|
| Stakeholder master records | System | DCOS | Project duration + 10 years |
| Compliance documents | System | DCOS storage | Certificate validity + 7 years |
| Project Stakeholder Matrix at kick-off | Exported | Project quality file | Project duration + 10 years |
| Approval authority audit trail | System | Audit log | Project + DLP + 5 years |
| Blacklist records and evidence | System | DCOS | Permanent |
| Monthly compliance review reports | Exported | Quality file | 3 years |
| Monthly performance review minutes | Exported | Quality file | 5 years |
| Quarterly register audit reports | Exported | Quality file | 3 years |
| Quarterly external access reviews | Exported | Quality file | 3 years |
| Legacy import reconciliation reports | Exported | Migration file | Permanent |

---

## 8. Escalation Matrix

| Issue | First Responder | Escalate To | Timeframe |
|---|---|---|---|
| Registration not verified | Document Controller | Company Admin | 5 working days |
| Approval halt — no approver | Project Manager | Project Director | Same day |
| Approver unavailable | Project Manager | Discipline Manager → Project Director | 2 working days |
| Mandatory document expired | Document Controller | Project Manager → Company Admin | Immediate |
| External access wider than contracted | Company Admin | Project Director | Immediate |
| Reliability below 60%, two months | Project Manager | Project Director | At monthly review |
| Suspected duplicate not resolvable | Document Controller | Company Admin | At quarterly audit |
| Blacklist variant registration attempt | Company Admin | Project Director | Immediate |
| Repeated external access denials | Company Admin | Security owner | Same day |
| Audit or claim request | Document Controller | Project Manager → Project Director | Per request deadline |

---

## 9. Common Mistakes and Prevention

| Mistake | Consequence | Prevention |
|---|---|---|
| Not searching before creating | Duplicate register; split spend data; blacklists defeated | Search is the first step of SOP-STK-01 |
| No fallback approver | Approvals halt when one person takes leave | Mobilisation checklist item 6 |
| Approval matrix completed after construction start | Unexplained halts in week one | Gate at checklist item 12 |
| Enabling all responsibilities | Notification fatigue; parties ignore genuine alerts | Enable only what the party does |
| Granting project root to a subcontractor | Competitors see each other's scope and progress | Read the coverage summary before saving |
| Sharing one external login | No traceability of who approved what | One login per named individual |
| Terminating without handover | Orphaned obligations discovered months later | The system blocks it — do not orphan to get past the block |
| Blacklisting over a commercial dispute | Governance tool misused; supplier base narrowed unfairly | Two-role requirement and evidence reference |
| Uploading a renewal without updating the expiry date | Alert never clears; expiry arrives unnoticed | Read the date from the certificate |
| Treating a halt as a system fault | Time lost blaming the software instead of fixing configuration | Rule 2, §1 |

---

## 10. Compliance Mapping — ISO 9001:2015

| Clause | Requirement | How These Procedures Satisfy It |
|---|---|---|
| 5.3 | Organisational roles, responsibilities and authorities | The register is the documented record of assigned authority; SOP-STK-04 defines it per project |
| 7.1.6 | Organisational knowledge | Performance history and lessons feed re-engagement decisions (SOP-STK-08) |
| 7.5 | Documented information — control | Compliance documents version-controlled with expiry tracking; superseded versions retained (SOP-STK-07) |
| 8.4 | Control of externally provided processes, products and services | Registration, verification, compliance, and performance monitoring of all external providers (SOP-STK-01, 02, 07, 08) |
| 8.4.1 | Criteria for evaluation and re-evaluation of external providers | Reliability scoring and monthly review (SOP-STK-08) |
| 8.5.1 | Control of production and service provision | Authority matrix ensures approvals are given by authorised parties (SOP-STK-04) |
| 9.2 | Internal audit | Quarterly register audit and access review (SOP-STK-12, 13) |
| 9.3 | Management review | Monthly performance review feeds management reporting (SOP-STK-08) |
| 10.2 | Nonconformity and corrective action | Suspension, warning, and blacklist procedures (SOP-STK-11) |

Traceability requirements under clause 8.5.2 are met by SOP-STK-14.

---

## 11. Open Questions

| ID | Question | Owner |
|---|---|---|
| Q-41 | Should the mobilisation checklist be a system-enforced gate on issue-for-construction, or a procedural one? System enforcement is stronger but less flexible for fast-track projects. | Project Director |
| Q-42 | Who owns compliance documents for subcontractors — Document Controller or Procurement Officer? Current split by type causes occasional gaps. | Company Admin |
| Q-43 | Should blacklisting require Project Director *and* Company Admin jointly, rather than either one? | Company Admin |
| Q-44 | Is a monthly performance review cadence right, or should it be quarterly with monthly exception reporting only? | Project Director |

---

## 12. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 14 SOPs, RACI, mobilisation checklist, governance calendar, ISO mapping | Construction Operations Consultant |

---

**End of Document**
