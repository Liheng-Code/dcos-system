# DCOS System - Project Folder Structure (Updated)

> Last updated: July 2026 — after cleanup (removed stale lockfiles, stray workspace configs, empty logs, backup files)

```
dcos-system/
│
├── .claude/                                # Claude Code AI agent configuration
│   ├── CLAUDE.md                           # Project overview and agent guidance for Claude Code
│   ├── agents/                             # Specialized AI agent definitions
│   │   ├── backend-engineer.md             # Backend API routes, service layer, Zod validation
│   │   ├── code-reviewer.md                # Code review quality gate (read-only)
│   │   ├── commercial-qs.md                # Quantity surveyor domain expert for BOQ/IPC/retention
│   │   ├── database-engineer.md            # Supabase migrations, RLS policies, indexes, seeds
│   │   ├── dcos-project-control-agent.md   # Executive project oversight, risk monitoring, analytics
│   │   ├── docs-writer.md                  # Documentation: specs, SOPs, module packs
│   │   ├── frontend-engineer.md            # Next.js UI implementation, shadcn, Tailwind
│   │   ├── mobile-engineer.md              # React Native field app (Phase 3)
│   │   └── system-architect.md             # Module design, data models, architecture decisions
│   └── skills/                             # Reusable skill definitions for AI agents
│       ├── dcos-audit-notification-skill/  #   Audit logging and notification patterns
│       │   ├── README.md
│       │   └── skill.md
│       ├── dcos-documentation/             #   Documentation standards
│       │   ├── README.md
│       │   └── skill.md
│       ├── dcos-nextjs-ui/                 #   Next.js UI patterns
│       │   ├── README.md
│       │   └── skill.md
│       ├── dcos-rbac-permission/           #   RBAC and permission patterns
│       │   ├── README.md
│       │   └── skill.md
│       ├── dcos-supabase-database/         #   Supabase/PostgreSQL patterns
│       │   ├── README.md
│       │   └── skill.md
│       ├── dcos-system-architect/          #   System architecture patterns
│       │   ├── README.md
│       │   └── skill.md
│       └── dcos-workflow-engine/           #   Workflow engine patterns
│           ├── README.md
│           └── skill.md
│
├── .dockerignore                          # Docker build exclusions
├── .gitignore                             # Git exclusions (node_modules, .env, .bak, dev-server*.log)
│
├── .github/
│   └── workflows/
│       └── ci.yml                         # CI pipeline: lint + build on master branch pushes/PRs
│
├── .opencode/                             # OpenCode IDE extension state
│   ├── .gitignore
│   ├── Agents/ 
│   │   └── AGENT.md                       # Agent definition
│   ├── git/                               # Git index, repos cache, sessions
│   ├── node_modules/                      # OpenCode plugin deps
│   ├── package-lock.json                  # OpenCode plugin lock
│   ├── package.json                       # Dependency: @opencode-ai/plugin
│   └── server.lock.json                   # OpenCode server config
│
├── Dockerfile                             # Multi-stage Docker build: Node 22 Alpine, pnpm 10.33.2
│                                          #   Next.js standalone output
│
├── apps/
│   └── web/                               # MAIN APPLICATION: Next.js 16 frontend
│       ├── .env.example                   # Template for Supabase credentials
│       ├── .env.local                     # Local Supabase creds (not committed)
│       ├── .env.production                # Production Supabase creds (not committed)
│       ├── .gitignore
│       ├── AGENTS.md                      # Warnings about Next.js 16 breaking changes
│       ├── CLAUDE.md                      # @AGENTS.md reference
│       ├── README.md
│       ├── components.json                # shadcn/ui config: base-nova style, Lucide icons
│       ├── eslint.config.mjs              # ESLint config (Next.js + TypeScript rules)
│       ├── next-env.d.ts                  # Next.js TypeScript declarations
│       ├── next.config.ts                 # Redirects: /qs/retention -> /qs/claims
│       ├── package.json                   # Next 16.2.6, React 19, Supabase, Three.js, Leaflet,
│       │                                  #   shadcn, Recharts, Zod, Zustand, XLSX, react-arborist,
│       │                                  #   @thatopen (BIM/IFC), jsqr, qrcode, react-hook-form
│       ├── postcss.config.mjs             # PostCSS with @tailwindcss/postcss
│       ├── tsconfig.json                  # ES2017 target, bundler resolution, @/* alias
│       ├── tsconfig.tsbuildinfo
│       ├── vercel.json                    # Vercel deploy config
│       │
│       ├── app/                           # Next.js App Router (file-based routing)
│       │   ├── favicon.ico
│       │   ├── globals.css
│       │   ├── layout.tsx                 # Root layout
│       │   ├── page.tsx                   # Landing page with auth redirect
│       │   │
│       │   ├── api/                       # Backend API route handlers
│       │   │   ├── bim/models/            # BIM model management endpoints
│       │   │   ├── geo/                   # search/, reverse/ (geocoding)
│       │   │   ├── hr/                    # attendance/, employees/, leave/,
│       │   │   │                          #   overtime/, timesheets/
│       │   │   ├── inv/                   # adjustments/, grns/, mrs/, stock/,
│       │   │   │                          #   stocktakes/, transfers/
│       │   │   └── procurement/[resource] # Dynamic procurement API
│       │   │
│       │   └── dashboard/                 # Authenticated dashboard area
│       │       ├── layout.tsx             # Dashboard layout (sidebar, auth)
│       │       ├── page.tsx               # Dashboard home
│       │       │
│       │       ├── account/               # Finance & Accounting (12 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── ap/                #   Accounts Payable
│       │       │   ├── ar/                #   Accounts Receivable
│       │       │   ├── bank/              #   Bank accounts
│       │       │   ├── coa/               #   Chart of Accounts
│       │       │   ├── currencies/        #   Currency settings
│       │       │   ├── gl/                #   General Ledger
│       │       │   ├── journals/          #   Journal entries
│       │       │   ├── payment-runs/      #   Payment runs
│       │       │   ├── payments/          #   Payment vouchers
│       │       │   ├── reports/           #   Financial reports
│       │       │   └── wht/               #   Withholding tax
│       │       │
│       │       ├── administration/        # System administration (6 sub-routes)
│       │       │   ├── leave-types/       #   Leave type configuration
│       │       │   ├── master-libraries/  #   Master WBS libraries
│       │       │   ├── stakeholder-templates/
│       │       │   ├── stakeholders/      #   Stakeholder management
│       │       │   ├── team-capacity/     #   Team capacity planning
│       │       │   └── year-end/          #   Year-end processing
│       │       │
│       │       ├── contracts/             # Contract administration (5 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── correspondence/[id]/
│       │       │   ├── employer-instructions/
│       │       │   ├── entitlements/
│       │       │   ├── notices/[id]/
│       │       │   └── register/[id]/
│       │       │
│       │       ├── design/                # Design management (3 disciplines)
│       │       │   ├── page.tsx
│       │       │   ├── arc/               #   Architecture: door-schedule, drawings,
│       │       │   │                      #     finish-schedule, material-approval, rfi,
│       │       │   │                      #     room-data, window-schedule
│       │       │   ├── bim/               #   BIM viewer (page.tsx + viewer/)
│       │       │   ├── coordination/      #   Design coordination log
│       │       │   ├── markup/            #   Drawing markup/redline
│       │       │   ├── mep/               #   MEP: commissioning, drawings, equipment,
│       │       │   │                      #     load-schedule, rfi, sleeves, submittals
│       │       │   └── str/               #   Structure: calculations, design-changes,
│       │       │                          #     drawings, models, rebar, rfi, technical-queries
│       │       │
│       │       ├── documents/             # Document control (3 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── audit-log/
│       │       │   ├── controller/
│       │       │   └── transmittals/
│       │       │
│       │       ├── hr/                    # Human Resources (18+ sub-routes)
│       │       │   ├── layout.tsx
│       │       │   ├── page.tsx
│       │       │   ├── analytics/
│       │       │   ├── assets/
│       │       │   ├── attendance/        #   checkin/, my/, reports/, shifts/,
│       │       │   │                      #     sites/, supervisor/
│       │       │   ├── competency/
│       │       │   ├── dashboard/
│       │       │   ├── documents/
│       │       │   ├── employees/         #   page.tsx, [id]/, new/
│       │       │   ├── leave/             #   apply/, my-requests/, approvals/,
│       │       │   │                      #     approval-chain/, approval-chains/, balance/,
│       │       │   │                      #     admin/, public-holidays/, team-calendar/,
│       │       │   │                      #     who-is-on-leave/, probation-policy/,
│       │       │   │                      #     seniority-rules/, replacement/,
│       │       │   │                      #     notifications/, reports/
│       │       │   ├── organization/
│       │       │   ├── overtime/          #   apply/, my-requests/, approvals/,
│       │       │   │                      #     approval-chain/, approval-chains/, [id]/,
│       │       │   │                      #     edit/, analytics/, audit/, rates/,
│       │       │   │                      #     limits/, level-config/, notifications/
│       │       │   ├── payroll/           #   setup/, periods/, entry/, run/, runs/,
│       │       │   │                      #     my-payslip/, reports/, audit/,
│       │       │   │                      #     cost-allocation/, tax-config/,
│       │       │   │                      #     nssf-config/, seniority-config/
│       │       │   ├── performance/
│       │       │   ├── recruitment/
│       │       │   ├── resources/
│       │       │   ├── timesheet/
│       │       │   └── training/
│       │       │
│       │       ├── hse/                   # Health, Safety & Environment (5 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── incidents/
│       │       │   ├── observations/
│       │       │   ├── permits/
│       │       │   ├── risk-assessments/
│       │       │   └── toolbox-talks/
│       │       │
│       │       ├── insights/              # Analytics dashboard
│       │       │   └── page.tsx
│       │       │
│       │       ├── inventory/             # Inventory management (7 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── adjustments/
│       │       │   ├── grns/
│       │       │   ├── movements/
│       │       │   ├── mrs/
│       │       │   ├── stock/
│       │       │   ├── stocktakes/
│       │       │   └── transfers/
│       │       │
│       │       ├── mobile/                # Mobile field app (3 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── devices/
│       │       │   └── sync/
│       │       │
│       │       ├── planning/              # Planning & Scheduling (8 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── calendars/
│       │       │   ├── comparison/
│       │       │   ├── delays/
│       │       │   ├── gantt/
│       │       │   ├── lookahead/
│       │       │   ├── reports/
│       │       │   ├── resource-loading/
│       │       │   └── scurve/
│       │       │
│       │       ├── procurement/           # Procurement (14 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── analytics/
│       │       │   ├── audit-log/
│       │       │   ├── auto-reorder/
│       │       │   ├── boq/
│       │       │   ├── goods-receipt/
│       │       │   ├── inventory/
│       │       │   ├── invoice-matches/
│       │       │   ├── notifications/
│       │       │   ├── po/
│       │       │   ├── pr/
│       │       │   ├── prequalification/
│       │       │   ├── rfq/
│       │       │   ├── supplier-performance/
│       │       │   ├── supplier-portal/
│       │       │   └── suppliers/
│       │       │
│       │       ├── profile/               # User profile
│       │       │   └── page.tsx
│       │       │
│       │       ├── projects/              # Project management
│       │       │   └── page.tsx
│       │       │
│       │       ├── qaqc/                  # Quality Assurance / QC
│       │       │   ├── page.tsx
│       │       │   └── ncrs/
│       │       │
│       │       ├── qs/                    # Quantity Surveying (8 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── boq/
│       │       │   ├── claims/
│       │       │   ├── cost-library/
│       │       │   ├── evm/
│       │       │   ├── payments/          # Redirected to claims
│       │       │   ├── rate-libraries/
│       │       │   ├── retention/         # Redirected to claims
│       │       │   └── variations/
│       │       │
│       │       ├── reports/               # Reporting (schedule sub-route)
│       │       │   ├── page.tsx
│       │       │   └── schedule/
│       │       │
│       │       ├── settings/              # Organization settings
│       │       │   └── page.tsx
│       │       │
│       │       ├── site/                  # Site management (6 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── daily-reports/
│       │       │   ├── equipment/
│       │       │   ├── inspections/
│       │       │   ├── manpower/
│       │       │   ├── ncrs/
│       │       │   └── progress-photos/
│       │       │
│       │       ├── subcontractors/        # Subcontractor management (5 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── [id]/
│       │       │   ├── back-charges/
│       │       │   ├── ipcs/
│       │       │   ├── performance-notices/
│       │       │   └── variations/
│       │       │
│       │       ├── tasks/                 # Task management
│       │       │   ├── page.tsx
│       │       │   └── [taskId]/
│       │       │
│       │       ├── tenders/               # Tender management (6 sub-routes)
│       │       │   ├── page.tsx
│       │       │   ├── bid-evaluation/
│       │       │   ├── budget-codes/
│       │       │   ├── cost-estimation/
│       │       │   ├── register/
│       │       │   ├── submissions/
│       │       │   └── tender-management/
│       │       │
│       │       └── wbs/                   # Work Breakdown Structure
│       │           ├── page.tsx
│       │           ├── lookahead/
│       │           └── templates/
│       │
│       ├── components/                    # React components (feature-organized)
│       │   ├── account/                   #   20 files: coa, gl, ap/ar, payments, reports
│       │   ├── bim/                       #   16 files: ifc-viewer, model register, filters
│       │   ├── dashboard/                 #   9 files: sidebar, switcher, context, alerts
│       │   ├── design/                    #   9 files: shell, drawings, schedules, RFI
│       │   ├── documents/                 #   4 files: list, edit, controller, workflow
│       │   ├── hr/                        #   11 files: employees, leave, overtime, payroll
│       │   ├── hse/                       #   6 files: shell, incidents, observations,
│       │   │                              #     permits, risk, toolbox
│       │   ├── insights/                  #   4 files: insight page, cards, tables
│       │   ├── inv/                       #   20 files: dashboard, GRN/MR/transfer/
│       │   │                              #     adjustment/stocktake (create/detail/list)
│       │   ├── landing/                   #   8 files: auth, panels, 3D scene, carousel
│       │   ├── master-libraries/          #   1 file: master-libraries-page
│       │   ├── naming/                    #   22 files: convention admin, WBS types,
│       │   │                              #     codes, levels, building, room, zone,
│       │   │                              #     discipline, abbreviations, numbering,
│       │   │                              #     budget, project/document/transmittal codes
│       │   ├── planning/                  #   22 files: gantt-view/bar/tree/header/toolbar/
│       │   │                              #     legend/milestone/dependency-lines/detail/
│       │   │                              #     types/utils, lookahead, portfolio, comparison,
│       │   │                              #     delay, resource-loading, calendar, schedule-levels
│       │   ├── procurement/               #   33 files: PR/PO/RFQ, suppliers, GRN,
│       │   │                              #     invoice-match, BOQ, permissions
│       │   ├── projects/                  #   8 files: list, edit, wizards, precontract
│       │   ├── qaqc/                      #   5 files: NCR, ITP, inspections
│       │   ├── qs/                        #   19 files: BOQ, budget, cost, EVM, variations,
│       │   │                              #     claims, retention, contingency, currency
│       │   ├── reports/                   #   charts/ (4), layout/ (3)
│       │   ├── settings/                  #   6 files: roles, company, staff, thresholds
│       │   ├── site/                      #   7 files: shell, reports, inspections,
│       │   │                              #     photos, manpower, equipment, NCRs
│       │   ├── stakeholders/              #   5 files: list, edit, staff, templates
│       │   ├── tenders/cost-estimation/   #   11 tabs: BOQ, price-list, unit-rates,
│       │   │                              #     prelims, sub-quotes, summaries, budget, risks
│       │   ├── ui/                        #   21 files: shadcn/ui base components
│       │   └── wbs/                       #   26 files: tree, gantt, kanban, execution,
│       │                                  #     summary, cost, EVM, resources, scurve,
│       │                                  #     lookahead, templates, types
│       │
│       ├── hooks/                         # Custom React hooks
│       │   ├── use-bim-viewer.ts
│       │   ├── use-qs-permissions.ts
│       │   └── use-supabase-auth.ts
│       │
│       ├── lib/                           # Utilities & service layer
│       │   ├── bim/                       #   bim-service, bim-types, ifc-helpers
│       │   ├── hr/                        #   approval-chain, attendance, auth,
│       │   │                              #     permissions, standard-positions
│       │   ├── inv/                       #   inv-service, inv-schemas
│       │   ├── supabase/                  #   client.ts (browser), server.ts (server)
│       │   ├── contract-service.ts
│       │   ├── contract-types.ts
│       │   ├── csv-export.ts
│       │   ├── evm-service.ts
│       │   ├── insights-service.ts
│       │   ├── master-libraries.ts
│       │   ├── permissions.ts
│       │   ├── print-service.ts
│       │   ├── project-setup-service.ts
│       │   ├── qaqc-service.ts
│       │   ├── qs-service.ts
│       │   ├── schedule-service.ts
│       │   ├── supplier-prequalification-service.ts
│       │   ├── task-alerts.ts
│       │   ├── tender-cost-service.ts
│       │   └── utils.ts
│       │
│       └── public/                        # Static assets
│           ├── file.svg
│           ├── globe.svg
│           ├── next.svg
│           ├── vercel.svg
│           ├── web-ifc.wasm
│           └── window.svg
│
├── docs/                                  # Project documentation
│   ├── DCOS-Project-Structure.md          #   This file
│   ├── Enterprise DCOS Documentation Structure.md
│   │
│   ├── 01-DCOS-Foundation/               # Foundation documents
│   │   ├── 05-DCOS-Naming-Convention/    #   Naming convention details
│   │   │   ├── DCOS-Naming-Convention.md
│   │   │   ├── DCOS_Naming_Convention_SOP.docx
│   │   │   └── DCOS_Naming_Standards.pdf
│   │   ├── DCOS-AI-Agent-Usage-Guide.md
│   │   ├── DCOS-Coding-Convention.md
│   │   ├── DCOS-Document-Control-Procedure.md
│   │   ├── DCOS-Governance-Framework.md
│   │   ├── DCOS-Module-Map.md
│   │   ├── DCOS-Naming-Convention.md
│   │   ├── DCOS-Roadmap.md
│   │   ├── DCOS-System-Architecture.md
│   │   └── DCOS-Vision.md
│   │
│   ├── 02-Governance/                    # Governance / SOPs
│   │   └── 01-SOP/
│   │       ├── 01-SOP-User-Management/
│   │       ├── 02-SOP-Stakeholder-Management/
│   │       ├── 03-SOP-Project-Setup/
│   │       ├── 04-SOP-WBS-Management/
│   │       ├── 05-SOP-Task-Management/
│   │       ├── 06-SOP-Planning-Scheduling/
│   │       └── 22-SOP-Quantity-Surveying/
│   │
│   ├── 03-Business-Modules/              # Business module specifications
│   │   ├── 06-Planning-Scheduling/       #   13-doc module pack
│   │   ├── 12-Quantity-Surveying/        #   QS: BOQ, budget codes, price lists
│   │   │   └── Old/
│   │   ├── 17-HR/                        #   5 sub-modules: employee, leave, attendance,
│   │   │                                  #     overtime, payroll
│   │   ├── 21-IPC-Progress-Claim/        #   13-doc pack + attachments
│   │   ├── 26-INV-Inventory/             #   12-doc module pack
│   │   └── 31-cwims/                     #   CWIMS enterprise doc package
│   │
│   └── 10-Archive/                       # Archived/outdated docs (61 items)
│       └── (legacy specs, gap analyses, seed SQL, images)
│
├── docker-compose.yml                    # Docker Compose: web on :3000, Supabase host
├── package.json                          # Root deps: date-fns
├── pnpm-lock.yaml                        # pnpm lockfile (single for monorepo)
├── pnpm-workspace.yaml                   # Workspace: apps/*, packages/*
│
├── scripts/
│   └── generate-task-seeds.mjs           # Generates SQL migration files from markdown docs
│
├── supabase/                             # Supabase backend
│   ├── config.toml                       # API:54321, DB:54322, Studio:54323
│   │                                    #   PostgreSQL 17, Deno 2 edge runtime
│   ├── .temp/                            # Local dev state (gitignored)
│   │
│   ├── functions/                        # Edge Functions (Deno)
│   │   ├── escalation-check/index.ts     #   Task escalation checking (cron)
│   │   └── notify-task/index.ts          #   Task notifications
│   │
│   ├── migrations/                       # 229 SQL migration files (May-Jul 2026)
│   │   ├── Core & Auth                   #   profiles, RBAC, companies, JWT hooks
│   │   ├── Projects & WBS               #   projects, wbs_nodes, templates, rollup
│   │   ├── Tasks                         #   timeline, comments, alerts, escalations
│   │   ├── Stakeholders                  #   stakeholders, staff, templates, mappings
│   │   ├── Document Control              #   documents, naming, transmittals
│   │   ├── Planning & Scheduling         #   insights, snapshots, weekly plans, CPM
│   │   ├── HR Module                     #   org, employees, attendance, leave,
│   │   │                                 #     timesheets, performance, training,
│   │   │                                 #     competency, recruitment, assets
│   │   ├── Payroll Module                #   payroll tables, tax/NSSF, cost allocation
│   │   ├── Overtime Module               #   OT tables, constraints, rates, level config
│   │   ├── Procurement Module            #   PR/PO/RFQ, invoice matching, audit
│   │   ├── QS Module                     #   cost library, BOQ, variations, claims,
│   │   │                                 #     retention, multi-currency
│   │   ├── Accounting Module             #   COA, AP/AR, payments, journals, bank,
│   │   │                                 #     WHT, FX
│   │   ├── Design Module                 #   design tables, drawing markup
│   │   ├── Site Execution                #   daily reports, inspections, manpower
│   │   ├── QAQC Module                   #   QAQC tables, NCRs
│   │   ├── HSE Module                    #   incidents, observations, permits, risk
│   │   ├── Subcontractor Management      #   subcon tables, contract administration
│   │   ├── Tender Management             #   tender register, cost estimation, bids
│   │   ├── BIM Module                    #   BIM models, element takeoff, storage
│   │   ├── Inventory Module              #   stock, GRN, MR, transfers, stocktakes
│   │   ├── Master Libraries              #   WBS templates, task templates, code gen
│   │   ├── Dashboard & Reporting         #   Reporting views
│   │   └── Mobile Field App              #   Mobile sync tables
│   │
│   └── seeds/                            # Seed data
│       ├── staff_list-seed.sql
│       ├── seed_demo_users.sql
│       ├── seed_contract_admin.sql
│       └── seed_supplier_prequalification.sql
│
└── vercel.json                           # Root Vercel config
```

---

## Summary of Major Components

| Module | Route Path | Description |
|--------|-----------|-------------|
| **WBS** | `/dashboard/wbs` | Hierarchical work breakdown structure with tree, Gantt, Kanban, and EVM views. Templates, master libraries, look-ahead planning, and progress rollup. |
| **Projects** | `/dashboard/projects` | Project listing, creation wizards, setup wizard with stakeholder assignment, pre-contract management. |
| **Tasks** | `/dashboard/tasks` | Task management with status tracking, assignees, alerts, escalations, recurrences, and constraints. |
| **Planning** | `/dashboard/planning` | Gantt charts, S-curves, delay registers, calendar exceptions, resource loading, plan comparisons, schedule levels (P6-like). |
| **Design** | `/dashboard/design` | Architecture/Structure/MEP design management, BIM model viewer (Three.js/IFC), drawing markup, coordination logs, RFI management. |
| **Documents** | `/dashboard/documents` | Document control with transmittals, audit trail, controller dashboard, and workflow review. |
| **HR** | `/dashboard/hr` | Full HR suite: employees, attendance (QR/selfie/check-in), leave (approval chains, seniority, holidays), overtime (levels, rates, analytics), payroll (PIT/NSSF, cost allocation, payslips), timesheets, performance, competency, training, recruitment, org chart, assets. |
| **Procurement** | `/dashboard/procurement` | PR/PO/RFQ workflows, supplier management (portal, prequalification, performance), 3-way invoice matching, goods receipts, BOQ, auto-reorder, audit log, notifications. |
| **QS** | `/dashboard/qs` | BOQ builder, cost library, variation orders, progress claims/IPC, retention ledger, EVM, cost control, budget revisions, multi-currency, contingency register. |
| **Accounting** | `/dashboard/account` | Chart of Accounts, General Ledger, AP/AR invoices, payment vouchers, payment runs, bank accounts, withholding tax, journal entries, multi-currency, financial reports. |
| **Tenders** | `/dashboard/tenders` | Tender register, management workflow, cost estimation (BOQ, price list, unit rates, preliminaries, sub-quotes, bid summary), bid evaluation, budget codes, submissions. |
| **Inventory** | `/dashboard/inventory` | Stock balances, GRNs, material requests, transfers, adjustments, stocktakes. |
| **Contracts** | `/dashboard/contracts` | Contract register, notices, correspondence, entitlements, employer instructions. |
| **Subcontractors** | `/dashboard/subcontractors` | Subcontractor management, IPCs, variations, back charges, performance notices. |
| **Site** | `/dashboard/site` | Daily reports, inspections, progress photos, manpower tracking, equipment tracking, site NCRs. |
| **QAQC** | `/dashboard/qaqc` | NCR management, ITP manager, inspection requests and results. |
| **HSE** | `/dashboard/hse` | Incidents, safety observations, permits to work, risk assessments, toolbox talks. |
| **Insights** | `/dashboard/insights` | Cross-module analytics with KPI cards, task status tables, and approval pipelines. |
| **Reports** | `/dashboard/reports` | Report generation with charts, KPIs, and export (PDF/Excel). |
| **Mobile** | `/dashboard/mobile` | Mobile field app device management and sync status. |
| **Administration** | `/dashboard/administration` | Stakeholders, stakeholder templates, leave type config, master libraries, team capacity, year-end processing. |

---

## Infrastructure Summary

| Component | Details |
|-----------|---------|
| **Monorepo** | pnpm workspaces with `apps/*` and `packages/*` (only `apps/web` exists) |
| **Database** | Supabase (PostgreSQL 17) with 229 SQL migrations, Row-Level Security, edge functions |
| **Auth** | Supabase Auth (JWT-based), email sign-up, RBAC with role/permission tables |
| **Storage** | Supabase Storage for task attachments, BIM models, procurement docs, attendance photos |
| **Edge Functions** | `escalation-check` (task escalations) and `notify-task` (task notifications) |
| **CI/CD** | GitHub Actions (lint + build on push/PR to master), Vercel deployment |
| **Docker** | Multi-stage Dockerfile (Node 22 Alpine) with standalone Next.js output |
| **AI Tooling** | 9 Claude Code agents, 7 Claude skills, OpenCode AI plugin |
| **BIM** | IFC viewer using Three.js + @thatopen/web-ifc (WebAssembly) with spatial tree, properties, viewpoints |

---

## Cleanup Log (July 2026)

| Action | Item | Reason |
|--------|------|--------|
| Deleted | `apps/web/dev-server.err.log` | Empty (0 bytes) dev artifact |
| Deleted | `apps/web/dev-server.log` | Empty (0 bytes) dev artifact |
| Deleted | `apps/web/package-lock.json` | Stale npm lockfile (project uses pnpm) |
| Deleted | `apps/web/pnpm-lock.yaml` | Stray lockfile (root governs monorepo) |
| Deleted | `apps/web/pnpm-workspace.yaml` | Stray workspace config (should only exist at root) |
| Deleted | `supabase/migrations/..._create_boq_engine.sql.bak` | Discarded backup file |
| Updated | Root `.gitignore` | Added `*.bak`, `dev-server*.log` rules |
| Updated | `apps/web/.gitignore` | Added `dev-server*.log`, `dev-server.err.log` rules |
