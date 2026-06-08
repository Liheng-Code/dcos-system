# DCOS-Coding-Convention.md

# Digital Construction Operating System (DCOS)

## Enterprise Coding Convention Standard

Version: 1.0
Status: Approved
Document Type: Development Standard

---

# 1. Purpose

This document defines coding standards for the Digital Construction Operating System (DCOS).

Objectives:

* Consistent codebase
* Easier maintenance
* Faster onboarding
* Better scalability
* AI-assisted development compatibility
* Reduced technical debt

This standard applies to:

* Frontend
* Backend
* Database
* API
* Infrastructure
* Testing

---

# 2. Technology Stack

## Frontend

```text
React
TypeScript
Vite
TailwindCSS
ShadCN UI
TanStack Table
React Query
React Router
```

---

## Backend

Current

```text
Supabase
PostgreSQL
Edge Functions
```

Future

```text
NestJS
Redis
BullMQ
```

---

## Infrastructure

```text
GitHub
Vercel
Supabase
Cloudflare
```

---

# 3. General Coding Principles

## Rule 1

Code must be readable.

Bad

```ts
const x = a + b;
```

Good

```ts
const totalProjectCost = materialCost + laborCost;
```

---

## Rule 2

Avoid duplicate logic.

Bad

```ts
calculateTaskProgress();
calculateTaskProgress();
calculateTaskProgress();
```

Good

```ts
sharedProgressService.calculate();
```

---

## Rule 3

Business rules belong in services.

Never inside UI components.

---

## Rule 4

No hardcoded values.

Bad

```ts
if (role === "Project Manager")
```

Good

```ts
if (role === Roles.PROJECT_MANAGER)
```

---

## Rule 5

Every change must be traceable.

Use:

```text
Git Commit
Audit Log
Change Request
```

---

# 4. Folder Structure Standard

## Frontend Structure

```text
src/
│
├── app/
├── pages/
├── modules/
├── components/
├── layouts/
├── hooks/
├── services/
├── lib/
├── types/
├── constants/
├── stores/
├── utils/
├── assets/
└── tests/
```

---

## Module Structure

Example

```text
modules/
└── task-management/
    │
    ├── pages/
    ├── components/
    ├── hooks/
    ├── services/
    ├── types/
    ├── schemas/
    ├── constants/
    └── tests/
```

Every module follows identical structure.

---

# 5. Naming Convention

## Files

Use:

```text
kebab-case
```

Examples

```text
task-board.tsx

project-dashboard.tsx

document-register.tsx
```

---

## React Components

Use:

```text
PascalCase
```

Examples

```tsx
TaskBoard

ProjectDashboard

DocumentRegister
```

---

## Variables

Use:

```text
camelCase
```

Examples

```ts
projectName

taskStatus

assignedUser
```

---

## Constants

Use:

```text
UPPER_CASE
```

Examples

```ts
MAX_FILE_SIZE

DEFAULT_PAGE_SIZE

TASK_STATUS
```

---

## Types

Use:

```text
PascalCase
```

Examples

```ts
Project

Task

DocumentRevision
```

---

# 6. TypeScript Rules

## Never Use Any

❌

```ts
const data: any
```

---

✅

```ts
const data: Project
```

---

## Explicit Types

Always define.

```ts
interface Project {
  id: string;
  code: string;
  name: string;
}
```

---

## Shared Types

Store in:

```text
src/types
```

---

# 7. React Component Rules

## One Component One Responsibility

Bad

```text
Task Page

+ Table
+ Modal
+ API
+ Notification
+ Report
```

---

Good

```text
Task Page

Task Table

Task Modal

Task Service
```

Separated.

---

## Maximum File Size

Recommended:

```text
300 lines
```

Hard limit:

```text
500 lines
```

---

# 8. UI Design Rules

All screens must use:

```text
DCOS Design System
```

---

## Layout Standard

```text
Page Header

Toolbar

Filters

Content

Footer
```

---

## Table Standard

Always support:

```text
Search

Filter

Sort

Export

Column Toggle

Pagination
```

---

# 9. State Management

Use:

```text
React Query
```

for server state.

---

Use:

```text
Zustand
```

for global state.

---

Avoid:

```text
Prop Drilling
```

more than 2 levels.

---

# 10. API Standards

## REST Naming

Use nouns.

Good

```text
/api/projects

/api/tasks

/api/documents
```

---

Bad

```text
/api/getProject

/api/createTask
```

---

## HTTP Methods

```text
GET

POST

PUT

PATCH

DELETE
```

Only.

---

# 11. Database Standards

## Table Names

Use:

```text
snake_case
```

Examples

```sql
projects

project_members

task_assignments

document_revisions
```

---

## Primary Key

Standard

```sql
id uuid
```

---

## Foreign Keys

Format

```sql
project_id

task_id

user_id
```

---

## Audit Fields

Every table must contain:

```sql
created_at

created_by

updated_at

updated_by
```

---

# 12. Multi-Tenant Standards

Every business table must contain:

```sql
tenant_id
```

Example

```sql
projects

tasks

documents

cost_records
```

---

Never allow cross-tenant access.

---

# 13. WBS Standards

Every operational table must support:

```sql
project_id

wbs_id
```

Examples

```sql
tasks

documents

issues

photos

inspections

cost_records
```

---

# 14. Service Layer Rules

Never place business logic inside:

```tsx
React Components
```

---

Bad

```tsx
calculateProgress();
approveTask();
```

inside component.

---

Good

```ts
taskService.calculateProgress();

taskService.approveTask();
```

---

# 15. Validation Standards

Use:

```text
Zod
```

Only.

---

Example

```ts
const ProjectSchema = z.object({
  code: z.string(),
  name: z.string()
});
```

---

# 16. Error Handling

Never:

```ts
console.log(error)
```

only.

---

Always:

```ts
logError(error)

showToast(error)

auditLog(error)
```

where applicable.

---

# 17. Logging Standards

Levels:

```text
INFO

WARNING

ERROR

CRITICAL
```

---

Example

```ts
logger.info("Task created");

logger.error("Document upload failed");
```

---

# 18. Notification Standards

Never trigger notifications directly.

Bad

```ts
sendTelegram();
```

---

Good

```ts
notificationEngine.send();
```

---

All notifications must go through:

```text
Notification Engine
```

---

# 19. Approval Standards

Never create custom approval logic.

All modules use:

```text
Approval Engine
```

---

Examples

```text
Document Approval

Purchase Approval

Leave Approval

Claim Approval
```

Shared engine only.

---

# 20. Audit Standards

Every module must log:

```text
Create

Update

Delete

Approve

Reject

Assign

Export
```

---

Use:

```text
Audit Engine
```

Only.

---

# 21. Security Standards

## Never Store

```text
Passwords

Secrets

API Keys
```

Inside source code.

---

Use:

```text
Environment Variables
```

Only.

---

## Permissions

Always validate:

```text
Frontend

Backend

Database
```

Triple layer.

---

# 22. Git Standards

## Branch Naming

Feature

```text
feature/task-management
```

---

Bug

```text
bugfix/document-upload
```

---

Hotfix

```text
hotfix/login-issue
```

---

# 23. Commit Standards

Format

```text
type(scope): description
```

---

Examples

```text
feat(task): add task approval

fix(document): revision upload bug

refactor(wbs): optimize tree loading
```

---

# 24. Testing Standards

Minimum Coverage

```text
80%
```

---

Required Tests

```text
Unit Test

Integration Test

UAT Test
```

---

Critical Modules

```text
Authentication

Approval

Payroll

Finance

Cost Control
```

Require higher coverage.

---

# 25. Performance Standards

Dashboard

```text
< 2 seconds
```

---

Task List

```text
< 1 second
```

---

API

```text
< 500 ms
```

---

# 26. AI Development Standards

When using:

```text
Claude Code

Codex

Gemini

Lovable
```

Generated code must:

* Follow folder structure
* Follow naming standards
* Use shared services
* Use shared types
* Use audit engine
* Use approval engine
* Use notification engine

No exceptions.

---

# 27. Definition of Done (DoD)

A feature is complete only when:

```text
Code Written
Code Reviewed
Type Safe
Tested
Audit Logged
Permission Checked
Documentation Updated
Merged to Main
```

---

# 28. Architecture Rules

No module may create its own:

```text
User System
Permission System
Approval System
Notification System
Audit System
```

All modules must reuse the shared platform engines.

---

# 29. Technical Debt Rules

Every shortcut must have:

```text
Technical Debt Record

Owner

Target Fix Date
```

No hidden technical debt.

---

# 30. Final Statement

The purpose of coding standards is not to restrict developers.

The purpose is to ensure that DCOS remains:

* Maintainable
* Scalable
* Secure
* Consistent
* Enterprise Ready

As the platform grows to 50+ modules and millions of records, these standards ensure that every developer, AI assistant, and future team member can work within the same architecture.

Consistency today prevents chaos tomorrow.
