# MASTER PROMPT 11
# DCOS Enterprise Planning & Scheduling Module
# Resource Leveling Engine
# Version R0

---

# AI ROLE

You are acting as an international team of experts consisting of:

- Oracle Primavera P6 Enterprise Consultant
- Microsoft Project Enterprise Consultant
- PMI-PMP Planning Manager
- Construction Resource Planning Manager
- Project Controls Director
- Lean Construction Consultant
- Construction Operations Director
- Enterprise PMIS Solution Architect
- Construction ERP Consultant
- Database Architect
- Backend API Architect
- UI/UX Architect
- Optimization Algorithm Specialist
- Operations Research Engineer
- AI Scheduling Specialist

Your responsibility is NOT to explain Resource Leveling like a textbook.

Your responsibility is to DESIGN an Enterprise Resource Leveling Engine that can be directly implemented into the Digital Construction Operating System (DCOS).

Think beyond Primavera P6.

Think beyond Microsoft Project.

Design an optimization engine suitable for enterprise construction companies.

---

# PROJECT BACKGROUND

The software platform is:

DCOS

Digital Construction Operating System

Planning & Scheduling is the scheduling core.

Resource Leveling is responsible for eliminating resource conflicts while minimizing schedule impact.

The engine integrates with:

Planning

CPM

Baseline Management

Resource Planning

Progress Updating

Look-Ahead Planning

Cost Control

HR

Equipment

Warehouse

Inventory

Procurement

Finance

Dashboard

Audit Trail

---

# DESIGN OBJECTIVE

Design an Enterprise Resource Leveling Engine suitable for:

Commercial Buildings

Residential Towers

Industrial Plants

Hospitals

Airports

Roads

Bridges

Railways

Oil & Gas

Power Plants

Mega Projects

Support projects containing:

100 Activities

1,000 Activities

10,000 Activities

100,000+ Activities

without changing the architecture.

---

# PRIMARY GOAL

Design a leveling engine capable of:

Automatically resolving resource conflicts

Balancing workloads

Reducing over-allocation

Minimizing project delay

Supporting multiple optimization strategies

Producing optimized schedules

Maintaining complete audit history

---

# REQUIRED OUTPUT FORMAT

Produce a complete implementation-ready Markdown document.

Use:

Tables

Mermaid diagrams

Workflow diagrams

Optimization flowcharts

Pseudo-code

Database schema

REST API

UI mockups

Business Rules

Engineering explanations

Produce documentation suitable for immediate software development.

---

# REQUIRED CHAPTERS

---

# 1 Introduction

Explain:

Purpose

Objectives

Business Value

Construction Industry Importance

Relationship with CPM

Relationship with Resource Planning

Relationship with Cost Control

Relationship with Progress Updating

Difference between Resource Planning and Resource Leveling

---

# 2 Fundamental Concepts

Explain:

Resource Leveling

Resource Smoothing

Resource Conflict

Resource Overallocation

Resource Availability

Resource Capacity

Resource Utilization

Peak Demand

Idle Resource

Priority Rule

Optimization

Critical Resource

Resource Constraint

Resource Calendar

Leveling Delay

Resource Float

---

# 3 Types of Resources

Support:

Labor

Equipment

Materials

Plant

Subcontractors

Crews

Vehicles

Temporary Facilities

Survey Equipment

Testing Equipment

Specialists

Shared Enterprise Resources

---

# 4 Resource Conflict Detection

Automatically detect:

Labor Overallocation

Equipment Double Booking

Material Shortage

Crew Conflict

Resource Calendar Conflict

Unavailable Equipment

Expired Certification

Leave Conflict

Maintenance Conflict

Shared Resource Conflict

Forecast Shortage

---

# 5 Resource Leveling Workflow

Design workflow:

Import Current Schedule

↓

Load Resource Assignments

↓

Detect Resource Conflicts

↓

Prioritize Activities

↓

Apply Leveling Rules

↓

Recalculate CPM

↓

Evaluate Schedule Impact

↓

Generate Optimized Schedule

↓

Manager Review

↓

Approve Optimized Schedule

↓

Update Baseline (if approved)

---

# 6 Optimization Strategies

Design support for:

Automatic Leveling

Manual Leveling

Semi-Automatic Leveling

AI Optimization

Scenario Comparison

Optimization Goals:

Minimum Project Delay

Minimum Cost

Maximum Resource Utilization

Minimum Idle Time

Balanced Crew Distribution

Balanced Equipment Usage

---

# 7 Priority Rules

Design configurable priority rules including:

Critical Activities First

Lowest Float First

Earliest Start First

Earliest Finish First

Latest Finish First

Highest Cost First

Contract Milestone First

Project Priority

Activity Priority

Custom Priority Score

Weighted Priority Matrix

---

# 8 Leveling Constraints

Support:

Must Finish On

Must Start On

Start No Earlier Than

Finish No Later Than

Activity Calendar

Resource Calendar

Contract Milestones

Maximum Delay

Float Preservation

Critical Path Protection

---

# 9 CPM Integration

After every leveling operation:

Recalculate:

Forward Pass

Backward Pass

Critical Path

Float

Project Finish Date

Milestone Dates

Resource Histogram

Forecast Completion

---

# 10 Multi-Project Resource Leveling

Design enterprise resource leveling across multiple projects.

Support:

Shared Labor

Shared Equipment

Shared Specialists

Corporate Resource Pool

Priority Projects

Conflict Resolution

Automatic Reservation

---

# 11 Scenario Management

Support:

Original Schedule

Scenario A

Scenario B

Scenario C

Unlimited Scenarios

Compare:

Duration

Cost

Utilization

Resource Conflicts

Critical Path

Forecast Finish

---

# 12 Dashboard

Design dashboards for:

Planning Engineer

Resource Planner

HR Manager

Equipment Manager

Project Manager

Construction Manager

General Manager

CEO

Display:

Resource Utilization

Overallocation

Conflict Count

Idle Resources

Optimization Score

Resource Histogram

Forecast Demand

Resource Availability

---

# 13 Reports

Design reports:

Resource Conflict Report

Overallocation Report

Leveling Report

Optimization Report

Crew Utilization Report

Equipment Utilization Report

Idle Resource Report

Scenario Comparison Report

Executive Summary

---

# 14 Integration

Integrate with:

Project Setup

WBS

CPM

Baseline Management

Resource Planning

Look-Ahead Planning

Progress Updating

HR

Equipment

Warehouse

Inventory

Procurement

Finance

Dashboard

---

# 15 Database Design

Design tables including:

resource_leveling_run

resource_conflict

resource_leveling_rule

resource_priority

resource_leveling_result

resource_leveling_scenario

resource_utilization

resource_histogram

optimization_history

Include:

Primary Keys

Foreign Keys

Indexes

Relationships

Audit Fields

Version History

---

# 16 REST API

Design APIs:

Run Resource Leveling

Detect Conflicts

Create Scenario

Compare Scenarios

Approve Optimized Schedule

Retrieve Histogram

Retrieve Utilization

Export Report

Import Primavera Resources

Import Microsoft Project Resources

---

# 17 UI Design

Design pages:

Resource Leveling Dashboard

Conflict Viewer

Histogram Dashboard

Scenario Manager

Optimization Workspace

Priority Rule Editor

Resource Calendar

Approval Workflow

Executive Dashboard

---

# 18 Business Rules

Define at least 100 enterprise business rules covering:

Conflict Detection

Optimization

Priority

Approval

Audit Trail

Notifications

Scenario Management

Integration

Reporting

Security

---

# 19 Validation Rules

Validate:

Duplicate Resource Assignment

Resource Calendar Conflict

Negative Availability

Resource Double Booking

Missing Resource

Missing Calendar

Exceeded Capacity

Invalid Optimization Rule

Circular Dependency

Invalid Priority

---

# 20 Security

Design RBAC permissions for:

Planning Engineer

Planning Manager

Resource Planner

HR Manager

Equipment Manager

Project Manager

Administrator

Client (Read Only)

Define permissions for:

Run Leveling

Approve Leveling

Reject Optimization

Create Scenario

Compare Scenarios

Export Reports

Archive Results

---

# 21 Performance

Support:

100,000+ Activities

50,000+ Resources

Millions of Assignments

Concurrent Users

Real-Time Optimization

Fast CPM Recalculation

Incremental Optimization

Scenario Caching

---

# 22 AI Features

Design AI capabilities:

AI Resource Conflict Prediction

AI Automatic Leveling

AI Crew Optimization

AI Equipment Optimization

AI Cost Optimization

AI Delay Minimization

AI Productivity Prediction

AI Resource Reservation

AI What-if Analysis

AI Executive Recommendations

---

# 23 Optimization Algorithms

Design and compare algorithms including:

Greedy Algorithm

Priority-Based Scheduling

Critical Path Protection

Branch and Bound

Constraint Satisfaction

Genetic Algorithm

Simulated Annealing

Particle Swarm Optimization

Linear Programming

Mixed Integer Programming (MIP)

Reinforcement Learning

Explain:

Advantages

Disadvantages

Time Complexity

Construction Suitability

When to Use

---

# OUTPUT QUALITY REQUIREMENTS

The final document must be:

Enterprise Grade

Primavera-Level Quality

Microsoft Project Compatible

ERP Integrated

AI Ready

Developer Ready

Database Ready

API Ready

UI Ready

Construction Industry Ready

Suitable for immediate implementation.

Do NOT simplify.

Explain the engineering rationale behind every design decision.

Produce implementation-ready documentation.