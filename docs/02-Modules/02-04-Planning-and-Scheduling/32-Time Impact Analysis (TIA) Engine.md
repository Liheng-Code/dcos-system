# MASTER PROMPT 09
# DCOS Enterprise Planning & Scheduling Module
# Time Impact Analysis (TIA) Engine
# Version R0

---

# AI ROLE

You are acting as an international team of experts consisting of:

- Oracle Primavera P6 Enterprise Consultant
- Microsoft Project Enterprise Consultant
- Project Controls Director
- Planning Manager
- Delay Analysis Expert
- Time Impact Analysis (TIA) Specialist
- Forensic Scheduling Expert
- Construction Claims Consultant
- FIDIC Contract Specialist
- NEC Contract Specialist
- JCT Contract Specialist
- EPC Project Controls Manager
- Civil Engineering Consultant
- Enterprise PMIS Architect
- Construction ERP Consultant
- Database Architect
- Backend API Architect
- UI/UX Architect

Your responsibility is NOT to explain Time Impact Analysis (TIA) like a textbook.

Your responsibility is to DESIGN an Enterprise Time Impact Analysis Engine that can be directly implemented into the Digital Construction Operating System (DCOS).

Think like Oracle Primavera P6.

Think like Deltek Acumen.

Think like a forensic planning consultant preparing evidence for arbitration.

Design something even better.

---

# PROJECT BACKGROUND

The software platform is:

DCOS

Digital Construction Operating System

The Planning & Scheduling module contains:

- WBS
- Activities
- CPM
- Baseline Management
- Progress Updating
- Delay Analysis
- Recovery Planning
- Earned Value
- Look-Ahead Planning

Time Impact Analysis (TIA) is one of the core contractual scheduling tools.

It is used to evaluate how specific delay events affect the approved project schedule.

The engine shall integrate with:

CPM

Baseline Management

Delay Analysis

Progress

Claims

Extension of Time (EOT)

Risk Register

Document Control

Dashboard

Audit Trail

---

# DESIGN OBJECTIVE

Design an Enterprise Time Impact Analysis Engine suitable for:

- Commercial Buildings
- Residential Towers
- Hospitals
- Airports
- Roads
- Bridges
- Railways
- Industrial Plants
- Oil & Gas Facilities
- Power Plants
- Data Centers
- Mega Infrastructure Projects

Support:

100 Activities

1,000 Activities

10,000 Activities

100,000+ Activities

without redesigning the architecture.

---

# PRIMARY GOAL

Design a TIA engine capable of:

- Evaluating the schedule impact of individual delay events
- Simulating delay scenarios
- Inserting fragnet networks
- Recalculating the CPM network
- Forecasting revised completion dates
- Supporting contractual EOT claims
- Producing evidence-based reports
- Maintaining a complete audit trail

---

# REQUIRED OUTPUT FORMAT

Produce a complete implementation-ready Markdown document.

Use:

- Tables
- Mermaid diagrams
- Workflow diagrams
- Pseudo-code
- Database schema
- REST API
- UI mockup descriptions
- Business Rules
- Engineering explanations

The document must be suitable for immediate software development.

---

# REQUIRED CHAPTERS

---

# 1. Introduction

Explain:

- Purpose of Time Impact Analysis
- Business Objectives
- Importance in Construction Projects
- Relationship with CPM
- Relationship with Baseline Management
- Relationship with Delay Analysis
- Relationship with Extension of Time (EOT)
- Relationship with Claims & Disputes

---

# 2. Fundamental Concepts

Explain:

- Delay Event
- Fragnet
- Schedule Update
- Data Date
- Impact Window
- Critical Path
- Float
- Time Contingency
- Mitigation
- Acceleration
- Recovery Schedule

Describe how each concept contributes to TIA.

---

# 3. TIA Workflow

Design the complete workflow:

Delay Event Identified

↓

Collect Supporting Evidence

↓

Select Approved Baseline

↓

Determine Data Date

↓

Create TIA Scenario

↓

Insert Fragnet

↓

Run CPM Recalculation

↓

Calculate Schedule Impact

↓

Compare with Baseline

↓

Prepare TIA Report

↓

Internal Review

↓

Consultant / Client Review

↓

Approve or Reject

↓

Update EOT Register

---

# 4. Delay Event Management

Design support for:

- Delay Event Register
- Event Classification
- Event Priority
- Responsible Party
- Delay Category
- Supporting Documents
- Photographs
- RFIs
- Site Instructions
- Variation Orders
- Weather Records
- Inspection Reports

---

# 5. Fragnet Management

Design a Fragnet Library.

Support:

- Standard Fragnets
- Custom Fragnets
- Multiple Activities
- Multiple Relationships
- Temporary Logic
- Calendar Assignment
- Resource Assignment

Explain:

How Fragnets are inserted

How Fragnets affect the CPM network

How Fragnets are removed after analysis

---

# 6. CPM Recalculation

Design the recalculation engine.

Include:

Forward Pass

Backward Pass

Float Recalculation

Critical Path Update

Milestone Update

Forecast Finish

Explain how the network is recalculated after each inserted Fragnet.

---

# 7. Schedule Comparison

Compare:

Baseline vs Current

Current vs TIA Scenario

Forecast vs Baseline

Critical Path Changes

Float Changes

Milestone Variance

Activity Variance

Project Finish Variance

---

# 8. Extension of Time (EOT)

Design integration with:

EOT Request

Supporting Evidence

TIA Result

Approval Workflow

Decision History

Approved Extension

Rejected Extension

Partial Approval

---

# 9. Scenario Management

Design support for:

Scenario A

Scenario B

Scenario C

Multiple Delay Events

Sequential Delay Events

Concurrent Delay Events

Combined Scenario Analysis

Scenario Versioning

Scenario Comparison

---

# 10. Dashboard

Design dashboards for:

Planning Engineer

Planning Manager

Project Manager

Commercial Manager

Claims Manager

General Manager

CEO

Dashboard should display:

Active TIA Studies

Pending Reviews

Delay Impact

Forecast Completion

Critical Delay

EOT Status

Scenario Comparison

Risk Level

---

# 11. Reports

Design:

TIA Report

Fragnet Report

Delay Impact Report

Scenario Comparison Report

Critical Path Change Report

Milestone Impact Report

Executive Summary

EOT Supporting Report

Claims Report

---

# 12. Integration

Integrate with:

Project Setup

WBS

CPM

Baseline Management

Progress Updating

Delay Analysis

Look-Ahead Planning

Resource Planning

Cost Control

Document Control

Risk Register

Claims & Disputes

Dashboard

---

# 13. Database Design

Design tables including:

tia_study

tia_scenario

tia_fragnet

tia_fragnet_activity

tia_delay_event

tia_schedule_snapshot

tia_comparison

tia_approval

tia_document

tia_history

Include:

Primary Keys

Foreign Keys

Indexes

Relationships

Audit Fields

Version History

---

# 14. REST API

Design APIs for:

Create TIA Study

Create Scenario

Insert Fragnet

Run CPM Analysis

Compare Scenarios

Approve TIA

Reject TIA

Generate Report

Export PDF

Export Excel

Import Primavera Schedule

Import Microsoft Project Schedule

---

# 15. UI Design

Design pages:

TIA Dashboard

TIA Register

Scenario Manager

Fragnet Editor

Network Diagram

Gantt Comparison

Schedule Comparison

Approval Workflow

Document Attachments

Audit History

---

# 16. Business Rules

Define at least 100 enterprise business rules covering:

Delay Events

Scenario Management

Fragnet

CPM Recalculation

Approval

Evidence

Reporting

Audit Trail

Notifications

Integration

---

# 17. Validation Rules

Validate:

Missing Baseline

Missing Data Date

Circular Logic

Open Ends

Duplicate Delay Event

Duplicate Scenario

Missing Fragnet

Negative Duration

Invalid Relationships

Missing Supporting Evidence

---

# 18. Security

Design RBAC permissions for:

Planning Engineer

Planning Manager

Project Manager

Commercial Manager

Claims Manager

Consultant

Client

Administrator

Define permissions for:

Create

Edit

Approve

Reject

Run Analysis

Export

Archive

Delete Draft

---

# 19. Performance

Support:

100,000+ Activities

Multiple TIA Studies

Concurrent Users

Fast CPM Recalculation

Real-Time Dashboards

Scenario Caching

Incremental Recalculation

---

# 20. AI Features

Design AI capabilities including:

AI Delay Event Detection

AI Fragnet Recommendation

AI Critical Path Impact Prediction

AI EOT Recommendation

AI Recovery Suggestions

AI Risk Scoring

AI Scenario Optimization

AI Claims Assistant

AI Executive Summary Generation

---

# OUTPUT QUALITY REQUIREMENTS

The final document must be:

- Enterprise Grade
- Primavera-Level Quality
- FIDIC Compatible
- NEC Compatible
- JCT Compatible
- Claims Ready
- Forensic Scheduling Ready
- Developer Ready
- Database Ready
- API Ready
- UI Ready
- Construction Industry Ready

Do NOT simplify.

Explain the engineering rationale behind every design decision.

Produce implementation-ready documentation suitable for immediate software development.