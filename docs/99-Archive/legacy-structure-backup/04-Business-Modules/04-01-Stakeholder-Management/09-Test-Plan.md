# 09 — Test Plan
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-TEST-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | QA Lead / Test Architect |
| Date | 2026-08-08 |
| Related Documents | DCOS-STK-FS-001, DCOS-STK-UC-001, DCOS-STK-DB-001, DCOS-STK-RBAC-001, DCOS-STK-API-001 |

---

## 1. Test Strategy and Objectives

The module holds no revenue-generating workflow of its own. It fails in one of two ways, and the second is far worse than the first:

| Failure Mode | Symptom | Severity |
|---|---|---|
| **Loud failure** — a workflow halts because no approver is configured | Work stops, somebody is notified, the gap is fixed | Recoverable |
| **Silent failure** — a workflow proceeds routed to a party without authority, or an external party sees data outside their scope | Nobody notices for months. Discovered during a claim, an audit, or a leak. | **Unrecoverable** |

Testing effort is therefore weighted toward proving that silent failures cannot occur. Roughly 40% of the case catalogue is negative, permission, and isolation testing — a proportion that would be excessive for most modules and is correct for this one.

### 1.1 Objectives

1. Verify all 69 functional requirements behave as specified, including exception paths.
2. Prove that tenant isolation cannot be breached by any request shape, role, or code path.
3. Prove that a zero-approver condition always halts and never auto-approves.
4. Prove that external parties cannot exceed their configured scope.
5. Prove that database constraints hold even when the API layer is bypassed.
6. Verify performance targets under realistic tenant volumes.
7. Verify that every state change produces the specified audit entry.

---

## 2. Scope

### 2.1 In Scope

All 15 screens, 49 endpoints, 15 tables plus 3 reference tables, RLS policies, database triggers and constraints, the resolution service, the 17 event contracts, scheduled jobs, and the mobile read-only directory.

### 2.2 Out of Scope

| Excluded | Owner |
|---|---|
| Identity provider internals (password policy, MFA, session store) | Module 02 test plan |
| WBS tree construction and node CRUD | Module 06 test plan |
| Consuming modules' own workflow logic | Their respective test plans — this plan verifies the contract boundary only |
| Supplier prequalification process | Module 17 test plan |
| Object storage durability and CDN behaviour | Infrastructure test plan |

### 2.3 Assumptions

- Modules 02, 05, and 06 are deployed and functional in the test environment.
- Approval Workflow, Notification, and Audit engines expose their R0 contracts.
- A virus-scanning service is available with a known EICAR test response.
- Two fully populated tenants exist for isolation testing.

---

## 3. Test Levels

| Level | Coverage | Tooling | Gate |
|---|---|---|---|
| Unit | Normalisation function, scoring calculation, WBS coverage predicate, validation rules | Vitest / pytest | ≥ 85% line coverage on domain logic |
| Database | Constraints, triggers, RLS policies, index usage | pgTAP | 100% of constraints have a violation test |
| API / Contract | All 49 endpoints, request and response schemas, error codes | Supertest + OpenAPI validation | 100% endpoint coverage |
| Integration | Resolution service against consuming modules, event delivery | Testcontainers | All 18 ITPs from DCOS-STK-INT-001 §10 |
| UI / E2E | 15 screens, critical journeys | Playwright | All P1 journeys |
| Performance | NFR-STK-01 to 16 | k6 | All targets met at p95 |
| Security | 40 negative tests from DCOS-STK-RBAC-001 §14 | Custom suite + OWASP ZAP | 100% pass, zero exceptions |
| UAT | Role-based business scenarios | Manual, scripted | Sign-off by each role owner |

---

## 4. Test Environment and Data

### 4.1 Tenants

| Tenant | Purpose | Contents |
|---|---|---|
| **T-ALPHA** | Primary functional tenant | 3 projects, 412 stakeholders, 1,180 contacts, 47 assignments on Tower A |
| **T-BETA** | Isolation counterpart | 2 projects, 180 stakeholders. Used exclusively to attempt cross-tenant access from T-ALPHA. |
| **T-SCALE** | Performance tenant | 50,000 stakeholders, 500 assignments on one project, 1.4 M performance events |
| **T-EMPTY** | First-run and empty-state testing | Zero stakeholders |

### 4.2 Reference Project — Tower A (T-ALPHA)

```
P001 Tower A
├── B01 Main Building
│   ├── L01 … L22          (22 levels)
│   │   ├── Z01 … Z04      (4 zones per level)
│   │   │   └── R001 …     (rooms)
└── B02 Annex
    └── L01 … L03
```

### 4.3 Seeded Stakeholders

| Fixture | Type | Status | Notes |
|---|---|---|---|
| `SH-CLIENT` Mekong Development Co Ltd | `CLIENT_OWNER` | ACTIVE | `FINAL_APPROVE`, fallback configured |
| `SH-PMC` Angkor PMC | `CONSULTANT` | ACTIVE | `APPROVE`, 7 modules |
| `SH-STR` Angkor Structural Consultants Ltd | `CONSULTANT` | ACTIVE | `APPROVE`, STR only, reliability 74.2 |
| `SH-MEP` Delta MEP Consultants | `CONSULTANT` | ACTIVE | `APPROVE`, MEP only, **no fallback** — for halt testing |
| `SH-SUB-BLK` Mekong Blockwork Co Ltd | `SUBCONTRACTOR` | ACTIVE | WBS scoped B01 L01–L05 |
| `SH-SUB-CW` Delta Curtain Wall | `SUBCONTRACTOR` | ACTIVE | WBS scoped B01 L06–L22 |
| `SH-SUP-EXP` Riverside Cement | `SUPPLIER_VENDOR` | ACTIVE | Public liability insurance **expired 8 days ago** |
| `SH-SUP-SOON` Delta Steel | `SUPPLIER_VENDOR` | ACTIVE | Insurance expires in 5 days |
| `SH-BL` Mekong Interior Solutions Co., Ltd. | `SUBCONTRACTOR` | BLACKLISTED | `CONTRACT_DEFAULT`, identity indexed |
| `SH-SUSP` Angkor Testing Services | `TESTING_AGENCY` | SUSPENDED | Compliance lapse |
| `SH-DUP-A` ABC Trading Co., Ltd. | `SUPPLIER_VENDOR` | ACTIVE | Duplicate-detection fixture |
| `SH-DRAFT` Sunrise Electrical | `SUPPLIER_VENDOR` | DRAFT | Never submitted |
| `SH-PEND` Bayon Geotechnical | `CONSULTANT` | PENDING_APPROVAL | Created by `U-DC` |
| `SH-LOWPERF` Slow Response Consultants | `CONSULTANT` | ACTIVE | Reliability 58%, 2 consecutive months |
| `SH-NEWPERF` Fresh Supplier | `SUPPLIER_VENDOR` | ACTIVE | 6 events only — insufficient data |

### 4.4 Test Users

| User | Role | Scope |
|---|---|---|
| `U-SA` | Super Admin | Platform |
| `U-CA` | Company Admin | T-ALPHA |
| `U-PD` | Project Director | T-ALPHA |
| `U-PM1` | Project Manager | Tower A only |
| `U-PM2` | Project Manager | Riverside only — for cross-project denial |
| `U-DM-STR` | Discipline Manager | STR |
| `U-DC` | Document Controller | T-ALPHA |
| `U-PROC` | Procurement Officer | T-ALPHA |
| `U-QS`, `U-ENG`, `U-QAQC`, `U-HSE`, `U-SUP`, `U-HR`, `U-ACC`, `U-VIEW` | As named | Tower A |
| `U-EXT-CON` | Consultant (external) | `SH-STR`, Tower A, STR |
| `U-EXT-SUB` | Subcontractor (external) | `SH-SUB-BLK`, B01 L01–L05 |
| `U-EXT-CLI` | Client (external) | `SH-CLIENT`, Tower A |
| `U-EXT-SUPP` | Supplier (external) | `SH-SUP-EXP` |
| `U-BETA` | Company Admin | **T-BETA** — the cross-tenant attacker |

---

## 5. Entry and Exit Criteria

| Level | Entry | Exit |
|---|---|---|
| Unit | Code complete for the component | ≥ 85% coverage, zero failures |
| Database | Migrations 001–016 applied | Every constraint has a passing violation test; RLS verification query returns zero rows |
| API | Deployed to dev, seed data loaded | 100% endpoint coverage; all error codes exercised |
| Integration | Consuming module stubs available | All 18 ITPs pass |
| E2E | UI deployed to staging | All P1 journeys pass on Chrome, Safari, and Android Chrome |
| Performance | T-SCALE loaded | All NFR targets met at p95 over a 30-minute soak |
| Security | Full suite deployed | **All 40 negative tests pass with zero exceptions.** No waivers permitted at this gate. |
| UAT | Staging stable for 3 days | Sign-off from Company Admin, Project Manager, Document Controller, and one external consultant |

---

## 6. Test Case Catalogue

Priority: **P1** blocking · **P2** major · **P3** minor.
Type: **F** functional · **N** negative · **I** integration · **S** security · **P** performance · **U** usability.
Auto: **Y** automated · **M** manual · **C** automation candidate.

---

### 6.1 Register and Search — 8 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-REG-001 | Register loads with correct columns | FR-STK-001 | `U-DC` in T-ALPHA | Open Admin → Stakeholder Management | Six columns render; 412 rows; 50 per page; `EXT` badge on external rows | P1 | F | Y |
| TC-STK-REG-002 | Type filter counts are accurate | FR-STK-002 | 412 stakeholders seeded | Read counts in left panel; compare to direct DB count per type | Every count matches exactly; total equals sum | P1 | F | Y |
| TC-STK-REG-003 | Type filter switches without reload | FR-STK-002 | Register open | Click Consultant, then Supplier, then All | Rows update in place; no full page reload; active type highlighted | P2 | F | Y |
| TC-STK-REG-004 | Instant search across four fields | FR-STK-003 | Register open | Search "Sok Dara" (contact), then "Angkor" (org), then "STR_CONSULTANT" (role) | Each returns the expected records; results update without page reload | P1 | F | Y |
| TC-STK-REG-005 | Search below minimum length | FR-STK-003 | Register open | Type "A" | No query fired; full list retained | P3 | F | Y |
| TC-STK-REG-006 | Combined filters apply as AND | FR-STK-004 | Register open | Filter: type Supplier + status Active + expiry within 30 days | Returns only `SH-SUP-SOON` and `SH-SUP-EXP`; chips shown for all three filters | P1 | F | Y |
| TC-STK-REG-007 | Export respects filters and role masking | FR-STK-006 | `U-PROC` logged in | Filter to suppliers; export XLSX | File contains only suppliers; no `notes`, no performance columns | P1 | F | C |
| TC-STK-REG-008 | Empty tenant first-run state | FR-STK-001 | `U-CA` in T-EMPTY | Open register | Empty state with Add and Import actions; no error; no skeleton persisting | P2 | U | M |

---

### 6.2 Create and Duplicate Detection — 8 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-CRE-001 | Create consultant end to end | FR-STK-007, UC-001 | `U-DC` | Complete all four drawer steps; save | Record created in `DRAFT`; `STK.STAKEHOLDER.CREATED` audited | P1 | F | Y |
| TC-STK-CRE-002 | Khmer script name persists correctly | FR-STK-015 | `U-DC` | Enter `full_name_local` "សុខ ដារា"; save; reload | Characters render identically; no mojibake; no glyph boxes | P1 | F | Y |
| TC-STK-CRE-003 | Exact registration number blocks hard | FR-STK-008 | `SH-DUP-A` exists with reg 00012345 | Create new with same registration number | 422 `DUPLICATE_IDENTITY`; no override offered; existing record linked | P1 | N | Y |
| TC-STK-CRE-004 | Fuzzy name match soft-blocks | FR-STK-008 | `SH-DUP-A` = "ABC Trading Co., Ltd." | Create "A.B.C. Trading" | 422 `FUZZY_DUPLICATE`, similarity ≥ 0.85, candidate shown, two options offered | P1 | N | Y |
| TC-STK-CRE-005 | Confirm-distinct override with reason | FR-STK-008 | Following TC-004 | Resubmit with `confirm_distinct=true` and reason | 201 created; reason stored and retrievable in audit | P1 | F | Y |
| TC-STK-CRE-006 | Confirm-distinct without reason rejected | FR-STK-008 | Following TC-004 | Resubmit with `confirm_distinct=true`, reason null | 400 `VALIDATION_FAILED` on `confirm_distinct_reason` | P2 | N | Y |
| TC-STK-CRE-007 | Blacklist identity variant blocked | FR-STK-009, UC-002 E1 | `SH-BL` blacklisted | Create "Mekong Interiors (Cambodia) Ltd" | 422 `BLACKLIST_IDENTITY_MATCH`; `CRITICAL` audit; Company Admin notified; no record created | P1 | S | Y |
| TC-STK-CRE-008 | Self-approval of own registration blocked | FR-STK-011 | `SH-PEND` created by `U-DC`; `U-DC` also granted approve permission temporarily | `U-DC` attempts approve | 422 `SELF_APPROVAL_FORBIDDEN`; status unchanged | P1 | N | Y |

---

### 6.3 Contacts and Compliance Documents — 6 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-CON-001 | Primary contact swap is atomic | FR-STK-016, UC-016 | `SH-STR` has primary `C-A` | Set `C-B` as primary | `C-B` primary, `C-A` demoted; at no point are two or zero primary | P1 | F | Y |
| TC-STK-CON-002 | Deactivation blocked by sole-approver rule | FR-STK-017, UC-016 E1 | `C-A` is sole approver on 2 open items | Deactivate `C-A` | 422 `OPEN_OBLIGATIONS_EXIST` with both items listed by reference and age | P1 | N | Y |
| TC-STK-CON-003 | Deactivation revokes linked external login | FR-STK-017 E3 | `C-A` has an `ACTIVE` link | Deactivate after clearing obligations | Link → `REVOKED`; `STK.EXTERNAL_USER.REVOKED` at `CRITICAL`; session invalidated | P1 | I | Y |
| TC-STK-DOC-001 | Upload with virus scan | FR-STK-018 | `U-DC` | Upload a clean PDF, then an EICAR test file | Clean file stored; EICAR quarantined with 422 `VIRUS_DETECTED`; no metadata row created for the infected file | P1 | S | Y |
| TC-STK-DOC-002 | Expiry indicator bands | FR-STK-018 | Documents at +90, +45, +20, +5, −8 days | Open compliance register | Bands render green / amber / amber+bg / red+bg / expired with "Expired 8 days ago" | P2 | U | C |
| TC-STK-DOC-003 | Download URL expires | FR-STK-022 | Signed URL obtained | Wait 16 minutes; use the URL | 403 from storage; `STK.DOCUMENT.DOWNLOADED` audited only for the successful fetch | P1 | S | Y |

---

### 6.4 Project Assignment — 10 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-ASG-001 | Assign client with FINAL_APPROVE | FR-STK-023, UC-003 | `SH-CLIENT` active | Full assignment flow with authority, access, responsibilities | Assignment `ACTIVE`; resolution returns the client for VO and IPC steps | P1 | F | Y |
| TC-STK-ASG-002 | Duplicate assignment blocked | FR-STK-024 | `SH-STR` already assigned to Tower A | Assign again | 409 `DUPLICATE_ASSIGNMENT` with a link to the existing assignment | P1 | N | Y |
| TC-STK-ASG-003 | Re-assign after termination permitted | FR-STK-024 | Prior assignment `TERMINATED` | Create a new assignment | 201 — the partial unique index excludes terminated rows | P2 | F | Y |
| TC-STK-ASG-004 | Assign draft stakeholder blocked | FR-STK-023 | `SH-DRAFT` | Attempt assignment | 422 `STAKEHOLDER_NOT_ACTIVE` naming the actual status | P1 | N | Y |
| TC-STK-ASG-005 | Assign suspended stakeholder blocked | FR-STK-023 | `SH-SUSP` | Attempt assignment | 422 `STAKEHOLDER_NOT_ACTIVE`; suspension reason shown to roles with detail permission | P1 | N | Y |
| TC-STK-ASG-006 | Assign blacklisted stakeholder blocked | FR-STK-023, UC-009 | `SH-BL` | Attempt assignment as `U-PM2` on a different project | 422 `STAKEHOLDER_BLACKLISTED`; reason visible to `U-PM2` who holds detail permission; audited | P1 | N | Y |
| TC-STK-ASG-007 | Activation gate — no authority | FR-STK-025 | Assignment in `DRAFT`, no authority set | Activate | 422 `ASSIGNMENT_NO_AUTHORITY` with the `readiness` object; database trigger also raises if API bypassed | P1 | N | Y |
| TC-STK-ASG-008 | Activation gate — no responsibility | FR-STK-025 | Authority and access set, no toggles | Activate | 422 `ASSIGNMENT_NO_RESPONSIBILITY` | P1 | N | Y |
| TC-STK-ASG-009 | Readiness checklist accuracy | FR-STK-025 | Partial configuration | GET assignment | `readiness` reflects exactly which of the four items are satisfied | P2 | F | Y |
| TC-STK-ASG-010 | Role change with in-flight items requires reason | FR-STK-026 | 3 items routed to the assignment | Change role without `change_reason` | 400 `VALIDATION_FAILED`; with reason → 200 and `STK.ASSIGNMENT.ROLE_CHANGED` audited | P2 | F | Y |

---

### 6.5 Approval Authority — 8 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-AUT-001 | Scoped authority — most specific wins | FR-STK-031 | Rules: `ALL/ALL` = REVIEW_ONLY, `DOC/STR_SHOP_DRAWING` = APPROVE | Resolve for a STR shop drawing | Returns APPROVE, not REVIEW_ONLY; `matched_scope` names the specific rule | P1 | F | Y |
| TC-STK-AUT-002 | Null authority rejected on activation | FR-STK-031 | — | Activate with no authority row | 422; trigger `ASSIGNMENT_NO_AUTHORITY` fires even on direct SQL insert | P1 | N | Y |
| TC-STK-AUT-003 | Threshold only on APPROVE | FR-STK-032 | — | Set threshold on `REVIEW_ONLY` | 422; CHECK constraint `chk_auth_threshold` also blocks direct SQL | P2 | N | Y |
| TC-STK-AUT-004 | Threshold applied in resolution | FR-STK-032 | Approver threshold USD 50,000 | Resolve for a PO of USD 48,200, then USD 62,000 | First returns the approver; second escalates past them to a higher authority | P1 | F | Y |
| TC-STK-AUT-005 | Self-referencing fallback rejected | FR-STK-033 | — | Set fallback to the same assignment | 422 `INVALID_FALLBACK_APPROVER`; CHECK constraint blocks direct SQL | P1 | N | Y |
| TC-STK-AUT-006 | Lower-authority fallback rejected | FR-STK-033 | Candidate holds `REVIEW_ONLY` | Set as fallback for an `APPROVE` rule | 422 `INVALID_FALLBACK_APPROVER` | P1 | N | Y |
| TC-STK-AUT-007 | In-flight re-route choice honoured | FR-STK-031, UC-006 | 4 items in flight | Change authority with `in_flight_action=KEEP`, then `REROUTE` | KEEP: items retain original approver. REROUTE: all 4 move; both approvers notified; `in_flight_rerouted: 4` returned | P1 | I | Y |
| TC-STK-AUT-008 | Gap simulation warns without blocking | FR-STK-034 | Config leaves L18–L22 unroutable | Save authority | 200 with `AUTHORITY_GAP` warning; gap appears on the project matrix; `STK.AUTHORITY.GAP_DETECTED` audited | P2 | F | Y |

---

### 6.6 Access Control and WBS Scope — 10 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-ACC-001 | FULL_ACCESS rejected for external — API | FR-STK-036 | `SH-STR` external | PUT access-scope with `FULL_ACCESS` | 422 `EXTERNAL_FULL_ACCESS_FORBIDDEN` | P1 | N | Y |
| TC-STK-ACC-002 | FULL_ACCESS rejected for external — database | FR-STK-036 | Same | Direct SQL insert bypassing the API | CHECK constraint `chk_access_external_not_full` raises | P1 | S | Y |
| TC-STK-ACC-003 | LIMITED_ACCESS requires modules | FR-STK-037 | — | Save with empty module array | 422; CHECK constraint also blocks direct SQL | P2 | N | Y |
| TC-STK-ACC-004 | WBS grant inherits to descendants | FR-STK-038 | Grant on `B01-L03` | Access check on `B01-L03-Z02-R014` | Allowed via ancestor path containment | P1 | F | Y |
| TC-STK-ACC-005 | WBS grant does not reach siblings | FR-STK-038 | Grant on `B01-L03` | Access check on `B01-L04` | Denied, failing dimension `wbs_scope`, HTTP 404 | P1 | S | Y |
| TC-STK-ACC-006 | WBS grant does not reach ancestors | FR-STK-038 | Grant on `B01-L03` | Access check on `B01` root record | Denied | P1 | S | Y |
| TC-STK-ACC-007 | Redundant descendant grants collapse | FR-STK-038 | Grant `B01` then `B01-L03` | Save both | `redundant_collapsed: 1`; only the ancestor grant stored; coverage unchanged | P3 | F | Y |
| TC-STK-ACC-008 | Node from another project rejected | FR-STK-038 | — | Grant a Riverside node on a Tower A assignment | 422 `VALIDATION_FAILED` | P2 | N | Y |
| TC-STK-ACC-009 | Project root grant requires confirmation | FR-STK-038, UC-004 E2 | Subcontractor assignment | Grant the project root without `confirm_project_root` | 422 with an explanatory message; with the flag → 200 | P2 | F | Y |
| TC-STK-ACC-010 | Confidentiality tier caps external parties | FR-STK-040 | External assignment | Set `max_confidentiality_tier` to 4 | 422; CHECK constraint enforces ≤ 2 for external | P1 | S | Y |

---

### 6.7 Workflow Responsibility — 4 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-RSP-001 | Toggle persists with attribution | FR-STK-042 | — | Enable `DOCUMENT_REVIEW` | Enabled; `enabled_by` and `enabled_at` recorded and displayed | P2 | F | Y |
| TC-STK-RSP-002 | INSPECTION_APPROVAL requires APPROVE | FR-STK-043 | Assignment holds `REVIEW_ONLY` | Enable `INSPECTION_APPROVAL` | 422 directing the user to set authority first; UI shows the toggle disabled with the same explanation | P1 | N | Y |
| TC-STK-RSP-003 | PAYMENT_CERTIFICATION requires APPROVE | FR-STK-043 | Same | Enable `PAYMENT_CERTIFICATION` | 422 | P1 | N | Y |
| TC-STK-RSP-004 | Disabling with in-flight items blocked | FR-STK-044 | 2 documents awaiting review | Disable `DOCUMENT_REVIEW` | 422 `OPEN_OBLIGATIONS_EXIST` listing both | P1 | N | Y |

---

### 6.8 External User Provisioning — 6 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-EXT-001 | Provision and first login | FR-STK-045, UC-005 | `SH-STR` assignment `ACTIVE` | Provision, accept invitation, log in | Link `INVITED` → `ACTIVE`; scope matches `effective_access_preview` exactly | P1 | I | Y |
| TC-STK-EXT-002 | Access preview matches runtime enforcement | FR-STK-045 | Following TC-001 | Compare preview payload to actual accessible modules, disciplines, and WBS | Every element matches; no module accessible that the preview excluded | P1 | S | Y |
| TC-STK-EXT-003 | Invitation token single-use and expiring | FR-STK-046 | Invitation issued | Accept once, then reuse the token; separately, wait 8 days and use | Second use rejected; expired token rejected with a re-invite offer | P1 | S | Y |
| TC-STK-EXT-004 | Resend invalidates the prior token | FR-STK-046 | Invitation issued | Resend, then attempt the original token | Original rejected; new token works | P2 | S | Y |
| TC-STK-EXT-005 | Termination revokes within one hour | FR-STK-029, UC-010 | External user logged in | Terminate the assignment | Link `REVOKED`; next request 401; measured within 60 minutes | P1 | I | Y |
| TC-STK-EXT-006 | Nightly orphan reconciliation | FR-STK-048 | Link left `ACTIVE` with a terminated assignment via direct SQL | Run the nightly job | Link revoked; `HIGH` severity audit entry; ops alert raised | P1 | I | Y |

---

### 6.9 Status Lifecycle and Blacklist — 8 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-STA-001 | Suspend freezes and escalates | FR-STK-049, UC-007 E1 | `SH-STR` with 2 in-flight approvals and a fallback | Suspend with reason | 3 assignments frozen; both approvals escalate to fallback within 60 s; response reports counts | P1 | I | Y |
| TC-STK-STA-002 | **Suspend with no fallback halts, never approves** | FR-STK-049 | `SH-MEP` — no fallback configured — with 1 in-flight approval | Suspend | Item **halts**; `halted_approvals` returned; `STK.RESOLUTION.NO_APPROVER` at `CRITICAL`; item is **not** approved, **not** skipped | **P1** | **S** | Y |
| TC-STK-STA-003 | Reinstate blocked while cause persists | FR-STK-050 | `SH-SUP-EXP` suspended for expired insurance | Reinstate without uploading a valid certificate | 422 with `blocking_causes[]` naming the document | P1 | N | Y |
| TC-STK-STA-004 | Reinstate succeeds after cause cleared | FR-STK-050 | Following TC-003, valid certificate uploaded | Reinstate | `ACTIVE`; frozen assignments restored to prior state | P1 | F | Y |
| TC-STK-STA-005 | Blacklist requires exact name match | FR-STK-051 | `SH-STR` active | Submit with `confirm_legal_name` differing by one character | 422 `CONFIRMATION_MISMATCH`; no state change | P1 | N | Y |
| TC-STK-STA-006 | Blacklist cascades tenant-wide | FR-STK-051, UC-008 | Stakeholder on 2 projects with 4 external logins | Blacklist correctly | Both assignments `TERMINATED`; all 4 logins revoked; identity indexed; 14 open items surfaced; `CRITICAL` audit; PMs and Procurement notified | P1 | I | Y |
| TC-STK-STA-007 | Unblacklist returns to INACTIVE not ACTIVE | FR-STK-052 | `SH-BL` blacklisted | Unblacklist with justification | Status `INACTIVE`; assignment still blocked until re-verification | P1 | F | Y |
| TC-STK-STA-008 | Status history is append-only | FR-STK-053 | Several transitions recorded | Attempt UPDATE and DELETE on `stakeholder_status_history` as `dcos_app` | Permission denied at the database for both | P1 | S | Y |

---

### 6.10 Performance Tracking — 5 cases

| ID | Title | FR/UC | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-PRF-001 | Score computed from weighted events | FR-STK-056 | `SH-STR`, 47 events, default weights | Run nightly job | Score 74.2 ± 0.1; matches independent calculation from the ledger | P1 | F | Y |
| TC-STK-PRF-002 | Insufficient data shows no score | FR-STK-056 | `SH-NEWPERF`, 6 events | Open performance panel | "Insufficient data — 6 of 10 events required"; score null, **not zero** | P1 | F | Y |
| TC-STK-PRF-003 | Duplicate event rejected | FR-STK-055 | Event already ingested | POST the same source entity and event type again | 200 with `duplicate: true`; ledger count unchanged; score unaffected | P1 | I | Y |
| TC-STK-PRF-004 | Threshold breach notifies once per crossing | FR-STK-058 | Score crosses below 80 | Run the job three consecutive nights | Exactly one notification, on the crossing night | P2 | I | Y |
| TC-STK-PRF-005 | Score is not writable by any role | FR-STK-059 | — | Attempt write as `U-CA`, `U-PD`, `U-SA` | No endpoint exists; direct SQL as `dcos_app` denied by grant | P1 | S | Y |

---

### 6.11 Integration and Resolution Service — 8 cases

| ID | Title | ITP | Precondition | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-INT-001 | Approver resolution ordering | ITP-01, UC-011 | Fully configured Tower A | Resolve STR shop drawing at `B01-L05-Z03` | Ordered list: STR consultant (`APPROVE`) then client (`FINAL_APPROVE`); `authority_snapshot` present on each | P1 | I | Y |
| TC-STK-INT-002 | **Zero approver halts with diagnostics** | ITP-02 | No approver covers `B01-L18` | Resolve there | 422 `NO_ELIGIBLE_APPROVER`; `failing_dimension: wbs_scope`; `CRITICAL` notification; **result not cached** | **P1** | **S** | Y |
| TC-STK-INT-003 | Cache invalidation on authority change | ITP-03 | Result cached | Change authority; resolve again immediately | New result on the first call after the change; no stale approver | P1 | I | Y |
| TC-STK-INT-004 | Zero-approver result is never cached | ITP-02 | Zero-approver condition | Resolve, fix the gap, resolve again | Second call returns the approver immediately, not after TTL | P1 | I | Y |
| TC-STK-INT-005 | WBS deletion guard blocks | ITP-12, UC-004 E3 | `SH-SUB-BLK` scoped to `B01-L03` | Attempt to delete `B01-L03` in WBS Management | Deletion blocked; blocking assignment named | P1 | I | Y |
| TC-STK-INT-006 | WBS move re-materialises paths | ITP-13 | Grant on `B01-L03`; move `L03` under `B02` | Perform the move | `wbs_path` updated in the same transaction; effective scope unchanged; cache invalidated | P1 | I | Y |
| TC-STK-INT-007 | Supplier eligibility blocks on expired document | ITP-11 | `SH-SUP-EXP` | Call eligibility before RFQ | `eligible: false`, reason `COMPLIANCE_EXPIRED` with the document named | P1 | I | Y |
| TC-STK-INT-008 | Audit write failure rolls back the action | ITP-15 | Audit sink forced to fail | Change approval authority | Authority unchanged; transaction rolled back; error surfaced to the user | P1 | S | C |

---

### 6.12 Permission and Negative Tests — 12 cases

Mapped from DCOS-STK-RBAC-001 §14. The full 40-item list is executed; these twelve are the representative gate set.

| ID | Title | RBAC Ref | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-PRM-001 | PM acts on another PM's project | NEG-05 | `U-PM2` sets authority on Tower A | 404 — not 403 | P1 | S | Y |
| TC-STK-PRM-002 | Discipline Manager crosses discipline | NEG-06 | `U-DM-STR` toggles responsibility on an MEP assignment | 403 | P1 | S | Y |
| TC-STK-PRM-003 | Procurement Officer edits a consultant | NEG-07 | `U-PROC` PATCHes `SH-STR` | 404 — type out of scope | P1 | S | Y |
| TC-STK-PRM-004 | HR Officer lists external stakeholders | NEG-08 | `U-HR` GETs the register | Only `INTERNAL_DEPARTMENT` rows; empty result, not an error | P2 | S | Y |
| TC-STK-PRM-005 | Accountant receives masked payload | NEG-09 | `U-ACC` GETs a supplier | `notes`, `reliability_score`, performance fields **absent** from the payload — not null | P1 | S | Y |
| TC-STK-PRM-006 | Document Controller attempts blacklist | NEG-10 | `U-DC` POSTs blacklist | 403 + audit | P1 | S | Y |
| TC-STK-PRM-007 | Viewer attempts export | NEG-33 | `U-VIEW` POSTs export | 403 | P2 | S | Y |
| TC-STK-PRM-008 | External user calls a write endpoint | NEG-30 | `U-EXT-CON` PATCHes their own stakeholder | 403 + audit | P1 | S | Y |
| TC-STK-PRM-009 | REVIEW_ONLY party attempts approval | NEG-29 | `U-EXT-CON` calls approve on a submittal | 403 `INSUFFICIENT_AUTHORITY` | P1 | S | Y |
| TC-STK-PRM-010 | Subcontractor reads outside WBS scope | NEG-27, UC-004 | `U-EXT-SUB` GETs a task on `B01-L07` | 404 + `STK.ACCESS.DENIED` with `failing_dimension: wbs_scope` | P1 | S | Y |
| TC-STK-PRM-011 | Client reads a tier-4 document | NEG-28, UC-018 | `U-EXT-CLI` opens an internal cost document link | 404; no title, metadata, or file name leaked | P1 | S | Y |
| TC-STK-PRM-012 | Repeated external denials raise an alert | NEG-32 | `U-EXT-CLI` triggers 5 denials in 10 minutes | `CRITICAL` notification to Company Admin | P2 | S | C |

---

### 6.13 Multi-Tenant Isolation — 6 cases

**These six are a CI/CD gate.** A failure blocks the build, not just the release. This implements the automated cross-tenant leak testing required by the R1 gap analysis.

| ID | Title | RBAC Ref | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-TEN-001 | Cross-tenant read by ID | NEG-01, UC-019 | `U-CA` (T-ALPHA) GETs a T-BETA stakeholder ID | 404 — never 403; `CRITICAL` audit; zero rows at the database | **P1** | **S** | Y |
| TC-STK-TEN-002 | Body tenant_id overrides claim | NEG-02 | POST with `tenant_id` of T-BETA in the body, T-ALPHA in the JWT | 400 `TENANT_MISMATCH`; `CRITICAL` audit; the body value is never used | **P1** | **S** | Y |
| TC-STK-TEN-003 | Query without session tenant | NEG-03 | Execute a query with `app.tenant_id` unset | Zero rows — RLS fails closed against NULL | **P1** | **S** | Y |
| TC-STK-TEN-004 | Table owner bypass attempt | NEG-04 | Connect as table owner; SELECT all rows | `FORCE ROW LEVEL SECURITY` applies; no bypass | **P1** | **S** | Y |
| TC-STK-TEN-005 | Super Admin without impersonation | NEG-34 | `U-SA` GETs a T-BETA record with no impersonation session | 404; with a valid impersonation session → 200 plus a `CRITICAL` audit entry naming target tenant and reason | **P1** | **S** | Y |
| TC-STK-TEN-006 | Untenanted background job | NEG-36 | Start the expiry scan without tenant scope | Job rejected at start-up; no cross-tenant iteration possible | **P1** | **S** | Y |

---

### 6.14 Performance and Load — 5 cases

Executed against **T-SCALE**.

| ID | Title | NFR | Load | Target | Pri | Type |
|---|---|---|---|:--:|:--:|:--:|
| TC-STK-PERF-001 | Register first page | NFR-STK-01 | 50,000 stakeholders, 100 concurrent users | < 1.5 s p95 | P1 | P |
| TC-STK-PERF-002 | Instant search | NFR-STK-02 | 50,000 stakeholders, 200 searches/min | < 300 ms p95 | P1 | P |
| TC-STK-PERF-003 | Approver resolution — cached and cold | NFR-STK-04, 05 | 2,000 resolutions/min, 500 assignments on one project | < 50 ms cached, < 200 ms cold, p95 | P1 | P |
| TC-STK-PERF-004 | Access check under external load | NFR-STK-06 | 500 concurrent external users | < 30 ms p95 | P1 | P |
| TC-STK-PERF-005 | Nightly expiry scan and scoring | FR-STK-020, 056 | 50,000 stakeholders, 1.4 M events | Expiry scan < 30 s/tenant; scoring completes within the maintenance window | P2 | P |

Each performance run includes a 30-minute soak to expose connection leaks and cache growth. Index usage is verified with `EXPLAIN ANALYZE` — a target met by sequential scan on a small dataset is not a pass.

---

### 6.15 Mobile and Offline — 4 cases

| ID | Title | FR | Steps | Expected | Pri | Type | Auto |
|---|---|---|---|---|:--:|:--:|:--:|
| TC-STK-MOB-001 | Directory loads and searches offline | FR-STK-068 | Sync, enable airplane mode, search | Directory searchable; phone and Telegram taps work | P1 | F | M |
| TC-STK-MOB-002 | Cache age and staleness warning | FR-STK-069 | Set cache age to 9 days | Persistent amber bar: "Directory last updated 9 days ago." | P2 | U | M |
| TC-STK-MOB-003 | **No approval resolution offline** | FR-STK-068 | Offline; attempt any action requiring authority resolution | Action unavailable; no on-device decision computed under any circumstance | **P1** | **S** | M |
| TC-STK-MOB-004 | Scope respected in the mobile directory | FR-STK-068 | `U-EXT-SUB` opens the directory | Only their own organisation and project-visible parties; no other subcontractors | P1 | S | M |

---

**Catalogue total: 90 cases** across 15 areas, meeting the 80-case minimum with the negative, permission, and isolation suites carrying 32 of them.

---

## 7. Security Test Suite

Beyond the RBAC negative list, the following are executed as a dedicated suite:

| ID | Test | Expected |
|---|---|---|
| SEC-01 | IDOR sweep across all 49 endpoints using T-BETA resource IDs | 404 on every endpoint; zero 403s; zero 200s |
| SEC-02 | JWT signature tampering | 401; no partial processing |
| SEC-03 | JWT `tenant_id` claim modification with a valid signature from another tenant's key | 401 — keys are per-environment, not per-tenant; a cross-signed token is invalid |
| SEC-04 | Expired JWT | 401 |
| SEC-05 | Privilege escalation via role claim manipulation | Signature verification fails; 401 |
| SEC-06 | SQL injection in `q`, `sort`, and `fields` parameters | Parameterised queries; no injection; malformed `sort` returns 400 |
| SEC-07 | Path traversal in `storage_key` on document download | Rejected; keys are server-generated, never client-supplied |
| SEC-08 | Signed URL replay after expiry | 403 from storage |
| SEC-09 | Signed URL for another tenant's document | 404 at the API before a URL is ever issued |
| SEC-10 | Mass assignment — sending `status`, `tenant_id`, `version`, `reliability_score` in a create body | Fields ignored; allowlist-based binding |
| SEC-11 | Rate limit enforcement and bypass attempts via header spoofing | 429 enforced per tenant from the JWT claim, not from a header |
| SEC-12 | Webhook signature forgery | Rejected by HMAC verification |
| SEC-13 | Service-auth endpoints reachable from the public edge | Not routable; connection refused at the gateway |
| SEC-14 | Sensitive data in logs | No tokens, no signed URLs, no `reason_text`, no personal contact data in application logs |
| SEC-15 | Service-role key exposure in client bundles | Static analysis of the built bundle finds no service key |

---

## 8. Integration Test Scenarios

Full chains, executed end to end rather than at the contract boundary only.

| ID | Scenario | Chain | Assertions |
|---|---|---|---|
| ITS-01 | Assign → submit → resolve → notify → audit | Assign STR consultant with `APPROVE` → Document Control submits a shop drawing → resolution returns the consultant → notification delivered → audit written with authority snapshot | Every link fires; snapshot matches the authority at routing time |
| ITS-02 | Authority change mid-flight | 4 items in flight → change authority with `REROUTE` → both parties notified → audit shows both routings | Historical routing remains explainable |
| ITS-03 | Suspension escalation | Suspend a consultant with 2 in-flight items and a fallback → items escalate → fallback notified | No item stalls silently |
| ITS-04 | Suspension halt | Suspend `SH-MEP` (no fallback) with 1 item → item halts → `CRITICAL` raised | Item is not approved and not skipped |
| ITS-05 | Termination handover | Terminate with 6 open items → reassign 5, orphan 1 with reason → logins revoked | No obligation left unowned; orphan decision audited |
| ITS-06 | Blacklist cascade | Blacklist → 2 assignments terminated → 4 logins revoked → 14 items surfaced → identity indexed → variant registration blocked | Full cascade in one transaction boundary where possible |
| ITS-07 | Compliance expiry to suspension to procurement block | Document expires → auto-suspend → procurement eligibility fails → PO blocked | The chain from a calendar date to a blocked purchase order |
| ITS-08 | External lifecycle | Provision → invite → accept → scoped access verified → assignment terminated → revoked → 401 | Preview matches enforcement at every step |

---

## 9. UAT Scenarios by Role

| Role | Scenario | Success Criterion |
|---|---|---|
| Company Admin | Onboard a tenant: import 480 legacy rows, resolve duplicates, verify 50 records, configure scoring weights | Completed in one working day without IT support |
| Project Manager | Mobilise Tower A from an empty register to a complete approval matrix | Matrix shows zero defects; first document routes correctly on the first attempt |
| Document Controller | One month of daily operation: 40 new contacts, 25 document uploads, monthly expiry review | No expired mandatory documents at month end; no duplicate organisations created |
| Project Director | Review performance across the portfolio and act on a threshold breach | Evidence located and exported in under 5 minutes |
| Procurement Officer | Build an RFQ distribution list of compliant, non-blacklisted steel suppliers | List produced in under 3 minutes; every supplier on it is genuinely eligible |
| QS Engineer | Verify payment certification authority before an IPC cycle | Correct certifier identified without asking the PM |
| Site Supervisor | Find a subcontractor's site manager number, offline, on a phone | Under 15 seconds, three taps |
| External Consultant | Receive an invitation, log in, review a structural submittal | Sees exactly the scope shown in the access preview and nothing more |
| External Client | Review the project party list and a progress document | Cannot reach cost data by any route, including direct links |

---

## 10. Regression Suite

Executed on every release. Approximately 45 minutes.

| Group | Cases |
|---|---|
| Tenant isolation gate | TC-STK-TEN-001 to 006 — **build-blocking** |
| Zero-approver behaviour | TC-STK-INT-002, 004; TC-STK-STA-002 |
| Activation gates | TC-STK-ASG-007, 008 |
| External access constraints | TC-STK-ACC-001, 002, 010; TC-STK-PRM-008 to 011 |
| Duplicate and blacklist | TC-STK-CRE-003, 004, 007; TC-STK-ASG-006 |
| Append-only integrity | TC-STK-STA-008; TC-STK-PRF-005 |
| Core journeys | TC-STK-REG-001; TC-STK-CRE-001; TC-STK-ASG-001; TC-STK-EXT-001 |

---

## 11. Defect Severity and Triage

| Severity | Definition | Examples | Response |
|---|---|---|---|
| **S1 Critical** | Silent failure, data leak, or unauthorised authority | Cross-tenant read; workflow auto-approves with no approver; external party sees out-of-scope data; audit entry missing on a state change | Stop the release. Fix before any other work. |
| **S2 High** | Blocks a core journey or produces incorrect authority routing | Cannot activate a valid assignment; resolution returns the wrong approver; revocation does not fire | Fix before release |
| **S3 Medium** | Workaround exists; incorrect non-critical behaviour | Type counts stale beyond 5 s; expiry band renders at the wrong threshold | Fix in the release if capacity allows |
| **S4 Low** | Cosmetic or minor usability | Column width, microcopy wording, sort order on a secondary field | Backlog |

Any defect in §6.13 (tenant isolation) or the zero-approver behaviour is **automatically S1**, regardless of how unlikely the trigger appears. These are the two failure modes this module exists to prevent.

---

## 12. Traceability Matrix

| Area | Functional Requirements | Use Cases | Test Cases |
|---|---|---|---|
| Register and search | FR-STK-001 to 006 | UC-015 | TC-STK-REG-001 to 008 |
| Create and duplicates | FR-STK-007 to 013 | UC-001, 002 | TC-STK-CRE-001 to 008 |
| Contacts | FR-STK-014 to 017 | UC-016 | TC-STK-CON-001 to 003 |
| Compliance documents | FR-STK-018 to 022 | UC-007, 017 | TC-STK-DOC-001 to 003 |
| Assignment | FR-STK-023 to 030 | UC-003, 004, 009, 010 | TC-STK-ASG-001 to 010 |
| Approval authority | FR-STK-031 to 035 | UC-006 | TC-STK-AUT-001 to 008 |
| Access and WBS scope | FR-STK-036 to 041 | UC-004, 018 | TC-STK-ACC-001 to 010 |
| Workflow responsibility | FR-STK-042 to 044 | UC-003 | TC-STK-RSP-001 to 004 |
| External provisioning | FR-STK-045 to 048 | UC-005 | TC-STK-EXT-001 to 006 |
| Status lifecycle | FR-STK-049 to 054 | UC-007, 008 | TC-STK-STA-001 to 008 |
| Performance | FR-STK-055 to 059 | UC-013, 014 | TC-STK-PRF-001 to 005 |
| Resolution service | FR-STK-060 to 065 | UC-011, 012 | TC-STK-INT-001 to 008 |
| Import and mobile | FR-STK-066 to 069 | UC-020 | TC-STK-MOB-001 to 004 |
| Permissions | All | UC-018, 019 | TC-STK-PRM-001 to 012, NEG-01 to 40 |
| Tenant isolation | FR-STK-039, 064 | UC-019 | TC-STK-TEN-001 to 006 |
| Non-functional | NFR-STK-01 to 16 | — | TC-STK-PERF-001 to 005 |

---

## 13. Open Questions

| ID | Question | Impact |
|---|---|---|
| Q-33 | Should the six tenant-isolation cases block the build, or only the release? Blocking the build slows development but is the only way to guarantee they are never skipped under deadline pressure. | CI policy |
| Q-34 | Is a 60-minute revocation window testable deterministically in CI, or does it need a shortened test configuration? | TC-STK-EXT-005 |
| Q-35 | Does T-SCALE at 50,000 stakeholders represent a realistic ceiling, or should it be 200,000 for a multi-year horizon? | Performance targets |
| Q-36 | Should the mobile offline cases be automated on real devices, or is emulator coverage sufficient? | Test infrastructure |

---

## 14. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 90 test cases, 15 security tests, 8 integration scenarios, traceability | QA Lead |

---

**End of Document**
