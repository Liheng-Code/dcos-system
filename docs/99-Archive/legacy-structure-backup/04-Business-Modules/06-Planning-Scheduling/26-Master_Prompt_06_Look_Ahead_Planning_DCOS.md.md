# MASTER PROMPT
# DCOS Enterprise Planning & Scheduling Module
# Master Prompt 06 – Look-Ahead Planning Engine
# Version R0

---

# AI ROLE

You are acting as a world-class team of experts including:

- Senior Construction Planning Manager
- Oracle Primavera P6 Consultant
- Microsoft Project Enterprise Consultant
- Lean Construction Specialist
- Last Planner System (LPS) Consultant
- Project Controls Manager
- Site Construction Manager
- Planning Engineer
- Construction Operations Director
- Enterprise Software Architect
- Database Architect
- UI/UX Architect
- Construction ERP Consultant

Your responsibility is NOT to explain what Look-Ahead Planning is.

Your responsibility is to DESIGN an enterprise-grade Look-Ahead Planning Engine that can be directly implemented into the DCOS (Digital Construction Operating System).

Think beyond Primavera P6 and Microsoft Project.

Design a system suitable for mega construction projects with multiple contractors, disciplines, and work fronts.

---

# PROJECT BACKGROUND

The software platform is called:

DCOS – Digital Construction Operating System

The Planning & Scheduling Module is one of the core modules and integrates with:

- WBS
- CPM Engine
- Gantt Chart
- Procurement
- Warehouse
- Equipment
- HR
- QA/QC
- HSE
- Document Control
- BIM
- Construction Execution
- Cost Control
- IPC Progress Claim
- Dashboard
- Notification Engine
- Approval Workflow

The Look-Ahead Planning Engine converts long-term schedules into short-term executable work plans.

---

# OBJECTIVE

Design a complete enterprise-grade Look-Ahead Planning System that enables project teams to:

- Convert master schedules into weekly execution plans.
- Identify upcoming constraints before work starts.
- Improve field productivity.
- Increase PPC (Percent Plan Complete).
- Support Lean Construction and Last Planner System.
- Coordinate all disciplines.
- Reduce delays.
- Improve communication between office and site.

The design must support:

- Commercial Buildings
- High-rise Towers
- Factories
- Infrastructure
- Airports
- Railways
- Hospitals
- Mixed-use Developments
- Industrial Plants

---

# OUTPUT REQUIREMENTS

Produce a complete implementation-ready technical document in Markdown.

Use:

- Headings
- Tables
- Mermaid Diagrams
- Flowcharts
- JSON Examples
- REST APIs
- Database Schema
- Business Rules
- SOP
- User Stories
- UI Design
- Workflow Diagrams

Do NOT provide summaries.

Every chapter must contain practical engineering details.

---

# REQUIRED CHAPTERS

---

## Chapter 1

Introduction

Explain

- Purpose
- Objectives
- Business Value
- Construction Industry Benefits
- Lean Construction Philosophy
- Relationship to CPM
- Relationship to Weekly Planning

---

## Chapter 2

Look-Ahead Planning Fundamentals

Explain

- Definition
- Planning Horizon
- Rolling Wave Planning
- Pull Planning
- Push Planning
- Last Planner System
- Percent Plan Complete (PPC)

---

## Chapter 3

Planning Period

Design

- 2 Week Look Ahead
- 3 Week Look Ahead
- 4 Week Look Ahead
- 6 Week Look Ahead
- 8 Week Look Ahead
- Custom Planning Window

Explain when each is used.

---

## Chapter 4

Look-Ahead Workflow

Design the complete workflow:

Master Schedule

↓

Filter Activities

↓

Constraint Review

↓

Resource Verification

↓

Material Verification

↓

Drawing Verification

↓

Equipment Verification

↓

Approval

↓

Weekly Work Plan

↓

Daily Execution

↓

Progress Update

↓

PPC Calculation

↓

Feedback into Master Schedule

---

## Chapter 5

Constraint Management

Design a complete Constraint Register.

Support:

- Drawing Constraint
- Design Approval
- Material Delivery
- Procurement Delay
- Equipment Availability
- Labor Availability
- Permit
- Inspection
- Weather
- Site Access
- Utility Shutdown
- Client Decision
- Financial Constraint
- Safety Requirement

For each constraint include:

- Severity
- Owner
- Due Date
- Status
- Resolution
- Escalation

---

## Chapter 6

Weekly Work Plan

Design:

- Weekly Task List
- Responsible Engineer
- Foreman
- Crew Assignment
- Planned Quantity
- Planned Start
- Planned Finish
- Daily Target
- Inspection Requirement
- Material Status

Explain approval workflow.

---

## Chapter 7

Daily Work Planning

Design:

- Morning Planning Meeting
- Toolbox Meeting
- Daily Task Assignment
- Resource Check
- Safety Check
- End-of-Day Review
- Daily Progress Entry

---

## Chapter 8

Percent Plan Complete (PPC)

Explain:

- Formula
- Calculation Logic
- Missed Commitments
- Delay Reasons
- Weekly Trend
- Monthly Trend

Design dashboards and reports.

---

## Chapter 9

Constraint Removal Workflow

Design:

Constraint Created

↓

Assigned

↓

Responsible Party

↓

Follow-up

↓

Resolved

↓

Verified

↓

Closed

Explain escalation rules.

---

## Chapter 10

Resource Verification

Verify:

- Labor
- Equipment
- Material
- Subcontractor
- Drawing
- Method Statement
- Inspection Request

No activity may enter Weekly Work Plan until all mandatory resources are ready.

---

## Chapter 11

Material Readiness

Integrate with:

Warehouse

Inventory

Procurement

Automatic verification:

- In Stock
- Ordered
- Delivered
- Shortage
- Alternative Material

---

## Chapter 12

Drawing Readiness

Verify:

- IFC Drawing
- Shop Drawing
- Approved Revision
- Latest Revision
- Technical Query
- RFI Status

---

## Chapter 13

Equipment Readiness

Verify:

- Equipment Assigned
- Maintenance Status
- Calibration
- Fuel
- Operator
- Availability

---

## Chapter 14

Labor Readiness

Verify:

- Crew Availability
- Attendance
- Skill
- Certification
- Working Hours
- Leave

---

## Chapter 15

Integration with CPM

Explain:

How Look-Ahead is generated automatically from:

- Critical Activities
- Near Critical Activities
- Milestones
- Float
- Remaining Duration

---

## Chapter 16

Integration with BIM

Support:

- Model-Based Activity Selection
- 4D Simulation
- Progress Visualization
- Clash Detection Status

---

## Chapter 17

Dashboard

Design dashboards for:

- Site Engineer
- Planning Engineer
- Construction Manager
- Project Manager
- Director

Include:

- Upcoming Activities
- Constraints
- PPC
- Delayed Tasks
- Resource Readiness
- Critical Activities

---

## Chapter 18

Reports

Generate:

- Weekly Look-Ahead Report
- Daily Work Plan
- Constraint Report
- PPC Report
- Material Readiness Report
- Resource Report
- Delay Report

---

## Chapter 19

Database Design

Create tables:

- lookahead_plan
- lookahead_activity
- constraint_register
- weekly_work_plan
- daily_work_plan
- ppc_history
- readiness_check
- approval_history

Include:

- Primary Keys
- Foreign Keys
- Indexes
- Relationships

---

## Chapter 20

REST API

Design APIs for:

GET

POST

PUT

DELETE

Search

Approval

Bulk Update

Export

Import

Constraint Update

PPC Calculation

---

## Chapter 21

UI Design

Design:

- Look-Ahead Dashboard
- Weekly Planner
- Constraint Board
- Daily Planner
- Resource Readiness Screen
- Kanban View
- Calendar View
- Gantt View

---

## Chapter 22

Notifications

Notify users when:

- Constraint Added
- Constraint Overdue
- Material Not Ready
- Drawing Not Approved
- PPC Below Target
- Weekly Plan Approved
- Critical Activity Entering Look-Ahead

---

## Chapter 23

Integration Matrix

Integrate with:

- CPM Engine
- Gantt Chart
- Resource Planning
- Cost Control
- Procurement
- Warehouse
- Inventory
- Equipment
- HR
- QA/QC
- HSE
- BIM
- Construction Execution
- Dashboard

---

## Chapter 24

Business Rules

Define at least 100 enterprise business rules covering:

- Weekly Planning
- Constraints
- PPC
- Resource Readiness
- Material Verification
- Drawing Approval
- Schedule Integration
- Notifications
- Escalations
- Audit Trail

---

## Chapter 25

Validation Rules

Validate:

- Missing Resources
- Missing Drawings
- Missing Materials
- Invalid Constraints
- Duplicate Activities
- Closed Activities
- Overlapping Work
- Invalid Dates

---

## Chapter 26

Security

Design RBAC permissions for:

- Planner
- Site Engineer
- Foreman
- Project Manager
- Construction Manager
- Director
- Administrator

Include:

- Approval Permissions
- Edit Permissions
- View Permissions
- Audit Logs

---

## Chapter 27

Performance Requirements

Support:

- 100,000+ Activities
- Multiple Projects
- Concurrent Users
- Real-Time Updates
- Mobile Devices
- Offline Synchronization

---

## Chapter 28

Future AI Features

Design AI capabilities including:

- AI Constraint Prediction
- AI Weekly Work Plan Generation
- AI Crew Optimization
- AI Material Readiness Prediction
- AI Delay Risk Prediction
- AI PPC Forecast
- AI Look-Ahead Optimization
- AI What-If Simulation

---

# OUTPUT QUALITY

The final document must be:

- Enterprise Grade
- Developer Ready
- Database Ready
- API Ready
- UI Ready
- Construction Industry Ready
- Suitable for Primavera P6-level project controls
- Suitable for Lean Construction implementation
- Ready for direct implementation into DCOS

Do not simplify the content.

Explain the engineering rationale behind every design decision.

Assume the audience consists of software engineers, planning engineers, project managers, and enterprise architects responsible for building a world-class construction management platform.