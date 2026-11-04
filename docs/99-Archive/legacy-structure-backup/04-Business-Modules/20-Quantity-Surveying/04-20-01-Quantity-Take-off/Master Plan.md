# MASTER IMPLEMENTATION PROMPT
## DCOS — Quantity Take-off Module

**Module ID:** `04-20-01`  
**Module Name:** Quantity Take-off  
**Specification Version:** 1.1  
**Product:** Digital Construction Operating System (DCOS)  
**Implementation Mode:** Extend existing system  
**Primary Users:** Quantity Surveyor, Senior QS, Estimator, Cost Manager, BIM Coordinator, Project Manager and System Administrator

---

# 1. ROLE AND OBJECTIVE

Act as a Senior Software Architect, Full-Stack Engineer, Quantity Surveying Domain Expert, Database Architect and QA/QC Engineer.

Your task is to design, implement, test and document the DCOS Quantity Take-off module as a production-oriented module integrated into the existing DCOS application.

Do not create a disconnected demo, a standalone application or a second set of project-management and authentication systems.

Before coding:

1. Inspect the existing repository, folder structure, application architecture, package configuration, database schema, authentication, authorization, UI components, design system and existing DCOS modules.
2. Identify reusable components, existing database entities and established coding conventions.
3. Read the existing Quantity Take-off specification documents:
   - `04-20-01-01-Business-Requirement.md`
   - `04-20-01-02-Functional-Specification.md`
   - `04-20-01-03-Use-Cases.md`
   - `04-20-01-04-Database-Schema.md`
   - `04-20-01-05-Integration-Specification.md`
   - `04-20-01-06-UI-UX-Design.md`
   - `04-20-01-07-RBAC-Matrix.md`
   - `04-20-01-08-API-Reference.md`
   - `04-20-01-09-Test-Plan.md`
   - `04-20-01-10-Deployment-Notes.md`
   - `04-20-01-11-SOP.md`
   - `04-20-01-12-Training-Guide.md`

4. Treat these documents as the original business baseline. Apply the additional requirements in this prompt as the refined implementation specification.
5. Identify conflicts between existing implementation and this specification. Document them before changing shared infrastructure.
6. Produce a concise implementation plan, then implement the module in manageable, testable stages.

Do not stop after producing a plan or mockup. Continue implementing the agreed scope, running available tests, fixing errors and documenting unfinished items.

Never claim that a feature works unless its implementation and relevant tests support that claim.

---

# 2. PRODUCT VISION

The Quantity Take-off module must provide a reliable, auditable measurement system for construction projects.

The system must support:

- Manual quantity measurement from 2D construction drawings.
- Quantity extraction from supported IFC BIM models.
- Tender-stage quantity preparation.
- Construction-stage remeasurement and quantity reconciliation.
- Company-standard measurement rules.
- Calculation formulas, deductions, factors and unit conversions.
- Classification by trade, WBS, location, cost code and BOQ item.
- Drawing/model revision comparison.
- QA/QC and issue management.
- Senior QS review and approval.
- Immutable publication of approved quantity baselines.
- Controlled export and transfer to downstream DCOS modules.
- Complete measurement provenance and audit history.

## Core design principle

Every published quantity must answer these questions:

1. What was measured?
2. Which project and construction location does it belong to?
3. Which drawing or BIM model revision supports it?
4. How was the quantity measured or extracted?
5. Which calculation formula and measurement rules were applied?
6. Which assumptions, deductions and factors were used?
7. Who prepared, reviewed and approved the quantity?
8. Which published version is authoritative?
9. Which downstream estimate or workflow consumed the quantity?

A quantity without traceable evidence must not be treated as a fully verified quantity.

---

# 3. NON-NEGOTIABLE IMPLEMENTATION PRINCIPLES

## 3.1 Existing DCOS architecture

- Reuse the existing framework, database, authentication, tenant model, project master, document-control module, WBS, location master, cost-code master and UI component library wherever available.
- Do not replace existing infrastructure merely because a new implementation would be easier.
- Do not create duplicate project, employee, user, document or cost-code master tables when authoritative master records already exist.
- Use existing service and repository patterns where appropriate.
- Document every required schema migration.
- Preserve compatibility with existing modules.
- If a required dependency or integration is unavailable, create a clearly defined interface and report the limitation.

## 3.2 Quantity integrity

- Use PostgreSQL `NUMERIC`/decimal arithmetic for commercial quantities.
- Do not use binary floating-point arithmetic for authoritative quantity calculations.
- Preserve original source values, units and evidence.
- Never silently apply a waste factor, deduction, rounding rule or quantity adjustment.
- Store the ruleset and calculation-engine version used.
- Make calculations reproducible from stored inputs and rule definitions.

## 3.3 Revision integrity

- Never overwrite a published quantity baseline.
- Create a new session version when a new measurement iteration is required.
- Retain the parent version and comparison baseline.
- Carry forward unchanged items only through an explicit, auditable operation.
- Distinguish remeasured, revalidated and unverified carried-forward quantities.
- Do not associate historical evidence with a newer source revision unless it has actually been revalidated.

## 3.4 Security

- Reuse the existing DCOS authorization and tenant-isolation model.
- Enforce permissions on the server and database, not only in the UI.
- Use Supabase Row Level Security if Supabase is the existing database platform.
- Never expose privileged service-role credentials in browser code.
- Validate all uploaded files and user-provided expressions.
- Log privileged actions and sensitive workflow transitions.

---

# 4. SCOPE AND PRIORITIES

Implement the module in three delivery levels.

## P0 — Production foundation

- Session and version management.
- Project, purpose and source-revision selection.
- Manual 2D drawing measurement.
- Drawing calibration and unit handling.
- Quantity items and classification.
- Calculation and measurement-rules engine.
- QA/QC and issue register.
- Review and approval workflow.
- Immutable publication snapshots.
- Revision comparison.
- Excel and CSV export.
- Downstream transfer interface.
- Audit trail.
- Access control.
- Automated tests.

## P1 — BIM and advanced reconciliation

- IFC upload and parsing.
- IFC element and quantity extraction.
- Element provenance and mapping.
- IFC unit and geometry validation.
- BIM-derived quantity review.
- Model revision comparison.
- Duplicate detection and reconciliation.

## P2 — Assisted intelligence

- Automated drawing-change assistance.
- Advanced element matching across model revisions.
- Anomaly detection.
- Measurement productivity analytics.
- AI-assisted quantity classification, with human verification.

Do not present P1 or P2 features as completed if only a placeholder or mock implementation exists.

If development time is limited, finish and test P0 before expanding into advanced automation.

---

# 5. USER ROLES AND PERMISSIONS

Use existing DCOS roles and permission mechanisms. Extend them only where necessary.

## Quantity Surveyor

Can:

- Create a take-off session.
- Select the project, source revision and ruleset.
- Measure and edit draft quantities.
- Apply authorized formulas and classifications.
- Resolve issues.
- Compare revisions.
- Submit a version for review.
- Export permitted data.

Cannot:

- Approve their own submission under the default separation-of-duties policy.
- Modify a published snapshot.
- Bypass blocking validation errors.

## Senior QS

Can:

- Review submitted versions.
- Inspect source evidence and calculations.
- Approve or request changes.
- Add review comments.
- Review revision variances.
- Publish an approved version if authorized.

Approval and publication permissions may be separate permissions.

## Estimator / Cost Manager

Can:

- Read published quantities within authorized projects.
- Select an eligible published quantity version for estimation.
- Inspect quantity provenance.
- Transfer quantities into permitted downstream workflows.

Cannot change the authoritative take-off quantity.

## BIM Coordinator

Can:

- Upload or register supported IFC models where authorized.
- Review model import and extraction results.
- Investigate element-mapping and model-integrity issues.

Cannot approve quantities unless separately granted the appropriate permission.

## System Administrator

Can:

- Manage access and configuration.
- Administer measurement rules according to governance permissions.
- Investigate operational failures.
- Perform authorized administrative recovery.

Administrative privileges must not silently rewrite approved quantity history.

---

# 6. MODULE INFORMATION ARCHITECTURE

Integrate the following pages into the existing DCOS navigation.

## 6.1 Quantity Take-off Dashboard

Display:

- Total sessions.
- Draft sessions.
- Sessions in progress.
- Sessions awaiting review.
- Approved versions awaiting publication.
- Published quantity versions.
- Open blocking issues.
- Provisional quantities.
- Recent revision changes.
- Recent publications.
- Recent downstream transfer failures.

Provide filters for:

- Project.
- Building.
- Trade.
- Measurement purpose.
- Session status.
- Source type.
- Responsible QS.
- Date range.

Dashboard values must come from actual application data, not hardcoded demonstration statistics.

## 6.2 Session Register

Display a searchable and filterable register with:

- Session code.
- Session name.
- Project.
- Tender or construction purpose.
- Trade.
- Current version.
- Source revision.
- Status.
- Responsible QS.
- Last update.
- Latest publication status.

Actions:

- Create session.
- Open session.
- View version history.
- Compare versions.
- Export authorized data.

## 6.3 Create Session Wizard

Use a guided workflow.

### Step 1 — Project and purpose

Select:

- Project.
- Contract or commercial package, where supported by existing DCOS masters.
- Purpose: `TENDER` or `CONSTRUCTION`.
- Trade.
- Building and measurement scope.

### Step 2 — Source selection

Select one source type:

- 2D drawing.
- IFC model.

For drawings, select the exact document and revision.

For IFC, select the registered model revision and retain the original file identity.

Never silently substitute the latest revision.

### Step 3 — Ruleset

Select the approved company ruleset and version.

Allow project-level settings or overrides only through authorized, explicit and versioned configuration.

### Step 4 — Session details

Enter:

- Session name.
- Description.
- Responsible QS.
- Measurement scope.
- Revision reason, where applicable.

### Step 5 — Confirmation

Display a summary before creation.

Validate required fields and project access.

Create the initial version in `DRAFT` status.

## 6.4 Measurement Workspace

The workspace should be the primary user interface.

Use a desktop-oriented layout, responsive enough for normal tablet use.

Recommended layout:

- Left: drawing/model browser and item register.
- Center: drawing or model viewport.
- Right: selected item properties, calculation details and classification.
- Bottom or collapsible panel: issues, calculation history and revision changes.

Do not overcrowd the workspace with every property simultaneously.

Allow panels to resize or collapse.

Provide clear empty, loading, error and no-permission states.

---

# 7. MANUAL 2D TAKE-OFF

## 7.1 Supported operations

Implement:

- Length measurement.
- Polyline length measurement.
- Polygon area measurement.
- Count measurement.
- Volume calculation from dimensions or measured area and thickness.
- Repeated-element counting.
- Deduction records.
- Formula-based composite quantities where supported by the rules engine.

Do not claim native measurement support for a file format unless the viewer and geometry implementation actually support it.

## 7.2 Calibration

Allow calibration using a known drawing dimension.

The user must specify or confirm:

- Known distance.
- Source units.
- Calibration points.
- Drawing coordinate transformation.

Display the active scale and unit.

Recalibration must be auditable.

If a drawing changes or its geometry is replaced, invalidate the previous calibration when appropriate and require revalidation.

## 7.3 Geometry evidence

For each measurement, store:

- Geometry type.
- Source drawing revision.
- Sheet or view reference.
- Source coordinates or geometry.
- Calibration information.
- Calculated geometric quantity.
- Output unit.
- Measurement timestamp.
- User who created or modified the measurement.

Geometry must remain associated with the correct source revision.

## 7.4 Editing

Users should be able to:

- Select a measurement.
- Edit its geometry.
- Change its description and permitted classifications.
- Inspect calculation details.
- Duplicate an item intentionally.
- Delete an eligible draft item.
- Undo or cancel an unfinished measurement.

Every saved change must be reflected in the audit history.

---

# 8. IFC BIM QUANTITY EXTRACTION

Implement IFC extraction through a dedicated adapter/service rather than coupling IFC parsing to the UI.

## 8.1 Ingestion sequence

1. Upload or register the IFC file.
2. Validate the file and its supported schema/version.
3. Calculate a file hash.
4. Parse project, site, building, storey and element information.
5. Read model units and coordinate information.
6. Extract supported element identifiers, classifications, properties and quantities.
7. Normalize supported quantities into DCOS unit conventions.
8. Record source model revision and element identifiers.
9. Flag missing, invalid or unsupported quantities.
10. Display the extraction results for review.
11. Permit authorized mapping to take-off items.
12. Preserve extraction logs and validation results.

## 8.2 Stable element identity

Retain IFC GlobalId or the corresponding supported identifier.

Do not rely exclusively on element names or display labels.

When comparing models, account for elements that are:

- Added.
- Removed.
- Modified.
- Unchanged.
- Matched ambiguously.

A matching algorithm must expose uncertain matches for human review.

## 8.3 Extraction policy

Support only explicitly defined element classes and quantity definitions in the first implementation.

For each supported quantity, document:

- IFC class.
- Property set or quantity set.
- Property/quantity name.
- Expected dimensional type.
- Unit conversion.
- Fallback rule.
- Validation behaviour.

If a reliable quantity cannot be extracted, flag the item instead of fabricating a result.

---

# 9. QUANTITY ITEM CLASSIFICATION

Each item should support independent relationships to:

- Project.
- Trade.
- WBS.
- Building.
- Level.
- Zone.
- Location.
- Cost code.
- BOQ item.
- Measurement purpose.
- Source revision.
- Ruleset version.

Reuse the existing DCOS WBS and location masters.

Do not duplicate the authoritative master tables.

Allow multiple quantities to map to the same BOQ item where the measurement breakdown requires it.

Do not assume that one measured item always corresponds to exactly one BOQ item.

Support item-level quantity statuses:

- `FIRM`
- `PROVISIONAL`
- `EXCLUDED`
- `PENDING_CLARIFICATION`

Each status must have clear business meaning.

Excluded items require an exclusion reason.

Provisional items require documented assumptions or an explanation of incomplete information.

---

# 10. CALCULATION ENGINE

Create a reusable, unit-aware calculation service.

## 10.1 Required calculation sequence

1. Capture raw dimensions or extracted quantities.
2. Validate input values and units.
3. Normalize units.
4. Calculate gross quantity.
5. Apply applicable deductions.
6. Calculate net quantity.
7. Apply explicitly authorized adjustments.
8. Apply configured rounding at the specified stage.
9. Store the calculation result and provenance.
10. Recalculate whenever relevant inputs or rules change.

## 10.2 Calculation records

Retain:

- Formula identifier.
- Formula expression.
- Formula version.
- Calculation-engine version.
- Input variables and values.
- Input units.
- Output unit.
- Deductions.
- Factors.
- Rounding rules.
- Calculation timestamp.
- Result value.
- Validation outcome.

Do not overwrite historical calculation records.

## 10.3 Formula security

Never evaluate arbitrary JavaScript, SQL, Python or other unrestricted code supplied by users.

Use an allowlisted expression parser.

Allow only approved operators, functions and variables.

Reject:

- Division by zero.
- Invalid expressions.
- Missing inputs.
- Circular dependencies.
- Incompatible units.
- Non-finite values.
- Invalid or unauthorized factors.

## 10.4 Measurement rules

Create a version-controlled company measurement-rules library.

Each rule should support:

- Rule code.
- Rule name.
- Trade or scope.
- Description.
- Input requirements.
- Formula or calculation method.
- Unit requirements.
- Deduction policy.
- Applicable factors.
- Rounding policy.
- Validation conditions.
- Effective version.
- Approval status.
- Approver and approval date.

Published session versions must retain the exact ruleset version used.

A new ruleset version must not retroactively change previously approved quantities.

---

# 11. QA/QC AND ISSUE MANAGEMENT

Implement configurable validation rules.

## 11.1 Blocking errors

Examples:

- Missing source revision.
- Invalid source file.
- Missing required unit.
- Invalid formula.
- Incompatible units.
- Missing mandatory classification.
- Invalid calculation result.
- Missing required provisional assumption.
- Invalid version or baseline relationship.
- Unsupported IFC quantity treated as a verified result.

Blocking errors must prevent submission.

## 11.2 Warnings

Examples:

- Duplicate or near-duplicate measurements.
- Unexpected quantity variance.
- Unusual dimensions.
- Missing optional classification.
- Carried-forward item not revalidated against a new source.
- Significant changes in IFC element properties.
- Large revision variance.

Warnings must be visible and actionable.

Allow acknowledgement only when permitted by policy, with user identity and justification recorded.

## 11.3 Issue register

Each issue should include:

- Issue code.
- Severity.
- Description.
- Affected session version.
- Affected item, where applicable.
- Source evidence.
- Status.
- Assigned user, where supported.
- Resolution.
- Resolved by.
- Resolution timestamp.

Rerunning validation must not create unlimited duplicate records for the same unresolved issue.

---

# 12. VERSIONING AND REVISION COMPARISON

Versioning is a critical business requirement.

## 12.1 Version creation

When a new measurement iteration begins:

- Create a new version.
- Retain the parent version.
- Record the reason.
- Select the source revision.
- Select the ruleset version.
- Identify the comparison baseline.
- Copy forward only eligible items.
- Retain provenance for every carried-forward item.

Version numbering must be generated safely under concurrent use.

## 12.2 Change classification

Compare item-level records and classify changes as:

- Added.
- Removed.
- Increased.
- Decreased.
- Unchanged.
- Modified description or classification.
- Changed calculation rule.
- Changed source evidence.
- Unresolved match.

Display:

- Previous quantity.
- New quantity.
- Absolute variance.
- Percentage variance, where mathematically defined.
- Change reason.
- Previous source.
- New source.
- Review status.

For a previous quantity of zero, do not calculate a misleading percentage variance.

## 12.3 Immutable publication

Once published:

- Freeze the approved item data.
- Freeze the calculation results.
- Freeze source and ruleset references.
- Record the publisher and timestamp.
- Generate a deterministic snapshot hash from canonicalized content.
- Reject ordinary updates and deletions.

A new version must be created for any subsequent change.

The snapshot hash is an integrity check, not a replacement for database permissions or audit logs.

---

# 13. SESSION WORKFLOW

Implement these statuses:

- `DRAFT`
- `IN_PROGRESS`
- `SUBMITTED_FOR_REVIEW`
- `CHANGES_REQUESTED`
- `APPROVED`
- `PUBLISHED`
- `CANCELLED`

Define and enforce permitted transitions on the server.

Expected workflow:

`DRAFT → IN_PROGRESS → SUBMITTED_FOR_REVIEW → APPROVED → PUBLISHED`

Alternative review path:

`SUBMITTED_FOR_REVIEW → CHANGES_REQUESTED → IN_PROGRESS`

Rules:

- Draft sessions may be edited by authorized users.
- Submitted versions are read-only during review.
- Changes requested returns work to an editable state.
- Previous review decisions remain in history.
- Approval does not automatically mean publication.
- Published versions cannot be edited.
- Cancellation must be authorized and audited.
- A published version remains valid when a newer version is being prepared.

Use separate publication and transfer records so that a failed downstream transfer does not invalidate a published measurement baseline.

---

# 14. DATABASE IMPLEMENTATION

Use the existing DCOS database conventions. If the project uses Supabase/PostgreSQL, implement the required schema as version-controlled SQL migrations.

Inspect existing tables before creating new ones.

## 14.1 Core tables

Implement or adapt:

1. `qs_takeoff_session`
2. `qs_takeoff_session_version`
3. `qs_takeoff_item`
4. `qs_takeoff_source`
5. `qs_takeoff_geometry`
6. `qs_takeoff_calculation`
7. `qs_takeoff_item_factor`
8. `qs_measurement_ruleset`
9. `qs_measurement_rule_version`
10. `qs_takeoff_review`
11. `qs_takeoff_issue`
12. `qs_takeoff_revision_change`
13. `qs_takeoff_publication`
14. `qs_takeoff_transfer`

If IFC ingestion is implemented, add appropriate IFC model revision and IFC element storage, reusing existing document-control tables wherever possible.

## 14.2 Data requirements

Use:

- UUID primary keys.
- Explicit foreign keys.
- `NUMERIC` quantity fields.
- `TIMESTAMPTZ` timestamps.
- Controlled status values.
- Unique constraints.
- Check constraints.
- Indexes for project, session, version, item and status queries.
- Soft deletion where appropriate.
- Append-only records for approvals and audit events.

Use `JSONB` for structured geometry, calculation inputs and versioned rule definitions only when a relational structure is not more suitable.

Do not store everything in a single JSON field.

## 14.3 Important constraints

- Unique session version number within each logical session.
- Unique item code within a session version.
- Parent version belongs to the same session.
- Source and ruleset references are valid.
- Published snapshots are immutable.
- Approved review records cannot be silently overwritten.
- Duplicate transfer requests are handled idempotently.
- Quantities cannot contain invalid numeric values.
- Unit conversions must be dimensionally valid.

## 14.4 Audit logging

Record:

- Actor.
- Action.
- Entity type and ID.
- Timestamp.
- Previous value where appropriate.
- New value where appropriate.
- Reason or comment.
- Correlation/request ID where available.

Audit logging must cover state changes, ruleset changes, review decisions, publication, export and transfer.

---

# 15. DOWNSTREAM INTEGRATION

The module must publish quantities for use by other DCOS modules.

Initial integration targets:

- Quantity Surveying / BOQ.
- Cost Estimation.
- Cost Control.
- Change Management, where available.
- Reporting.

## 15.1 Transfer contract

Each transfer must identify:

- Source module.
- Published take-off version.
- Target module.
- Target record or estimate version.
- Item identifiers.
- Quantity values.
- Units.
- BOQ and cost-code mapping.
- Provisional/firm status.
- Source references.
- Transfer timestamp.
- Transfer result.

## 15.2 Transfer rules

- Only eligible published quantities may be transferred.
- The target estimate version must be explicitly selected.
- Transfers must be idempotent.
- A retry must not create duplicate items.
- Failures must be visible and recoverable.
- Record which target version consumed each publication.
- Do not automatically overwrite quantities already consumed by another workflow.
- Preserve source lineage in the receiving module.

Provide Excel and CSV exports with a documented column mapping.

Do not implement a fake transfer that only displays a success message without writing to the intended target or returning a real result.

---

# 16. UI/UX AND DESIGN SYSTEM

Reuse the existing DCOS design system.

Before creating new styles, inspect existing pages, typography, color tokens, spacing, cards, tables, buttons, dialogs, form controls and navigation.

The module should feel like part of DCOS, not a separate product.

Required interface qualities:

- Clear hierarchy.
- Compact, readable data tables.
- Consistent status labels.
- Visible errors and validation results.
- Accessible form labels.
- Clear confirmation for publication and cancellation.
- No misleading success states.
- Loading, empty, failure and permission-denied states.
- Responsive layouts.
- Keyboard-accessible core workflows.

Use a clean engineering/business interface.

Prioritize the measurement viewport, item register and calculation details over decorative charts.

Do not add arbitrary color themes or a new UI library without a demonstrated need.

---

# 17. API AND SERVICE ARCHITECTURE

Follow existing DCOS API patterns.

Separate business logic from UI components.

Provide service operations equivalent to:

- Create session.
- Create new version.
- Register source revision.
- Create and update quantity item.
- Save geometry evidence.
- Run calculation.
- Run validation.
- Resolve issue.
- Submit for review.
- Approve or request changes.
- Publish version.
- Compare versions.
- Export quantities.
- Transfer publication.
- Retrieve audit history.

Use schema validation on incoming requests.

Use server-side permission checks.

Use database transactions for operations that must succeed or fail together.

Long-running IFC imports should use a background job mechanism if supported by the existing architecture.

Provide explicit job status and error details.

Do not block the UI while a large model is processing.

---

# 18. ACCEPTANCE TESTS

Implement automated tests for the following requirements.

## A. Session and source tests

1. A valid tender session can be created.
2. A valid construction session can be created.
3. Session creation without a required source revision fails.
4. A user cannot access an unauthorized project.
5. A new version references the correct parent.
6. Concurrent version creation cannot produce duplicate version numbers.

## B. Measurement and calculation tests

7. A calibrated line produces the expected length.
8. A calibrated polygon produces the expected area.
9. A rectangular slab of 10 × 8 × 0.2 m produces 16.00 m³.
10. A 0.50 m³ deduction produces 15.50 m³ net quantity.
11. An authorized factor of 1.05 applied to 100 produces 105.
12. Incompatible units are rejected.
13. Invalid expressions are rejected safely.
14. Calculation history preserves previous results.
15. Rounding occurs at the configured stage.

## C. IFC tests

16. A supported IFC fixture is imported successfully.
17. Element identifiers and model revision are retained.
18. Units are normalized correctly.
19. Unsupported quantity types are flagged.
20. Malformed IFC input fails safely.
21. Repeated imports of the same source do not create unintended duplicates.

## D. Revision and approval tests

22. A new version does not modify its parent.
23. Unchanged carried-forward items retain provenance.
24. Quantity 100 compared with 120 produces variance +20 and +20%.
25. Zero-to-positive changes are classified without invalid percentage calculations.
26. Review rejection retains the original decision.
27. Users cannot edit submitted versions during review.
28. Unauthorized self-approval is rejected.
29. Published quantities cannot be modified through ordinary APIs.
30. Snapshot hashes are reproducible for identical canonicalized content.

## E. Integration and security tests

31. Publication records the correct version.
32. Transfer writes to the correct target estimate version.
33. Retrying a transfer does not duplicate quantities.
34. Failed transfers expose actionable errors.
35. Provisional items follow configured transfer policies.
36. Audit history records relevant actions.
37. RLS prevents cross-tenant access.
38. Export values match the published snapshot.
39. Rerunning validation does not create duplicate unresolved issues.
40. Database migrations can be applied to a clean test database and safely upgraded from the existing schema.

Use realistic fixtures, deterministic expected values and isolated test data.

Do not mark tests as passing unless they have actually executed successfully.

---

# 19. DEFINITION OF DONE

The module is complete for production release only when:

- All P0 requirements are implemented.
- Database migrations are committed.
- Existing DCOS authentication and permissions are respected.
- Manual take-off works with supported drawing inputs.
- The calculation engine is tested.
- Ruleset versions are traceable.
- QA/QC and review workflow works end to end.
- Published baselines are immutable.
- Revision comparison works against a selected baseline.
- Excel/CSV export produces valid files.
- Downstream integration is implemented or explicitly documented as an approved interface dependency.
- Automated tests pass.
- Security and authorization tests pass.
- Error handling and audit history are implemented.
- Documentation is updated.
- No critical errors remain.
- Outstanding limitations are documented.

P1 IFC features must have their own completion status and acceptance evidence. Do not claim the entire source scope is complete while IFC extraction remains a placeholder.

---

# 20. REQUIRED DELIVERABLES

Implement and provide:

1. Updated module folder structure.
2. Database migrations.
3. Functional frontend pages.
4. Reusable measurement components.
5. Backend services and API endpoints.
6. Calculation engine.
7. Measurement-rules configuration.
8. Revision comparison service.
9. QA/QC and issue-management service.
10. Approval and publication workflow.
11. Export and downstream integration interface.
12. Automated unit, integration and acceptance tests.
13. Test fixtures and sample construction quantities.
14. Developer documentation.
15. User workflow documentation.
16. Environment/configuration requirements.
17. Implementation report identifying completed, partially completed and unimplemented features.

If an existing document is being updated, preserve its established naming and organizational conventions.

Do not create unnecessary documentation duplicates.

---

# 21. IMPLEMENTATION EXECUTION RULES

Work directly in the existing DCOS repository.

Follow this sequence:

### Phase 1 — Inspect

- Inspect the repository.
- Read all four specification documents.
- Inspect the existing database and authentication model.
- Identify reusable components.
- Report the implementation gaps.

### Phase 2 — Design and migrate

- Confirm entity relationships.
- Design the required schema changes.
- Add migrations and constraints.
- Add authorization and audit mechanisms.
- Verify migration compatibility.

### Phase 3 — Implement the core workflow

- Build the dashboard and session register.
- Implement session creation and versioning.
- Implement quantity items and classification.
- Implement calculation and validation services.
- Implement review, publication and audit history.

### Phase 4 — Implement measurement and integration

- Build supported 2D measurement operations.
- Store geometry and source evidence.
- Implement revision comparison.
- Implement exports and downstream transfer contracts.
- Implement IFC ingestion according to the agreed release scope.

### Phase 5 — Test and verify

- Run linting and type checks.
- Run unit tests.
- Run integration tests.
- Run acceptance tests.
- Verify authorization and RLS.
- Test revision immutability and transfer idempotency.
- Fix errors before declaring completion.

### Phase 6 — Report

Provide a concise report covering:

- Files created or modified.
- Database migrations.
- Implemented features.
- Test results.
- Known limitations.
- Required environment variables or setup steps.
- Remaining work and recommended next actions.

If a blocker prevents implementation, explain the blocker and complete the independent work that remains possible.

Do not silently skip a requirement.

---

# 22. FINAL SUCCESS CRITERION

The final product must enable a Quantity Surveyor to create a tender or construction take-off session, measure or extract quantities, calculate them using approved company rules, validate the results, submit them for review, publish an immutable quantity baseline, compare future revisions and transfer approved quantities into downstream DCOS workflows.

The complete process must retain source evidence, calculation history, rule versions, approval history and downstream lineage.

**Build a reliable quantity-management system, not merely a drawing viewer with a quantity table.**