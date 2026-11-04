# DCOS — Module 10-01 Daily Reporting

**Digital Construction Operating System — Construction Execution Layer**

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-10-01-DR |
| Module Path | `10-Construction / 10-01-Daily-Reporting` |
| Version | R1 — Initial Module Design |
| Parent Document | DCOS System Architecture Module Design R0 (Module 9 — Construction Management; Phase 1 item "Daily Report") |
| Related | DCOS-MOD-03-01-AUTH (identity, sessions, offline assertions); DCOS Gap Analysis R1 (§4.6 Mobile Field Application, §5.2 tenant isolation); Approval Workflow Engine; Notification Matrix; Audit Trail Engine |
| Source Idea | DCOS Multi-Project AI-Assured Telegram Daily Reporting System (Master Architecture Prompt) |
| Channels | Telegram Mini App (online) + DCOS Field App (online and offline) |
| Data Backend | PostgreSQL / Supabase |
| Classification | Internal — Strategic Architecture |
| Status | For Review |

> **Numbering note:** the module number `10-01` follows R0's master module map (Module 10 — Construction). If the Documentation Tracker uses a different numbering, change the code and path only; nothing else in this document depends on it.

---

## 1. Purpose

The Daily Reporting module answers one question every evening on every project:

> **What actually happened on site today, who says so, and has a responsible person accepted it as the official record?**

It turns the daily flow of site information from subcontractors and in-house crews into **verified project data** that management can trust without reading hundreds of chat messages.

The module is responsible for:

- Letting every reporting unit (subcontractor or in-house crew) submit a structured daily report, online or offline.
- Keeping the **original submission immutable** and every correction versioned.
- Running deterministic rules at intake and AI-assisted checks after submission.
- Giving the Project Manager one review package per report: the report, its findings, its evidence, and a drafted correction if needed.
- Compiling approved reports into a **Project Daily Summary** and a **Multi-Project Management Overview**.
- Capturing the contemporaneous records (delays, instructions, weather, area access) that later support claims and extension-of-time submissions.
- Emitting every action into the Audit Trail Engine.

It is the highest-frequency operational module in DCOS. If it is slow, confusing, or distrusted in the field, adoption of the whole platform fails.

---

## 2. Business Context — Why Construction Is Different

| Construction Reality | Consequence for Daily Reporting |
|---|---|
| Reports come from **many parties** on one project: 5–15 subcontractors plus in-house crews | One report model for all; the "reporting unit" abstraction covers both |
| Site staff coordinate on Telegram already | Telegram is the entry point, but **chat is not a record** |
| Basements, tunnels, and remote sites have no signal | Offline capture and queued sync are day-one requirements, not Phase 4 |
| Daily reports become **evidence** in disputes years later | Immutable originals, hashed evidence, server timestamps, append-only history |
| Subcontractors have commercial incentives to over-report progress | Reported, verified, and certified quantities are separate values |
| Delays must be notified within contractual time bars | Delay events are captured structurally in the daily report and feed Contract Administration |
| The PM cannot read 40 reports a day at full attention | Exception-first review package; clean reports are fast, flagged reports get attention |
| Site workers often write in Khmer or mixed languages | Localised UI; AI quality on Khmer text must be tested before it is relied on |
| Management only wants the approved picture, but also needs to know what is still missing | Official summary plus an explicit coverage indicator |

---

## 3. Key Stakeholders

| Stakeholder | Interaction |
|---|---|
| Subcontractor foreman / supervisor | Submits the daily report; answers correction requests |
| In-house site supervisor / engineer | Submits the daily report for in-house crews through the same process |
| Project Manager | Reviews and approves reports; publishes the Project Daily Summary (sole approver in Phase 1) |
| Project Director / Management | Consumes the published summary and the multi-project overview |
| Site Engineer / QS | Delegated reviewer in a later phase; reads reports for measurement support |
| QA/QC, HSE, Planning | Read approved data; receive linked records (inspection requests, incidents, delay events) |
| Document Controller | Receives instructions and drawing references recorded in reports |
| Contract Administrator | Receives delay events and notice flags |
| Company Admin | Manages Telegram group bindings and reporting configuration |
| Auditor / Claims Team | Reads immutable report versions and the audit trail |

---

## 4. Scope

### 4.1 In Scope

- Reporting unit setup and Telegram group binding
- Telegram identity linking, bot, and Mini App launch
- DCOS Field App (PWA first, React Native later) with full offline capture
- Report content model, custom fields, evidence capture
- Rules engine at intake and post-submit
- AI assurance (advisory only), findings, correction drafting, summary drafting
- PM review, return, request-for-information, approval, post-approval amendment
- Project Daily Summary and Multi-Project Management Overview
- Missing-report detection, reminders, escalation
- Offline sync, duplicate and conflict handling
- Audit events, notifications, KPIs

### 4.2 Out of Scope (owned by other modules)

| Concern | Owning Module |
|---|---|
| Identity, sessions, MFA, offline assertions | 03-01 Authentication |
| Role and permission definitions | 03-02 RBAC |
| WBS structure and codes | WBS Management |
| Sub-IPC measurement and payment certification | Subcontractor Management / IPC |
| Approval engine mechanics | Approval Workflow Engine |
| Attendance, gate access, payroll | HR Module |
| Inspection requests, NCRs | QA/QC |
| Incidents and permits | HSE |
| Claims preparation | Claims & Disputes / Contract Administration |

**Boundary rule:** a reported quantity is a statement by the reporter. It is **not** a measured or certified quantity. Daily Reporting never writes to IPC or payment tables.

---

## 5. Confirmed Design Decisions (from design review)

| # | Decision | Effect on Design |
|---|---|---|
| C1 | In-house crews report through the **same process** as subcontractors | Introduce `reporting_unit` with type `SUBCONTRACTOR` or `IN_HOUSE_TEAM`; one form, one workflow |
| C2 | **PM is the sole approver first; delegation comes later** | Phase 1 review step is the project PM only; the data model and workflow template already carry a reviewer role so delegation is configuration, not a rebuild |
| C3 | **Online and offline both required from day one** | Two channels share one API: Telegram Mini App (online with draft resilience) and DCOS Field App (full offline). See Section 12 |
| C4 | Output is a formal module design in markdown | This document |

---

## 6. Architecture

### 6.1 Roles of Each Layer

| Layer | Role | Is the system of record? |
|---|---|---|
| DCOS Database | Authoritative store for reports, versions, evidence, findings, decisions, summaries | **Yes** |
| Telegram Group | Coordination space and reporting entry point | No |
| Telegram Bot | Context and notification bridge | No |
| Telegram Mini App | Online structured entry | No |
| DCOS Field App | Offline-capable structured entry | No (local cache only until synced) |
| DCOS API | Single gateway: authentication, validation, persistence, events | No (stateless) |
| Rules Engine | Deterministic checks | No |
| AI Assurance | Advisory interpretation | No — cannot write authoritative data |
| Project Manager | Final human authority | Decisions are recorded in DCOS |

### 6.2 Component View

```text
                        MULTI-PROJECT
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
    PROJECT A            PROJECT B            PROJECT C
        │                    │                    │
  Reporting Units      Reporting Units      Reporting Units
  (SC-A1, SC-A2,       (SC-B1, IH-B1 ...)   (SC-C1 ...)
   IH-A1 ...)
        │
        ├── Telegram Group (1 active per unit)
        │        │
        │        └── DCOS Bot ── signed launch link ──► Telegram Mini App ─┐
        │                                                                   │
        └── Field App (PWA / React Native, offline queue) ──────────────────┤
                                                                            ▼
                                                                       DCOS API
                                                                            │
                                         ┌──────────────────────────────────┤
                                         ▼                                  ▼
                                   DCOS DATABASE                       Event Bus
                         (reports, versions, evidence, ...)                 │
                                         │                  ┌───────────────┼───────────────┐
                                         │                  ▼               ▼               ▼
                                         │             Rules Engine   AI Assurance   Notification /
                                         │                  │               │          Audit Engines
                                         │                  └───────┬───────┘
                                         │                          ▼
                                         │                   Assurance Package
                                         │                          ▼
                                         └──────────────────►  PM REVIEW
                                                                    │
                                                  ┌─────────────────┴────────────────┐
                                                  ▼                                  ▼
                                           RETURN / REQUEST INFO                  APPROVE
                                                  │                                  ▼
                                          Reporting unit corrects         Approved report version
                                          → new version → re-check                   ▼
                                                                          Project Daily Summary
                                                                                     ▼
                                                                          PM publishes (Official)
                                                                                     ▼
                                                                       Management Overview Dashboard
```

### 6.3 Core Principles

1. **One report model, many channels.** The Daily Reporting domain has no Telegram-specific logic. Channel adapters call the same API.
2. **No direct database access** from any client or from Telegram.
3. **Server resolves context.** Project, reporting unit, and WBS scope are resolved from the authenticated user and the bound group — never trusted from a client-supplied ID.
4. **Rules decide what is deterministic. AI interprets what is not. The PM decides what is judgment.**
5. **Original submissions are immutable.** Corrections create new versions.
6. **AI findings are internal.** Reporting units see only the PM-approved correction request, never raw AI output.
7. **Normal Telegram chat is never a report.** Only a formal submission creates a report record.

---

## 7. Identity and Context Resolution

### 7.1 Principle

Telegram is **one more identity provider** under Module 03-01, not a parallel user system. A valid Telegram account is not a DCOS user. This keeps the Auth rule intact: no auto-provisioning.

### 7.2 Telegram Identity Linking

```text
User receives DCOS invitation (per 03-01 §8.1 / §8.2)
→ account provisioned in DCOS (app_user + membership + project access)
→ user opens the DCOS bot in a private chat
→ bot shows "Link my DCOS account"
→ user enters the one-time link code shown in DCOS (or the code from the invitation SMS)
→ API validates code → creates identity_link (provider = 'telegram', provider_identifier = telegram_user_id)
→ AUTH.IDENTITY_LINKED logged
```

| Rule | Detail |
|---|---|
| Link code | Single-use, 10-minute expiry, stored as hash |
| One Telegram account | Maps to exactly one DCOS user |
| Unlinked user | Can chat in the group but cannot submit; Mini App shows "Link your account" |
| Telegram account change | Old link revoked by admin or user; new link requires a new code |
| Group membership | **Never grants any permission.** Anyone can add anyone to a Telegram group |

This adds `telegram` to the `identity_link.provider` enum in Module 03-01 §7.2.

### 7.3 Mini App Session

```text
Mini App opens with Telegram initData + signed launch token
→ POST /dr/telegram/session/exchange { initData, launchToken }
→ API validates initData signature server-side (bot secret, auth_date freshness)
→ API validates launchToken (signature, expiry, bound group, bound telegram user)
→ API resolves telegram_user_id → identity_link → app_user
→ API checks reporting_unit_member + user_project_access + wbs_scope
→ API checks the user is still a member of the bound Telegram group (see 7.5)
→ DCOS session token issued (same format as 03-01 §5.4, client_type = 'telegram_miniapp')
```

Subsequent calls use the DCOS access token only. `initData` is an entry ticket, exactly like the Firebase ID token in Module 03-01.

### 7.4 Group Binding

| Concept | Rule |
|---|---|
| Binding | One **active** Telegram group maps to exactly one `reporting_unit` on one project |
| Reporting unit | May have only one active group at a time; history of previous groups is kept |
| Same company on two projects | Two reporting units, two groups — never one global group |
| Bot privacy | Bot operates in privacy mode; it does **not** read normal group chat (supports Rule "chat is not a report") |
| Binding actor | Company Admin or PM; requires bot added to the group and a binding code posted by the admin |
| Group migrated to supergroup | Telegram changes the chat ID. Bot detects migration, marks old binding `MIGRATED`, creates a new binding with `migrated_from_chat_id`, notifies admin to confirm |
| Bot removed from group | Binding becomes `SUSPENDED`; admin alerted |

### 7.5 Launching from a Group

> **Verify before build:** Mini App launch behaviour inside groups differs from private chats, and `initData` may not carry the group's chat ID. The design therefore does **not** rely on `initData` to identify the group.

- The bot posts a pinned message in the group with a **Submit Daily Report** link.
- The link is a direct Mini App link carrying a **signed, short-lived launch token** generated by DCOS for that binding.
- The token claims: `binding_id`, `reporting_unit_id`, `project_id`, `exp` (≤ 24 h), `jti`.
- The server never trusts the token alone; it cross-checks the Telegram user's account link, unit membership, and — through the Bot API — that the user is currently a member of the group.
- A user who belongs to several units (a foreman on two projects) chooses the unit from the group they launched; the server still enforces access per unit.

### 7.6 Authorization Chain

```text
Telegram user ─► identity_link ─► app_user
                                    │
                                    ├─► reporting_unit_member (role: REPORTER | VIEWER)
                                    ├─► user_project_access (project, discipline_scope, wbs_scope)
                                    └─► DCOS session (tid, prj, aal)
```

Authorization for field entry = **unit membership + project access + WBS scope**. WBS scope limits which WBS nodes and activities appear in the form.

---

## 8. Reporting Unit

### 8.1 Concept

A **reporting unit** is the party that submits one daily report for one project. It abstracts the difference between a subcontractor and an in-house crew so both follow the identical process.

| Field | Subcontractor | In-house Team |
|---|---|---|
| `unit_type` | `SUBCONTRACTOR` | `IN_HOUSE_TEAM` |
| Parent record | Project subcontract assignment (stakeholder + contract) | Internal department / team record |
| Reporter users | Subcontractor users (external member type) | Employees (linked via `hr_employee_id`) |
| Access expiry | Contract-driven per 03-01 `access_valid_to` | Employment-driven |
| Telegram group | One active group | One active group |
| Review path | Same | Same |

### 8.2 Rules

- One report per reporting unit per report date (see §10.6 for duplicate handling).
- A subcontractor working on two projects has two reporting units.
- A reporting unit may span several disciplines, but each report line carries its own discipline and WBS reference.
- Reporting unit status: `Planned → Active → Suspended → Demobilised`. Missing-report checks run only while `Active`.

### 8.3 Reporting Schedule (per unit, configurable)

| Setting | Default |
|---|---|
| Working days | Project calendar (public holidays excluded per R0 §23) |
| Report deadline | 18:00 project local time |
| Reminder time | 16:00 |
| Late-submission window | Up to next day 09:00 accepted with LATE flag |
| Required evidence | Configurable: minimum photo count per activity or per report |
| Required sections | Standard set plus unit-specific custom fields |

---

## 9. Report Content Model

### 9.1 Standard Sections

| Section | Content | Required |
|---|---|---|
| Header | Project, reporting unit, report date, reporter, channel | Yes |
| Weather & site conditions | Condition, hours lost to weather | Yes |
| Manpower | Headcount by trade, supervisors, hours; planned vs reported | Yes |
| Activities & progress | Activity (selected from assigned list), WBS location, quantity today, cumulative quantity, percent, work status | Yes |
| Equipment | Asset or type, hours working / idle / breakdown | If applicable |
| Materials | Delivered, used, delivery note reference | If applicable |
| Delay events | Cause category, description, start/end, hours lost, affected WBS, notice-required flag | If any |
| Issues & constraints | Type, severity, action needed from whom, linked RFI / NCR | If any |
| Instructions received | Verbal or written instructions, from whom, reference | If any |
| Inspection requests raised | Reference, WBS, status | If any |
| Safety | Toolbox talk held, observations, incidents or near misses (links to HSE) | Yes |
| Area / work-front access | Areas released to the unit or still blocked | If any |
| Next-day plan | Planned activities and manpower | Yes |
| Evidence | Photos and documents linked to sections, activities, or WBS nodes | Per configuration |

### 9.2 Activity Selection

The form is **pre-filled** from the assigned WBS scope and the look-ahead / weekly work plan. The reporter selects activities instead of typing them. This removes most invalid-WBS errors and makes plan-versus-actual comparison automatic. Free-text activities are allowed only when flagged `UNPLANNED` with a reason.

### 9.3 Quantity Terminology

| Term | Meaning | Owner |
|---|---|---|
| Reported quantity | What the reporter says was done today | Reporting unit |
| Verified quantity | Quantity accepted by the PM at approval (may differ, with remark) | PM |
| Certified quantity | Quantity measured and certified for payment | IPC / Subcontract module |

Daily Reporting stores the first two. It never infers the third.

### 9.4 Delay Event Categories

`EMPLOYER_CAUSED` · `CONTRACTOR_CAUSED` · `SUBCONTRACTOR_CAUSED` · `DESIGN_INFORMATION` · `WEATHER` · `THIRD_PARTY_UTILITY` · `AUTHORITY` · `FORCE_MAJEURE` · `MATERIAL_SUPPLY` · `ACCESS_NOT_RELEASED` · `OTHER`

Delay events flagged `notice_required` raise a task in Contract Administration. The contemporaneous daily report, with its immutable version and timestamp, becomes the supporting record.

### 9.5 Custom Fields

Custom fields are configurable per reporting unit or discipline without schema change.

- Stored as JSONB in the report version, validated against a versioned `custom_field_definition` (JSON Schema).
- The definition version used is stored on each report version, so old reports remain interpretable after the definition changes.
- Custom fields participate in rules (required, range) but not in AI checks unless explicitly enabled.

### 9.6 Evidence Rules

- Photos are captured through the Mini App or Field App into DCOS storage — **not** posted as Telegram chat photos.
- Each file receives a SHA-256 hash and a server receipt timestamp. The device capture timestamp is stored separately.
- Perceptual hash is stored to detect re-use of the same photo on different days or by different units.
- Optional GPS and WBS tag per photo.
- Every file passes virus scanning before it is made visible to reviewers.
- Compression on cellular; original resolution on Wi-Fi (per Gap Analysis §4.6).

---

## 10. Rules Engine

### 10.1 Two Execution Points

| Execution Point | Purpose | Result |
|---|---|---|
| **Intake** (synchronous, at submit) | Block structurally invalid reports before a record exists | Hard errors are returned to the reporter; no report is created |
| **Post-submit** (asynchronous) | Context-dependent and statistical checks | Warnings attached to the report for the PM |

Offline reports run the **same intake rules locally** (cached rule set) and again on the server at sync.

### 10.2 Rule Catalogue (initial)

| Rule Code | Check | Point | Severity |
|---|---|---|---|
| `REQ_FIELD` | Required section or field missing | Intake | ERROR |
| `INV_PROJECT` | Project invalid or not active | Intake | ERROR |
| `INV_UNIT` | Reporting unit invalid, inactive, or user not a member | Intake | ERROR |
| `INV_WBS` | WBS or activity outside the unit's assigned scope | Intake | ERROR |
| `PROGRESS_MAX_100` | Cumulative progress above 100% | Intake | ERROR |
| `QTY_NEGATIVE` | Negative quantity | Intake | ERROR |
| `UOM_MISMATCH` | Unit of measure differs from the activity's | Intake | ERROR |
| `DATE_FUTURE` | Report date in the future | Intake | ERROR |
| `DUP_REPORT` | Report already exists for unit and date | Intake | ERROR (online) / CONFLICT (offline sync) |
| `EVIDENCE_MIN` | Fewer photos than configured minimum | Intake | WARNING or ERROR per config |
| `LATE_SUBMIT` | Submitted after deadline | Post-submit | WARNING |
| `MANPOWER_BELOW_PLAN` | Reported manpower below planned threshold | Post-submit | WARNING |
| `QTY_RANGE` | Quantity outside configured range | Post-submit | WARNING or ERROR per config |
| `PROGRESS_JUMP` | Daily production exceeds N× the rolling average | Post-submit | WARNING |
| `PROGRESS_REGRESS` | Cumulative quantity decreased without reason | Post-submit | WARNING |
| `PRODUCTIVITY_ABNORMAL` | Output per man-day outside historical band | Post-submit | WARNING |
| `NEXT_DAY_MISSING_RESOURCE` | Next-day plan lists activities with no manpower | Post-submit | WARNING |
| `DELAY_NO_NOTICE_FLAG` | Delay event with an employer-related cause but notice flag unset | Post-submit | WARNING |
| `PHOTO_REUSE` | Perceptual hash matches a previous report's photo | Post-submit | WARNING |
| `OFFLINE_ASSERTION_REVOKED` | Report created under a later-revoked offline assertion | Sync | REQUIRES_REVIEW |

### 10.3 Statistical Rules and History

`PROGRESS_JUMP`, `PRODUCTIVITY_ABNORMAL`, and similar rules need history. They are **disabled for a unit until it has at least N approved report days** (default 10) and use a rolling window. They are deterministic code, not AI.

### 10.4 Structured Rule Result

```json
{
  "rule_code": "PROGRESS_JUMP",
  "status": "FAILED",
  "severity": "WARNING",
  "message": "Reported production is 12.8x the 10-day average for this activity.",
  "params": { "baseline": 35, "reported": 450, "window_days": 10 },
  "target": { "section": "activity_progress", "line_id": "..." }
}
```

### 10.5 Rule Governance

- Rules are data (`rule_definition`), versioned, with per-project overrides. No business thresholds are hard-coded (R0 §23.3).
- Changing a rule is an Admin Event in the audit log.
- A **critical rule failure cannot be overridden by any AI output.**

### 10.6 Duplicate and Conflict Handling

| Situation | Behaviour |
|---|---|
| Online duplicate for same unit and date | Rejected at intake; reporter is directed to the existing report |
| Offline report syncs and a report already exists for that date | Held in `sync_conflict`; PM or the reporter resolves: merge into new version, keep existing, or keep both as distinct versions |
| Same idempotency key re-sent after a network failure | Returns the original receipt; no duplicate is created |

---

## 11. AI Assurance

### 11.1 Position

AI is a **consultation layer**. It checks, interprets, and drafts. It does not approve, reject, or change authoritative data.

### 11.2 Scope: Three Capabilities, Not Eight Agents

Most of the checks in the source idea are deterministic and belong to the Rules Engine (completeness, validation, manpower, numeric progress, simple anomaly). Only work that needs interpretation uses an LLM.

| Capability | Input | Output |
|---|---|---|
| **Evidence assessment** | Photos plus the claimed activity and WBS | Per-activity assessment: `SUPPORTED`, `UNCLEAR`, `CONTRADICTED`, or `NOT_ASSESSABLE`, with a short reason |
| **Text interpretation & cross-report reasoning** | Free-text issues, constraints, delay descriptions, instructions; related reports from other units and prior days | Classified issues and constraints; flagged contradictions (e.g. one unit reports an area complete while another reports it not released) |
| **Drafting** | Findings, rule results, report data | Draft correction request for the PM; draft Project Daily Summary narrative |

Additional "specialist agents" are added only when a measured need appears.

### 11.3 No Numeric Confidence

LLM self-reported confidence is not a calibrated probability and must not drive decisions. Findings use categorical assessments with cited evidence. The review UI never shows a "91% confident" figure.

### 11.4 Standard Finding Object

```json
{
  "finding_id": "fnd_...",
  "report_id": "DR-2026-000148",
  "version_no": 1,
  "project_id": "prj_001",
  "reporting_unit_id": "ru_002",
  "capability": "EVIDENCE_ASSESSMENT",
  "finding_type": "EVIDENCE_UNCLEAR",
  "severity": "WARNING",
  "assessment": "UNCLEAR",
  "message": "Photos show formwork but do not show the reported Level 5 Zone B slab area.",
  "target": { "section": "activity_progress", "line_id": "..." },
  "source_refs": ["evidence:ev_...", "report:DR-2026-000142"],
  "recommended_action": "REQUEST_ADDITIONAL_EVIDENCE",
  "model": "...",
  "prompt_version": "...",
  "created_at": "..."
}
```

All AI output uses this one contract. Findings reference their sources so the PM can verify them.

### 11.5 Controls

| Control | Detail |
|---|---|
| Write permission | AI service role can **insert only** into `ai_run` and `ai_finding`. It has no write access to report, version, review, or summary tables |
| Untrusted input | All reporter text and images are treated as untrusted data (prompt injection). Prompts instruct the model to treat content as data; outputs are schema-validated; free text never triggers actions |
| Asynchronous | AI runs after intake and never blocks submission. If it fails or times out, assurance state becomes `AI_UNAVAILABLE` and the report proceeds to the PM with that flag |
| Visibility | Findings are visible to the PM and delegated reviewers only. Reporting units receive only what the PM sends as a correction request |
| Registry | Every capability is registered with model, model version, prompt version, input and output schema, and status |
| Audit | Every AI run and finding is logged with model and prompt version |
| Language | Khmer and mixed-language inputs are evaluated on real samples before AI findings are enabled for a project; if quality is insufficient, the capability is limited to evidence assessment |
| Cost control | Evidence assessment runs only on photos tied to activities, not on every upload; per-project daily AI budget is configurable |

### 11.6 Assurance Result

The consolidated result shown to the PM contains: rule results (errors, warnings), AI findings, a status for each of completeness, validation, evidence, progress, and manpower, any cross-report conflicts, a recommended action, and a draft correction request if applicable. There is **no single combined score.**

---

## 12. Channels, Offline and Sync

### 12.1 Channel Strategy

| Channel | Connectivity | Primary Users | Notes |
|---|---|---|---|
| **Telegram Mini App** | Online (with draft resilience) | Subcontractor and in-house reporters with signal | Launched from the project group |
| **DCOS Field App** — PWA first, React Native later | Online **and fully offline** | Reporters on poor-signal sites, QA, HSE | Same API, same form definition |

> **Verify before build:** Telegram Mini Apps run inside the Telegram web view. Local storage and IndexedDB are generally available, but service-worker support and background sync vary by platform, and the Mini App cannot be opened at all without Telegram connectivity. For that reason full offline is delivered by the Field App, and the Mini App provides draft autosave and queued submit for short signal loss only.

### 12.2 Mini App Offline Behaviour (short signal loss)

- Form definition and rule set cached on first load.
- Draft autosaved locally every few seconds.
- If submit fails for connectivity, the report is queued in local storage with an idempotency key and retried automatically while the Mini App is open.
- A visible banner shows `Saved on device — not yet sent`.
- Evidence files are queued separately and uploaded after the report.

### 12.3 Field App Offline Behaviour (full offline)

Built on Module 03-01 §8.5 (offline assertions) and Gap Analysis §4.6 (sync principles).

```text
Online: user logs in → DCOS issues offline assertion (valid ≤ offline_grace_hours)
        → app downloads: form definitions, rule set, assigned activities,
          look-ahead plan, previous-day report summary, reference lists
Offline: user unlocks with PIN / device biometric
        → app validates assertion locally
        → creates report; intake rules run locally; evidence stored on device
        → report written to local queue with idempotency key + assertion id
        → NO review or approval actions offline
Online again: queue pushes in order (report first, then evidence, chunked and resumable)
        → server re-validates assertion, re-runs intake and post-submit rules
        → receipt returned per item; sync state updated visibly
```

### 12.4 Sync Rules

| Rule | Detail |
|---|---|
| Local first | Everything is written to device storage before any network attempt |
| Idempotency | Every submission carries a client-generated key; the server returns the original receipt on replay |
| Timestamps | Device capture time and server receipt time are both stored. Field facts keep device time as the event time; approvals use server time |
| Order | Report version first, evidence second; a report with missing evidence is marked `EVIDENCE_PENDING`, not rejected |
| Photo upload | Compressed on cellular, original on Wi-Fi, chunked and resumable |
| Revoked while offline | Per Auth decision D11: queued reports are **still accepted**, flagged `REQUIRES_REVIEW` for the PM, and no new offline assertion is issued. Site work is a fact and is never dropped |
| Sync visibility | A sync-state indicator is visible on every screen: `Local only`, `Syncing`, `Synced`, `Conflict`, `Requires review` |
| Review is online only | PM review and approval require a live session; AAL is established per Module 03-01 |

### 12.5 Both Channels Use One API

Both channels call the same endpoints (Section 18). The channel is recorded on each report version (`channel`) but never changes validation, workflow, or authorization.

---

## 13. Workflows

### 13.1 Reporting Unit Setup

```text
Project created and WBS assigned
→ Company Admin / PM creates reporting unit (subcontractor or in-house)
→ assigns discipline, scope, WBS scope, reporting schedule, required sections and evidence
→ assigns reporter users (reporting_unit_member)
→ users linked to Telegram (§7.2) or install Field App
→ admin binds Telegram group (§7.4)
→ bot pins "Submit Daily Report" message in the group
→ unit status = Active
```

### 13.2 Submission — Online

```text
Reporter opens Mini App / Field App
→ session established; form loaded with pre-filled activities
→ reporter completes sections, attaches evidence
→ intake rules run live in the form
→ reporter reviews summary screen → Submit
→ POST /dr/reports (idempotency key)
→ API: authenticate → resolve context → intake rules
      → ERROR: returned to reporter, nothing persisted
      → OK: report + version 1 + evidence registered; receipt returned
→ event REPORT_SUBMITTED
→ post-submit rules run
→ AI assurance requested (if enabled)
→ assurance package assembled
→ PM notified: review required
→ confirmation sent to reporter (Telegram DM or in-app) and a one-line status in the group
```

### 13.3 Submission — Offline

```text
Reporter creates report offline (Field App)
→ local intake rules pass → saved to local queue → sync_state = LOCAL_ONLY
→ connectivity returns → queue pushes → sync_state = SYNCING
→ server re-validates assertion and intake rules
      → duplicate for unit/date → sync_conflict → PM or reporter resolves
      → assertion revoked → accepted, flagged REQUIRES_REVIEW
      → OK → continues as 13.2 from "event REPORT_SUBMITTED"
→ sync_state = SYNCED
```

### 13.4 PM Review (Phase 1: PM is the sole approver)

```text
PM opens Review Inbox (sorted by project, then flagged-first)
→ opens assurance package:
     report · rule results · AI findings · evidence · cross-report conflicts
     · previous-day comparison · draft correction (if any)
→ PM decision:
     APPROVE                → version becomes approved
     APPROVE WITH REMARK    → approved; remark stored and visible to the unit
     REQUEST INFORMATION    → question sent; report stays under review
     RETURN FOR CORRECTION  → PM edits/confirms drafted correction → sent to unit
```

- PM may adjust **verified quantities** during approval; the reported value is retained alongside the verified value with a mandatory remark.
- Rejection or return requires a comment (R0 §24.4.13).
- Review runs through the **Approval Workflow Engine** using template `DR_REVIEW`.
  - Phase 1: one step, approver role = project PM.
  - Later: step 1 = delegated reviewer role, step 2 = PM (or PM for exceptions only). This is a template change, not a code change.

### 13.5 Return and Correction Loop

```text
PM returns report with correction request
→ correction_request created (items target specific sections or lines)
→ notification to reporter (Telegram DM + in-app) and short status in group
→ reporter opens the returned report; only returned items are editable
→ reporter resubmits → new version (v2), original v1 untouched
→ intake rules → post-submit rules → AI (delta only) → PM review again
→ APPROVE
```

**Item-level return:** only the items the PM selects are reopened; the rest of the report is locked, avoiding a full re-entry.

**Visibility rule:** the correction request shown to the reporter contains only what the PM approved. Raw AI findings are never shown to the reporting unit.

### 13.6 Post-Approval Amendment

Approved reports are immutable. If an error is found later:

```text
PM (or reporter with PM approval) initiates amendment with mandatory reason
→ new version created, marked AMENDED, original approved version preserved
→ review_state = AMENDMENT_PENDING → PM approves amended version
→ affected Project Daily Summary issued as next revision (Rev 2, Rev 3 …)
→ audit log records old and new values and the reason
```

### 13.7 Missing Report Handling

```text
Reporting deadline reached on a working day for an Active unit
→ no submission found
→ MISSING_REPORT record created
→ reporter + unit lead notified; PM notified in digest
→ next-morning cut-off passes → escalation to Project Director per matrix
→ late submission later → LATE flag; MISSING_REPORT closed
→ unit marks "No work today" with a reason (weather, holiday, access) → counts as reported, not missing
```

The unit can submit an explicit **No Work Today** report. Silence and "no work" are different facts and are recorded differently.

### 13.8 Project Daily Summary

```text
Reports approved through the day
→ Live Summary compiles automatically from approved versions only
→ coverage computed: expected units / submitted / approved / missing / no-work
→ AI drafts the narrative (optional); PM edits
→ at cut-off the PM publishes the summary → status OFFICIAL, revision number set
→ late approvals or amendments produce a new revision; the previous one is SUPERSEDED
→ management dashboard updated
```

| Content | Source |
|---|---|
| Total manpower by trade and unit | Approved reports |
| Activities completed / ongoing / delayed | Approved reports vs look-ahead |
| Verified quantities and progress | Approved reports |
| Delay events and notice flags | Approved reports |
| Issues, constraints, instructions | Approved reports |
| Materials and equipment | Approved reports |
| Unit compliance (on time / late / missing / no-work) | Reporting schedule |
| Unresolved findings and open returns | Review records |
| Next-day plan and schedule risks | Approved reports and Planning |

**Management transparency rule:** management sees official numbers **and** a coverage banner such as `3 of 5 reports approved — 2 pending`. Pending items are visibly unofficial; they are neither hidden nor mixed into official totals.

### 13.9 Multi-Project Management Overview

Compiled from published project summaries: reporting compliance, manpower, progress versus plan, major issues, delays, critical risks, unit performance, project comparison and trends.

---

## 14. Status Model

A single linear status is fragile. A report carries **four independent state fields**, plus a derived label for the UI.

### 14.1 Submission State

`DRAFT` → `QUEUED_OFFLINE` → `SUBMITTED` → `RETURNED` → (resubmission creates a new version and returns to `SUBMITTED`) · `WITHDRAWN`

### 14.2 Assurance State

`PENDING` → `RULES_DONE` → `AI_RUNNING` → `COMPLETE` · `AI_UNAVAILABLE` · `NOT_APPLICABLE` (AI disabled for this project or phase)

### 14.3 Review State

`AWAITING_REVIEW` → `IN_REVIEW` → `INFO_REQUESTED` · `RETURNED` · `APPROVED` · `APPROVED_WITH_REMARK` · `AMENDMENT_PENDING`

### 14.4 Sync State (offline channel)

`LOCAL_ONLY` → `SYNCING` → `SYNCED` · `CONFLICT` · `REQUIRES_REVIEW` · `EVIDENCE_PENDING`

### 14.5 Derived UI Label

| Label | Derived From |
|---|---|
| Draft | Submission = DRAFT |
| Saved on device | Submission = QUEUED_OFFLINE |
| Submitted — checking | Submitted, assurance not complete |
| Awaiting PM | Review = AWAITING_REVIEW |
| Returned — action required | Review = RETURNED |
| Approved | Review = APPROVED or APPROVED_WITH_REMARK |
| Amended | Latest version kind = AMENDMENT |
| Official | Included in a published summary revision |

### 14.6 Other Status Lists

| Entity | Statuses |
|---|---|
| Reporting unit | `Planned` · `Active` · `Suspended` · `Demobilised` |
| Telegram binding | `Pending` · `Active` · `Migrated` · `Suspended` · `Unbound` |
| Correction request | `Draft` · `Sent` · `Acknowledged` · `Resubmitted` · `Closed` · `Cancelled` |
| Missing report | `Open` · `Late Submitted` · `Excused` · `Closed` |
| Project daily summary | `Live` · `Official` · `Superseded` |
| Evidence | `Uploading` · `Scanning` · `Available` · `Quarantined` · `Failed` |
| AI run | `Queued` · `Running` · `Completed` · `Failed` · `Timed Out` |
| Sync conflict | `Open` · `Resolved — Merged` · `Resolved — Kept Existing` · `Resolved — Kept Both` |

---

## 15. Data Model

All tables carry `tenant_id` with Row-Level Security per Module 03-01 §5.5. Child tables also carry `project_id` where applicable.

### 15.1 `reporting_unit`

| Field | Type | Description |
|---|---|---|
| unit_id | uuid PK | |
| tenant_id / project_id | uuid FK | |
| unit_code | varchar | e.g. `SC-A2`, `IH-A1` |
| unit_type | enum | `SUBCONTRACTOR` \| `IN_HOUSE_TEAM` |
| stakeholder_id | uuid FK nullable | Subcontractor organisation |
| subcontract_id | uuid FK nullable | Contract link |
| department_id | uuid FK nullable | For in-house teams |
| display_name | varchar | |
| discipline_scope | text[] | |
| wbs_scope | uuid[] | Assigned WBS nodes |
| schedule_id | uuid FK | Reporting schedule |
| required_sections | jsonb | Section configuration |
| evidence_min_policy | jsonb | |
| custom_field_def_id | uuid FK nullable | Active definition |
| status | enum | See §14.6 |
| mobilised_at / demobilised_at | date | |

### 15.2 `reporting_unit_member`

| Field | Type | Description |
|---|---|---|
| member_id | uuid PK | |
| unit_id | uuid FK | |
| user_id | uuid FK | → `app_user` |
| role | enum | `REPORTER` \| `VIEWER` |
| valid_from / valid_to | date | Mirrors contract-driven access |
| status | enum | `active` \| `suspended` \| `revoked` |

### 15.3 `reporting_schedule`

| Field | Type | Description |
|---|---|---|
| schedule_id | uuid PK | |
| tenant_id / project_id | uuid FK | |
| deadline_time | time | Project local time |
| reminder_time | time | |
| late_window_hours | int | |
| working_calendar_id | uuid FK | Public holidays per R0 |
| timezone | varchar | |

### 15.4 `telegram_group_binding`

| Field | Type | Description |
|---|---|---|
| binding_id | uuid PK | |
| tenant_id / project_id | uuid FK | |
| unit_id | uuid FK | |
| telegram_chat_id | bigint | Current chat ID |
| chat_title_snapshot | varchar | |
| chat_type | varchar | Group / supergroup |
| migrated_from_chat_id | bigint nullable | |
| bot_present | boolean | |
| status | enum | See §14.6 |
| valid_from / valid_to | timestamptz | |
| bound_by | uuid FK | |

Constraints: one `Active` binding per `unit_id`; one `Active` binding per `telegram_chat_id`.

### 15.5 `telegram_link_code`

| Field | Type |
|---|---|
| code_id uuid PK · user_id uuid FK · code_hash varchar · expires_at timestamptz · used_at timestamptz nullable · created_by uuid FK | |

Telegram identity itself is stored in `identity_link` (`provider = 'telegram'`), not in a new user table.

### 15.6 `daily_report` (header)

| Field | Type | Description |
|---|---|---|
| report_id | uuid PK | |
| report_no | varchar unique | e.g. `DR-2026-000148` |
| tenant_id / project_id | uuid FK | |
| unit_id | uuid FK | |
| report_date | date | |
| report_kind | enum | `WORK` \| `NO_WORK` |
| current_version_no | int | |
| approved_version_no | int nullable | Version accepted by PM |
| submission_state | enum | §14.1 |
| assurance_state | enum | §14.2 |
| review_state | enum | §14.3 |
| sync_state | enum | §14.4 |
| late_flag | boolean | |
| first_submitted_at | timestamptz | Server time |
| approved_at / approved_by | timestamptz / uuid | |

Unique: (`unit_id`, `report_date`).

### 15.7 `daily_report_version` (immutable)

| Field | Type | Description |
|---|---|---|
| version_id | uuid PK | |
| report_id | uuid FK | |
| version_no | int | |
| version_kind | enum | `ORIGINAL` \| `CORRECTION` \| `AMENDMENT` |
| payload | jsonb | Complete snapshot of all sections |
| custom_fields | jsonb | |
| custom_field_def_version | int | |
| content_hash | varchar | SHA-256 of payload |
| submitted_by | uuid FK | |
| submitted_at | timestamptz | Server time |
| client_created_at | timestamptz | Device time |
| idempotency_key | varchar | Unique per tenant |
| channel | enum | `TELEGRAM_MINIAPP` \| `FIELD_APP` \| `WEB` \| `API` \| `IMPORT` |
| offline_assertion_id | uuid nullable | |
| device_id | uuid FK nullable | |
| amendment_reason | text nullable | |

**Append-only. No update. No delete.** The structured line tables below are projections of the payload for querying and roll-up.

### 15.8 Line Tables (per version)

| Table | Key Fields |
|---|---|
| `dr_activity_progress` | version_id, wbs_node_id, activity_id, boq_item_id (nullable), discipline, reported_qty, verified_qty (nullable), uom, cumulative_reported_qty, percent_complete, work_status, unplanned_flag, remarks |
| `dr_manpower` | version_id, trade, planned_count, reported_count, supervisors, hours |
| `dr_equipment` | version_id, equipment_asset_id (nullable), equipment_type, hours_working, hours_idle, hours_breakdown |
| `dr_material` | version_id, item_id (nullable), description, qty_delivered, qty_used, uom, delivery_note_ref |
| `dr_delay_event` | version_id, cause_category, description, start_at, end_at, hours_lost, wbs_node_id, notice_required, contract_notice_ref (nullable) |
| `dr_issue` | version_id, issue_type, severity, description, action_required_from, linked_rfi_id (nullable), linked_ncr_id (nullable) |
| `dr_instruction_received` | version_id, instruction_type, given_by, reference, description |
| `dr_inspection_request` | version_id, wbs_node_id, reference, status |
| `dr_weather` | version_id, condition, hours_lost |
| `dr_safety` | version_id, toolbox_talk_held, observations, incident_count, near_miss_count, linked_incident_ids |
| `dr_area_access` | version_id, wbs_node_id, access_state (`RELEASED` \| `BLOCKED` \| `PARTIAL`), note |
| `dr_next_day_plan` | version_id, activity_id, wbs_node_id, planned_manpower, planned_qty |

### 15.9 `dr_evidence`

| Field | Type | Description |
|---|---|---|
| evidence_id | uuid PK | |
| version_id | uuid FK | |
| target_section / target_line_id | varchar / uuid | What the file supports |
| wbs_node_id | uuid FK nullable | |
| storage_key | text | Tenant-partitioned path |
| mime_type / size_bytes | varchar / bigint | |
| sha256 | varchar | |
| perceptual_hash | varchar nullable | |
| captured_at_device | timestamptz | |
| received_at_server | timestamptz | |
| gps_lat / gps_lng | numeric nullable | |
| source | enum | `MINIAPP` \| `FIELD_APP` \| `WEB` |
| caption | text | |
| scan_status | enum | §14.6 |

### 15.10 Rules

**`rule_definition`**: rule_id, tenant_id, project_id (nullable override), rule_code, point (`INTAKE` \| `POST_SUBMIT`), severity, params jsonb, min_history_days, version, is_active.

**`rule_result`**: result_id, report_id, version_no, rule_code, rule_version, status, severity, message, params jsonb, target jsonb, created_at.

### 15.11 AI

**`ai_capability_registry`**: capability_id, name, purpose, input_schema, output_schema, model, model_version, prompt_version, permissions, status.

**`ai_run`**: run_id, report_id, version_no, capability_id, model, prompt_version, status, started_at, finished_at, token_usage, error.

**`ai_finding`**: finding_id, run_id, report_id, version_no, capability, finding_type, severity, assessment, message, target jsonb, source_refs jsonb, recommended_action, created_at.

### 15.12 Review and Correction

**`dr_review_decision`**: decision_id, report_id, version_no, workflow_instance_id, reviewer_id, decision (`APPROVE` \| `APPROVE_WITH_REMARK` \| `REQUEST_INFO` \| `RETURN`), comment, verified_quantity_adjustments jsonb, decided_at.

**`dr_correction_request`**: correction_id, report_id, based_on_version_no, drafted_by (`AI` \| `PM`), approved_by_pm, status, message, sent_at, resolved_in_version_no.

**`dr_correction_item`**: item_id, correction_id, target_section, target_line_id, reason, required_action.

### 15.13 Missing Reports and Sync

**`dr_missing_report`**: missing_id, unit_id, report_date, detected_at, status, excuse_reason, closed_at, linked_report_id.

**`dr_sync_conflict`**: conflict_id, unit_id, report_date, existing_report_id, incoming_payload_ref, detected_at, resolution, resolved_by, resolved_at.

Sync queue, device registration, and offline cache manifest reuse **Group U** from the Gap Analysis (`sync_queue`, `device_registrations`, `offline_cache_manifest`).

### 15.14 Summary

**`project_daily_summary`**

| Field | Type | Description |
|---|---|---|
| summary_id | uuid PK | |
| tenant_id / project_id | uuid FK | |
| summary_date | date | |
| revision_no | int | |
| status | enum | `Live` \| `Official` \| `Superseded` |
| coverage | jsonb | expected, submitted, approved, no_work, missing, pending |
| totals | jsonb | manpower, quantities, progress, delays, issues |
| included_report_versions | jsonb | Exact `(report_id, version_no)` list |
| narrative_ai_draft | text | |
| narrative_final | text | PM-edited |
| published_by / published_at | uuid / timestamptz | |

**`management_overview`** is a **database view** across published summaries, not a stored table.

### 15.15 Entity Relationships

```text
Project ─┬─ reporting_unit ─┬─ reporting_unit_member ─► app_user ◄─ identity_link (telegram)
         │                  ├─ telegram_group_binding
         │                  └─ daily_report ─┬─ daily_report_version (immutable) ─┬─ line tables
         │                                   │                                    └─ dr_evidence
         │                                   ├─ rule_result
         │                                   ├─ ai_run ─► ai_finding
         │                                   ├─ dr_review_decision
         │                                   └─ dr_correction_request ─► dr_correction_item
         ├─ dr_missing_report
         └─ project_daily_summary ─► (approved report versions)
```

The key identity chain from the source idea is preserved:

`Telegram user → app_user → reporting unit → project → discipline → WBS → activity → report version → evidence → findings → PM decision → approved data → summary`

---

## 16. Notification Rules

Uses the Notification Matrix (R0 §24.5). Channel names: In-app, Telegram DM, Telegram group, Email, Push (Field App).

### 16.1 Matrix

| Trigger | Recipients | Priority | Channel | Timing |
|---|---|---|---|---|
| Reporting reminder | Reporters of units with no report yet | Normal | Telegram DM, In-app, Push | `reminder_time` on working days |
| Report submitted (confirmation) | Reporter | Normal | Telegram DM / In-app | Immediately |
| Report submitted — status line | Unit's Telegram group | Low | Telegram group (one line, no content) | Immediately |
| Intake rejected | Reporter | High | In-app (inline) | Immediately |
| Report awaiting review | PM | High | In-app, Telegram DM | Immediately; batched digest for low-volume projects |
| Daily review digest | PM | Normal | In-app, Email | Next-morning 08:00: awaiting, flagged, missing |
| Review pending > 12 h | PM | High | In-app, Telegram DM | After 12 h |
| Review pending > 24 h | PM, Project Director | Critical | In-app, Email, Telegram DM | After 24 h |
| Information requested | Reporter | High | Telegram DM, In-app, Push | Immediately |
| Report returned for correction | Reporter, unit lead | High | Telegram DM, In-app, Push, Email optional | Immediately |
| Correction pending > 24 h | Reporter, PM | High | Telegram DM, In-app | After 24 h |
| Report approved / with remark | Reporter | Normal | In-app, Telegram DM | Immediately |
| Report missing at deadline | Reporter, unit lead | High | Telegram DM, In-app, Push | `deadline_time` |
| Report missing next morning | PM | High | In-app, Telegram DM | 09:00 |
| Unit missing 2 consecutive days | PM, Project Director | Critical | In-app, Email, Telegram DM | Immediately |
| Delay event with notice required | Contract Administrator, PM | Critical | In-app, Email | Immediately after approval |
| Safety incident reported in daily report | HSE Officer, PM, Project Director | Critical | In-app, Email, Telegram DM | Immediately on submission — **does not wait for review** |
| Sync conflict detected | PM | High | In-app | On sync |
| Offline report requires review (assertion revoked) | PM, Company Admin | High | In-app, Email | On sync |
| AI unavailable on a report | PM (in package only) | Low | In-app flag | On assurance end |
| Photo re-use detected | PM | High | In-app | On assurance end |
| Project Daily Summary published | Project Director, Management | Normal | In-app, Email | On publish |
| Summary revision issued | Project Director, Management | Normal | In-app | On publish |
| Telegram binding migrated / bot removed | Company Admin, PM | High | In-app, Email | Immediately |
| Telegram message delivery failed | Reporter (fallback channel) | Normal | In-app, SMS fallback | After retry failure |

### 16.2 Rules

- **Group messages are public to the unit.** Nothing in a group message contains findings, quantities, rule results, or review comments — only short status lines (`DR-148 submitted`, `DR-148 returned — check your DM`).
- **Detail goes to private chat or in-app.** If a user has not started the bot privately, the notification falls back to in-app and SMS.
- **Safety incidents bypass review.** A reported incident notifies HSE immediately; the report still goes through normal review.
- Respect the Notification Engine's anti-spam rules: digest low-priority items, no repeats within the same channel, quiet hours for non-critical Telegram and email.
- Reminders skip non-working days and units marked No Work.

### 16.3 Escalation Timing (configurable)

| Event | First Reminder | First Escalation | Final Escalation |
|---|---:|---:|---:|
| Report missing | At deadline | Next 09:00 → PM | 2nd day → Project Director |
| PM review pending | 12 h | 24 h → Project Director | 48 h → Company Admin |
| Correction pending | 24 h | 48 h → PM | 72 h → Project Director |

---

## 17. Audit Events

| Event Code | Logged Data |
|---|---|
| `DR.UNIT_CREATED` / `_UPDATED` / `_STATUS_CHANGED` | unit, actor, old/new |
| `DR.BINDING_CREATED` / `_MIGRATED` / `_SUSPENDED` / `_UNBOUND` | chat id, unit, actor |
| `AUTH.IDENTITY_LINKED` (telegram) | user, telegram id (hashed in logs per policy), actor |
| `DR.LAUNCH_TOKEN_ISSUED` / `_REJECTED` | binding, user, reason |
| `DR.DRAFT_SAVED` | unit, date, channel (low severity, optional) |
| `DR.INTAKE_REJECTED` | unit, date, rule codes — **kept even though no report is created** |
| `DR.REPORT_SUBMITTED` | report, version, channel, device, offline assertion |
| `DR.REPORT_SYNCED` | report, queue age, conflicts |
| `DR.SYNC_CONFLICT_RAISED` / `_RESOLVED` | conflict, resolution, actor |
| `DR.RULES_EVALUATED` | report, version, failed rule codes |
| `DR.AI_RUN_COMPLETED` / `_FAILED` | run, capability, model, prompt version |
| `DR.REVIEW_OPENED` | reviewer, report |
| `DR.REVIEW_DECISION` | decision, comment, verified-quantity adjustments |
| `DR.CORRECTION_SENT` / `_RESUBMITTED` | correction, items, versions |
| `DR.REPORT_AMENDED` | reason, old/new version |
| `DR.EVIDENCE_UPLOADED` / `_QUARANTINED` / `_VIEWED` | hash, scan result |
| `DR.MISSING_REPORT_RAISED` / `_EXCUSED` | unit, date, reason |
| `DR.SUMMARY_PUBLISHED` / `_SUPERSEDED` | revision, included versions, actor |
| `DR.RULE_CHANGED` | old/new definition |
| `DR.NOTIFICATION_FAILED` | channel, reason |

Every record follows the Audit Trail schema (R0 §24.4.5). **Append-only; retention: project duration + DLP + 5 years** (project workflow logs, R0 §24.4.12). Daily reports are claim evidence and are not purged with routine archival.

---

## 18. API Endpoints

All calls use the DCOS access token. Tenant and project context come from the token and server-side resolution, never from the request body.

### 18.1 Telegram and Identity

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/telegram/webhook` | Bot updates (signature-verified) |
| POST | `/dr/telegram/link/complete` | Redeem link code → create `identity_link` |
| POST | `/dr/telegram/session/exchange` | `initData` + launch token → DCOS session |
| POST | `/admin/dr/bindings` | Create group binding |
| PATCH | `/admin/dr/bindings/:id` | Confirm migration, suspend, unbind |
| POST | `/admin/dr/bindings/:id/launch-token` | Re-issue signed launch link |

### 18.2 Reporting

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/dr/context` | Reporting units available to the current user |
| GET | `/dr/forms/:unitId?date=` | Form definition, pre-filled activities, rules, previous-day data |
| PUT | `/dr/drafts/:unitId/:date` | Save server-side draft |
| POST | `/dr/reports` | Submit report (header `Idempotency-Key`) |
| POST | `/dr/reports/:id/versions` | Resubmit corrected items |
| POST | `/dr/reports/:id/withdraw` | Withdraw before review |
| GET | `/dr/reports/:id` | Report with versions and state |
| GET | `/dr/reports` | List / filter by project, unit, date, state |
| POST | `/dr/evidence/upload-url` | Signed chunked upload |
| POST | `/dr/evidence/:id/complete` | Finalise upload, trigger scan |

### 18.3 Offline Sync

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/dr/sync/push` | Ordered batch of queued items with idempotency keys |
| GET | `/dr/sync/pull?since=` | Form definitions, assignments, rule set, previous reports |
| GET | `/dr/sync/conflicts` | Open conflicts for the user |
| POST | `/dr/sync/conflicts/:id/resolve` | Resolve a conflict |

### 18.4 Review and Summary

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/dr/review/inbox` | PM review inbox |
| GET | `/dr/review/:reportId/package` | Assurance package |
| POST | `/dr/review/:reportId/decision` | Approve / remark / request info / return |
| POST | `/dr/reports/:id/amend` | Start amendment (reason required) |
| GET | `/dr/summaries/project/:projectId?date=` | Project summary (live or official) |
| POST | `/dr/summaries/:id/publish` | PM publishes official summary |
| GET | `/dr/management/overview` | Multi-project overview |
| GET | `/dr/compliance` | Reporting compliance by unit and project |

### 18.5 Admin

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST/PATCH | `/admin/dr/units` | Reporting unit CRUD |
| GET/PUT | `/admin/dr/schedules` | Reporting schedules |
| GET/POST/PATCH | `/admin/dr/rules` | Rule definitions and project overrides |
| GET/POST/PATCH | `/admin/dr/custom-fields` | Versioned custom field definitions |
| GET/PATCH | `/admin/dr/ai-capabilities` | AI capability registry, enable/disable per project |

Audit logs, notifications, and workflow actions use the existing engine endpoints (R0 §24).

---

## 19. Integration Points

| Module | Direction | Interface |
|---|---|---|
| 03-01 Authentication | Auth ↔ DR | Telegram as identity provider; offline assertions; session exchange |
| 03-02 RBAC | RBAC → DR | Permissions for submit, review, approve, publish, amend |
| Project Setup / WBS | WBS → DR | WBS scopes, activities, node paths |
| Planning & Scheduling | Planning → DR | Look-ahead pre-fill; DR → Planning: actual start/finish and progress feed (approved data only) |
| Subcontractor Management | Subcontract ↔ DR | Unit created from subcontract; contract dates drive access expiry; reported/verified quantities available as **measurement support** only |
| Approval Workflow Engine | DR → Approval | `DR_REVIEW` template; delegation by template change |
| Notification Engine | DR → Notif | Section 16 matrix; Telegram channel adapter |
| Audit Trail Engine | DR → Audit | Section 17 events |
| RFI / QA/QC / HSE | DR ↔ others | Issues link to RFIs; inspection requests create QA/QC records; incidents create HSE records |
| Contract Administration | DR → Contract Admin | Delay events with notice flag; instructions received; time-bar tasks |
| Equipment / Inventory | DR ↔ others | Equipment hours and material usage feed cost allocation to WBS |
| HR Module | HR ↔ DR | In-house reporters link to employee master |
| Mobile Field App | Shared | Offline sync protocol, device registration (Gap Group U) |
| Reporting & KPI | DR → KPI | Compliance, manpower, progress, delay metrics |
| Claims & Disputes | DR → Claims | Immutable versions and evidence as contemporaneous records |

---

## 20. Reports & KPIs

**Operational**
- Reporting compliance by unit and project: on time, late, missing, no-work
- Review turnaround time per PM
- Return rate and average correction cycles per unit
- Open returns and aged information requests
- Offline usage by project and sync-lag distribution

**Project**
- Manpower by trade and unit (reported and verified)
- Verified progress versus look-ahead
- Delay events by cause category and hours lost
- Open issues and constraints aging
- Area release and blocked-work-front report

**Management**
- Multi-project compliance and progress dashboard
- Unit performance league (timeliness, accuracy, correction rate)
- Delay and notice register summary
- Trend analysis (manpower, productivity, delays) — available after history accrues

**Quality of the module itself**
- Share of reports clean on first submission
- Intake rejection rate by rule (indicates form or training problems)
- AI finding acceptance rate by the PM (finding led to return / remark vs dismissed) — used to tune or disable AI capabilities
- Reported vs verified quantity variance by unit

---

## 21. UI / Screens

| Screen | Users | Notes |
|---|---|---|
| Group launch / unit selector | Reporters | Shown when a user belongs to several units |
| Daily Report Form (Mini App / Field App) | Reporters | Sections as steps, pre-filled activities, large touch targets, usable with gloves, Khmer / English |
| Evidence capture | Reporters | Camera-first, tag to activity or WBS, upload progress, offline queue indicator |
| Review summary before submit | Reporters | Shows rule warnings and the evidence count |
| Sync status bar | Reporters | Visible on every screen |
| My Reports / Returned Items | Reporters | Only returned items editable |
| PM Review Inbox | PM | Sorted flagged-first, filter by project and unit |
| Review Package | PM | Report, evidence viewer, rule results, AI findings (internal), previous-day diff, cross-report conflicts, draft correction |
| Verified Quantity panel | PM | Reported vs verified, mandatory remark on adjustment |
| Project Daily Summary editor | PM | Live vs Official, coverage, AI draft narrative, publish |
| Missing Reports board | PM, Project Director | By day, by unit, with escalation status |
| Management Overview | Project Director, Management | Multi-project, coverage banner |
| Admin — Reporting Units | Company Admin, PM | Units, members, schedules, required sections |
| Admin — Telegram Bindings | Company Admin | Binding status, migration alerts, launch links |
| Admin — Rules and Custom Fields | Company Admin | Versioned definitions, project overrides |
| Admin — AI Capabilities | Company Admin | Enable per project, model and prompt versions |
| Sync Conflicts | PM, reporters | Side-by-side compare and resolve |

---

## 22. Build Phasing

| Phase | Scope |
|---|---|
| **Phase 1 — MVP (core, online and offline)** | Reporting unit (subcontractor and in-house) · Telegram identity linking, group binding, bot and signed launch · Mini App with draft resilience · Field App (PWA) with full offline capture and sync · standard sections, evidence upload, intake rules · duplicate and conflict handling · PM-only review and approval via Approval Engine · return loop with item-level returns · post-approval amendment · missing-report detection and notifications · live and official Project Daily Summary with coverage banner · audit events · notifications |
| **Phase 2 — Assurance** | AI evidence assessment, text interpretation, correction and summary drafting (advisory, non-blocking) · post-submit statistical rules once history exists · photo re-use detection · delegated reviewer step in `DR_REVIEW` · management overview dashboard · delay-event feed to Contract Administration |
| **Phase 3 — Integration** | Planning actuals feed · RFI / QA/QC / HSE linkage · equipment and material cost allocation to WBS · measurement support for sub-IPC · KPI dashboards and trend analysis · React Native Field App with background sync |
| **Phase 4 — Intelligence** | Cross-project anomaly detection · productivity benchmarking from historical data · unit performance scoring · forecasting inputs for EVM |

**Build-risk note:** offline plus Telegram in Phase 1 is the largest effort item. If scope must be cut, cut Mini App convenience features first, not offline capture or the immutable version model.

---

## 23. Design Decision Register

| # | Decision | Rationale |
|---|---|---|
| D1 | DCOS database is the system of record; Telegram is an interface | Chat is mutable, platform-owned, and not auditable to contract standards |
| D2 | Telegram is an identity provider under Module 03-01, not a parallel user system | Keeps one identity per person and no auto-provisioning |
| D3 | Group membership never grants access | Anyone can be added to a group |
| D4 | Launch is a signed, short-lived token bound to a group binding, cross-checked server-side | Group identity cannot be assumed from Mini App data |
| D5 | One active group per reporting unit; mapping has validity dates | Handles group migration and replacement without losing history |
| D6 | Subcontractors and in-house teams share one reporting-unit model | Confirmed requirement C1; one workflow to build and maintain |
| D7 | PM is sole approver in Phase 1; reviewer role designed in from the start | Confirmed requirement C2; delegation becomes configuration |
| D8 | Online and offline from day one via two channels on one API | Confirmed requirement C3; Telegram web view cannot guarantee full offline |
| D9 | Hard rule errors block at intake; no record is created, but the attempt is audited | Keeps invalid data out; PM reviews meaningful reports only |
| D10 | Rules handle deterministic and statistical checks; AI only interprets | Cheaper, faster, reproducible, explainable |
| D11 | AI is advisory, asynchronous, insert-only, and never blocks a report | A failed model must not stop site reporting |
| D12 | No numeric AI confidence; categorical assessments with source references | LLM confidence is not calibrated |
| D13 | AI findings are internal to PM and reviewers | Prevents pressure on or coaching of the reporter by raw machine output |
| D14 | Original versions are immutable; corrections and amendments create versions | Claims-grade traceability |
| D15 | Reported, verified, and certified quantities are separate | Prevents daily claims from becoming payment by default |
| D16 | Management sees official numbers plus a visible coverage banner | Honest status without exposing unapproved data as official |
| D17 | Four independent state fields instead of one linear status | Submission, assurance, review, and sync change independently |
| D18 | Offline reports survive revocation, flagged for review (Auth D11) | Site work is a fact |
| D19 | Reviewing and approving requires a live session | Assurance level cannot be established offline (Auth D10) |
| D20 | "No Work Today" is an explicit report type | Silence and no-work must be distinguishable |
| D21 | Group messages carry status only, never content or findings | Groups include external parties |
| D22 | Use the shared Approval, Notification, and Audit engines | Avoids duplicate engines and keeps one audit model |

---

## 24. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Offline + Telegram scope is too large for Phase 1 | Delay of the highest-value module | Phase scope in §22; PWA first; keep Mini App simple |
| Telegram Mini App offline limits misunderstood | Reporters lose data in basements | Field App is the sanctioned offline channel; draft autosave in Mini App; clear banners |
| Fake or recycled photos | Overstated progress accepted | Perceptual hash, server timestamps, device vs server time comparison, PM review of evidence |
| PM becomes the bottleneck | Late summaries, ignored reports | Exception-first inbox, SLAs and escalation, delegated reviewer step ready in Phase 2 |
| Reporters resist the form | Low adoption, back to chat | Pre-filled activities, minimal required fields, Khmer UI, test with real foremen before release |
| AI misreads Khmer or low-quality photos | Noise findings, PM distrust | Evaluate on real samples first; enable per project; track PM acceptance rate; disable weak capabilities |
| Prompt injection through reporter text | Manipulated findings or summaries | Untrusted-data prompting, schema validation, insert-only DB role, no tool access |
| Telegram group migration or bot removal | Reports cannot be launched | Migration detection, binding validity, admin alerts, Field App fallback |
| Reporter has not started the bot (cannot receive DMs) | Notifications missed | Fall back to in-app and SMS; onboarding prompts a bot start |
| Offline report from a revoked user | Evidence loss or untrusted data | Accept and flag `REQUIRES_REVIEW` (Auth D11) |
| Quantities treated as payment basis | Overpayment | Separate reported / verified / certified; no write path to IPC |
| Statistical rules fire on cold start | False alarms | Minimum history gate per unit |
| Daily report data too sensitive for group | Data leak to other parties | Status-only group messages; evidence stored in DCOS; WBS-scoped access |
| Telegram platform dependency | Channel disruption | Channel adapters isolate Telegram; Field App and web remain fully functional |
| Report volume growth | Storage and cost | Cold-storage tiering for photos per Gap Analysis §5.1; per-project AI budget |

---

## 25. Items to Verify Before Build

These depend on the current Telegram platform behaviour and should be confirmed against the Bot API and Mini Apps documentation before design is frozen.

1. How a Mini App is launched from within a group (direct link with start parameter vs button type) and what `initData` contains about the chat.
2. Behaviour on basic-group to supergroup migration and the notification the bot receives.
3. Bot privacy mode behaviour: confirm the bot receives only commands and mentions and can still post and pin.
4. Bot permission required to check current group membership at launch.
5. Local storage / IndexedDB limits and service-worker support in the Telegram web views on Android and iOS.
6. Rate limits for bot messaging to groups and users at the planned volume.
7. Whether users who have never opened a private chat with the bot can receive DMs (expected: no).
8. Camera, file, and optional location access available inside Mini Apps on target devices.
9. SMS fallback provider availability and cost in the deployment country.

---

## 26. Open Items for Design Review

| # | Item | Needed For |
|---|---|---|
| O1 | Default reporting deadline and cut-off time per project | Reporting schedule defaults |
| O2 | Minimum evidence policy per discipline | `EVIDENCE_MIN` configuration |
| O3 | Standard trade list and unit-of-measure master | Manpower and quantity forms (link to Master Data Standard) |
| O4 | Activity and BOQ item linkage depth in Phase 1 | `dr_activity_progress.boq_item_id` usage |
| O5 | Whether the PM may approve in bulk for clean reports | Review inbox design |
| O6 | Languages required in Phase 1 (English, Khmer, others) | UI localisation and AI evaluation |
| O7 | Retention and archive policy confirmation for photos | Storage tiering |
| O8 | Which role may publish the official summary when the PM is absent | Delegation rules in Phase 2 |

---

*Digital Construction Operating System — Construction Execution — Module 10-01 Daily Reporting — Internal Controlled Document*
