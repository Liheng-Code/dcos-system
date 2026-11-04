# DCOS — Module 01 Company / Tenant Setup
## Document 12 — Standard Operating Procedures

**Digital Construction Operating System — Foundation Layer**

| Field | Value |
|---|---|
| Document Code | DCOS-CMP-12-SOP |
| Module | 01 — Company / Tenant Setup (`CMP`) |
| Version | R1 — Initial Issue |
| Audience | Platform Operations · Company Admin · Director · Finance · HR · Document Control |
| Review Cycle | Annual, or on any change to the module |
| Parent Documents | DCOS-CMP-01-BR · DCOS-CMP-03-WF · DCOS-CMP-07-PERM |
| Classification | Internal — Controlled Procedure |
| Status | For Issue |

---

## 0. SOP Register

| SOP | Title | Owner | Frequency |
|---|---|---|---|
| SOP-CMP-01 | New Tenant Provisioning | Platform Operations | Per new customer |
| SOP-CMP-02 | Company Onboarding | Company Admin | Once per tenant |
| SOP-CMP-03 | Adding a Legal Entity | Company Admin → Director | As required |
| SOP-CMP-04 | Forming a Joint Venture Entity | Commercial Manager → Director | Per JV award |
| SOP-CMP-05 | Branch and Site Office Setup | Company Admin / PM | Per new office |
| SOP-CMP-06 | Department and Discipline Maintenance | Company Admin | As required |
| SOP-CMP-07 | Annual Holiday Calendar Update | HR Officer → Director | **Annually — Nov/Dec** |
| SOP-CMP-08 | Numbering Scheme Definition | Document Controller → Director | Once, at setup |
| SOP-CMP-09 | Branding and Signatory Maintenance | Company Admin → Director | As required |
| SOP-CMP-10 | Bank Account Maintenance | Finance Manager → Director | As required |
| SOP-CMP-11 | Seat and Storage Management | Company Admin | Monthly |
| SOP-CMP-12 | Responding to Tenant Suspension | Company Admin + Director | Exception |
| SOP-CMP-13 | Tenant Offboarding and Data Export | Company Admin + Platform Ops | Exception |
| SOP-CMP-14 | Support Impersonation | Platform Operations | Per support ticket |
| SOP-CMP-15 | Quarterly Company Configuration Review | Company Admin | **Quarterly** |

---

## SOP-CMP-01 — New Tenant Provisioning

**Purpose** — Create a new DCOS tenant safely, with correct commercial terms and verified data isolation.
**Owner** — Platform Operations (Super Admin)
**Trigger** — Signed subscription agreement or approved trial request.
**Approver** — Platform Owner.

### Prerequisites

- [ ] Signed order form or trial agreement on file
- [ ] Customer legal name, country of operation, and data residency preference confirmed in writing
- [ ] Plan, seat counts (full / field / external), and storage quota agreed
- [ ] Named first Company Admin with a verified email or mobile number
- [ ] Proposed company code agreed **with the customer in writing** — this is permanent

### Procedure

| Step | Action | Responsible | Verification |
|---|---|---|---|
| 1 | Confirm the company code with the customer. Show them a sample project code and drawing number using it. Get written agreement. | Account Manager | Email confirmation on file |
| 2 | Raise the provisioning request in the platform console. Enter legal name, country, residency, plan, seats, quota, admin contact. | Super Admin | Request in `pending` |
| 3 | Submit for commercial approval. | Super Admin | — |
| 4 | Review commercial terms against the signed order form. Approve or reject with reason. | Platform Owner | Approval recorded |
| 5 | System creates the tenant, primary entity stub, default calendar, seeded departments and disciplines, default numbering templates, and storage partition. | System | Status = `provisioning` |
| 6 | **Verify the RLS self-test result.** If it fails, stop. Do not release the tenant. Raise an engineering incident. | Super Admin | `rls_selftest_passed = true` |
| 7 | Confirm module entitlements match the sold plan. Correct any discrepancy before release. | Super Admin | Entitlement list reviewed |
| 8 | Issue the invitation to the first Company Admin. | Super Admin | Invitation `sent` |
| 9 | Set the tenant to `trial` or `active` per the agreement. | Super Admin | Status confirmed |
| 10 | Send the welcome pack: onboarding checklist, SOP-CMP-02, and a scheduled 60-minute onboarding call. | Account Manager | Call booked |
| 11 | Follow up at day 3 and day 14 if onboarding is incomplete. | Account Manager | Onboarding status checked |

### Records

Provisioning request · commercial approval · RLS self-test result · `CMP.TENANT_CREATED` audit entry · welcome pack email.

### Escalation

| Condition | Action |
|---|---|
| RLS self-test fails | Halt immediately. Engineering incident, P1. Tenant not released under any circumstance. |
| Company code already reserved | Return to Step 1 with the customer. Never substitute a code without written agreement. |
| Admin invitation bounces twice | Contact the customer by phone. Do not send to an unverified alternative address. |
| Onboarding incomplete at day 14 | Escalate to Account Manager and Customer Success lead. |

---

## SOP-CMP-02 — Company Onboarding

**Purpose** — Configure the tenant so the first project can be created correctly.
**Owner** — Company Admin
**Trigger** — Invitation accepted, tenant active.
**Target duration** — 60 minutes, resumable.

### Before You Start — Gather These

- [ ] Company registration certificate and tax registration certificate (each legal entity)
- [ ] Registered and operating addresses
- [ ] Company logo (PNG or SVG, minimum 400 × 400 px) and letterhead
- [ ] Names and positions of authorised signatories
- [ ] Current-year public holiday list
- [ ] Existing document numbering convention, if the company already has one — **bring a real example document number**
- [ ] List of departments and disciplines actually used
- [ ] List of office and site locations

### Procedure

| Step | Action | Notes |
|---|---|---|
| 1 | **Company Profile.** Enter trading name, address, contact, timezone, language, date format. | Company code is already set and cannot be changed. |
| 2 | **Primary Legal Entity.** Complete legal name (English and local script), registration number, TIN, VAT, incorporation date, registered address. Upload certificates. | Copy exactly from the certificate. Do not abbreviate. |
| 3 | **Financial Defaults.** Set base currency, reporting currency, fiscal year start month. | ⚠️ Base currency locks permanently on the first financial transaction. Confirm with Finance before saving. |
| 4 | **Branches.** Head office is created automatically. Add regional offices, yards, and workshops. Site offices can wait until projects exist. | GPS coordinates help mobile users. |
| 5 | **Departments.** Review the 12 seeded departments. Delete unused ones now, rename to match your organisation chart, assign department heads. | Deleting is only easy before anything references them. |
| 6 | **Disciplines.** Review the seeded codes. ⚠️ Codes lock permanently once referenced. Delete any you will never use. | If you work on roads and bridges, keep CIVIL. If you never do landscape, delete LAND now. |
| 7 | **Working Calendar.** Set working days, hours, break, overtime threshold. Create a second calendar if office and site hours differ. | Default is Mon–Sat, 07:00–17:00 for site. |
| 8 | **Public Holidays.** Import the country template, then review every date. Confirm lunar-calendar holidays against the current sub-decree. | See SOP-CMP-07. Provisional lunar dates are flagged. |
| 9 | **Numbering Scheme.** Review the default patterns. Use Preview and compare against your real example document number. Adjust before approving. | ⚠️ Locks permanently on first issue. See SOP-CMP-08. |
| 10 | **Branding.** Upload logo, letterhead, and seal. Generate the sample transmittal preview and check it looks like your real letterhead. | If the preview looks wrong, it will look wrong on every document you send a client. |
| 11 | **Invite Core Team.** Invite Directors, PMs, Document Controller, Finance. Site staff can be onboarded later by phone. | Handled by the Authentication module. |
| 12 | **Review and Activate.** Read the summary of permanent decisions. Type the company code to confirm. | This is the last opportunity to correct the locking items. |

### Verification

- [ ] `GET /company/onboarding` shows `can_create_project: true`
- [ ] Sample transmittal preview renders with the correct logo, entity name, and address
- [ ] A test project can be created and receives the expected project code
- [ ] Working-day calculation across the next public holiday returns the expected date

### Common Mistakes

| Mistake | Consequence | Prevention |
|---|---|---|
| Trading name entered in the legal name field | Wrong name on every contract and IPC | Copy legal name from the registration certificate, not the signboard |
| Base currency set to KHR when contracts are in USD | All financial reports wrong; irreversible after first transaction | Confirm with Finance at Step 3 |
| Skipping the numbering preview | A permanent, unreadable document numbering convention | Preview is mandatory; compare to a real document |
| Keeping all seeded disciplines "just in case" | Cluttered filters forever; codes lock on first use | Delete unused disciplines at Step 6 |
| Uploading a low-resolution logo | Pixelated letterhead on client-facing documents | Minimum 400 × 400 px, vector preferred |

---

## SOP-CMP-03 — Adding a Legal Entity

**Purpose** — Register an additional legal entity so it can contract, purchase, and invoice.
**Owner** — Company Admin (prepare) → Director (approve)
**Trigger** — New subsidiary incorporated, acquisition, or a project awarded to a different group entity.

### Prerequisites

- [ ] Certificate of incorporation
- [ ] Tax registration certificate (TIN)
- [ ] VAT registration, if applicable
- [ ] Confirmed parent entity and ownership percentage
- [ ] Names and positions of directors

### Procedure

| Step | Action | Responsible |
|---|---|---|
| 1 | Create the entity record. Enter legal name exactly as registered, in English and local script. | Company Admin |
| 2 | Enter registration number, TIN, VAT, incorporation date, country. **Check each digit against the certificate.** | Company Admin |
| 3 | Enter registered address and operating address. | Company Admin |
| 4 | Set entity type, parent entity, and ownership percentage. | Company Admin |
| 5 | Add directors and authorised signatories with position titles. | Company Admin |
| 6 | Upload the incorporation and tax certificates as attachments. | Company Admin |
| 7 | Submit for approval. | Company Admin |
| 8 | Verify the entity details against the uploaded certificates. Approve or reject with a reason. Step-up authentication required. | **Director** |
| 9 | On approval, upload entity-specific branding if it differs from the group. | Company Admin |
| 10 | Notify Finance and Commercial that the entity is available for project assignment. | System (automatic) |

### Verification

- [ ] Entity status is `active`
- [ ] Entity appears in the contracting entity list on project creation
- [ ] A test PO preview renders the correct entity name, TIN, and address

### Escalation

| Condition | Action |
|---|---|
| Registration number already exists in the tenant | Investigate — likely a duplicate entry. Do not create a second record. |
| Director rejects twice | Escalate to CEO; the certificate may not match what was requested. |
| Entity needed urgently for a contract signing | Director can approve within minutes; do not create an unapproved entity and "fix it later". An unapproved entity cannot issue a PO. |

---

## SOP-CMP-04 — Forming a Joint Venture Entity

**Purpose** — Register a JV so contracts, POs, and IPCs carry the correct party and tax number.
**Owner** — Commercial Manager (prepare) → Director (approve)
**Trigger** — JV agreement signed, or a tender won as a JV.

### Prerequisites

- [ ] Executed JV agreement
- [ ] JV registration number and TIN, if separately registered
- [ ] Confirmed participating interest of each party
- [ ] Confirmed lead participant
- [ ] Liability basis (several, or joint and several)

### Procedure

| Step | Action | Responsible |
|---|---|---|
| 1 | Create the entity with type = Joint Venture. | Commercial Manager |
| 2 | Enter JV legal name, registration number, TIN, agreement date, expiry date, governing law, liability type. | Commercial Manager |
| 3 | Add every participant. Internal group entities link to the entity record; external partners link to the stakeholder record. | Commercial Manager |
| 4 | Enter participating interests. **The total must be exactly 100.0000%.** The system will reject anything else. | Commercial Manager |
| 5 | Flag the lead participant — exactly one. | Commercial Manager |
| 6 | Attach the executed JV agreement. | Commercial Manager |
| 7 | Submit for Director approval with step-up. | Commercial Manager |
| 8 | Verify participating interests against the JV agreement clause. Approve. | **Director** |
| 9 | Assign the JV as contracting entity on the relevant project. | Project Manager |
| 10 | Set access expiry dates for seconded partner staff to match the JV agreement expiry. | Company Admin |

### Why This Matters

An IPC issued under the parent company's TIN when the contract is with the JV will be rejected by the client's QS, delayed by a payment cycle, and may create a tax exposure. The five minutes spent here prevents a month of correspondence.

### Verification

- [ ] Participating interests total 100.0000%
- [ ] Exactly one lead participant flagged
- [ ] A test IPC preview shows the JV name and JV TIN, not a parent's
- [ ] Seconded staff access expiry matches the JV agreement end date

---

## SOP-CMP-05 — Branch and Site Office Setup

**Owner** — Company Admin (all types) · Project Manager (site and project offices, own projects only)
**Trigger** — New office opened, or a project site office established.

| Step | Action |
|---|---|
| 1 | Select branch type: head office, regional, project, site, yard, workshop, warehouse. |
| 2 | Link to the operating legal entity. |
| 3 | Enter address and, for site offices, GPS coordinates — mobile users navigate to these. |
| 4 | Assign the branch manager. |
| 5 | Enter the cost centre code if Finance uses branch-level cost allocation. |
| 6 | For a project or site office, link the project. |
| 7 | Activate. |

**Closing a branch:** reassign all linked users and projects first, then deactivate with a closed date. The system lists blocking records; work through the list. Never attempt to force closure — the record is retained for history either way.

---

## SOP-CMP-06 — Department and Discipline Maintenance

**Owner** — Company Admin

### Adding a Department

1. Enter code and name; codes are short and stable (`QAQC`, not `Quality Assurance and Quality Control Dept`).
2. Set the parent department for sub-departments.
3. Assign the department head.
4. Set the sort order so it appears logically in dropdowns.

### Adding a Discipline

> ⚠️ **The discipline code is permanent once any record references it.** Decide carefully.

1. Enter a 2–10 character uppercase code.
2. Enter the display name, colour, and sort order.
3. Set whether it is a design discipline (appears in the design module filters).

### Before Deactivating Either

Run the usage check. The system reports how many WBS nodes, documents, tasks, drawings, and scoped users reference the record. If any exist, reassign them first. The system will block and list them; that list is your work order.

**Renaming rule.** Display names can always be changed. Codes cannot, once referenced. If a discipline name is wrong, fix the name — do not create a duplicate discipline with a corrected code.

---

## SOP-CMP-07 — Annual Holiday Calendar Update

**Purpose** — Publish next year's public holidays before they affect schedules.
**Owner** — HR Officer (prepare) → Director (approve and publish)
**Frequency** — **Annually, in November or December, for the following year.**
**Criticality** — High. Every schedule, timesheet, leave balance, and SLA timer depends on this.

### Why This SOP Exists

Several Cambodian public holidays follow the lunar calendar — Khmer New Year, Visak Bochea, Royal Ploughing Ceremony, Pchum Ben, Water Festival. Their dates move each year and are fixed by sub-decree. A schedule built on last year's dates is wrong by up to three days on every task that crosses those periods, and the error compounds through the critical path.

### Procedure

| Step | Action | Responsible | Timing |
|---|---|---|---|
| 1 | Obtain the official public holiday sub-decree for the coming year. | HR Officer | On publication (usually Q4) |
| 2 | Import the country template for the coming year into each calendar. | HR Officer | Within 5 working days |
| 3 | Review every imported date against the sub-decree. Pay particular attention to lunar-basis holidays flagged as provisional. | HR Officer | — |
| 4 | Correct provisional dates to the gazetted dates. | HR Officer | — |
| 5 | Add company-specific closures — extended Khmer New Year site shutdown, annual company holiday. | HR Officer | With Operations input |
| 6 | Mark each holiday paid / unpaid and full / half day. | HR Officer | — |
| 7 | Review the impact preview — how many open schedules and tasks will recalculate. | Planning Manager | — |
| 8 | Set the effective date to 1 January of the coming year. | HR Officer | — |
| 9 | Approve and publish. | **Director** | Before 31 December |
| 10 | Confirm the recalculation job completed and spot-check three tasks that cross a holiday period. | Planning Manager | Within 24 hours |
| 11 | Notify all project teams that the calendar is published. | System (automatic) | On publish |

### Verification

- [ ] Holiday count matches the sub-decree
- [ ] No lunar holiday remains flagged provisional
- [ ] A working-day calculation across Khmer New Year returns the correct finish date
- [ ] Leave balances for the new year reflect the correct number of public holidays
- [ ] Timesheet expected-hours for a holiday week is correct

### Escalation

| Condition | Action |
|---|---|
| Sub-decree not yet published by 15 December | Publish with provisional dates clearly flagged; schedule a correction release immediately on publication. Notify all PMs that dates are provisional. |
| Effective date blocked by a closed timesheet period | Choose the earliest permitted forward date. Never reopen a closed period to accommodate a calendar change. |
| Recalculation job fails | Raise a P2 support ticket. Do not manually adjust task dates as a workaround — the discrepancy will resurface. |

---

## SOP-CMP-08 — Numbering Scheme Definition

**Purpose** — Define document and record numbering before any number is issued.
**Owner** — Document Controller (propose) → Company Admin (configure) → Director (approve)
**Timing** — Onboarding step 9. **This is a one-time, irreversible decision.**

### Prerequisites

- [ ] A real document number from an existing project, for comparison
- [ ] Agreement from Document Control, QS, and Project Management on the convention
- [ ] Decision on sequence scope per record type — per project, per project-discipline, per entity-year

### Procedure

| Step | Action | Responsible |
|---|---|---|
| 1 | Collect the company's existing conventions. If none exist, use the DCOS defaults — they follow standard construction practice. | Document Controller |
| 2 | For each record type, draft the pattern using the token set. | Document Controller |
| 3 | Choose the sequence scope. Understand the consequence: `per_project_discipline` means STR-001 and ARC-001 both exist. | Document Controller |
| 4 | Run Preview. Compare the generated samples against the real example document. | Company Admin |
| 5 | Adjust separators and sequence width. Four digits for high-volume records (RFI, PR); three for lower volume (NCR, IPC). | Company Admin |
| 6 | Review the warnings the preview returns. | Company Admin |
| 7 | Circulate the previewed samples to QS and PM for sign-off. | Document Controller |
| 8 | Approve. Step-up required. | **Director** |
| 9 | Publish with an effective date. | Company Admin |

### The Warning

Once the first number is issued under a pattern, that pattern is **permanently locked**. It cannot be edited. A new pattern can be created with a future effective date, but every number already issued keeps its original form. A register containing both `P001-RFI-0001` and `P001RFI1` is a register nobody trusts.

Spend the twenty minutes now.

### Voiding a Number

When a record is cancelled, the number is voided, not released. Record the reason. The gap in the register is intentional and defensible; a reused number is not.

---

## SOP-CMP-09 — Branding and Signatory Maintenance

**Owner** — Company Admin (branding) · Director (signatory approval)

### Branding

1. Upload logo, monochrome logo, letterhead header and footer, and seal per legal entity.
2. Meet the specification: logo minimum 400 × 400 px and 2 MB; letterhead A4 aspect at 300 dpi and 5 MB; seal PNG with transparency.
3. Generate the sample transmittal preview.
4. **Look at the preview.** Compare it side by side with a printed letterhead. Check margins, logo position, and footer text.
5. Publish. All subsequently generated PDFs use the new assets; previously generated documents keep their original rendering.

### Signatories

1. Enter full name, position title, and authority scope (PO, subcontract, IPC, transmittal, certificate).
2. Enter the documentary value limit and validity dates.
3. Upload the signature image — clean scan, transparent background, black ink.
4. Submit for Director approval with step-up.
5. On approval, the signatory is available for use.

### Rules

- A signature image is a legal instrument. It is stored restricted, and its use requires step-up authentication every time.
- When a signatory leaves the company or their authority changes, set `valid_to` **the same day**. Do not wait for the next review.
- The documentary value limit here prints on the contract. The enforceable approval threshold is set separately in the RBAC delegation of authority matrix. Keep them consistent, and check both when authority changes.

---

## SOP-CMP-10 — Bank Account Maintenance

**Purpose** — Maintain payment destination records with fraud controls.
**Owner** — Finance Manager (create and edit) → Director (approve)

> **Company Admin cannot create or edit bank accounts under any role combination.** This separation is deliberate and must not be worked around by temporary role changes.

### Prerequisites

- [ ] Bank confirmation letter or account statement showing account name and number
- [ ] Confirmed currency and purpose (receipts, payments, payroll, retention)
- [ ] Verbal confirmation with a known bank contact for any new or changed account details

### Procedure

| Step | Action | Responsible |
|---|---|---|
| 1 | Verify the account details against the bank confirmation letter. | Finance Manager |
| 2 | For any change to an existing account, **telephone a known contact at the bank on a number you already hold** — never a number supplied in the change request. | Finance Manager |
| 3 | Enter account label, bank, branch, account name, account number, currency, SWIFT/IBAN, purpose. | Finance Manager |
| 4 | Attach the bank confirmation letter. | Finance Manager |
| 5 | Submit with step-up authentication. | Finance Manager |
| 6 | Independently verify the account number against the attachment. Approve. | **Director** |
| 7 | Set as default for the currency and purpose if applicable. | Finance Manager |

### Escalation

| Condition | Action |
|---|---|
| Change request received by email claiming urgency | **Stop.** This is the standard pattern of a mandate fraud attempt. Verify by telephone using a previously held number. Report to the Director regardless of outcome. |
| Account number does not match the attachment | Reject. Do not correct it yourself. |
| Unmask activity on bank accounts outside normal hours | IT to review the audit log and confirm with the user directly. |

---

## SOP-CMP-11 — Seat and Storage Management

**Owner** — Company Admin
**Frequency** — Monthly, and on any 80% alert.

### Monthly Check

| Step | Action |
|---|---|
| 1 | Open the quota dashboard. Review full seats, field seats, external seats, storage, and API usage. |
| 2 | Review dormant accounts — no login in 60 days. Confirm with department heads whether each is still needed. |
| 3 | Deactivate leavers. Each deactivation frees a seat immediately. |
| 4 | Review external users nearing access expiry. Extend only where the contract justifies it. |
| 5 | Review storage growth. Identify projects with unusually large uploads — usually uncompressed photos or superseded BIM models. |
| 6 | If any metric exceeds 80%, plan action before it reaches 100%. |

### On an 80% Alert

1. Identify the metric and the growth rate.
2. Reclaim first: deactivate leavers, expire finished external access, archive completed project files to cold storage.
3. If reclamation is insufficient, raise a subscription change request with a justification and a forecast.
4. Do not wait for 100%. At 100% the system blocks new user activation and new uploads, which will happen on a Monday morning when a site team is trying to work.

### What Never Happens

The system will not deactivate users, delete files, or block logins to enforce a quota. Enforcement blocks growth, never access. If someone tells you a user was deactivated because of the quota, that is not the system — investigate.

---

## SOP-CMP-12 — Responding to Tenant Suspension

**Owner** — Company Admin + Director
**Trigger** — Suspension warning received (T-7 or T-1), or suspension in effect.

### On Receiving a Warning

| Step | Action | Responsible |
|---|---|---|
| 1 | Read the reason category — payment, breach, or customer request. | Company Admin |
| 2 | For payment: contact Finance immediately, confirm invoice status, arrange settlement. | Director |
| 3 | Notify all Project Managers of the date and expected impact. | Company Admin |
| 4 | Instruct site teams to complete and submit outstanding daily reports, inspection requests, and timesheets **before** the effective date. | PMs |
| 5 | Ensure any IPC or payment application due in the window is submitted early. | QS Manager |
| 6 | Escalate to the platform Account Manager with evidence of resolution. | Director |

### During Suspension

- All data is intact. Nothing is deleted, archived, or moved.
- Company Admin retains read-only access; other users cannot sign in.
- Writes and API traffic are blocked. Notifications are muted except Critical.
- Do not attempt workarounds — no parallel spreadsheets, no email-based approvals that bypass the audit trail. The gap will need reconstructing later.

### On Reactivation

1. Confirm status returned to `active`.
2. Review the digest of missed events.
3. Instruct teams to submit any work recorded on paper during the outage, dated correctly, with a note explaining the delay.
4. Conduct a short review: what was the cause, and what prevents recurrence.

---

## SOP-CMP-13 — Tenant Offboarding and Data Export

**Owner** — Company Admin + Platform Operations
**Trigger** — Contract not renewed, or termination notice issued.

### Company Admin Actions

| Step | Action | Timing |
|---|---|---|
| 1 | Confirm the termination date and retention hold period (default 90 days). | On notice |
| 2 | Request the full tenant data export. Step-up authentication and Director approval required. | Immediately |
| 3 | Download the export when ready. Verify the SHA-256 checksum against the manifest. | Within 30 days |
| 4 | **Verify the export is usable** — open sample CSV/JSON files, confirm drawings and photos are present and open correctly. | Within 30 days |
| 5 | Store the export in the company's own controlled archive with documented retention. | Within 30 days |
| 6 | Confirm to Platform Operations in writing that the export is downloaded and verified. | Within 30 days |
| 7 | Notify all users of the shutdown date. Ensure nothing operationally critical remains only in DCOS. | 30 days before |
| 8 | Extract any records with statutory retention obligations — financial, HR, contractual — into the company's permanent archive. | Before termination |

### Platform Operations Actions

| Step | Action |
|---|---|
| 1 | Confirm Platform Owner approval and Company Admin typed confirmation of the company code. |
| 2 | Set status to `terminating`; retention hold begins. |
| 3 | Send reminders at day 30, 60, and 80 if the export is not downloaded. |
| 4 | Send a final 7-day notice before purge. |
| 5 | Execute purge per the retention policy. |
| 6 | Retain permanently: shell company record, company code reservation, audit log, financial summary, billing history. |
| 7 | Set status to `archived`. |

### Absolute Rules

- No purge before the retention hold expires.
- No purge without a downloaded and confirmed export.
- The company code is never reissued to another customer.
- The audit log survives the purge.

---

## SOP-CMP-14 — Support Impersonation

**Owner** — Platform Operations
**Trigger** — A support ticket that cannot be resolved from logs and metadata alone.

| Step | Action |
|---|---|
| 1 | Exhaust non-invasive diagnosis first — audit logs, error traces, tenant metadata, configuration review. |
| 2 | Confirm the customer has raised a ticket. Never impersonate on your own initiative. |
| 3 | Request the impersonation session. State the ticket reference and a specific, factual reason. |
| 4 | Request **read-only** by default. Write access requires Platform Owner approval and a specific justification. |
| 5 | Set the shortest duration that will do the job. Maximum 60 minutes. |
| 6 | Perform only the actions needed to resolve the ticket. Do not browse. |
| 7 | End the session as soon as the diagnosis is complete. |
| 8 | Record the findings on the ticket. |

### Customer Transparency

The Company Admin is notified the moment the session starts, sees a banner for its duration, and receives a full list of every action taken when it ends. This is a feature, not an inconvenience — a customer who can see exactly what the vendor did inside their account is a customer who trusts the platform.

### Prohibited

- Impersonating without a ticket reference.
- Using write access to "just fix it" without approval.
- Viewing commercial, HR, or tender data not relevant to the ticket.
- Extending a session rather than opening a new one with a fresh reason.

---

## SOP-CMP-15 — Quarterly Company Configuration Review

**Owner** — Company Admin
**Frequency** — Quarterly
**Duration** — Approximately 60 minutes

### Checklist

**Legal Entities**
- [ ] All active entities still trading; dormant entities flagged correctly
- [ ] Registration and tax numbers still current
- [ ] Directors and signatories current — leavers removed, validity dates correct
- [ ] JV participating interests match the current agreements
- [ ] JV expiry dates reviewed; expired JVs closed

**Organisation**
- [ ] Branch register matches actual offices; closed sites deactivated
- [ ] Department heads current
- [ ] No unused disciplines cluttering filters

**Calendar**
- [ ] Current-year holidays complete and correct
- [ ] Next-year calendar prepared if in Q4 (see SOP-CMP-07)
- [ ] Project shutdown overrides still relevant

**Numbering**
- [ ] Sequence counters progressing as expected
- [ ] Voided-number register reviewed; reasons documented
- [ ] No record type without an active numbering rule

**Branding**
- [ ] Logo and letterhead current
- [ ] Sample transmittal preview still correct
- [ ] Signature blocks match current authority

**Finance**
- [ ] Bank accounts current; closed accounts deactivated
- [ ] Default account per currency correct

**Commercial**
- [ ] Seat utilisation and forecast to renewal
- [ ] Storage utilisation and growth trend
- [ ] Renewal date noted; renewal discussion scheduled if within 90 days
- [ ] Module entitlements match what is actually used — flag anything paid for and unused

**Security**
- [ ] Restricted-field unmask log reviewed for unusual patterns
- [ ] Any impersonation sessions in the quarter reviewed and understood
- [ ] Permission-denied spikes investigated
- [ ] Dormant admin accounts deactivated

### Output

A short written note to the Director: what changed, what needs action, what the renewal position looks like. Two paragraphs is enough. File it.

---

## Appendix A — RACI

| Activity | Platform Owner | Super Admin | Company Admin | Director | Finance | HR | Doc Control | PM |
|---|---|---|---|---|---|---|---|---|
| Tenant provisioning | **A** | **R** | I | I | — | — | — | — |
| Company onboarding | I | C | **R/A** | C | C | C | C | I |
| Legal entity creation | — | — | **R** | **A** | C | — | — | I |
| JV formation | — | — | C | **A** | C | — | — | **R** |
| Branch setup | — | — | **R/A** | I | — | — | — | C |
| Department / discipline | — | — | **R/A** | I | — | C | C | C |
| Holiday calendar update | — | — | C | **A** | — | **R** | — | I |
| Numbering scheme | — | — | **R** | **A** | C | — | C | C |
| Branding | — | — | **R/A** | C | — | — | C | I |
| Signatory approval | — | — | **R** | **A** | I | — | — | I |
| Bank accounts | — | — | — | **A** | **R** | — | — | — |
| Seat / storage management | I | C | **R/A** | I | C | — | — | I |
| Subscription change | **A** | **R** | C | C | C | — | — | — |
| Suspension response | **A** | **R** | **R** | **A** | C | — | — | I |
| Offboarding and export | **A** | **R** | **R** | **A** | C | C | C | I |
| Impersonation | **A** | **R** | I | I | — | — | — | — |
| Quarterly review | — | — | **R/A** | I | C | C | C | C |

**R** Responsible · **A** Accountable · **C** Consulted · **I** Informed

---

## Appendix B — Escalation Contacts

| Issue | First Contact | Escalation | Target Response |
|---|---|---|---|
| Cannot access after suspension | Account Manager | Platform Owner | 4 hours |
| Suspected cross-tenant data visibility | IT Security | Platform Owner (P1 incident) | **Immediate** |
| Suspected bank account fraud attempt | Director | Finance Director, external bank | **Immediate** |
| Calendar recalculation failure | Support ticket P2 | Platform Engineering | 1 working day |
| Numbering pattern error discovered after lock | Document Controller | Director, Platform Support | 1 working day |
| Quota reached and blocking work | Company Admin | Account Manager | 4 hours |
| Export failed or incomplete | Platform Support | Platform Owner | 1 working day |
| Unexplained impersonation session | Company Admin | Platform Owner | 4 hours |

---

## Appendix C — Irreversible Decisions Register

Every item below is permanent. Confirm each with the responsible party before saving.

| Decision | Locks When | Confirm With | Consequence If Wrong |
|---|---|---|---|
| Company code | On tenant creation | Customer, in writing | Embedded in every project and document number, forever |
| Data residency | On tenant creation | Customer IT / legal | Requires a full supervised migration to change |
| Base currency | On first financial transaction | Finance Manager | All financial reporting invalid |
| Discipline codes | On first reference | Document Control, PMs | Permanent clutter or a wrong code in every drawing number |
| Numbering patterns | On first number issued | Doc Control, QS, PMs | An unreadable document register for the life of the company |
| Issued document numbers | On issue | — | Never reused; voids are permanent |
| Audit log entries | On write | — | Append-only by design |
| Tenant purge after retention hold | On execution | Director, Platform Owner | Irrecoverable |

---

*Digital Construction Operating System — Foundation — Module 01 Company / Tenant Setup — Document 12 Standard Operating Procedures — Internal Controlled Document*
