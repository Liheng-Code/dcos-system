# DCOS Documentation Skill

## Purpose
Use this skill when writing, reviewing, restructuring, or upgrading documentation for the Digital Construction Operating System (DCOS).

This skill helps Codex produce professional construction-software documentation that is consistent, implementation-ready, and aligned with the DCOS architecture principle:

> One unified construction operating system, modular by discipline, driven by WBS.

## When to Use This Skill
Use this skill for:

- Module specifications
- System architecture documents
- Database design documents
- Workflow documents
- UI/UX requirement documents
- Implementation prompts
- README files
- Developer handover notes
- Product requirement documents
- Gap analysis reports
- Revision-controlled markdown files
- Construction process documentation

## DCOS Documentation Principles

### 1. Write for real implementation
Documentation must not sound like a brochure. It must help a developer, product owner, or construction manager build the system.

Each document should clearly explain:

- What the module does
- Why it exists
- Who uses it
- What data is required
- What workflow it follows
- What permissions apply
- What notifications are triggered
- What audit logs are required
- What reports are produced
- What other modules it connects to

### 2. Keep WBS as the backbone
For any DCOS module, always check whether records need to connect to:

- Project
- WBS node
- Discipline
- Responsible user
- Status
- Document
- Approval workflow
- Audit log
- Notification rule

If the module affects project execution, cost, schedule, document control, QA/QC, HSE, or procurement, it should normally link back to Project and WBS.

### 3. Use construction language
Prefer construction terms over generic software terms.

Examples:

- Use “RFI” instead of “question ticket”
- Use “NCR” instead of “quality issue”
- Use “Inspection Request” instead of “check request”
- Use “Transmittal” instead of “file sharing”
- Use “Interim Payment Certificate” instead of “monthly invoice”
- Use “WBS node” instead of “folder item”

### 4. Separate business logic from UI
Good documentation should separate:

- Business purpose
- Workflow logic
- Data model
- UI layout
- Permissions
- API behavior
- Reporting

Do not mix everything into one unclear paragraph.

### 5. Use revision-controlled document style
For formal DCOS documents, include a document header:

```markdown
# Document Title

| Field | Detail |
|---|---|
| System | Digital Construction Operating System (DCOS) |
| Module | Module Name |
| Document Type | Specification / Prompt / Guide / Gap Analysis |
| Version | R1 |
| Status | Draft / Review / Approved |
| Prepared For | DCOS Development |
| Date | YYYY-MM-DD |
```

## Standard DCOS Module Specification Template

When asked to create a module document, use this structure:

```markdown
# Module Name — DCOS Module Specification

## 1. Purpose
Explain what the module does and why it exists.

## 2. Business Context
Explain the real construction process supported by this module.

## 3. Key Users and Stakeholders
| Role | Responsibility |
|---|---|

## 4. Module Scope
### 4.1 Included
### 4.2 Excluded / Future Phase

## 5. Core Features
| Feature | Description | Priority |
|---|---|---|

## 6. Main Workflow
Use step-by-step workflow and include rejection / return paths.

## 7. Status Lifecycle
| Status | Meaning | Next Possible Status |
|---|---|---|

## 8. Data Model
| Field | Type | Required | Description |
|---|---|---|---|

## 9. Permissions
| Role | View | Create | Edit | Submit | Approve | Delete | Export |
|---|---|---|---|---|---|---|---|

## 10. Notification Rules
| Trigger | Recipient | Channel | Priority |
|---|---|---|---|

## 11. Audit Log Rules
| Action | Severity | Required Snapshot |
|---|---|---|

## 12. UI / UX Requirements
Describe screens, layout, table columns, filters, forms, dashboards.

## 13. Reports and KPIs
| Report / KPI | Purpose | User |
|---|---|---|

## 14. Integration Points
| Connected Module | Relationship |
|---|---|

## 15. Acceptance Criteria
Use checklist format.

## 16. Implementation Notes
Practical notes for developers.
```

## Standard Prompt Document Template

When asked to create a prompt for Codex, Lovable, Cursor, or another AI coding tool, use this structure:

```markdown
# DCOS Implementation Prompt — Module Name

## 1. Role
You are acting as a senior full-stack construction software engineer.

## 2. System Context
This project is DCOS: Digital Construction Operating System.
Core principle: one unified system, modular by discipline, driven by WBS.

## 3. Objective
State the exact feature/module to implement.

## 4. Existing Stack
- Frontend: Next.js / React / TypeScript
- UI: Tailwind CSS / shadcn/ui
- Backend: Supabase or Node.js
- Database: PostgreSQL / Supabase
- Auth: Supabase Auth / RBAC

## 5. Functional Requirements
List requirements clearly.

## 6. Data Requirements
List tables, fields, relationships, constraints.

## 7. UI Requirements
List screens, components, filters, forms, actions.

## 8. Workflow Requirements
Describe statuses and transitions.

## 9. Permission Requirements
Describe who can do what.

## 10. Audit and Notification Requirements
Describe logs and alerts.

## 11. Validation Rules
List required validations.

## 12. Output Required
Tell the coding agent exactly what files/code/docs to create.
```

## Documentation Quality Checklist

Before finalizing any DCOS document, verify:

- [ ] Title is clear
- [ ] Version/status is shown
- [ ] Purpose is specific
- [ ] Business process is explained
- [ ] WBS relationship is considered
- [ ] Roles and responsibilities are clear
- [ ] Workflow includes rejection/return paths
- [ ] Status lifecycle is defined
- [ ] Data fields are listed
- [ ] Permissions are included
- [ ] Notifications are included
- [ ] Audit requirements are included
- [ ] Reports/KPIs are included
- [ ] Integration points are included
- [ ] Acceptance criteria are testable
- [ ] Language is practical, not marketing fluff

## Markdown Style Rules

Use clean markdown:

- Use numbered sections for formal documents
- Use tables for structured fields
- Use code blocks for workflows, folder trees, schemas, and examples
- Use checklists for acceptance criteria
- Use short paragraphs
- Avoid vague words like “manage everything”
- Avoid overusing emojis in formal specs
- Keep document names clear and revision-based

Recommended file names:

```text
DCOS_Project_Setup_Module_R1.md
DCOS_WBS_Management_Spec_R1.md
DCOS_Task_Workflow_Prompt_R1.md
DCOS_RBAC_Permission_Matrix_R1.md
DCOS_Audit_Notification_Engine_R1.md
```

## DCOS Tone

Use a professional construction-technology tone:

- Practical
- Direct
- Implementation-ready
- Clear enough for developers
- Familiar to construction managers
- Structured like controlled project documentation

Avoid:

- Sales language
- Overly academic wording
- Unclear abstract explanations
- Missing workflows
- Missing data fields
- Missing ownership and permissions

## Common DCOS Sections to Reuse

### Core Principle
```text
DCOS is one unified construction operating system, modular by discipline, driven by WBS.
```

### Standard WBS Relationship
```text
Company / Tenant
└── Project
    └── Building / Area
        └── Level
            └── Zone
                └── Room / Space / Element
                    └── Task / Document / Cost / Inspection / Issue
```

### Standard Task Status
```text
Open
Assigned
In Progress
On Hold
Completed
Submitted for Approval
Approved
Rejected
Closed
Cancelled
```

### Standard Document Status
```text
Draft
Submitted
Under Review
Approved
Approved with Comment
Rejected
Issued for Construction
Superseded
Archived
```

### Standard Approval Flow
```text
Draft
→ Submitted
→ Reviewer
→ Approver
→ Approved / Rejected
→ Closed
```

## Special Instructions for Codex

When this skill is used inside Codex:

1. Inspect existing project files before writing new documents.
2. Keep documentation consistent with current folder structure.
3. Do not overwrite approved files without creating a new revision.
4. Use `R0`, `R1`, `R2` revision naming where suitable.
5. If improving an existing document, preserve useful original content and clearly add upgraded sections.
6. Prefer markdown output unless the user requests HTML, CSV, Excel, or another format.
7. For implementation prompts, make requirements explicit enough that another coding agent can execute them.

## Output Standards

Good output should be ready to save as `.md` with minimal editing.

Bad output is generic, vague, or misses construction workflow logic.
