# MASTER PROMPT 07
# DCOS Enterprise Planning & Scheduling Module
# Baseline Management Engine
# Version R0

---

# AI ROLE

You are acting as an international team of experts including:

- Oracle Primavera P6 Enterprise Consultant
- Microsoft Project Enterprise Consultant
- PMI-PMP Planning Manager
- Construction Planning Director
- Delay Analysis Specialist
- Time Impact Analysis (TIA) Expert
- Earned Value Management (EVM) Specialist
- Construction Claims Consultant
- Enterprise PMIS Solution Architect
- Construction ERP Consultant
- Database Architect
- Backend API Architect
- UI/UX Architect

Your responsibility is NOT to explain Baseline Management like a textbook.

Your responsibility is to DESIGN an Enterprise Baseline Management Engine that can be directly implemented into the Digital Construction Operating System (DCOS).

Think beyond Primavera P6 and Microsoft Project.

Design a system suitable for enterprise construction companies managing multiple projects and contractual schedule revisions.

---

# PROJECT BACKGROUND

The software platform is:

**DCOS (Digital Construction Operating System)**

Planning & Scheduling is one of the core modules.

Baseline Management is the official schedule control mechanism that supports:

- Schedule Performance Monitoring
- Delay Analysis
- Earned Value Management
- Extension of Time (EOT)
- Time Impact Analysis (TIA)
- Claims & Disputes
- Executive Reporting
- Audit Compliance

Every baseline must be immutable once approved and fully traceable.

---

# DESIGN OBJECTIVE

Design a Baseline Management Engine suitable for:

- Buildings
- High-Rise Projects
- Infrastructure
- Industrial Plants
- Airports
- Railways
- Bridges
- Oil & Gas
- Power Plants
- Data Centers

Support:

- 100 activities
- 1,000 activities
- 10,000 activities
- 100,000+ activities

without changing the architecture.

---

# PRIMARY GOAL

Design a baseline engine capable of:

- Capturing project schedule snapshots
- Locking approved baselines
- Comparing current schedule against any baseline
- Tracking multiple revisions
- Supporting contractual schedule submissions
- Maintaining complete audit history

---

# REQUIRED OUTPUT FORMAT

Produce a complete technical design document in Markdown.

Include:

- Tables
- Mermaid diagrams
- Workflow diagrams
- Database schema
- REST APIs
- Business Rules
- UI mockup descriptions
- Pseudo-code where useful

Produce implementation-ready documentation.

---

# REQUIRED CHAPTERS

---

# 1. Introduction

Explain:

- Purpose of Baseline Management
- Business Objectives
- Why Baselines are Required
- Contractual Importance
- Relationship with Project Controls
- Relationship with Delay Claims
- Relationship with EVM

---

# 2. Baseline Concepts

Explain:

- Project Schedule
- Current Schedule
- Working Schedule
- Approved Schedule
- Baseline Schedule
- Forecast Schedule
- Recovery Schedule
- As-Planned Schedule
- As-Built Schedule

Describe when each schedule is used.

---

# 3. Types of Baselines

Design support for:

Baseline 0
- Original Contract Baseline

Baseline 1
- Approved Revision

Baseline 2
- Client Approved Change

Baseline 3
- Recovery Baseline

Unlimited Future Baselines

Include:

Purpose

Approval Authority

Typical Trigger

Business Rules

---

# 4. Baseline Workflow

Design workflow:

Draft Schedule

↓

Internal Review

↓

Planning Manager Review

↓

Project Manager Approval

↓

Client Submission

↓

Consultant Review

↓

Approved Baseline

↓

Schedule Lock

↓

Execution

↓

Progress Update

↓

Variance Monitoring

↓

Schedule Revision (if required)

---

# 5. Baseline Creation

Design:

Manual Creation

Automatic Snapshot

Scheduled Snapshot

Version Naming Convention

Comments

Revision Notes

Supporting Documents

Approval Records

---

# 6. Baseline Locking

Design rules for:

Approved Baseline

Locked Activities

Locked Dates

Locked Logic

Locked Duration

Locked Constraints

Read-only Mode

Digital Signature

Approval Certificate

---

# 7. Baseline Comparison

Compare:

Baseline Start vs Current Start

Baseline Finish vs Current Finish

Duration Variance

Critical Path Variance

Float Variance

Logic Changes

Relationship Changes

Calendar Changes

Milestone Changes

Resource Changes

Cost Changes

Provide comparison dashboards and reports.

---

# 8. Variance Analysis

Design calculations for:

Schedule Variance (SV)

Start Variance

Finish Variance

Duration Variance

Critical Path Drift

Milestone Variance

Activity Delay

Acceleration

Recovery

Trend Analysis

---

# 9. Baseline Revision Management

Support:

Revision Number

Revision Date

Reason for Revision

Approved By

Submitted By

Revision Category

Contract Variation Reference

Client Instruction Reference

Linked Change Request

Revision History

---

# 10. Delay Analysis Integration

Integrate baselines with:

Critical Path

Float Analysis

Delay Events

Concurrent Delay

Excusable Delay

Compensable Delay

Non-Excusable Delay

Time Impact Analysis

EOT Claims

---

# 11. Earned Value Integration

Compare baseline with:

Planned Value (PV)

Earned Value (EV)

Actual Cost (AC)

Schedule Performance Index (SPI)

Cost Performance Index (CPI)

Forecast Finish

Forecast Cost

---

# 12. Dashboard

Design dashboards showing:

Current Baseline

Active Revision

Baseline Completion %

Variance Summary

Critical Delay

Forecast Finish

Milestone Status

Revision History

Schedule Health

---

# 13. Reports

Design reports:

Baseline Register

Revision Register

Variance Report

Milestone Report

Schedule Comparison Report

Baseline vs Current Report

Executive Summary

Client Submission Report

Delay Report

Recovery Report

---

# 14. Integration

Integrate with:

Project Setup

WBS

CPM

Look-Ahead Planning

Resource Planning

Cost Control

Procurement

Document Control

Claims & Disputes

Dashboard

Audit Trail

Notification Engine

---

# 15. Database Design

Design tables including:

baseline_master

baseline_version

baseline_activity

baseline_relationship

baseline_calendar

baseline_milestone

baseline_variance

baseline_approval

baseline_document

baseline_history

Include:

Primary Keys

Foreign Keys

Indexes

Relationships

Audit Fields

Version History

---

# 16. REST API

Design APIs for:

Create Baseline

Update Draft Baseline

Approve Baseline

Lock Baseline

Compare Baselines

Retrieve Variance

List Baselines

Export Baseline

Import Primavera Baseline

Import Microsoft Project Baseline

---

# 17. UI Design

Design pages:

Baseline Register

Create Baseline

Revision History

Baseline Comparison

Variance Dashboard

Approval Workflow

Audit History

Document Attachments

Gantt Comparison View

---

# 18. Business Rules

Define at least 100 enterprise business rules covering:

Baseline Creation

Approval

Locking

Revision

Comparison

Reporting

Security

Audit Trail

Notifications

Integration

---

# 19. Validation Rules

Validate:

Duplicate Baseline Names

Invalid Revision Numbers

Missing Approval

Circular Logic

Activity Mismatch

Deleted Activities

Calendar Differences

Relationship Conflicts

Incomplete Schedule

---

# 20. Security

Design RBAC permissions for:

Planner

Planning Manager

Project Manager

Construction Manager

General Manager

Client

Consultant

Administrator

Define permissions for:

Create

Edit

Approve

Lock

Compare

Export

Delete Draft

---

# 21. Performance

Support:

100,000+ Activities

Multiple Baselines

Fast Comparison

Incremental Comparison

Concurrent Users

Real-Time Dashboards

---

# 22. AI Features

Design AI capabilities:

AI Schedule Drift Detection

AI Baseline Recommendation

AI Delay Prediction

AI Revision Impact Analysis

AI Recovery Suggestions

AI Forecast Finish Prediction

AI Milestone Risk Detection

AI What-if Scenario Comparison

---

# OUTPUT QUALITY REQUIREMENTS

The final document must be:

- Enterprise Grade
- Primavera-Level Quality
- Microsoft Project Compatible
- Developer Ready
- Database Ready
- API Ready
- UI Ready
- Construction Industry Ready
- Contract Administration Ready
- Claims & EOT Ready

Do NOT provide simplified explanations.

Explain the engineering rationale behind every design decision.

Produce implementation-ready documentation suitable for immediate software development.