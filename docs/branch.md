# Branch Strategy

| Document Information | |
|----------------------|------------------------------------------------|
| Document Name | Branch Strategy |
| Document ID | DCOS-GOV-BRANCH-001 |
| Project | DCOS – Digital Construction Operating System |
| Version | 1.0.0 |
| Status | Approved |
| Owner | System Owner / Chief Software Architect |
| Approved By | Project Steering Committee |
| Effective Date | YYYY-MM-DD |

---

# 1. Purpose

This document defines the Git branch management strategy for the DCOS platform.

The objectives are to:

- Protect the production source code.
- Allow multiple developers to work independently.
- Prevent merge conflicts.
- Maintain software quality.
- Standardize release management.
- Ensure traceability of every code change.

This policy applies to all repositories within the DCOS ecosystem.

---

# 2. Scope

This strategy applies to:

- Frontend
- Backend
- Shared Libraries
- Database
- Infrastructure
- DevOps
- Documentation

---

# 3. Branch Hierarchy

```
main
│
├── develop
│
├── release/*
│
├── hotfix/*
│
└── feature/*
```

---

# 4. Branch Description

| Branch | Purpose | Protected |
|---------|----------|-----------|
| main | Production Source Code | Yes |
| develop | Integration Branch | Yes |
| release/* | Release Preparation | Yes |
| hotfix/* | Emergency Production Fix | Yes |
| feature/* | Individual Development | No |

---

# 5. Main Branch

## Purpose

The **main** branch represents the official production source code.

It shall always be deployable.

No developer shall commit directly to this branch.

---

## Allowed Operations

✔ Merge from Release Branch

✔ Merge from Hotfix Branch

---

## Forbidden Operations

✘ Direct Commit

✘ Force Push

✘ Delete Branch

---

# 6. Develop Branch

## Purpose

The develop branch is the integration branch.

All completed feature branches are merged here first.

Develop represents the next software version.

---

## Allowed Operations

- Merge Feature Branch
- Integration Testing
- System Testing

---

## Deployment

Development Environment

Testing Environment

---

# 7. Feature Branch

## Naming Convention

```
feature/module-name
```

Examples

```
feature/project

feature/planning

feature/design

feature/procurement

feature/qs

feature/hr

feature/account
```

---

## Rules

Each feature branch belongs to exactly one module.

Each feature branch has one responsible developer.

Feature branches shall never merge directly into Main.

---

# 8. Release Branch

## Naming

```
release/v1.0.0

release/v1.1.0

release/v2.0.0
```

---

## Purpose

Release preparation.

Activities include:

- Bug fixing
- Documentation
- Final testing
- Performance testing
- Security testing

---

# 9. Hotfix Branch

## Naming

```
hotfix/v1.0.1

hotfix/v1.0.2
```

---

## Purpose

Emergency production fixes.

Hotfix branches originate from Main.

After completion they merge into:

- Main
- Develop

---

# 10. Branch Ownership

| Branch | Owner |
|----------|-----------------------------|
| main | System Owner |
| develop | Technical Lead |
| feature/project | Project Developer |
| feature/planning | Planning Developer |
| feature/design | Design Developer |
| feature/procurement | Procurement Developer |
| feature/qs | QS Developer |
| feature/construction | Construction Developer |
| feature/hr | HR Developer |
| feature/account | Finance Developer |
| feature/admin | System Owner |

---

# 11. Branch Lifecycle

```
Create Branch

↓

Development

↓

Local Testing

↓

Commit

↓

Push

↓

Pull Request

↓

Code Review

↓

Merge Develop

↓

Integration Testing

↓

Release Branch

↓

QA Approval

↓

Owner Approval

↓

Main Branch

↓

Production Deployment
```

---

# 12. Branch Protection Rules

## Main

- Require Pull Request
- Require Approval
- Require Successful Build
- Require Successful Unit Test
- Require Successful Integration Test
- Require Owner Approval

---

## Develop

- Require Pull Request
- Require Build
- Require Test

---

## Feature

Developer may commit freely.

---

# 13. Merge Strategy

Only Pull Request Merge is allowed.

No direct push.

Merge sequence:

```
Feature

↓

Develop

↓

Release

↓

Main
```

---

# 14. Commit Message Standard

Format

```
<type>: <description>
```

Examples

```
feat: Add Project Dashboard

fix: Resolve Login Bug

docs: Update User Guide

style: Improve Navigation

refactor: Simplify API

test: Add Unit Test

chore: Upgrade Dependencies
```

---

# 15. Pull Request Process

Developer

↓

Push Feature Branch

↓

Create Pull Request

↓

Automatic Build

↓

Unit Testing

↓

Code Review

↓

Approval

↓

Merge to Develop

---

# 16. Code Review Policy

Minimum reviewers:

- One Senior Developer

or

- Technical Lead

Critical modules require:

- System Owner approval

---

# 17. Merge Conflict Policy

If merge conflict occurs:

Developer

↓

Resolve Conflict

↓

Run Test

↓

Re-submit Pull Request

---

# 18. Release Process

```
Develop

↓

Release Branch

↓

QA Testing

↓

Performance Testing

↓

Security Testing

↓

Owner Approval

↓

Merge Main

↓

Production

↓

Tag Version
```

---

# 19. Emergency Hotfix Workflow

```
Production Issue

↓

Create Hotfix Branch

↓

Fix

↓

Test

↓

Owner Approval

↓

Merge Main

↓

Merge Develop

↓

Deploy

↓

Close Incident
```

---

# 20. Version Tagging

Format

```
vMajor.Minor.Patch
```

Examples

```
v1.0.0

v1.1.0

v1.2.3

v2.0.0
```

---

# 21. Roles and Responsibilities

## System Owner

- Protect Main Branch
- Approve Releases
- Approve Hotfix
- Manage Branch Policy

---

## Technical Lead

- Review Pull Requests
- Review Architecture
- Merge Feature Branches

---

## Developer

- Develop Assigned Module
- Follow Coding Standards
- Resolve Merge Conflicts
- Submit Pull Requests

---

## QA Engineer

- Execute Test Cases
- Validate Release
- Report Bugs

---

# 22. Branch Naming Standard

```
feature/<module>

bugfix/<module>

release/vX.X.X

hotfix/vX.X.X
```

Examples

```
feature/project

feature/document-control

feature/hr

bugfix/authentication

release/v1.0.0

hotfix/v1.0.1
```

---

# 23. Repository Workflow Diagram

```
                       MAIN
                        ▲
                        │
                Release Branch
                        ▲
                        │
                    DEVELOP
       ┌────────┬────────┬────────┐
       │        │        │        │
 Feature   Feature   Feature   Feature
 Project   Design      QS        HR
       │        │        │        │
       └────────┴────────┴────────┘
                Individual Developers
```

---

# 24. Compliance

All contributors shall comply with this Branch Strategy.

Failure to follow this policy may result in rejection of Pull Requests or delayed software releases.

---

# 25. Revision History

| Version | Date | Description | Author |
|----------|------|-------------|--------|
| 1.0.0 | YYYY-MM-DD | Initial Release | System Owner |

---