# MASTER PROMPT
# DCOS Enterprise Planning & Scheduling Module
# Critical Path Method (CPM) Engine Design
# Version R0

---

# AI ROLE

You are acting as a team of internationally recognized experts consisting of:

- Primavera P6 Senior Consultant
- Oracle Primavera Solution Architect
- Microsoft Project Enterprise Consultant
- PMI-PMP Planning Manager
- Construction Planning Director
- Mega Project Scheduler
- Delay Analysis Expert
- Time Impact Analysis (TIA) Specialist
- Earned Value Management Specialist
- Lean Construction Consultant
- Last Planner System Expert
- Civil Engineering Project Manager
- Enterprise Software Architect
- Database Architect
- Backend API Architect
- UI/UX Architect
- Construction ERP Consultant

Your responsibility is NOT to explain CPM like a textbook.

Your responsibility is to DESIGN an Enterprise Critical Path Engine that can be directly implemented into a Digital Construction Operating System (DCOS).

Think like Oracle Primavera P6.

Think like Microsoft Project.

Think like Asta PowerProject.

Think like OpenPlan.

Think like Synchro.

Design something even better.

---

# PROJECT BACKGROUND

The software being developed is called

DCOS

Digital Construction Operating System

The objective is to build one integrated construction management platform covering the entire construction lifecycle.

Examples of modules include

Project Setup

Planning & Scheduling

Tender Management

Cost Control

Quantity Surveying

Procurement

Warehouse

Inventory

Equipment

HR

Construction Execution

QAQC

HSE

BIM

Document Control

Commissioning

Handover

Defect Liability

Asset Management

Finance

Dashboard

Every module is connected through

Project

WBS

Activity

Resource

Cost

Document

Organization

Approval Workflow

Audit Trail

Notification Engine

The Planning & Scheduling Module is considered one of the core engines of DCOS.

---

# DESIGN OBJECTIVE

Design a complete enterprise-grade Critical Path Method (CPM) Engine suitable for:

Commercial Buildings

Residential Buildings

Industrial Projects

Factories

Infrastructure

Roads

Bridges

Railways

Airports

Hospitals

High-rise Buildings

Mixed-use Developments

Data Centers

Power Plants

Oil & Gas Facilities

Mega Projects

The design must support projects containing

100 activities

1,000 activities

10,000 activities

100,000+ activities

without changing the architecture.

---

# PRIMARY GOAL

Do NOT explain only the mathematical formulas.

Instead, explain

WHY

HOW

WHEN

WHERE

WHAT

the CPM engine is used inside a real construction company.

Design the CPM engine as if developers will immediately implement it into production software.

---

# REQUIRED OUTPUT FORMAT

Produce a complete technical design document using Markdown.

Use proper headings.

Use tables.

Use workflow diagrams.

Use flowcharts.

Use Mermaid diagrams whenever appropriate.

Use pseudo-code where useful.

Use database schema.

Use REST API examples.

Use JSON examples.

Provide implementation-ready content.

Do not provide short summaries.

Every section must contain practical engineering detail.

---

# REQUIRED CHAPTERS

Design every chapter in depth.

## 1 Introduction

Explain

Purpose

Objectives

Business Value

Construction Industry Importance

History of CPM

Relationship with PERT

Relationship with Primavera

Relationship with Microsoft Project

---

## 2 Fundamental Concepts

Explain

Activity

Duration

Milestone

Calendar

Relationship

Dependency

Lag

Lead

Constraint

Float

Critical Activity

Critical Path

Network Logic

Project Finish Date

Forecast Finish

---

## 3 CPM Mathematical Engine

Explain

Forward Pass

Backward Pass

Early Start

Early Finish

Late Start

Late Finish

Total Float

Free Float

Independent Float

Negative Float

Longest Path

Critical Path Detection

---

## 4 Activity Network Logic

Explain

Finish to Start

Start to Start

Finish to Finish

Start to Finish

Lag

Lead

Mandatory Links

Soft Links

Circular Logic Detection

Broken Logic Detection

Missing Logic Detection

---

## 5 CPM Calculation Engine

Design

Calculation sequence

Calculation algorithms

Processing order

Recalculation engine

Incremental recalculation

Full recalculation

Optimization

Performance strategy

Memory usage

Large project support

---

## 6 Critical Path Identification

Explain

How activities become critical

Multiple Critical Paths

Dynamic Critical Path

Near Critical Activities

Critical Chain vs Critical Path

Longest Path

---

## 7 Float Management

Design

Float calculation

Float visualization

Float reporting

Float alerts

Float consumption

Float transfer

Negative Float handling

---

## 8 Calendars

Explain

Project Calendar

Activity Calendar

Resource Calendar

Holiday Calendar

Weather Calendar

Regional Calendar

Shift Calendar

---

## 9 Constraints

Design

Start On

Finish On

Must Start On

Must Finish On

Start No Earlier Than

Finish No Later Than

Mandatory Finish

Deadline

Priority Rules

Conflict Resolution

---

## 10 Baseline Management

Design

Original Baseline

Approved Baseline

Revised Baseline

Baseline Comparison

Variance Analysis

---

## 11 Progress Updating

Design

Actual Start

Actual Finish

Remaining Duration

Physical %

Duration %

Units %

Weighted %

Rules

Automatic recalculation

---

## 12 Delay Analysis

Explain

Delay Identification

Critical Delay

Excusable Delay

Non-excusable Delay

Concurrent Delay

Compensable Delay

Float Ownership

Delay Responsibility

---

## 13 Recovery Planning

Design

Crashing

Fast Tracking

Resource Increase

Additional Shift

Overtime

Weekend Work

Logic Revision

Recovery Simulation

---

## 14 Time Impact Analysis (TIA)

Explain

Workflow

Scenario Creation

Insertion Fragnet

Impact Calculation

Approval Process

Claim Support

---

## 15 Resource Integration

Connect CPM with

Labor

Equipment

Material

Subcontractor

Plant

Crew

---

## 16 Cost Integration

Connect CPM with

Budget

Cost Loading

Cash Flow

Earned Value

IPC

Forecast Cost

---

## 17 Dashboard

Design dashboards for

Planning Engineer

Project Manager

Construction Manager

Executive

Director

CEO

---

## 18 Reports

Design reports

Critical Activity Report

Float Report

Longest Path Report

Near Critical Report

Delay Report

Recovery Report

Milestone Report

Schedule Health Report

Look Ahead Report

---

## 19 Database Design

Design

Tables

Relationships

Indexes

Constraints

Audit Trail

History

Versioning

---

## 20 REST API

Design complete API

GET

POST

PUT

DELETE

Search

Filter

Export

Import

Bulk Update

---

## 21 UI Design

Design

Schedule Grid

Network Diagram

Gantt Chart

Critical Path Highlight

Float Column

Dependency Editor

Logic Viewer

Delay Dashboard

Recovery Dashboard

---

## 22 Notifications

Automatic notifications for

Critical Delay

Float Reduction

Logic Error

Schedule Approval

Baseline Revision

Milestone Missed

---

## 23 Integration

Integrate CPM with

Project Setup

WBS

Tender

Procurement

Warehouse

Inventory

HR

Equipment

Document Control

BIM

QAQC

Construction

Cost Control

Finance

Dashboard

---

## 24 Business Rules

Define at least

100 enterprise business rules

---

## 25 Validation Rules

Validate

Circular Logic

Open Ends

Negative Float

Missing Calendar

Missing Resource

Duplicate Activity Code

Invalid Relationship

Impossible Dates

---

## 26 Security

Design RBAC

Permissions

Approval Levels

Audit Trail

Schedule Lock

Baseline Lock

---

## 27 Performance

Support

100,000+ activities

Millions of relationships

Concurrent users

Fast recalculation

Caching

Optimization

---

## 28 Future AI Features

AI Delay Prediction

AI Critical Path Optimization

AI Recovery Suggestions

AI Resource Optimization

AI Risk Detection

AI What-if Analysis

AI Automatic Scheduling

---

# OUTPUT QUALITY REQUIREMENTS

The output must be

Enterprise Grade

Implementation Ready

Developer Ready

Database Ready

Construction Industry Ready

Suitable for Oracle Primavera-level functionality

Suitable for Microsoft Project-level functionality

Suitable for enterprise PMIS platforms.

Do NOT simplify.

Do NOT omit technical details.

Always explain the engineering rationale behind every design decision.

The final document should be comprehensive enough that a software engineering team can implement the CPM engine directly from the documentation.