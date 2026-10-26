# MASTER PROMPT: DCOS TASK TEAM PLANNING MODULE
## Full Architecture, Specification, and Implementation

**Role:** Act as a Principal Software Architect, Senior Full-Stack Engineer, Database Architect, Product Designer, QA Engineer, and Construction Operations Specialist.

**Project:** DCOS — Digital Construction Operating System  
**Module:** Task Team Planning & Work Management  
**Implementation objective:** Build a complete, integrated, production-oriented module inside the existing DCOS repository.

---

# 1. MISSION

Design, implement, test, and integrate the DCOS Task Team Planning module.

The module converts project WBS work into discipline-managed team plans, allocates work to individual employees, manages workload and capacity, supports daily and weekly execution, tracks deliverables and progress, controls review and approval, and reports actual performance to project management.

The system must support multiple projects, multiple disciplines, different organizational structures, and different employee seniority levels.

This is an implementation task, not merely a proposal, mockup, or standalone prototype.

## Core operating principle

- WBS defines WHAT work exists.
- Organization defines WHO manages and performs the work.
- Planning defines WHEN work should happen.
- Task Team Planning defines WHO is responsible for the work and HOW the team will deliver it.
- Execution records WHAT actually happened.
- Review verifies the quality and completeness of deliverables.
- Reporting measures planned versus actual performance.
- AI may recommend decisions, but authorized humans retain approval authority.

Primary workflow:

Project → WBS → Task Pool → Discipline Manager → Team Plan → Staff Allocation → Published Plan → Staff Execution → Progress Reporting → Review → Approval → Completion → Project KPI.

---

# 2. MANDATORY PRE-IMPLEMENTATION AUDIT

Before changing any code, inspect the existing repository and report:

1. Current framework and application structure.
2. Existing authentication and authorization implementation.
3. Existing organization, department, discipline, employee, and team models.
4. Existing Project and WBS data structures.
5. Existing database schema, migrations, and relationships.
6. Existing UI components, navigation, design system, and reusable layouts.
7. Existing task, schedule, resource, document, notification, and reporting modules.
8. Existing Supabase integration, Row Level Security policies, and database conventions.
9. Existing seed data, test infrastructure, and deployment configuration.
10. Current incomplete features, known errors, and relevant technical debt.

For the current DCOS repository, check the existing Next.js application, TypeScript conventions, Supabase configuration, and shared components where applicable. Confirm the actual implementation rather than assuming the repository still matches this description.

Produce a short audit report containing:

- Existing assets that can be reused.
- Existing modules that should be integrated.
- Missing functionality.
- Potential conflicts or migration risks.
- Recommended implementation sequence.

Do not create duplicate Projects, WBS, Employees, Organization, or Authentication modules if equivalent functionality already exists.

Do not reset, recreate, or destructively modify the database.

Do not overwrite existing user work.

After the audit, proceed with implementation in manageable phases unless a genuine blocker requires clarification.

---

# 3. ARCHITECTURAL PRINCIPLES

The implementation must follow these principles.

## 3.1 Modular architecture

Task Team Planning must be a distinct business module integrated with the existing DCOS platform.

It must not become a separate application with an independent authentication system or disconnected database.

## 3.2 Single source of truth

Reuse the existing authoritative records for:

- Users and employees.
- Projects.
- WBS.
- Organization and disciplines.
- Leave and working calendars.
- Documents and attachments, where available.

Avoid duplicating the same business data across modules.

## 3.3 Configurable business rules

Discipline codes, position names, approval rules, capacity thresholds, task types, and planning policies must be configurable where appropriate.

Do not hard-code STR, ARC, MEP, PD, or CON into application logic in a way that prevents new disciplines from being added.

## 3.4 Traceability

Every important assignment, approval, schedule change, status change, and override must be traceable to the responsible user and timestamp.

## 3.5 Human accountability

Managers remain responsible for team planning and allocation decisions. Reviewers remain responsible for reviews. Authorized approvers remain responsible for approval.

## 3.6 Engineering and construction context

The module must accommodate both:

- Engineering deliverables, such as calculations, drawings, models, and technical reviews.
- Construction and project operations, such as inspections, procurement follow-ups, site execution, and reporting.

Do not assume that every task is measured only by hours or percentage completion.

---

# 4. ORGANIZATION AND DISCIPLINE STRUCTURE

Use the existing DCOS organization model where available.

The target conceptual structure is:

Company → Department/Discipline → Team → Position → Employee.

An organization may contain multiple disciplines and teams. The actual hierarchy must accommodate the company's existing structure rather than enforcing an unnecessary rigid hierarchy.

Initial example disciplines:

- STR — Structural Engineering.
- ARC — Architectural.
- MEP — Mechanical, Electrical, and Plumbing.
- PD — Planning / Project Development.
- CON — Construction.
- BIM — Building Information Modeling.
- QS — Quantity Surveying.
- PROCUREMENT — Procurement.
- QAQC — Quality Assurance and Quality Control.
- HSE — Health, Safety, and Environment.
- DOCUMENT — Document Control.
- COMMERCIAL — Commercial and Contracts.
- FINANCE — Finance.
- HR — Human Resources.

These are initial configuration examples, not an exhaustive or immutable list.

## Employee information

Reuse existing employee records. Where information is missing, integrate the necessary fields or references:

- Employee ID.
- Employee name.
- Account/user ID.
- Department and discipline.
- Team membership.
- Position or grade.
- Employment status.
- Competencies and skills.
- Working calendar.
- Available capacity.
- Project commitments.

An employee may have more than one project commitment and, where authorized, more than one team membership.

Separate organizational title from application permission. A Senior Engineer should not automatically gain approval privileges merely because of the title.

---

# 5. DISCIPLINE TASK LIBRARY

Implement configurable task types and reusable task templates.

Examples include:

## STR — Structural

- Geotechnical data review.
- Foundation design.
- Pile design.
- Pile cap design.
- Raft design.
- Column design.
- Beam design.
- Slab design.
- Shear wall design.
- Staircase design.
- Structural analysis.
- Structural calculations.
- Structural drawings.
- Rebar detailing.
- Shop drawing review.
- RFI technical review.

## ARC — Architectural

- Floor plan preparation.
- Elevation and section preparation.
- Interior layout.
- Finishing schedule.
- Door and window schedules.
- Material selection.
- Architectural detailing.
- Shop drawing review.
- Mock-up review.

## MEP

- HVAC design.
- Electrical design.
- Lighting design.
- Plumbing design.
- Drainage design.
- Fire protection design.
- Fire alarm design.
- ELV design.
- Equipment schedules.
- MEP coordination.
- Shop drawing review.
- Testing and commissioning preparation.

## BIM

- Architectural modeling.
- Structural modeling.
- MEP modeling.
- Model federation.
- Clash detection.
- Coordination review.
- Drawing extraction.
- Quantity extraction.
- Model auditing.
- 4D simulation.

## QS

- Quantity takeoff.
- BOQ preparation.
- Cost estimating.
- Tender preparation.
- Tender comparison.
- Subcontractor quotation evaluation.
- Interim payment assessment.
- Variation assessment.
- Final account.
- Cost reporting.

## PROCUREMENT

- Material requisition review.
- RFQ preparation.
- Quotation collection.
- Technical evaluation.
- Commercial evaluation.
- Purchase order processing.
- Delivery tracking.
- Supplier follow-up.

## CON

- Work planning.
- Method statement preparation.
- Site execution.
- Subcontractor coordination.
- Manpower planning.
- Daily site reporting.
- Weekly look-ahead.
- Progress measurement.
- Inspection coordination.

## QAQC

- Inspection and Test Plan preparation.
- Material inspection.
- Work Inspection Request.
- Site inspection.
- Nonconformance reporting.
- Test report tracking.
- Quality audits.
- Corrective action follow-up.

## HSE

- Risk assessment.
- Method statement review.
- Toolbox meeting.
- Site safety inspection.
- Safety observation.
- Incident reporting.
- Permit-to-work coordination.
- Safety audits.

## PD / PLANNING

- Baseline schedule preparation.
- Schedule updating.
- Look-ahead planning.
- Weekly work planning.
- Progress review.
- Delay analysis.
- Extension of Time analysis.
- Time Impact Analysis.
- S-curve reporting.
- Earned Value Management reporting.

## DOCUMENT CONTROL

- Document registration.
- Transmittal preparation.
- Drawing distribution.
- Revision tracking.
- Document submission follow-up.
- Document status reporting.

Create equivalent configurable task types for other disciplines.

Do not automatically populate every project with every possible task. Task templates must be selectively applied to a project, WBS package, or work package.

---

# 6. WBS AND TASK MASTER

The existing WBS remains the authoritative project work structure.

Integrate with the existing WBS rather than creating a second independent WBS.

A task should reference the relevant project and WBS node whenever applicable.

## Task fields

Implement the appropriate fields for:

### Identification

- Task ID.
- Task code.
- Task name.
- Description.
- Project reference.
- WBS reference.
- Responsible discipline.
- Task type.
- Work package.
- Parent task, if hierarchical tasks are supported.

### Planning

- Priority.
- Planned start.
- Planned finish.
- Planned duration.
- Estimated effort.
- Required competencies.
- Required seniority or experience.
- Target deadline.
- Dependencies.
- Required deliverables.

### Responsibility

- Responsible team.
- Task owner/PIC.
- Supporting staff.
- Reviewer.
- Approver, where required.
- Assigning manager.

### Execution

- Workflow status.
- Progress.
- Actual effort.
- Remaining effort estimate.
- Blocker status.
- Submission and approval timestamps.

### Governance

- Created by.
- Created at.
- Updated by.
- Updated at.
- Version or revision, where appropriate.
- Audit history.

Use relational foreign keys for relationships. Do not duplicate WBS labels, employee names, or project names as the authoritative relationship when IDs already exist.

Historical snapshots may be stored where needed for auditability.

---

# 7. TASK POOL

Build a Task Pool where authorized Managers can find and manage tasks requiring planning or allocation.

Required filters:

- Project.
- WBS.
- Discipline.
- Team.
- Task type.
- Priority.
- Planned date.
- Deadline.
- Required competency.
- Status.
- Assigned/unassigned.
- Blocked/overdue.

Required views:

- All tasks.
- Unassigned.
- Assigned.
- Due soon.
- Overdue.
- Blocked.
- In progress.
- Awaiting review.
- Completed.

Support search, sorting, pagination, and useful empty states.

Bulk operations may include assignment, priority updates, and plan inclusion where permissions permit.

A task must not be silently duplicated when imported, generated from a template, or added to a plan.

---

# 8. MANAGER WORKSPACE

Create a dedicated Manager Workspace.

A discipline Manager should see only the projects, teams, and tasks authorized by their permissions.

## Dashboard

Display:

- Total tasks.
- Unassigned tasks.
- Planned tasks.
- In-progress tasks.
- Overdue tasks.
- Blocked tasks.
- Tasks awaiting review.
- Tasks completed.
- Team capacity.
- Planned workload.
- Workload by employee.
- Upcoming deadlines.
- Critical dependencies.

## Team view

Display employee name, role, assigned tasks, available capacity, planned effort, utilization, and current workload.

## Task planning view

Provide:

- Task Pool.
- Team assignment.
- Staff allocation.
- Weekly planning.
- Workload overview.
- Capacity warnings.
- Plan publication.
- Change history.

Support practical table-based planning first. Add drag-and-drop allocation only if it can be implemented accessibly and reliably.

Every drag-and-drop operation must have an equivalent accessible action, such as a staff-selection dialog.

---

# 9. TEAM PLAN AND PUBLICATION WORKFLOW

Implement a formal team planning workflow.

Draft → Manager Review → Approved/Authorized for Publication → Published → Revised/Archived.

Use the company's actual authorization policy to determine whether a separate approval step is necessary.

A Manager should be able to:

1. Select a project and planning period.
2. Select relevant WBS tasks.
3. Assign a PIC.
4. Assign supporting staff.
5. Select reviewers and approvers.
6. Set planned start and finish.
7. Allocate estimated effort.
8. Check staff availability.
9. Check dependencies.
10. Review workload conflicts.
11. Save a draft.
12. Publish the plan.
13. Revise a published plan with an audit trail.

Staff should receive their assigned work through their own workspace after publication.

A published plan must not become silently inconsistent if a Manager changes an assignment or deadline. Record changes and notify affected users.

Where the Manager has permission to override a workload warning, require a reason for the override.

---

# 10. STAFF WORKSPACE

Every individual staff member must have a dedicated workspace.

This is a mandatory part of the module, not an optional future feature.

The workspace must be useful on a desktop and reasonably usable on mobile.

## 10.1 My Dashboard

Display:

- Today's tasks.
- Tasks due today.
- Tasks due this week.
- Overdue tasks.
- In-progress tasks.
- Blocked tasks.
- Tasks awaiting my submission.
- Tasks returned for revision.
- Recently completed tasks.
- Planned hours this week.
- Remaining workload.
- Upcoming milestones.

Only show records that the logged-in user is authorized to access.

## 10.2 My Tasks

Provide filters:

- All.
- Today.
- This week.
- Upcoming.
- Overdue.
- In progress.
- Blocked.
- Awaiting review.
- Returned for revision.
- Completed.

Each row or card should show:

- Task name.
- Project.
- WBS.
- My responsibility.
- Priority.
- Planned dates.
- Deadline.
- Current status.
- Progress.
- Reviewer, where applicable.

## 10.3 My Day

Display the staff member's daily assignments, planned hours, priorities, deadlines, and meetings where the relevant calendar integration exists.

Do not invent a meeting calendar if none exists.

Allow authorized users to view planned work by day.

## 10.4 My Week

Display weekly work distribution, total planned hours, available hours, workload warnings, and deadlines.

Staff may submit a proposed adjustment or report a conflict. They must not automatically modify the official team plan unless specifically authorized.

## 10.5 Task Detail

Each staff member should be able to open a task and see:

- Objective and description.
- Project and WBS location.
- Assigned role.
- Assigned Manager.
- Other authorized task participants.
- Planned dates.
- Estimated effort.
- Dependencies.
- Required inputs.
- Deliverables.
- Applicable standards and project requirements.
- Reference documents.
- Reviewer.
- Comments and instructions.
- Revision history, where permitted.

Support the following actions according to permissions:

- Accept assignment.
- Start work.
- Update progress.
- Record actual hours.
- Update remaining effort.
- Add comments.
- Upload or link evidence.
- Report a blocker.
- Request clarification.
- Request reassignment.
- Submit deliverables for review.
- View review comments.
- Resubmit corrected work.

A staff member must not be able to approve their own work where independent review is required.

---

# 11. TASK DELIVERABLES

Tasks must support one or more deliverables.

Examples for a structural design task:

- Design calculations.
- Analysis model.
- Structural drawing.
- Reinforcement details.
- Internal checking record.
- Design report.

Examples for procurement:

- RFQ.
- Quotation comparison.
- Technical evaluation.
- Purchase order.

Examples for construction:

- Inspection request.
- Inspection evidence.
- Site report.
- Test report.

Each deliverable may have:

- Name.
- Description.
- Required/optional flag.
- Assigned contributor.
- Due date.
- File or document reference.
- Revision.
- Status.
- Submission timestamp.
- Reviewer comments.

Reuse the existing DCOS Document Control module for authoritative documents where available.

Avoid creating a separate document storage system.

Task completion rules should depend on configured requirements. If mandatory deliverables or approvals are incomplete, prevent completion when the workflow requires them.

---

# 12. PROGRESS AND EFFORT TRACKING

Support multiple progress methods:

- Percentage-based.
- Deliverable-based.
- Quantity-based.
- Milestone-based.

The appropriate method should be configurable by task type.

Store progress history rather than overwriting the only record of previous progress updates.

Record:

- Previous progress.
- New progress.
- Update timestamp.
- Updated by.
- Actual hours, where applicable.
- Remaining effort estimate.
- Comment.
- Supporting evidence.

Do not treat percentage completion as a reliable measurement of every type of work.

Avoid automatically calculating overall progress as the simple average of unrelated tasks.

Where aggregation is necessary, use a configured and explainable weighting method.

---

# 13. REVIEW AND APPROVAL

Implement a configurable review workflow.

Assigned → In Progress → Submitted → Under Review → Approved or Returned for Revision → Resubmitted → Approved → Completed.

Cancelled and Blocked should be handled as explicit states or controlled flags according to the final state model.

Support:

- Reviewer assignment.
- Review comments.
- Acceptance or rejection.
- Required corrections.
- Revision history.
- Resubmission.
- Approval timestamps.
- Separation of duties where required.

Only authorized users can review or approve.

A review rejection should return the task to the appropriate work state without deleting the original submission or review record.

Define the exact transition rules centrally and enforce them in the backend.

---

# 14. BLOCKERS AND CROSS-DISCIPLINE COORDINATION

Staff must be able to report a blocker against a task.

Blocker information:

- Blocker title.
- Description.
- Category.
- Impact.
- Responsible party or discipline.
- Required action.
- Reported date.
- Expected resolution date.
- Supporting evidence.
- Resolution status.
- Resolution comments.

Example:

A STR engineer cannot complete a beam design because the required ARC opening information is unavailable.

The system should allow the STR task to be linked to the relevant ARC task, document request, RFI, or issue.

The relationship must not imply that one discipline can modify another discipline's tasks without authorization.

Support blocker escalation to the Manager or Project Manager.

Integrate with existing RFI, Issue, and Document modules where they exist.

Do not create duplicate issue-management functionality unnecessarily.

---

# 15. TASK DEPENDENCIES

Support dependencies between tasks where required.

Examples:

Column loads → Pile Design → Pile Cap Design → Foundation Drawings → Internal Review.

Implement the dependency types required by the existing scheduling architecture.

At minimum, support finish-to-start dependencies if no scheduling engine currently exists.

If the existing Planning module supports additional dependency types, reuse them.

The system should warn users when a predecessor is incomplete or a planned task conflicts with its dependencies.

Do not automatically reschedule an entire project without an authorized action.

Avoid circular dependencies.

If tasks are also represented in the existing schedule, maintain one authoritative relationship and avoid creating a competing scheduling engine.

---

# 16. CAPACITY AND WORKLOAD ENGINE

Calculate employee capacity using available authoritative data.

Conceptually:

Available Capacity = Working Time − Leave − Holidays − Other Reserved Time.

Planned Utilization = Assigned Planned Effort / Available Capacity × 100%.

Actual effort and planned effort must remain distinct.

Consider:

- Working calendar.
- Public holidays.
- Approved leave.
- Part-time availability.
- Other project commitments.
- Meetings or reservations where recorded.
- Existing assignments.
- Planning-period boundaries.

Do not double-count shared assignments.

Support capacity at employee, team, discipline, and project levels.

Provide configurable utilization thresholds and visual warnings.

An overloaded employee should trigger a warning, not an automatic rejection unless an explicit business rule requires it.

If capacity data is incomplete, display the limitation rather than inventing availability.

Support authorized overrides with recorded reasons.

---

# 17. MULTI-PROJECT PLANNING

The same employee may work across multiple projects.

Example:

- Project A: 50% allocation.
- Project B: 30% allocation.
- Project C: 20% allocation.

The capacity engine must consider the employee's combined commitments across projects within the relevant organization and authorization scope.

Prevent accidental double-booking where the planning policy prohibits it.

When two Managers attempt to allocate the same employee's capacity, handle concurrent changes safely.

Do not expose another project's confidential task details to unauthorized users merely because they share a resource.

Managers should see sufficient authorized capacity information to make allocation decisions.

---

# 18. DAILY AND WEEKLY PLANNING

Implement daily and weekly planning views.

A weekly plan should reference its planning period and assigned tasks.

Daily planning should support:

- Planned hours.
- Actual hours.
- Work notes.
- Progress updates.
- Blockers.
- Deliverables completed.

Staff may report actual work independently of the planned allocation, subject to the organization's time-recording rules.

The system must distinguish:

- Planned hours.
- Actual hours.
- Remaining estimated hours.
- Available capacity.

Do not assume a task with eight estimated hours must always be completed in one eight-hour day.

Support tasks spanning multiple days and multiple staff members.

---

# 19. NOTIFICATIONS

Implement in-app notifications for relevant events:

- New assignment.
- Assignment changed.
- Plan published.
- Deadline approaching.
- Task overdue.
- Blocker reported.
- Blocker resolved.
- Review requested.
- Work returned for revision.
- Work approved.
- Reassignment request.
- Relevant dependency completed.

Reuse the existing notification infrastructure if available.

Notifications must respect user permissions and must not disclose unauthorized project information.

Email, Telegram, and push notifications can be integrated through existing or later adapters. Do not make an external integration a prerequisite for the core module.

Avoid duplicate notifications caused by retries.

---

# 20. AUDIT AND CHANGE CONTROL

Record important business events:

- Task creation.
- Assignment and reassignment.
- Team plan publication.
- Deadline changes.
- Priority changes.
- Status transitions.
- Progress submissions.
- Review decisions.
- Approval.
- Capacity overrides.
- Permission changes affecting planning.

Audit entries should identify the actor, target record, action, timestamp, and relevant change details.

Require a reason for selected overrides or significant published-plan changes.

Do not allow ordinary users to rewrite or delete audit history through the application.

Apply retention policies consistent with the existing DCOS governance architecture.

---

# 21. ROLE-BASED ACCESS CONTROL

Use the existing DCOS authentication and authorization framework.

Suggested capabilities:

## Platform Administrator

- Configure module settings.
- Manage authorized organization-wide configuration.
- Administer access according to existing policies.

## Company Administrator

- Manage organization settings and authorized employee/team relationships.
- Access company-level planning information according to permissions.

## Project Manager

- View and manage project-level planning within assigned scope.
- Coordinate cross-discipline priorities.
- Monitor project progress and risks.

## Discipline Manager

- View authorized discipline tasks.
- Prepare and publish team plans.
- Assign and reassign tasks.
- Monitor team workload.
- Review or approve work only when authorized.
- Resolve or escalate blockers.

## Senior Engineer / Senior Specialist

- View authorized tasks.
- Execute assigned work.
- Support other staff.
- Review work when explicitly authorized.

## Engineer / Junior / Staff

- View authorized assigned tasks.
- Update progress.
- Record actual effort where enabled.
- Submit deliverables.
- Report blockers.
- Request clarification or reassignment.

## Viewer

- Read-only access within explicitly authorized scope.

These are role examples. Implement permissions using the existing RBAC design rather than hard-coding all permissions solely by job title.

Enforce authorization on the server and in the database where applicable. Hiding a UI button is not security.

---

# 22. REPORTING AND KPI

Provide role-appropriate reporting.

## Staff

- Assigned tasks.
- Completed tasks.
- Overdue tasks.
- Actual hours.
- Planned versus actual effort.
- Work awaiting review.
- Personal workload.

## Discipline Manager

- Team task status.
- Unassigned workload.
- Staff utilization.
- Overdue tasks.
- Blockers.
- Review backlog.
- Workload distribution.
- Planned versus actual effort.

## Project Manager

- Cross-discipline progress.
- Critical tasks.
- Cross-team blockers.
- Upcoming deadlines.
- Milestone risks.
- Task completion trends.

## Management

- Authorized company-wide project and team summaries.
- Resource demand.
- Capacity bottlenecks.
- Completion trends.
- Operational risks.

Potential KPIs:

- On-time completion rate.
- Overdue task rate.
- Planned versus actual effort variance.
- Review rejection rate.
- Rework frequency.
- Workload utilization.
- Blocker resolution time.

Define every KPI precisely.

Do not rank employees using raw task counts alone. Different tasks have different complexity and effort.

Avoid presenting utilization or hours alone as proof of employee productivity.

---

# 23. AI FEATURES — AFTER CORE WORKFLOWS ARE STABLE

AI functionality must be optional and must not block core operations.

## AI Manager Assistant

Support future recommendations for:

- Task allocation.
- Workload balancing.
- Competency matching.
- Deadline risk.
- Capacity conflicts.
- Blocker analysis.
- Alternative task distribution.

AI recommendations should identify their inputs, explain their reasoning, and flag missing information.

## AI Staff Assistant

Potential questions:

- What should I prioritize today?
- Which tasks are due this week?
- What deliverables remain incomplete?
- Which dependencies are blocking my work?
- What review comments require action?

AI answers must be based on authorized DCOS records.

## Approval policy

AI must never independently publish a team plan, approve engineering deliverables, override access permissions, or alter official allocations without an authorized human action.

Do not send confidential data to external AI providers without the applicable authorization and data-handling controls.

Implement AI only after the deterministic task, assignment, and workflow features have been tested.

---

# 24. DATABASE DESIGN

First inspect the existing schema. Extend it instead of duplicating existing entities.

The logical data model may require the following entities, mapped to the actual DCOS naming conventions:

- Task types.
- Task templates.
- Tasks.
- Task dependencies.
- Task deliverables.
- Task assignments.
- Assignment roles.
- Team plans.
- Team plan items.
- Weekly plans.
- Daily work records.
- Progress history.
- Actual effort records.
- Task comments.
- Blockers or task issues.
- Review records.
- Notifications.
- Audit events.
- Capacity reservations, if not already provided.

Organization, employee, project, WBS, document, calendar, and leave references should reuse their existing authoritative tables.

## Database requirements

- Stable primary keys.
- Foreign key constraints.
- Appropriate uniqueness constraints.
- Indexes for common filters and relationships.
- Explicit timestamps.
- Defined deletion and archival behavior.
- Transactional handling for multi-record operations.
- Concurrency protection for critical allocations.
- Consistent tenant/company isolation.
- Appropriate database constraints and Row Level Security.

Use database migrations for schema changes.

Never edit production schema manually as a substitute for versioned migrations.

Do not reset the database to make migrations pass.

Do not expose service-role secrets to the browser.

Do not trust user-supplied employee IDs or project IDs without server-side authorization checks.

Use the existing database migration workflow and reconcile existing migration history before applying changes.

---

# 25. API AND BUSINESS LOGIC

Implement server-side operations for the actual application framework.

Provide appropriate operations for:

- Listing authorized tasks.
- Creating and updating tasks.
- Applying task templates.
- Assigning staff.
- Reassigning staff.
- Creating and updating team plans.
- Publishing plans.
- Reading personal tasks.
- Updating task progress.
- Recording actual effort.
- Submitting deliverables.
- Reviewing and approving work.
- Reporting and resolving blockers.
- Reading workload and capacity.
- Reading KPI summaries.
- Accessing audit history.

The names and endpoints should follow the existing repository conventions.

Validate inputs on the server.

Enforce permissions at every operation.

Use transactions or equivalent safe operations when assignments, plan publication, or approvals require multiple changes to succeed together.

Handle invalid status transitions and concurrent updates explicitly.

Return understandable validation and authorization errors.

Do not rely on client-side calculations as the authoritative source for capacity or permission checks.

---

# 26. UI/UX REQUIREMENTS

Use the existing DCOS design system and navigation.

Do not create a separate visual identity or unrelated dashboard.

Build responsive, practical interfaces for engineering and construction staff.

Required screens:

1. Task Team Planning Overview.
2. Task Pool.
3. Task Detail.
4. Manager Workspace.
5. Team Members.
6. Staff Workload.
7. Capacity Overview.
8. Team Planning Board.
9. Team Plan Detail.
10. Weekly Team Plan.
11. My Workspace.
12. My Tasks.
13. My Day.
14. My Week.
15. Staff Task Detail.
16. Deliverables.
17. Review Queue.
18. Blockers and Issues.
19. Reports and KPI.
20. Configuration screens for authorized administrators.

Use shared components where practical.

Provide:

- Loading states.
- Error states.
- Empty states.
- Search and filters.
- Pagination where needed.
- Form validation.
- Confirmation for significant actions.
- Clear status indicators.
- Accessible controls.
- Responsive layouts.
- Consistent date and timezone handling.

Do not use fake KPI values in the production interface.

Demo or seed data must be clearly identified as demo data.

---

# 27. TESTING REQUIREMENTS

Create automated tests using the repository's existing test framework.

At minimum, test:

## Organization

- Employees belong to authorized teams.
- Team membership changes are reflected correctly.
- Inactive employees cannot receive new assignments where policy prohibits it.

## Task management

- Task creation and editing.
- WBS relationship validation.
- Task template application.
- Dependency validation.
- Prevention of duplicate template-generated tasks where applicable.

## Assignment

- Authorized assignment.
- Unauthorized assignment rejection.
- Reassignment history.
- Multi-project capacity conflicts.
- Concurrent allocation handling.

## Staff workspace

- Staff see their authorized tasks.
- Staff cannot view another employee's restricted tasks.
- Staff cannot approve their own work when separation of duties is required.

## Workflow

- Valid status transitions.
- Invalid transitions rejected.
- Review and resubmission.
- Completion requirements.
- Audit history.

## Security

- Server-side permission enforcement.
- Tenant/company isolation.
- Database Row Level Security.
- No unauthorized document access.
- No exposed secrets.

## User experience

- Main screens render correctly.
- Filters work.
- Forms validate correctly.
- Loading, error, and empty states work.
- Critical workflows are usable on desktop and mobile.

Run available lint, type-check, unit, integration, and build commands.

Report tests that could not be run because of unavailable infrastructure.

Do not claim that tests passed unless they actually ran successfully.

---

# 28. IMPLEMENTATION PHASES

Implement in this order.

## Phase 0 — Repository and architecture audit

Inspect the current DCOS application and produce an integration plan.

## Phase 1 — Foundation

Implement or integrate:

- Organization and discipline references.
- Team membership.
- Employee competency references.
- Project and WBS integration.
- Permissions and authorization.

Reuse existing modules wherever possible.

## Phase 2 — Task engine

Implement:

- Task types.
- Task Master.
- Task templates.
- Task Pool.
- Dependencies.
- Deliverables.

## Phase 3 — Manager planning

Implement:

- Manager dashboard.
- Team workload.
- Capacity checks.
- Staff allocation.
- Team plans.
- Publication workflow.

## Phase 4 — Staff workspace

Implement:

- My Dashboard.
- My Tasks.
- My Day.
- My Week.
- Task Detail.
- Progress updates.
- Actual effort.
- Deliverables.
- Blocker reporting.

## Phase 5 — Review and control

Implement:

- Review queues.
- Review comments.
- Approval workflow.
- Reassignment requests.
- Notifications.
- Audit history.

## Phase 6 — Reporting

Implement:

- Staff reports.
- Team reports.
- Discipline reports.
- Project summaries.
- KPI calculations.

## Phase 7 — Integration

Connect to existing Planning, Resource, HR, Document, BIM, QS, Procurement, Construction, QAQC, HSE, and other applicable modules.

Implement only integrations supported by actual DCOS entities and business workflows.

## Phase 8 — AI enhancements

Implement AI recommendations after core workflows, permissions, and data quality are reliable.

## Phase 9 — Production readiness

Complete:

- Security review.
- Database migration review.
- Automated testing.
- Build verification.
- Error handling.
- Performance checks.
- Documentation.
- Deployment instructions.
- Acceptance testing.

At the end of every phase, summarize changed files, migrations, implemented features, test results, and remaining issues.

---

# 29. DEFINITION OF DONE

The module is not complete merely because the dashboard looks good.

The implementation is accepted when the following end-to-end scenario works.

## Scenario A — Manager

1. An authorized Manager opens a project.
2. The Manager sees the relevant WBS tasks.
3. The Manager selects the tasks requiring allocation.
4. The Manager assigns tasks to authorized team members.
5. The Manager specifies PIC, support, reviewer, and approver where required.
6. The Manager sets planned dates and estimated effort.
7. The system calculates workload and warns about capacity conflicts.
8. The Manager resolves conflicts or records authorized overrides.
9. The Manager publishes the team plan.
10. The system records the publication and notifies affected staff.

## Scenario B — Individual staff

1. Staff member A logs in.
2. Staff member A sees their own assigned tasks.
3. Staff member A opens a task and understands the required work.
4. Staff member A starts work.
5. Staff member A updates progress and actual effort.
6. Staff member A uploads or links the required deliverables.
7. Staff member A reports blockers when necessary.
8. Staff member A submits the work for review.
9. The assigned Reviewer reviews and approves or returns the submission.
10. The staff member can address review comments and resubmit.

## Scenario C — Management

1. The Manager sees the current team workload.
2. The Project Manager sees authorized cross-discipline progress.
3. Overdue tasks and blockers appear in the appropriate dashboards.
4. Approved work updates the relevant task status.
5. Reports reflect actual database records.
6. Assignment and approval history remain auditable.

## Scenario D — Security

1. An unauthorized user cannot assign tasks.
2. Staff cannot approve restricted work.
3. Users cannot read records outside their authorized scope.
4. Server and database controls enforce permissions.
5. Published-plan changes are traceable.

---

# 30. IMPLEMENTATION RULES FOR THE CODING AGENT

Follow these rules throughout development.

1. Inspect before modifying.
2. Reuse existing components and business entities.
3. Preserve existing WBS and project relationships.
4. Never reset the database to simplify development.
5. Use version-controlled migrations.
6. Never bypass authorization to make a demo work.
7. Never use fake data as a substitute for core functionality.
8. Do not introduce unnecessary dependencies.
9. Keep business logic separate from presentation components.
10. Use the existing TypeScript and coding conventions.
11. Implement error handling and validation.
12. Keep secrets on the server.
13. Test each critical workflow.
14. Do not silently change existing business behavior.
15. Do not implement every phase as one giant, unreviewable code change.
16. If an assumption is necessary, document it and choose the least disruptive option.
17. Ask for clarification only when an unresolved decision materially affects architecture, data integrity, security, or business rules.
18. Do not stop after producing a plan. Continue into implementation, testing, and documentation unless blocked by a genuine constraint.

---

# 31. FINAL DELIVERABLES

Provide:

1. Repository audit report.
2. Architecture and integration plan.
3. Data model and relationship documentation.
4. Versioned database migrations.
5. Backend operations and validation.
6. Manager Workspace.
7. Staff Workspace.
8. Task assignment and planning workflows.
9. Review and approval workflows.
10. Workload and capacity calculations.
11. Notifications and audit history.
12. Reports and KPI.
13. Automated tests.
14. Updated navigation and permissions.
15. Setup and deployment instructions.
16. User guide for Managers.
17. User guide for Staff.
18. Acceptance test results.
19. List of incomplete items and known limitations.

---

# FINAL INSTRUCTION

Start by auditing the existing DCOS repository.

Then produce a concise implementation plan that maps the required capabilities to existing files, modules, database tables, and missing functionality.

After that, implement the module phase by phase.

The final result must be a working, integrated DCOS feature in which Managers plan and allocate team work, individual staff execute their own assignments, and progress flows back into project reporting.

**Build the real system, preserve the existing architecture, verify the results, and never claim completion for functionality that has not been implemented and tested.**