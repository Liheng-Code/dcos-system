\# INTELLIGENT CONSTRUCTION PLANNING SYSTEM
\## Product Requirements Document (PRD) \& Technical Architecture

> DCOS status against this PRD (what exists, the gaps, the phased to-do list): [doc 35, ICPS Gap Register and Roadmap](35-ICPS-Gap-Register-and-Roadmap.md).

\*\*Document ID:\*\* ICPS-PRD-001  
\*\*Version:\*\* 1.0  
\*\*Status:\*\* Proposed — Architecture Baseline  
\*\*Product Type:\*\* Construction Planning \& Project Control Software  
\*\*Development Approach:\*\* Modular, Hybrid, Engineering-Driven  
\*\*Scheduling Engine:\*\* Proprietary Scheduling Engine  
\*\*Primary Users:\*\* Planning Engineers, Project Managers, Construction Managers, Management
\---

**# PART A — PRODUCT REQUIREMENTS DOCUMENT**
**## 1. Product Vision**
Develop an intelligent construction planning and project-control system that transforms project information, BOQ quantities, standardized construction knowledge and productivity data into reliable construction programmes
The system must reduce manual planning work, improve scheduling accuracy, promote reuse of engineering knowledge, and simplify project monitoring and control.
**### 1.1 Five Core Principles**

1\. \*\*Accuracy:\*\* Engineering-based calculations, validated scheduling logic and traceable assumptions.
2\. \*\*Speed:\*\* Automated programme preparation, calculation and reporting.
3\. \*\*Reusability:\*\* Standardized libraries, reusable templates and historical project knowledge.
4\. \*\*Ease of Use:\*\* Simple guided workflows and efficient professional controls.
5\. \*\*User Friendliness:\*\* Intuitive interfaces, clear feedback and minimal repetitive operations.

**### 1.2 Product Differentiation**

The product must not simply reproduce Microsoft Project or Primavera P6.
It must provide construction-specific intelligence, including:
\- WBS generation.
\- BOQ-to-activity mapping.
\- Quantity-driven scheduling.
\- Productivity-based duration calculation.
\- Construction sequence recommendations.
\- Resource planning.
\- Schedule QA/QC.
\- Automated progress updating.
\- Forecasting and recovery planning.
\- AI-assisted planning.

**## 2. Product Objectives**

| ID 	 | Objective 				| Measurement 							  |
|--------|------------------------------------- |---------------------------------------------------------------- |
| OBJ-01 | Reduce schedule preparation time 	| At least 50% reduction against measured traditional workflows   |
| OBJ-02 | Improve schedule accuracy 		| 100% agreement with approved deterministic reference test cases |
| OBJ-03 | Improve activity reusability 	| At least 80% applicable library reuse in pilot projects 	  |
| OBJ-04 | Reduce manual data entry 		| At least 70% reduction in identified repetitive operations 	  |
| OBJ-05 | Improve progress reporting 		| At least 50% reduction in weekly update preparation time 	  |
| OBJ-06 | Improve schedule quality 		| All mandatory QA/QC rules executed before baseline submission   |
| OBJ-07 | Support professional planners 	| Advanced editing and scheduling control 			  |
| OBJ-08 | Support new planners 		| Guided programme preparation workflow 			  |

These are initial product targets. Pilot testing must establish realistic baselines and refine the targets.

**## 3. Target Users and Roles**

| Role 			   | Responsibilities 					     |
|--------------------------|---------------------------------------------------------|
| System Administrator     | Configure system-wide settings and user access 	     |
| Planning Manager 	   | Manage planning standards, templates and approvals      |
| Planning Engineer 	   | Prepare and update project programmes 		     |
| Senior Planning Engineer | Review schedules, logic and calculations 		     |
| Project Manager 	   | Review performance and approve project plans 	     |
| Construction Manager 	   | Review construction sequence and execution requirements |
| Site Engineer 	   | Submit actual progress and daily quantities 	     |
| QS Engineer 		   | Provide BOQ and quantity information 		     |
| Management 		   | View project performance and management reports 	     |
| Viewer 		   | View authorized project information 		     |

Permissions must be configurable by project, module and action.
**## 4. Product Scope**
**### 4.1 Included in Version 1.0**
1\. Project planning configuration.
2\. WBS management.
3\. Planning knowledge library.
4\. BOQ import and mapping.
5\. Activity generation.
6\. Duration calculation.
7\. Scheduling and CPM engine.
8\. Gantt chart.
9\. Resource planning.
10\. Cost planning.
11\. Baseline management.
12\. Daily and periodic progress updating.
13\. Schedule QA/QC.
14\. Progress monitoring.
15\. Delay analysis.
16\. Forecasting.
17\. Recovery planning.
18\. Reporting.
19\. MS Project and Excel interoperability.
20\. AI-assisted planning recommendations.

**### 4.2 Excluded from Initial Version**

\- Full ERP accounting.
\- Full procurement transaction management.
\- Payroll processing.
\- BIM authoring.
\- Full construction site management.
\- Automatic contractual entitlement determination.
\- Unsupervised AI modification of approved baselines.

These may be delivered through integrations or future product versions.
\---
**# 5. Functional Architecture**
The system consists of 12 functional groups.



| ID 	 | Functional group 		| Priority |
|------- |----------------------------- |--------- |
| MOD-01 | Project Planning Setup 	| P1 	   |
| MOD-02 | WBS Management 		| P1 	   |
| MOD-03 | Planning Knowledge Library   | P1 	   |
| MOD-04 | BOQ \& Quantity Mapping 	| P1 	   |
| MOD-05 | Schedule Development 	| P1 	   |
| MOD-06 | Resource Planning 		| P2 	   |
| MOD-07 | Cost \& Cash Flow Planning   | P2 	   |
| MOD-08 | Baseline Management 		| P1 	   |
| MOD-09 | Progress Management 		| P2 	   |
| MOD-10 | Schedule Control \& QA/QC 	| P1 	   |
| MOD-11 | Forecast \& Recovery 	| P3 	   |
| MOD-12 | Reporting \& Closure 	| P2 	   |

P1 = Essential foundation. P2 = Operational expansion. P3 = Advanced control.

**## 5.1 MOD-01: Project Planning Setup**
\*\*Purpose:\*\* Establish the project environment and planning parameters.

Requirements:
\- FR-001: Create project planning workspace.
\- FR-002: Define contract commencement and completion dates.
\- FR-003: Configure project calendars.
\- FR-004: Define working days and working hours.
\- FR-005: Configure holidays and non-working periods.
\- FR-006: Define project milestones.
\- FR-007: Configure progress calculation methods.
\- FR-008: Configure project time units.
\- FR-009: Define project-specific scheduling settings.
\- FR-010: Import project configuration templates.

Acceptance criteria:

\- Project dates must be validated.
\- All activities must have an applicable calendar.
\- Calendar changes must trigger controlled schedule recalculation.
\- Existing approved baseline dates must remain unchanged.

**## 5.2 MOD-02: WBS Management**

\*\*Purpose:\*\* Establish the project breakdown structure.

Default hierarchy:
Project → Phase → Building → Level → Zone → Room → Element → Discipline → Task Group.
Requirements:

\- FR-011: Create and edit WBS elements.
\- FR-012: Automatically generate WBS codes.
\- FR-013: Support configurable hierarchy levels.
\- FR-014: Support multiple buildings.
\- FR-015: Support multiple construction zones.
\- FR-016: Assign WBS responsibilities.
\- FR-017: Copy and reuse WBS templates.
\- FR-018: Import and export WBS.
\- FR-019: Maintain WBS revision history.
\- FR-020: Validate parent-child relationships.

Acceptance criteria:

\- Every WBS element must have a unique project-level code.
\- Activities must reference valid WBS elements.
\- Changes must not silently invalidate existing activities.
\- Deletion must be restricted where dependent records exist.

**## 5.3 MOD-03: Planning Knowledge Library**

\*\*Purpose:\*\* Maintain standardized and reusable construction knowledge.

Library categories:

1\. WBS templates.
2\. Activity library.
3\. Productivity norms.
4\. Resource library.
5\. Construction logic templates.
6\. Construction methodology templates.
7\. Project templates.
8\. Cost benchmarks.
9\. Reporting templates.

Requirements:

\- FR-021: Create standardized activity records.
\- FR-022: Configure productivity norms.
\- FR-023: Configure activity units.
\- FR-024: Define resource requirements.
\- FR-025: Define construction sequence templates.
\- FR-026: Define activity applicability.
\- FR-027: Support library versioning.
\- FR-028: Approve and publish library revisions.
\- FR-029: Reuse library content between projects.
\- FR-030: Record the source of productivity assumptions.

Acceptance criteria:

\- Published library versions must be traceable.
\- Project-specific changes must not silently modify the master library.
\- Reused data must retain its source and version.
\- Users must be able to distinguish standard values from project-specific overrides.

**## 5.4 MOD-04: BOQ \& Quantity Mapping**
\*\*Purpose:\*\* Convert contractual BOQ information into schedule-related quantities.

Requirements:

\- FR-031: Import BOQ from Excel.
\- FR-032: Validate imported BOQ data.
\- FR-033: Standardize BOQ classification.
\- FR-034: Map BOQ items to activity library records.
\- FR-035: Support one-to-many mappings.
\- FR-036: Support many-to-one mappings.
\- FR-037: Allocate quantities by building, floor and zone.
\- FR-038: Identify unmapped BOQ items.
\- FR-039: Detect quantity duplication.
\- FR-040: Reconcile mapped quantities with source BOQ quantities.
\- FR-041: Maintain mapping revision history.
\- FR-042: Support manual mapping and approved mapping templates.

Acceptance criteria:

\- BOQ items and activities must remain separate entities.
\- Mapping must not automatically duplicate quantities.
\- Quantity allocation must be traceable.
\- Unmapped items must be reported.
\- Quantity changes must trigger an impact review.

**## 5.5 MOD-05: Schedule Development**

\*\*Purpose:\*\* Generate and manage project construction programmes.

Requirements:

\- FR-043: Generate activities from the WBS.
\- FR-044: Generate activities from templates.
\- FR-045: Generate activities by building, floor and zone.
\- FR-046: Copy activities from typical floors.
\- FR-047: Assign activity quantities.
\- FR-048: Calculate durations using productivity norms.
\- FR-049: Allow authorized manual duration overrides.
\- FR-050: Define activity relationships.
\- FR-051: Support FS, SS, FF and SF relationships.
\- FR-052: Support lead and lag.
\- FR-053: Support activity constraints.
\- FR-054: Calculate early and late dates.
\- FR-055: Calculate critical path.
\- FR-056: Calculate total and free float.
\- FR-057: Display Gantt charts.
\- FR-058: Support bulk editing.
\- FR-059: Support activity filtering and grouping.
\- FR-060: Support undo and redo.
\- FR-061: Detect circular dependencies.
\- FR-062: Detect missing or invalid schedule logic.

Acceptance criteria:

\- Schedule calculations must be deterministic.
\- Recalculating unchanged inputs must produce identical results.
\- Invalid dependency networks must be reported.
\- All manual overrides must be traceable.
\- Gantt dates must match scheduling engine results.

**## 5.6 MOD-06: Resource Planning**

Requirements:

\- FR-063: Define labour resources.
\- FR-064: Define equipment resources.
\- FR-065: Define material resources.
\- FR-066: Assign resources to activities.
\- FR-067: Calculate resource requirements.
\- FR-068: Generate manpower histograms.
\- FR-069: Generate equipment histograms.
\- FR-070: Detect resource over-allocation.
\- FR-071: Support resource levelling.
\- FR-072: Compare planned and available resources.

Acceptance criteria:

\- Resource assignments must be time-phased.
\- Resource conflicts must be identifiable.
\- Resource levelling must not silently change approved baseline data.
\- Every levelling adjustment must be explainable.

**## 5.7 MOD-07: Cost \& Cash Flow Planning**

Requirements:

\- FR-073: Assign activity budget costs.
\- FR-074: Define labour, material and equipment cost components.
\- FR-075: Calculate activity budgets.
\- FR-076: Generate time-phased cost plans.
\- FR-077: Generate planned cash flow.
\- FR-078: Compare planned cost with actual cost where integrated data exists.
\- FR-079: Maintain cost assumptions and revisions.

Acceptance criteria:

\- Cost calculations must be traceable to source quantities and rates.
\- Cost distribution must reconcile with approved budget totals.
\- Financial values must use configured currencies and precision.

**## 5.8 MOD-08: Baseline Management**

Requirements:

\- FR-080: Create schedule revisions.
\- FR-081: Submit schedules for review.
\- FR-082: Approve or reject schedules.
\- FR-083: Create approved baseline versions.
\- FR-084: Freeze approved baseline data.
\- FR-085: Compare baseline versions.
\- FR-086: Maintain baseline approval history.
\- FR-087: Record contractual and internal baseline status.

Acceptance criteria:

\- Approved baseline versions are immutable.
\- Modifications require a new revision or authorized change process.
\- Historical baseline data remains accessible.
\- Every approval records user, date and decision.

**## 5.9 MOD-09: Progress Management**

Requirements:

\- FR-088: Record actual start and finish dates.
\- FR-089: Record actual quantities.
\- FR-090: Record remaining quantities.
\- FR-091: Calculate physical progress.
\- FR-092: Support weighted milestone progress.
\- FR-093: Record manpower and equipment performance.
\- FR-094: Import daily construction reports.
\- FR-095: Verify submitted progress.
\- FR-096: Approve progress updates.
\- FR-097: Maintain actual progress history.

Acceptance criteria:

\- Actual quantities cannot exceed approved scope without an authorized scope adjustment.
\- Progress calculations must follow configured rules.
\- Rejected reports must not affect approved progress.
\- Every update must be traceable to its source.

**## 5.10 MOD-10: Schedule Control \& QA/QC**

Requirements:

\- FR-098: Compare baseline against actual.
\- FR-099: Compare baseline against forecast.
\- FR-100: Calculate schedule variance.
\- FR-101: Calculate schedule performance indicators.
\- FR-102: Identify critical and near-critical activities.
\- FR-103: Detect missing relationships.
\- FR-104: Detect invalid activity dates.
\- FR-105: Detect abnormal durations.
\- FR-106: Detect productivity anomalies.
\- FR-107: Generate schedule QA/QC reports.
\- FR-108: Maintain findings and resolution status.

Acceptance criteria:

\- All mandatory checks must execute.
\- Findings must include evidence and affected records.
\- Critical findings must block baseline submission where configured.
\- Warnings must remain visible until resolved or formally accepted.

**## 5.11 MOD-11: Forecast \& Recovery**

Requirements:

\- FR-109: Forecast activity completion dates.
\- FR-110: Forecast project completion.
\- FR-111: Identify delayed activities.
\- FR-112: Analyze critical path changes.
\- FR-113: Create recovery scenarios.
\- FR-114: Simulate resource increases.
\- FR-115: Simulate working calendar changes.
\- FR-116: Compare recovery scenarios.
\- FR-117: Approve recovery programmes.
\- FR-118: Track recovery action effectiveness.

Acceptance criteria:

\- Forecasts must retain their assumptions and calculation date.
\- Recovery scenarios must be separate from the approved baseline.
\- The system must not promise recovery without calculating resource and logic feasibility.
\- Approved changes must be traceable.

**## 5.12 MOD-12: Reporting \& Closure**

Requirements:

\- FR-119: Generate master programme.
\- FR-120: Generate look-ahead programmes.
\- FR-121: Generate weekly progress reports.
\- FR-122: Generate monthly progress reports.
\- FR-123: Generate S-curves.
\- FR-124: Generate resource histograms.
\- FR-125: Generate delay registers.
\- FR-126: Generate recovery reports.
\- FR-127: Generate final schedule performance reports.
\- FR-128: Export reports to Excel and PDF.
\- FR-129: Archive completed project schedules.

Acceptance criteria:

\- Report figures must reconcile with the underlying approved data.
\- Reports must identify their data date and baseline reference.
\- Historical reports must remain reproducible.
\---

**# PART B — USER EXPERIENCE ARCHITECTURE**
**## 6. Dual Interface Strategy**
The system must provide two interfaces using the same backend and scheduling engine.
**### 6.1 Guided Planning Mode**

Target users:

\- Junior Planning Engineers.
\- New users.
\- Project Engineers.
\- Users preparing standard construction programmes.

Interface characteristics:

\- Step-by-step workflow.
\- Simple data-entry forms.
\- Automated suggestions.
\- Clear validation feedback.
\- Minimal technical configuration.
\- Contextual help.
\- Progress indicators.

Main workflow:

1\. Create project.
2\. Configure project information.
3\. Select WBS template.
4\. Import BOQ.
5\. Map BOQ to activities.
6\. Generate activities.
7\. Calculate durations.
8\. Generate schedule logic.
9\. Review Gantt programme.
10\. Complete QA/QC.
11\. Submit for approval.

**### 6.2 Advanced Planning Mode**

Target users:
\- Experienced Planning Engineers.
\- Senior Planning Engineers.
\- Planning Managers.

Interface characteristics:

\- Interactive Gantt chart.
\- Spreadsheet-style activity table.
\- Direct predecessor/successor editing.
\- Multiple calendar management.
\- Advanced filtering.
\- Bulk operations.
\- Baseline comparison.
\- Critical path highlighting.
\- Resource histograms.
\- Schedule calculation controls.

**### 6.3 Shared Interface Principles**

Both modes must:

\- Use the same schedule data.
\- Use the same calculation engine.
\- Apply the same permission rules.
\- Preserve the same revisions.
\- Display the same baseline information.
\- Provide consistent validation results.

Switching modes must not create duplicate schedules.

\---

**# PART C — TECHNICAL ARCHITECTURE**
**## 7. Overall Technical Architecture**

The system should use a modular architecture with clear separation between the frontend, application services, scheduling engine, knowledge services and database.

```text

                  USERS
                    |
         +----------+----------+
         |                     |
    GUIDED MODE           ADVANCED MODE
         |                     |
         +----------+----------+
                    |
            FRONTEND API
                    |
            APPLICATION LAYER
                    |
    +---------------+----------------+
    |               |                |
PROJECT         PLANNING          USER \& ACCESS
SERVICE         SERVICES           SERVICE
                    |
      +-------------+-------------+
      |             |             |
 KNOWLEDGE      SCHEDULING     PROGRESS
 SERVICES       ENGINE         SERVICES
      |             |             |
      +-------------+-------------+
                    |
           DATABASE LAYER
                    |
       PostgreSQL / File Storage
                    |
            INTEGRATION LAYER
                    |
      QS / HR / PROCUREMENT / ETC.
```

**## 8. Recommended Technology Stack**

| Layer 		| Recommended technology 		| Responsibility 			|
|-----------------------|---------------------------------------|--------------------------------------	|
| Frontend 		| Next.js + React + TypeScript 		| User interface 			|
| UI components 	| Tailwind CSS + component library 	| Consistent interface 			|
| Gantt visualization   | Custom Gantt component 		| Schedule visualization and editing 	|
| Backend 		| TypeScript application services 	| Business logic and APIs 		|
| Scheduling engine 	| Independent TypeScript package 	| CPM and schedule calculations 	|
| Database 		| PostgreSQL 				| Structured project data 		|
| Backend platform 	| Supabase 				| Database, authentication and storage  |
| API 			| REST initially  			| Communication between modules 	|
| Background jobs 	| Worker/job queue 			| Large calculations and reports 	|
| File storage 		| Supabase Storage or object storage 	| Attachments and imports 		|
| Testing 		| Vitest + Playwright 			| Unit and end-to-end testing 		|
| Version control 	| GitHub 				| Source control 			|
| Deployment 		| Vercel + suitable backend hosting 	| Application deployment 		|

The recommended stack should reuse the existing DCOS technical foundation where practical rather than introducing unnecessary infrastructure.

Important architectural rule:
The scheduling engine must remain independent of the frontend framework and database provider.
It must be possible to use the same engine through APIs, automated jobs and other products.

\## 9. Scheduling Engine Architecture

This is the most important technical component of the entire product.
The engine must be developed independently as a reusable software package.

Proposed package:
`@icps/scheduling-engine`

**### 9.1 Engine Responsibilities**

1\. Schedule input validation.
2\. Dependency graph construction.
3\. Circular dependency detection.
4\. Calendar calculations.
5\. Forward pass.
6\. Backward pass.
7\. Total float calculation.
8\. Free float calculation.
9\. Critical path identification.
10\. Constraint evaluation.
11\. Schedule recalculation.
12\. Calculation diagnostics.

**### 9.2 Scheduling Calculation Workflow**

```text

Schedule Input
     |
     v
Input Validation
     |
     v
Build Activity Dependency Graph
     |
     v
Detect Circular Dependencies
     |
     v
Resolve Calendars and Constraints
     |
     v
Forward Pass
     |
     v
Calculate Early Start / Finish
     |
     v
Backward Pass
     |
     v
Calculate Late Start / Finish
     |
     v
Calculate Total Float / Free Float
     |
     v
Identify Critical Path
     |
     v
Schedule Validation
     |
     v
Calculated Schedule Output

```
**### 9.3 Scheduling Engine Data Structure**

Each activity should contain:

\- Activity ID.
\- Activity code.
\- Activity name.
\- WBS ID.
\- Original duration.
\- Remaining duration.
\- Actual duration.
\- Calendar ID.
\- Activity type.
\- Constraint information.
\- Actual start.
\- Actual finish.
\- Calculated early start.
\- Calculated early finish.
\- Calculated late start.
\- Calculated late finish.
\- Total float.
\- Free float.
\- Critical status.

Each relationship should contain:

\- Relationship ID.
\- Predecessor activity ID.
\- Successor activity ID.
\- Relationship type.
\- Lag duration.
\- Lag calendar.
\- Relationship status.

**### 9.4 Core Scheduling Mathematics**

For a simple FS relationship:
Successor early start must respect predecessor early finish plus the applicable lag.
The engine must calculate dates in working time, respecting the relevant calendars.

For a simplified continuous-time model:
ES(successor) >= EF(predecessor) + lag
For SS, FF and SF relationships, the corresponding start/finish constraints must be evaluated separately.
The actual engine must use a consistent time representation and calendar-aware date arithmetic rather than simply adding calendar days.

**### 9.5 CPM Calculation Requirements**

The engine must support:

\- Multiple starting activities.
\- Multiple ending activities.
\- Independent network branches.
\- Multiple calendars.
\- Relationship lags.
\- Milestones.
\- Constraints.
\- Actual progress.
\- Remaining duration.
\- Open-ended logic diagnostics.
\- Multiple critical paths.
\- Negative float where applicable.

Important: The engine must not assume that every activity with zero float is automatically the only critical activity. Critical path identification must consider the selected completion milestone, applicable constraints and scheduling rules.

\### 9.6 Engine Calculation Principles
\- Deterministic output.
\- No AI dependency for core scheduling calculations.
\- No direct database dependency.
\- No UI dependency.
\- Full calculation traceability.
\- Version-controlled calculation rules.
\- Automated reference test cases.
\- Explicit error reporting.

**### 9.7 Engine Version Control**

Every calculation result should record:

\- Engine version.
\- Calculation timestamp.
\- Input schedule revision.
\- Calendar versions.
\- Scheduling settings.
\- Calculation warnings.
\- Calculation result reference.

This allows historical schedules to be reproduced and audited.

\---

**# PART D — DATABASE ARCHITECTURE**

\## 10. Main Database Domains

The database should be organized into functional domains.

| Domain 	| Main responsibility 			   |
|---------------|------------------------------------------|
| PROJECT 	| Project master information 		   |
| WBS 		| Hierarchical project breakdown 	   |
| LIBRARY 	| Reusable planning knowledge 		   |
| BOQ 		| Contractual quantities 		   |
| ACTIVITY 	| Project schedule activities 		   |
| SCHEDULE 	| Relationships and scheduling information |
| CALENDAR 	| Working calendars and holidays 	   |
| RESOURCE 	| Labour, equipment and materials 	   |
| COST 		| Activity budget and cost planning 	   |
| BASELINE 	| Approved schedule versions 		   |
| PROGRESS 	| Actual performance records 		   |
| FORECAST 	| Forecast and recovery scenarios 	   |
| QAQC 		| Schedule validation and findings 	   |
| REPORTING 	| Reporting configurations and snapshots   |
| SYSTEM 	| Users, roles, permissions and audit logs |

**## 11. Proposed Core Database Tables**

\### Project and WBS

\- projects
\- project\_settings
\- project\_milestones
\- project\_calendars
\- calendar\_working\_periods
\- calendar\_exceptions
\- wbs\_nodes
\- wbs\_templates
\- wbs\_template\_nodes

\### Planning Library

\- activity\_library
\- activity\_library\_versions
\- productivity\_norms
\- productivity\_norm\_versions
\- resource\_library
\- construction\_logic\_templates
\- project\_templates

\### BOQ and Quantities

\- boq\_imports
\- boq\_items
\- boq\_item\_mappings
\- activity\_quantity\_allocations
\- quantity\_measurements

\### Schedule

\- schedules
\- schedule\_revisions
\- schedule\_activities
\- schedule\_relationships
\- activity\_constraints
\- schedule\_calculations
\- schedule\_calculation\_warnings

\### Resource and Cost

\- resource\_assignments
\- resource\_availability
\- activity\_cost\_items
\- project\_budgets
\- cost\_periods

\### Baseline and Progress

\- baseline\_versions
\- baseline\_activities
\- baseline\_relationships
\- progress\_periods
\- progress\_submissions
\- activity\_progress
\- progress\_approvals
\- actual\_resource\_usage

\### Forecast and QA/QC

\- forecast\_scenarios
\- forecast\_activities
\- recovery\_actions
\- schedule\_qaqc\_rules
\- schedule\_qaqc\_runs
\- schedule\_qaqc\_findings

\### Audit and Reporting

\- approval\_workflows
\- approval\_records
\- audit\_logs
\- report\_templates
\- report\_snapshots

**## 12. Database Design Principles**

1\. Every project-owned record must contain a project identifier.
2\. Every organization-owned record must contain a tenant identifier.
3\. All critical relationships must use foreign keys.
4\. Use UUID primary keys.
5\. Use database transactions for important multi-record operations.
6\. Maintain created\_at, updated\_at, created\_by and updated\_by where applicable.
7\. Use soft deletion where historical integrity is required.
8\. Preserve approved baselines as immutable records.
9\. Store source and version information for reused library data.
10\. Use database indexes for frequently queried project, WBS and schedule fields.
11\. Apply tenant-aware Row Level Security.
12\. Maintain audit trails for important business operations.

Do not store all schedule information in one large JSON column. Schedule activities, relationships, calendars, progress and resources require structured relational data.
JSONB can be used for flexible configuration, imported metadata and calculation assumptions where appropriate.

\---

**# PART E — DATA FLOW AND INTEGRATION**

**## 13. Core Data Flow**
```text

PROJECT INFORMATION
       |
       v
WBS STRUCTURE
       |
       v
BOQ IMPORT
       |
       v
BOQ STANDARDIZATION
       |
       v
ACTIVITY MAPPING
       |
       v
QUANTITY ALLOCATION
       |
       v
ACTIVITY GENERATION
       |
       v
DURATION CALCULATION
       |
       v
SCHEDULING ENGINE
       |
       v
RESOURCE / COST LOADING
       |
       v
SCHEDULE QA/QC
       |
       v
BASELINE APPROVAL
       |
       v
SITE PROGRESS
       |
       v
MONITORING AND FORECASTING

```

**## 14. Integration Requirements**

| Integration 	| Data received 			| Data provided 		    |
|---------------|---------------------------------------|-----------------------------------|
| PROJECT 	| Project scope and structure 		| Planning status 		    |
| QS 		| BOQ and measured quantities 		| Scheduled quantities 		    |
| CONSTRUCTION 	| Daily execution data 			| Planned activities and targets    |
| PROCUREMENT 	| Purchase and delivery status 		| Required material dates 	    |
| HR 		| Employee and labour information 	| Planned manpower demand 	    |
| EQUIPMENT 	| Equipment availability 		| Equipment demand 		    |
| QAQC 		| Inspection and approval status 	| Upcoming inspection requirements  |
| DOCUMENT 	| Drawings and revision information 	| Planned document/submission dates |
| FINANCE 	| Budget and actual cost 		| Planned cost distribution 	    |

All integrations should use defined API contracts and controlled synchronization.

\---

\# PART F — AI AND AUTOMATION ARCHITECTURE
**## 15. AI Planning Assistant**

AI should be an independent assistance layer.
It must never replace the deterministic scheduling engine.

\### AI capabilities

1\. WBS generation suggestions.
2\. Activity generation suggestions.
3\. BOQ-to-activity mapping suggestions.
4\. Productivity recommendations.
5\. Construction sequence recommendations.
6\. Schedule QA/QC explanations.
7\. Delay analysis summaries.
8\. Recovery scenario recommendations.
9\. Weekly and monthly reporting assistance.
10\. Natural-language schedule queries.

\### AI execution workflow

```text
User Request
    |
    v
AI Interpretation
    |
    v
Retrieve Project Context
    |
    v
Generate Proposed Action
    |
    v
Validate Against Business Rules
    |
    v
Run Scheduling Engine if Required
    |
    v
Present Results and Assumptions
    |
    v
Human Review and Approval
    |
    v
Execute Approved Changes
    |
    v
Audit Trail

```

\### AI safety requirements

\- AI must not silently modify approved baselines.
\- AI must identify assumptions.
\- AI must distinguish actual data from recommendations.
\- AI must not invent productivity rates.
\- AI must not approve its own recommendations.
\- All executed changes must be traceable.
\- High-impact actions require authorized human approval.

\---

**# PART G — NON-FUNCTIONAL REQUIREMENTS**
**## 16. System Performance**

Initial performance targets:

| ID 	  | Requirement 		    | Target 								    |
|---------|-------------------------------- |---------------------------------------------------------------------- |
| NFR-001 | Standard schedule recalculation | Under 10 seconds for a typical 5,000-activity project 		    |
| NFR-002 | Initial project generation 	    | Under 5 minutes for a defined standard template 			    |
| NFR-003 | Standard dashboard response     | Under 2 seconds for common queries 				    |
| NFR-004 | Standard report generation      | Under 60 seconds 							    |
| NFR-005 | Concurrent users 		    | Support at least 50 concurrent users in the initial production target |
| NFR-006 | Data consistency 		    | No silent loss of approved transactions 				    |
| NFR-007 | Calculation reproducibility     | Identical inputs and engine version produce identical results 	    |
| NFR-008 | API reliability 		    | Clear error handling, retry policies and idempotency 		    |

Performance must be measured under realistic data volumes and infrastructure configurations.

**## 17. Security Requirements**

\- Authentication.
\- Role-based access control.
\- Project-level permissions.
\- Tenant-level isolation.
\- Row Level Security.
\- Secure API authorization.
\- Audit trails.
\- File access control.
\- Approval authorization.
\- Session management.
\- Backup and recovery.
\- Protection against unauthorized baseline changes.

**## 18. Usability Requirements**

\- Consistent navigation.
\- Search and filtering.
\- Bulk editing.
\- Keyboard shortcuts.
\- Clear error messages.
\- Undo and redo.
\- Responsive layouts.
\- Contextual guidance.
\- Reusable templates.
\- Guided and advanced modes.
\- Consistent date and number formatting.

**## 19. Reliability and Maintainability**

\- Automated unit testing.

\- Integration testing.
\- End-to-end testing.
\- Database migration management.
\- API versioning.
\- Error logging.
\- Calculation diagnostics.
\- Monitoring.
\- Backup procedures.
\- Disaster recovery procedures.
\- Technical documentation.
\---

**# PART H — TESTING AND ACCEPTANCE**
**## 20. Scheduling Engine Reference Tests**
The scheduling engine must have a dedicated verified test suite.
Minimum test categories:
1\. Simple FS relationship.
2\. SS relationship.
3\. FF relationship.
4\. SF relationship.
5\. Positive lag.
6\. Negative lag.
7\. Different working calendars.
8\. Weekends and holidays.
9\. Multiple critical paths.
10\. Open-ended activities.
11\. Circular dependencies.
12\. Multiple project milestones.
13\. Constraints.
14\. Actual progress.
15\. Remaining duration.
16\. Negative float.
17\. Resource assignment.
18\. Baseline comparison.
19\. Large network calculation.
20\. Date and daylight-saving edge cases where applicable.

Each test must include independently calculated expected results.

**## 21. End-to-End Acceptance Scenarios**

| Test ID | Scenario 		| Expected outcome 		   |
|---------|---------------------|----------------------------------|
| E2E-001 | Create project 	| Project workspace established    |
| E2E-002 | Generate WBS 	| Correct hierarchical structure   |
| E2E-003 | Import BOQ 		| Validated BOQ data 		   |
| E2E-004 | Map BOQ 		| Correct quantity allocation 	   |
| E2E-005 | Generate activities | Correct activity register 	   |
| E2E-006 | Calculate durations | Correct engineering calculations |
| E2E-007 | Calculate CPM 	| Correct dates and float 	   |
| E2E-008 | Load resources 	| Resource demand calculated 	   |
| E2E-009 | Approve baseline 	| Immutable baseline created 	   |
| E2E-010 | Update progress 	| Verified actual performance 	   |
| E2E-011 | Analyze delays 	| Correct schedule variance 	   |
| E2E-012 | Generate recovery 	| Valid recovery scenario 	   |
| E2E-013 | Generate reports 	| Reconciled reporting data 	   |
| E2E-014 | Import/export 	| Data integrity maintained 	   |
| E2E-015 | Permission testing  | Unauthorized operations rejected |

**## 22. Definition of Done**

A functional group can be considered complete only when:

\- Requirements are approved.
\- Database structure is implemented.
\- Backend business logic is implemented.
\- Frontend workflows are operational.
\- Permissions are tested.
\- Validation rules are implemented.
\- Unit tests pass.
\- Integration tests pass.
\- End-to-end tests pass.
\- User acceptance is completed.
\- Documentation is available.
\- Critical defects are resolved.

A module is not complete merely because its screens have been developed.

\---

**# PART I — DEVELOPMENT ROADMAP**
**## 23. Recommended Development Phases**

\### Phase 1 — Foundation

Scope:
\- Project setup.
\- WBS.
\- Planning libraries.
\- BOQ import.
\- BOQ mapping.
\- Quantity allocation.

Deliverable: Complete planning data foundation.

\### Phase 2 — Scheduling Engine

Scope:

\- Activity generation.
\- Duration calculations.
\- Relationship management.
\- Calendars.
\- CPM.
\- Critical path.
\- Float.
\- Schedule validation.

Deliverable: Operational proprietary scheduling engine.

\### Phase 3 — Schedule Development Interface

Scope:
\- Guided Planning Mode.
\- Advanced Planning Mode.
\- Gantt chart.
\- Activity table.
\- Bulk editing.
\- Schedule revision management.

Deliverable: Operational schedule preparation application.

\### Phase 4 — Resource and Baseline Management

Scope:
\- Labour planning.
\- Equipment planning.
\- Cost loading.
\- Resource histograms.
\- Baseline review and approval.

Deliverable: Approved resource-loaded programme.

\### Phase 5 — Progress and Monitoring

Scope:
\- Daily progress.
\- Actual quantities.
\- Progress validation.
\- Planned versus actual.
\- S-curves.
\- Weekly reporting.

Deliverable: Operational planning and monitoring system.

\### Phase 6 — Forecast and Recovery

Scope:
\- Forecast engine.
\- Delay analysis.
\- Recovery scenarios.
\- Resource simulations.
\- Management reports.

Deliverable: Complete project planning and control lifecycle.

\### Phase 7 — AI and Optimization

Scope:
\- AI planning assistant.
\- Automated recommendations.
\- Intelligent mapping.
\- Schedule review assistance.
\- Recovery recommendations.

Deliverable: Intelligent construction planning platform.

\---

**# PART J — PRODUCT ACCEPTANCE AND SUCCESS**

**## 24. Final Product Acceptance Criteria**

The Planning System v1.0 will be considered functionally complete when it can demonstrate the following complete business process:

1\. Create a construction project.
2\. Generate the project WBS.
3\. Import and validate contractual BOQ.
4\. Map BOQ items to standardized activities.
5\. Allocate quantities by building, floor and zone.
6\. Generate the project activity register.
7\. Calculate activity durations.
8\. Establish construction relationships.
9\. Calculate a complete schedule using the proprietary engine.
10\. Display and edit the programme in both user modes.
11\. Load resources and costs.
12\. Perform schedule QA/QC.
13\. Review and approve the baseline.
14\. Collect actual construction progress.
15\. Compare planned versus actual performance.
16\. Analyze delays.
17\. Forecast completion.
18\. Generate and evaluate recovery scenarios.
19\. Produce weekly and monthly reports.
20\. Archive final project records.

All 20 processes must be supported by successful acceptance tests.

**## 25. Final Product Definition**

The Intelligent Construction Planning System is a construction-focused planning and project-control platform powered by a proprietary scheduling engine, standardized construction knowledge and intelligent automation.

Its purpose is to make professional construction planning:

\- More accurate than manual scheduling.
\- Faster than traditional programme preparation.
\- More reusable across multiple projects.
\- Easier for new planning engineers.
\- More flexible for experienced professionals.
\- More intelligent in monitoring and controlling project performance.

\*\*Product Philosophy:\*\*

"Build the programme intelligently. Control the project systematically. Improve every project through accumulated knowledge."

\---

\*\*END OF DOCUMENT\*\*

\*\*Document status:\*\* Proposed architecture baseline. Detailed database schema, API contracts, UI specifications, scheduling algorithms and implementation tasks should be approved as separate technical design documents before development.

