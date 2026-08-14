# 12 — Training Guide
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-TRN-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Use |
| Author Role | Enterprise SaaS Trainer / Construction Operations Consultant |
| Date | 2026-08-08 |
| Delivery | Instructor-led, bilingual English / Khmer |
| Related Documents | DCOS-STK-UC-001, DCOS-STK-UX-001, DCOS-STK-RBAC-001, DCOS-STK-SOP-001 |

---

## 1. Training Objectives

By the end of training, participants will be able to:

1. Explain why the stakeholder register is a responsibility control panel and not a contact list.
2. Register an organisation without creating a duplicate.
3. Assign a party to a project with correct authority, access, and scope.
4. Recognise a workflow halt as correct system behaviour and fix its cause.
5. Maintain compliance documents ahead of expiry.
6. Provision and revoke external access safely.
7. Locate traceability evidence for an audit or claim.

### 1.1 The One Thing

If a participant remembers nothing else:

> **If a party is not registered and assigned with an approval level, the workflow will stop and nobody will be notified in time. That is the system working correctly, not a bug.**

This sentence appears in every training path in this guide, deliberately.

---

## 2. Audience Analysis

| Factor | Reality |
|---|---|
| Prior system exposure | Most participants have used spreadsheets, Telegram, and email. Few have used an enterprise platform with role-based access. |
| Devices | Office staff: laptops. Site staff: Android phones, often older models, frequently used with gloves or wet hands. |
| Language | Mixed. Technical staff generally comfortable in English; site supervisors and storekeepers prefer Khmer. Materials are bilingual; delivery is bilingual with Khmer-first for site roles. |
| Connectivity | Office reliable. Site variable — basements and rural projects have no signal. |
| Attitude | Expect scepticism. Most participants have seen a system introduced, half-adopted, and abandoned. Address this directly rather than ignoring it. |
| Literacy with the concepts | High. These are construction professionals who understand approval chains, RFIs, and scope better than most software trainers do. Do not over-explain the construction; explain the system. |

---

## 3. Training Paths by Role

| Path | Audience | Duration | Prerequisites | Assessment |
|---|---|---|---|---|
| **P1 — Company Admin** | Company Admin, IT lead | 90 min | DCOS platform induction | Practical: onboard 20 records, resolve 3 duplicates, blacklist 1, configure weights |
| **P2 — Project Manager** | PM, Project Director | 60 min | P0 core concepts | Practical: mobilise a test project to zero matrix defects |
| **P3 — Document Controller** | DC, admin support | 90 min | P0 core concepts | Practical: register 10 organisations, upload 15 documents, run an expiry review |
| **P4 — Discipline Manager** | ARC/STR/MEP/CIV managers | 45 min | P0 core concepts | Knowledge check + configure responsibilities for own discipline |
| **P5 — Procurement Officer** | Procurement, storekeeper | 45 min | P0 core concepts | Practical: build a compliant RFQ list |
| **P6 — Site Supervisor** | Site supervisors, foremen | 20 min | None | Practical: find a contact offline in under 15 seconds |
| **P7 — External Onboarding** | Client, consultant, subcontractor, supplier users | 30 min | None | Practical: log in, locate assigned items |

**P0 — Core Concepts** (§4) is a 15-minute module delivered at the start of P2 through P5.

---

## 4. P0 — Core Concepts Lesson

*Duration: 15 minutes. Delivered to all internal paths.*

### 4.1 Open With the Problem, Not the Software

Start here, not with a screenshot:

> "On the last project, how long did it take to find out who approved the L07 concrete pour inspection? And when the structural consultant's reviewer left in month six, how did we find out? Usually when an RFI had been sitting unanswered for three weeks."

Let the room answer. They will have better examples than any prepared slide.

### 4.2 The Four Questions

Every record in DCOS must answer four questions, and this module is where the answers live:

1. **Who is responsible** for this scope of work?
2. **Who approves** this document, task, RFI, inspection, or purchase?
3. **Who executes** the work?
4. **Who is accountable** when it fails?

### 4.3 What This Is Not

| It is not | Why the distinction matters |
|---|---|
| A contact list | A contact list stores names. This stores authority. |
| A CRM | No sales pipeline, no leads. |
| Optional admin | Every workflow in DCOS resolves its actor through this module. |

### 4.4 How Assignment Drives Everything

Draw this on a whiteboard rather than showing a slide:

```
   Organisation registered
            ↓
   Assigned to a project  ──── with role, authority, access, scope
            ↓
   ┌────────┴────────┬─────────────┬──────────────┐
   ▼                 ▼             ▼              ▼
Documents          RFIs        Inspections    Purchase Orders
route here      route here     route here      route here
```

Then remove the assignment box and ask what happens to the four arrows below it.

### 4.5 The One Thing

State it, write it up, and return to it at the end of every path:

> **If a party is not registered and assigned with an approval level, the workflow will stop and nobody will be notified in time. That is the system working correctly, not a bug.**

Follow with: "The old system did not stop. It carried on, and the wrong person approved, and we found out during the claim. Stopping is the improvement."

---

## 5. Step-by-Step Walkthroughs

---

### W1 — Register a New Organisation

*Paths: P1, P3, P5 · 12 minutes*

`[SCREENSHOT: SCR-STK-001 — Stakeholder Register with the type filter panel showing counts]`

**Step 1 — Search first.** Type the organisation name in the search box before anything else. Over half of all duplicates are created by somebody who skipped this.

`[SCREENSHOT: SCR-STK-001 — search box with results filtered]`

**Step 2 — Add.** Select `+ Add Stakeholder`. The drawer opens over the register, so you can still see the list behind it.

`[SCREENSHOT: SCR-STK-002 — Step 1, twelve stakeholder type cards]`

**Step 3 — Choose the type.** Each card explains what the type means in practice. A firm that designs is a Consultant. A firm that builds part of the works is a Subcontractor. A firm that only delivers goods is a Supplier.

**Step 4 — Organisation details.** Enter the legal name **exactly as it appears on the registration certificate**, punctuation and suffix included.

`[SCREENSHOT: SCR-STK-002 — Step 2 with the duplicate check showing a clear result]`

**Step 5 — Read the duplicate result.** After leaving the legal name field, the check runs.

`[SCREENSHOT: SCR-STK-002 — amber fuzzy-match card showing a candidate organisation]`

| Result | What to do |
|---|---|
| Green check | Continue |
| Amber card with a candidate | Open it. Same firm? Use it. Genuinely different? Record why. |
| Red — exact match | Stop. Use the existing record. |
| Red — cannot be registered | Stop. Contact the Company Admin. **Do not try a different spelling.** |

**Step 6 — Contact.** Add the primary contact. Use the local-script field for the Khmer name where you have it — site staff recognise the Khmer name, not the transliteration.

`[SCREENSHOT: SCR-STK-002 — Step 3 contact form with both name fields populated]`

**Step 7 — Compliance documents.** Upload the mandatory documents for this type. Read the expiry date off the certificate. Do not estimate it.

`[SCREENSHOT: SCR-STK-009 — compliance register with colour-coded expiry indicators]`

**Step 8 — Save and submit.** Save creates a `Draft`. Then select `Submit for verification`. A draft that is never submitted cannot be used for anything.

---

### W2 — Assign to a Project

*Paths: P1, P2 · 15 minutes*

`[SCREENSHOT: SCR-STK-014 — Project Stakeholder Matrix with the defect banner visible]`

**Step 1.** Open `Projects → [Project] → Stakeholders`. Note the defect count at the top. Zero is the target before construction starts.

**Step 2.** Select `+ Assign` and choose the organisation. If it is not Active, the drawer tells you why instead of showing a form.

`[SCREENSHOT: SCR-STK-004 — blocked-assignment state for a blacklisted stakeholder]`

**Step 3 — Assignment details.** Role, discipline, contractual representative, contract reference, dates.

The **contractual representative** is the person on whom contractual notices are validly served. This has legal effect. Get it right.

**Step 4 — Approval authority.**

`[SCREENSHOT: SCR-STK-005 — four authority level cards with consequence descriptions]`

| Level | Meaning |
|---|---|
| No Approval | Participates, cannot approve anything |
| Review Only | Comments and marks reviewed; cannot approve |
| Approve | Approves at this workflow step |
| Final Approval | Closes the approval chain |

**Set a fallback approver.** This is the most commonly skipped field and the most commonly regretted. The named reviewer will take leave. Without a fallback, approvals halt.

**Step 5 — Access control.**

`[SCREENSHOT: SCR-STK-006 — access level cards with Full Access disabled for an external party]`

For external parties, `Full Access` is not available. This is by design and cannot be overridden.

**Step 6 — WBS scope** (subcontractors especially).

`[SCREENSHOT: SCR-STK-006 — WBS tree showing direct grants and greyed inherited nodes]`

Ticking `B01-L03` grants **every zone, room, and element beneath it**. The tree shows inherited nodes greyed and labelled "inherited". Read the coverage summary at the bottom before saving.

**Step 7 — Workflow responsibilities.**

`[SCREENSHOT: SCR-STK-007 — eight toggles, two disabled with authority explanations]`

Enable only what this party actually does. Enabling everything "to be safe" means they receive notifications for everything and read none of them.

**Step 8 — Activate.**

`[SCREENSHOT: SCR-STK-004 — readiness checklist showing two remaining items]`

The footer checklist shows exactly what is missing. Each unmet item is a link that takes you there.

---

### W3 — Provision External Access

*Paths: P1 · 8 minutes*

`[SCREENSHOT: SCR-STK-012 — provisioning drawer with the effective access preview]`

**The most important element on this screen is the access preview.** It states, in plain language, exactly what this person will and will not see.

Read it before sending. If anything in the "will NOT see" list should be visible, or anything granted should not be, fix the assignment scope first.

**One login per named individual.** Never share a login across a firm. Shared logins destroy traceability, which is the entire point of the module.

---

### W4 — Monthly Compliance Review

*Paths: P3, P5 · 10 minutes*

`[SCREENSHOT: SCR-STK-001 — register filtered to compliance expiring within 60 days]`

**Step 1.** Filter: status Active, compliance expiring within 60 days.

**Step 2.** Export the list.

**Step 3.** Request renewals using the template in §11.

**Step 4.** Upload renewals as received. The system supersedes the old certificate automatically.

**Why 60 days and not 7:** a renewed insurance certificate from a Cambodian insurer typically takes three to five weeks. Requesting at seven days guarantees a suspension.

---

### W5 — Fix an Approval Halt

*Paths: P2, P4 · 10 minutes*

`[SCREENSHOT: notification — Critical: no eligible approver, with diagnostics]`

**Step 1 — Read the notification.** It names the module, entity type, WBS branch, and which filter emptied the approver list.

**Step 2 — Open the Project Stakeholder Matrix.** The gap appears as a defect with the same detail.

**Step 3 — Configure the missing authority.**

**Step 4 — The halted item resolves on the next attempt.** Halted results are never cached, so the fix takes effect immediately.

**What never to do:** ask for the approval to be bypassed, approve on somebody's behalf, or proceed on a verbal approval. If work genuinely cannot wait, escalate to the Project Director for a documented commercial decision — recorded as a commercial decision, not disguised as an approval.

---

### W6 — Find a Contact on Site

*Path: P6 · 5 minutes*

`[SCREENSHOT: SCR-STK-015 — mobile directory with contact cards]`

Open Stakeholders. Search or tap a type chip. Tap the phone number to dial, or the Telegram handle to open Telegram.

Works offline. The cache age shows at the bottom. If it says more than seven days, connect to refresh.

---

## 6. Hands-On Exercises

All exercises use the **Tower A** training project in the training tenant.

---

**E1 — Register a consultant** *(P1, P3 · 10 min)*
Register "Bayon Geotechnical Services Co., Ltd.", registration 00087412, with contact Kim Sophal, Principal Geotechnical Engineer, discipline CIV. Upload the trade licence (expires 2027-06-30) and professional indemnity certificate (expires 2027-01-15). Submit for verification.
*Self-check:* status is Pending Approval; both documents show green expiry indicators.

---

**E2 — Hit a duplicate** *(P1, P3 · 8 min)*
Attempt to register "Angkor Structural Consultants Limited". The register already holds "Angkor Structural Consultants Co., Ltd."
*Expected:* amber fuzzy-match card with the existing candidate.
*Task:* decide whether it is the same firm and act accordingly. Justify your decision to the group.
*Self-check:* no second record created.

---

**E3 — Hit a blacklist** *(P1, P3 · 5 min)*
Attempt to register "Mekong Interiors (Cambodia) Ltd."
*Expected:* hard block. The register holds "Mekong Interior Solutions Co., Ltd." as blacklisted.
*Discussion:* why did the system match these two names? What would have happened without this check?

---

**E4 — Assign the client** *(P2 · 12 min)*
Assign Mekong Development Co., Ltd. to Tower A as Employer with `Final Approval` on variations and progress claims, `Limited Access` to Documents, Progress Reports, RFI, Variation Order, and Progress Claim. Set the Deputy Project Director as fallback. Activate.
*Self-check:* assignment Active; matrix defect count unchanged or reduced.

---

**E5 — Scope a subcontractor** *(P2 · 12 min)*
Assign Mekong Blockwork Co., Ltd. as a Subcontractor with `No Approval`, `Limited Access` to Tasks, Documents, Inspection Requests, and Daily Reports, restricted to B01 levels L01 to L05.
*Self-check:* coverage summary reads 5 grants; log in as the test subcontractor user and confirm a task on L07 returns "not available".

---

**E6 — Try to break the rules** *(P2 · 8 min)*
Attempt each and record what the system says:
(a) grant `Full Access` to a consultant; (b) activate an assignment with no authority; (c) enable Inspection Approval on a `Review Only` party; (d) set an assignment as its own fallback.
*Discussion:* which of these would have been possible in a spreadsheet, and what would the consequence have been?

---

**E7 — Cause and fix a halt** *(P2, P4 · 15 min)*
Remove the approval authority for structural submittals on Tower A. Submit a test drawing. Observe the halt and the notification. Read the diagnostics. Restore the authority. Resubmit.
*Self-check:* the drawing was neither approved nor skipped during the halt; it routes correctly after the fix.
*This is the most important exercise in the programme.*

---

**E8 — Handle expiring compliance** *(P3, P5 · 10 min)*
Filter for documents expiring within 30 days. Identify Delta Steel (5 days). Draft the renewal request using the §11 template. Upload the renewal and confirm the alert clears.

---

**E9 — Provision and revoke external access** *(P1 · 12 min)*
Provision a login for Sok Dara at Angkor Structural. Read the access preview aloud to the group. Send the invitation. Then terminate the assignment and confirm the login shows as revoked.
*Discussion:* what would have happened under the old process when a consultant's engagement ended?

---

**E10 — Produce audit evidence** *(P1, P2, P3 · 10 min)*
A client auditor asks who approved the inspection on B01-L07-Z02 on 14 March. Locate: the approver, the authority they held **on that date**, their assignment record for the period, and their professional indemnity certificate current at that time. Export.
*Target: under 5 minutes.*
*Discussion:* how long would this have taken from email and a shared drive?

---

**E11 — Build a compliant RFQ list** *(P5 · 10 min)*
Produce a list of suppliers eligible to receive an RFQ for structural steel: Active, no compliance expiring within 30 days, reliability 80% or above, trade category matching. Export.
*Self-check:* every supplier on the list passes an eligibility check.

---

**E12 — Find a contact offline** *(P6 · 5 min)*
Sync the directory, enable airplane mode, then find the site manager for the blockwork subcontractor and start a call.
*Target: under 15 seconds.*

---

## 7. Worked Scenario — Tower A Mobilisation

*Delivered in P2, 25 minutes, as a group exercise.*

**Situation.** Tower A, 22 storeys, Phnom Penh, lump sum, 26-month programme. Construction start in 14 working days. The register holds nothing for this project.

**Day 1.** Create the project. Build the WBS to zone level.

**Day 2–3.** Register the client, the PMC, and four design consultants. Two already exist from a previous project — reuse them rather than recreating. One triggers a duplicate warning. One consultant's professional indemnity certificate expires in 40 days; request the renewal now, not in month three.

**Day 4.** Assign each party. Client: `Final Approval` on variations and claims, Deputy PD as fallback. PMC: `Approve` on drawings and inspections. Structural consultant: `Approve` on structural submittals only — scoped by discipline so they cannot approve architectural finishes.

At this point you discover the MEP consultant has nominated only one reviewer. Ask for a second before continuing. This five-minute conversation prevents a two-week halt in month nine.

**Day 5–7.** Register and assign six subcontractors and twenty-two suppliers. Blockwork scoped to L01–L05, curtain wall to L06–L22. Neither can see the other.

**Day 8.** Open the Project Stakeholder Matrix. Three defects:
- No approver for fit-out material approval on L18–L22
- Fire Authority has no contractual representative
- One supplier's insurance expires before the first delivery date

Resolve all three.

**Day 10.** Provision external logins. Two invitations expire unused; resend.

**Day 14.** First structural drawing issued for review. It routes correctly on the first attempt.

**Group discussion.** On the last project this took four weeks and was still incomplete when construction started. What specifically made the difference here? What would happen if step 8 were skipped?

---

## 8. Quick Reference Cards

*Printable, one page per role.*

---

### Company Admin

| Task | Where |
|---|---|
| Approve registrations | Register → filter Pending Approval |
| Provision external access | Assignment → Provision external user |
| Blacklist | Stakeholder → ⋯ → Blacklist |
| Configure scoring weights | Admin → Stakeholder settings |
| Bulk import | Register → Import |

**You can:** approve, blacklist, provision, configure, archive
**You cannot:** edit a performance score (nobody can), approve a registration you created
**Remember:** blacklisting affects every project. Two-step confirmation exists for a reason.
**Contact:** Project Director for blacklist decisions; IT for platform issues

---

### Project Manager

| Task | Where |
|---|---|
| Assign a party | Projects → Stakeholders → + Assign |
| Set authority | Assignment → Approval Authority |
| Set WBS scope | Assignment → Access Control |
| Check matrix defects | Projects → Stakeholders (banner at top) |
| Terminate | Assignment → Terminate |

**You can:** assign, set authority and access, terminate — **on your own projects only**
**You cannot:** blacklist, provision external logins, act on other PMs' projects
**Remember:** set a fallback approver every time. Zero matrix defects before construction starts.
**Contact:** Project Director for authority questions the contract does not answer

---

### Document Controller

| Task | Where |
|---|---|
| Register an organisation | Register → + Add Stakeholder |
| Add or change contacts | Detail panel → Contacts |
| Upload compliance documents | Detail panel → Compliance |
| Monthly expiry review | Register → filter expiring within 60 days |
| Produce audit evidence | Record → Activity tab |

**You can:** register, maintain contacts and documents, suspend, export
**You cannot:** assign to projects, set authority, blacklist
**Remember:** search before creating. Read expiry dates off the certificate.
**Monthly:** working day 3 — expiry review

---

### Discipline Manager

| Task | Where |
|---|---|
| Configure responsibilities | Assignment → Workflow Responsibility |
| Check your discipline's approvers | Projects → Stakeholders, filter by discipline |
| Review your discipline's performance | Stakeholder → Performance |

**You can:** configure responsibilities for **your discipline only**
**You cannot:** assign, set authority, act outside your discipline
**Remember:** a halt in your discipline is usually a missing fallback approver

---

### Procurement Officer

| Task | Where |
|---|---|
| Register a supplier | Register → + Add Stakeholder |
| Check eligibility | Supplier record → status and compliance |
| Build an RFQ list | Register → filter and export |
| Maintain supplier documents | Detail panel → Compliance |

**You can:** create and edit **suppliers and subcontractors only**
**You cannot:** edit consultants or clients, assign to projects, blacklist
**Remember:** an expired insurance certificate blocks purchase orders automatically

---

### Site Supervisor

| Task | Where |
|---|---|
| Find a phone number | Stakeholders → search → tap number |
| Open Telegram | Tap the Telegram handle |
| Refresh offline data | Pull down to sync |

**You can:** view the directory, on or offline
**You cannot:** create, edit, or approve anything here
**Remember:** if the cache is more than 7 days old, connect and refresh

---

### External User (Client / Consultant / Subcontractor / Supplier)

| Task | Where |
|---|---|
| See your assigned items | Dashboard |
| Review or respond | Open the item |
| Check your own scope | Your organisation → Project Assignment |

**You can:** see and act on items within your project scope
**You cannot:** see other parties' commercial data, other disciplines, or other projects
**If you cannot find something:** contact your project's Document Controller. Not seeing it usually means it is outside your contracted scope.

---

## 9. Frequently Asked Questions

**1. Why can I not just add the supplier quickly and fix the details later?**
Because a supplier with no compliance documents can receive a purchase order, and if there is an incident on site with no valid insurance, the company carries the loss.

**2. The system says a similar organisation exists but I am sure it is different. What do I do?**
Check the registration numbers. Different number means genuinely different — record that as your reason. Same number means the same entity.

**3. Why can I not give the client full access? They own the project.**
They own the project, not our cost data. Full access would expose internal rates, margins, and subcontractor pricing. The client sees everything they are contractually entitled to see.

**4. An approval has been sitting for two weeks. Can somebody else approve it?**
Only somebody with recorded authority. If nobody has it, configure it — do not work around it. An approval by an unauthorised party is worth nothing in a dispute.

**5. What is a fallback approver and why does it keep asking me for one?**
The person who approves when the primary is on leave, sick, or unreachable. It asks because a single named approver is the most common cause of a project-wide approval halt.

**6. I ticked one WBS level but the subcontractor can see much more. Why?**
A grant covers that node and everything beneath it. Ticking a level grants all its zones, rooms, and elements. The tree shows this — inherited nodes appear greyed and labelled.

**7. Can I delete a stakeholder we no longer use?**
No. Archive it. The historical record must survive for claims and audits. Deletion would destroy the evidence of who did what.

**8. The supplier is suspended but we need a delivery this week.**
Ask the Company Admin for a time-boxed override with a documented reason, and chase the renewal. The override is limited to 90 days and appears on the exception report.

**9. Why does my colleague see stakeholders I cannot?**
Access depends on role, project membership, and stakeholder type. A Procurement Officer sees suppliers and subcontractors; an HR Officer sees internal departments only.

**10. The system says "not available" for a record I know exists.**
It exists but is outside your scope. The system does not confirm existence to somebody who cannot access it — that is a deliberate security property, not a bug.

**11. Can two people at the same consultant share one login?**
No. One login per named individual. Shared logins make it impossible to prove who approved what, which is the whole purpose of the module.

**12. An external user has left their company. What happens to their access?**
Revoke it immediately. It also revokes automatically when the assignment is terminated, and an hourly job catches anything missed.

**13. Why can I not edit a reliability score that I think is unfair?**
Nobody can — no role, no admin, no developer. If scores were editable they would be worthless as evidence. You can add a context note against a specific event explaining a client-caused delay.

**14. A consultant scores 74%. Should we stop using them?**
Not automatically. Open the event ledger and see where the delay concentrates. One bad month is a different problem from consistent underperformance.

**15. What happens if I terminate an assignment with open items?**
The system blocks it and lists them. Reassign each, or mark genuinely obsolete items as orphaned with a reason.

**16. Is blacklisting reversible?**
Yes, with justification and two-step confirmation, but the record returns to Inactive and requires re-verification. The blacklist history is never erased.

**17. Somebody registered a blacklisted firm under a slightly different name. How was it caught?**
The system normalises names — removing punctuation, case, and legal suffixes — and matches against the blacklist index. "Mekong Interiors (Cambodia) Ltd" and "Mekong Interior Solutions Co., Ltd." normalise closely enough to match.

**18. My phone shows the directory is 9 days old. Is the data wrong?**
Possibly out of date. Contacts change. Connect to refresh when you next have signal.

**19. Why does the system stop work instead of just carrying on?**
Because carrying on means the wrong person approves, and we find out during a claim eighteen months later. Stopping is loud and fixable. Silent failure is neither.

**20. This is more steps than the old spreadsheet. Why bother?**
The spreadsheet took four weeks to set up a project and still could not tell you who approved a pour eighteen months ago. This takes eight days and answers that question in four minutes.

---

## 10. Troubleshooting Guide

| Symptom | Likely Cause | Resolution | Escalate To |
|---|---|---|---|
| Cannot assign — "Cannot assign a Draft stakeholder" | Registration never submitted or approved | Submit and get it verified | Company Admin |
| Cannot assign — "Cannot assign a Suspended stakeholder" | Mandatory document expired | Upload the renewal, request reinstatement | Document Controller |
| Cannot assign — blacklisted | Firm blocked company-wide | Do not work around it | Company Admin |
| Cannot activate an assignment | Authority, access, or responsibility missing | Read the readiness checklist; each item links to its section | — |
| Approval not moving | No approver configured, or the approver has not acted | Check the matrix for defects; if configured, contact the approver | Project Manager |
| Notification says "no eligible approver" | Authority gap on that WBS branch | Configure the authority; the item resolves on the next attempt | Project Manager |
| External user sees too much | Access scope wider than contracted | Correct the module and WBS scope; report what may have been visible | Project Director |
| External user sees too little | Scope narrower than needed, or the assignment is not Active | Check the assignment status and access preview | Project Manager |
| Duplicate warning on a genuinely different firm | Similar names | Verify registration numbers; record the reason | Document Controller |
| Expiry alert will not clear after upload | Expiry date not updated on the new document | Edit the document and correct the date | Document Controller |
| "This record is not available" | Outside your scope | Confirm with the Document Controller whether you should have access | Document Controller |
| Cannot deactivate a contact | Sole approver on open items | Reassign those items first | Project Manager |
| Mobile directory empty | Never synced, or no project assignment | Connect and sync; confirm project membership | Project Manager |
| Type counts look wrong | Refresh lag, up to 60 seconds | Wait and reload | IT if persistent |
| Score shows "insufficient data" | Fewer than 10 recorded events | Normal for a new party; no action | — |

---

## 11. Templates

**Compliance renewal request** *(SOP-STK-07 step 3)*

> Subject: Renewal required — {document type} expiring {date}
>
> Dear {contact name},
>
> Our records show your {document type} ({reference}) expires on {date}.
>
> Please provide the renewed certificate before {date minus 14 days}. Under our procedures, an expired mandatory certificate suspends the account, which prevents new purchase orders and new project assignments until it is resolved.
>
> Please send the renewal to {email} or upload it through your DCOS access.
>
> Regards,
> {name}, Document Controller

**External user invitation follow-up**

> Subject: DCOS access invitation — action required
>
> Dear {contact name},
>
> An invitation to access the DCOS platform for {project} was sent on {date} and expires on {date + 7}. It has not yet been used.
>
> Please complete the setup so you can receive and respond to {documents / RFIs / inspection requests} for this project. If you did not receive it, reply and we will resend.
>
> Regards,
> {name}

---

## 12. Glossary

| Term | English | Khmer | Meaning |
|---|---|---|---|
| Stakeholder | Stakeholder | អ្នកពាក់ព័ន្ធ | Any organisation involved in a project |
| Assignment | Assignment | ការចាត់តាំង | The link between an organisation and one project |
| Approval authority | Approval authority | សិទ្ធិអនុម័ត | What a party is permitted to approve |
| Fallback approver | Fallback approver | អ្នកអនុម័តជំនួស | Who approves when the primary is unavailable |
| WBS scope | WBS scope | វិសាលភាព WBS | The locations a party may see and act on |
| Access level | Access level | កម្រិតចូលប្រើ | Full, limited, or read-only |
| Confidentiality tier | Confidentiality tier | កម្រិតសម្ងាត់ | How sensitive a document is; external parties are capped at tier 2 |
| Compliance document | Compliance document | ឯកសារអនុលោមភាព | Licence, insurance, or certificate with an expiry date |
| Suspend | Suspend | ផ្អាកបណ្ដោះអាសន្ន | Temporarily block, reversible |
| Blacklist | Blacklist | បញ្ជីខ្មៅ | Permanently block across all projects |
| Halt | Halt | ការឈប់ | Workflow stops because no approver is configured |
| Resolution | Resolution | ការកំណត់អ្នកទទួលខុសត្រូវ | The system determining who approves or is notified |
| Traceability | Traceability | ការតាមដានប្រវត្តិ | Proving who did what, when, under what authority |
| Reliability score | Reliability score | ពិន្ទុភាពជឿជាក់ | Computed performance measure, 0–100 |

---

## 13. Assessment

### 13.1 Knowledge Check — 20 questions

1. What are the four questions this module answers? *(responsible / approves / executes / accountable)*
2. Is the stakeholder register a contact list? *(No — it stores authority and accountability)*
3. What is the first step before registering an organisation? *(Search the register)*
4. Which name goes in the legal name field? *(The exact name on the registration certificate)*
5. Can an external stakeholder be granted Full Access? *(No — never, by design)*
6. What is a fallback approver for? *(To approve when the primary is unavailable)*
7. Ticking WBS node `B01-L03` grants access to what? *(That node and all descendants — zones, rooms, elements)*
8. Does a WBS grant on L03 give access to L04? *(No)*
9. What happens when a workflow finds no eligible approver? *(It halts; a Critical notification is raised; nothing is auto-approved)*
10. Can you delete a stakeholder? *(No — archive only)*
11. Who may blacklist? *(Company Admin or Project Director, with two-step confirmation)*
12. Does blacklisting affect one project or all? *(All projects in the company)*
13. When should compliance renewals be requested? *(60 days before expiry)*
14. What happens when a mandatory document expires? *(The stakeholder is suspended automatically)*
15. Can a reliability score be edited? *(No — by anyone)*
16. Below what score does a warning appear? *(80%)*
17. Can two people share one external login? *(No — one per named individual)*
18. When is external access revoked? *(On assignment termination, blacklisting, or manual revocation)*
19. Can you terminate an assignment with open items? *(Not until each is reassigned or explicitly orphaned)*
20. Why does the system return "not available" instead of "permission denied"? *(So the existence of out-of-scope records is not disclosed)*

Pass mark: 16 of 20.

### 13.2 Practical Assessment

| Path | Task | Pass Criterion |
|---|---|---|
| P1 | Onboard 20 records, resolve 3 duplicates, blacklist 1 correctly | No duplicates created; blacklist has reason, evidence, and confirmation |
| P2 | Mobilise a test project to zero matrix defects | Defect count zero; every approval-bearing party has a fallback |
| P3 | Register 10 organisations, upload 15 documents, run an expiry review | Zero duplicates; all expiry dates match certificates |
| P4 | Configure responsibilities for own discipline | Correct toggles; no cross-discipline changes attempted |
| P5 | Build a compliant RFQ list | Every supplier passes eligibility |
| P6 | Find a contact offline | Under 15 seconds |
| P7 | Log in and locate assigned items | Successful login; correct scope confirmed |

---

## 14. Trainer Notes

### 14.1 Timing

| Segment | Planned | Typical Actual |
|---|---|---|
| P0 core concepts | 15 min | 20 min — the opening discussion runs long, which is fine |
| W1 registration | 12 min | 12 min |
| W2 assignment | 15 min | 25 min — authority and WBS scope generate the most questions |
| E7 halt exercise | 15 min | 20 min — allow it; this is the exercise that changes minds |
| Q&A | 10 min | 15 min |

### 14.2 Common Confusions

| Confusion | How to Address |
|---|---|
| "Authority" versus "access" | Access is what you can *see*. Authority is what you can *decide*. A consultant may see a drawing and not be able to approve it. |
| WBS inheritance | Do not explain it — demonstrate it. Tick a level, then scroll and show the greyed descendants. |
| Why halts are good | Ask what happened last time an unauthorised person approved something. There is always a story. |
| Suspend versus blacklist | Suspend is a pause, project-agnostic, reversible. Blacklist is permanent, company-wide, and needs two roles. |
| Why external users see so little | Ask what a client would do with our subcontractor rates during a variation negotiation. |

### 14.3 Demo Data Setup

Before every session, reset the training tenant: 412 stakeholders, Tower A with a full WBS, one blacklisted firm with a name variant ready, one supplier with insurance expiring in 5 days, one consultant with a 74% score, one assignment deliberately missing its structural authority for E7.

### 14.4 Delivery Tips

- **Do not lead with a feature tour.** Lead with a failure they recognise.
- **Let the room supply the war stories.** They are better than any prepared example, and they build the case for you.
- **Do the halt exercise even if you are short on time.** Cut something else.
- **For site roles, deliver in Khmer with English terms retained** for the interface labels they will actually see on screen.
- **Expect the "this is more work" objection in every session.** Meet it with E10 — the four-minute audit response — rather than arguing.

---

## 15. Post-Training Support

| Phase | Support | Duration |
|---|---|---|
| Week 1 | Floor-walking: trainer available on site or in office | Daily |
| Weeks 2–4 | Daily 30-minute drop-in clinic | Weekdays |
| Month 2 | Super-user network: one trained super-user per project | Ongoing |
| Month 3 | Refresher for Project Managers focused on the approval matrix | Half day |
| Quarterly | Update session covering new features and lessons learned | 1 hour |
| Ongoing | Quick reference cards, this guide, and the SOP document | — |

**Super-user selection.** One per project, usually the Document Controller. They receive an extended P3 session and act as first-line support before anything escalates to IT. This is the difference between adoption and abandonment — a colleague two desks away is used; a support ticket is not.

---

## 16. Open Questions

| ID | Question | Owner |
|---|---|---|
| Q-45 | Should P7 external onboarding be delivered live, or as a self-serve video? External parties are hard to schedule. | Training lead |
| Q-46 | Is 20 minutes sufficient for site supervisors, given variable device familiarity? | Training lead |
| Q-47 | Should the halt exercise (E7) be added to P3 and P5, or does it only matter for PMs and Discipline Managers? | Project Director |
| Q-48 | Do we need a Khmer-only version of the full guide, or is the bilingual glossary sufficient? | Company Admin |

---

## 17. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 7 training paths, 6 walkthroughs, 12 exercises, 20 FAQs, assessment | Enterprise SaaS Trainer |

---

**End of Document**
