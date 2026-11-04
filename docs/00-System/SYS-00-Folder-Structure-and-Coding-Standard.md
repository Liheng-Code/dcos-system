# DCOS Enterprise Documentation Structure & Coding Standards Guide

> **Version**: 3.0  
> **Status**: Full Hierarchical Number Sequence Standard  
> **Scope**: All repository documentation under `d:\dcos-system\docs\`

This guide defines the **strict multi-tier number sequences** (`XX`, `XX-YY`, `XX-YY-ZZ`) applied across every folder and file in the DCOS documentation system.

---

## 1. Top-Level Number Sequences

```text
d:\dcos-system\docs\
├── 00-System/                 # Core Platform, Architecture & AI Agent Team
├── 01-Master-Data-Standards/  # MDM Standards, CSI Divisions & Naming Codes
├── 02-Modules/                # Business Module Specifications (1:1 with Codebase)
├── 03-Operations-SOP/         # Standard Operating Procedures & User Manuals
├── 04-Templates-Samples/      # WBS Templates, Sample BOQs & Reference Projects
├── 99-Archive/                # Consolidated Archive (Historical Notes & Backups)
└── README.md                  # Master Entrance & Navigation Hub
```

---

## 2. Full Hierarchical Sequence Tree

```text
docs/
│
├── 00-System/                                                 # Core Platform & Architecture
│   ├── README.md
│   ├── 00-01-DCOS-Vision.md                                   # Vision & core principles
│   ├── 00-02-DCOS-System-Architecture.md                      # Full stack Next.js/Supabase architecture
│   ├── 00-03-DCOS-Module-Map.md                               # Registry of system modules
│   ├── 00-04-DCOS-System-Modules.md                           # Detailed module boundaries
│   ├── 00-05-DCOS-Roadmap.md                                  # Delivery roadmap & milestones
│   ├── 00-06-DCOS-Coding-Convention.md                        # TypeScript, React 19, Tailwind rules
│   ├── 00-07-DCOS-Developer-Onboarding.md                     # Dev environment & setup guide
│   ├── 00-08-DCOS-Modularisation-Plan.md                      # Architecture isolation rules
│   ├── 00-09-Agent-Architecture/                              # AI Agent Team & orchestration
│   ├── 00-10-DCOS-AI-Agent-Usage-Guide.md                     # Antigravity/Codex agent guidelines
│   ├── 00-11-DCOS-Licensing-Control-Plane-Design.md           # Cryptographic licensing & entitlements
│   ├── 00-12-DCOS-Governance-Framework.md                    # Data governance & platform controls
│   ├── 00-13-DCOS-RLS-Security-Remediation-Tracker.md         # Database Row-Level Security policies
│   ├── 00-14-DCOS-Document-Control-Procedure.md               # Document management procedures
│   └── 00-15-DCOS-Deploy-Module-Selection-Prompt.md           # Module deployment prompt
│
├── 01-Master-Data-Standards/                                  # Master Data & Classification
│   ├── README.md
│   ├── 01-01-CSI-MasterFormat-Standard.md                     # 35 CSI Divisions standard
│   ├── 01-02-MDM-Master-Data-Management/                      # MDM Governance
│   │   ├── 01-02-01-MDM-CAT-001-Catalogue/                    # Master Data Catalogue
│   │   ├── 01-02-02-MDM-COD-001-Coding/                       # Coding & Naming Rules
│   │   ├── 01-02-03-MDM-STD-001-Standard/                     # Enterprise MDM Standard
│   │   └── 01-02-04-Decisions-ADR/                            # Architecture Decision Records
│   └── 01-03-Naming-Conventions/                              # Naming Standards
│       ├── DCOS-Naming-Convention.md
│       ├── DCOS_Naming_Convention_SOP.docx
│       └── DCOS_Naming_Standards.pdf
│
├── 02-Modules/                                                # Business Modules (1:1 with Codebase)
│   ├── README.md
│   ├── 02-01-Administration/                                  # User Management, RBAC & Licensing
│   │   └── 02-01-01-User-Management/
│   ├── 02-02-Project/                                         # Project Setup & Stakeholders
│   │   ├── 02-02-01-Project-Setup/
│   │   │   ├── 02-02-01-01-Pre-Contract/
│   │   │   └── Guild/
│   │   └── 02-02-02-Stakeholder-Management/
│   ├── 02-03-WBS-and-Tasks/                                   # WBS Tree & Task Spine
│   │   ├── 02-03-01-WBS-Management/
│   │   └── 02-03-02-Task-Management/
│   ├── 02-04-Planning-and-Scheduling/                         # CPM Engine, Working Calendars
│   │   └── 02-04-04-Activity-Database/
│   ├── 02-05-Quantity-Surveying/                              # QS & Commercial Management
│   │   ├── 02-05-01-Cost-and-BOQ-Core/
│   │   └── 02-05-04-IPC-Progress-Claims/
│   ├── 02-06-Procurement/                                     # Requisitions, RFQ & Bid Comparison
│   ├── 02-07-Inventory/                                        # Warehouse & Materials Master
│   ├── 02-08-Construction/                                    # Site Execution, Daily Reports, QA/QC
│   │   └── 02-08-01-Daily-Site-Reporting/
│   ├── 02-09-HR-and-Workforce/                                # Employee Master, Attendance & Leave
│   │   ├── 02-09-01-Employee-Master/
│   │   ├── 02-09-02-Leave-Management/
│   │   ├── 02-09-03-Attendance/
│   │   ├── 02-09-04-Overtime/
│   │   ├── 02-09-05-Payroll/
│   │   └── 02-09-06-Asset-Management/
│   └── 02-10-CWIMS/                                           # Water & Infrastructure Telemetry
│
├── 03-Operations-SOP/                                         # Standard Operating Procedures
│   ├── README.md
│   ├── 03-01-SOP-User-Management/                             # User onboarding & profile SOP
│   ├── 03-02-SOP-Stakeholder-Management/                      # Stakeholder registration SOP
│   ├── 03-03-SOP-Project-Setup/                               # Project creation & kickoff SOP
│   ├── 03-04-SOP-WBS-Management/                              # WBS breakdown & spine SOP
│   ├── 03-05-SOP-Task-Management/                             # Task update & alert SOP
│   ├── 03-06-SOP-Planning-Scheduling/                         # Schedule & CPM engine SOP
│   └── 03-07-SOP-Quantity-Surveying/                          # BOQ measurement & IPC claim SOP
│
├── 04-Templates-Samples/                                      # Reference Blueprints & Sample Datasets
│   ├── README.md
│   └── 04-01-Project-Examples/
│       └── 04-01-01-Hattha-Bank-Tower/                        # Complete reference high-rise package
│
└── 99-Archive/                                                # Consolidated Historical Archive
    ├── early-startup/                                         # Prototype requirements
    ├── root-loose-files/                                      # Cleaned temporary notes
    └── legacy-structure-backup/                               # Preserved original folder backups
```

---

## 3. Rules for Adding New Items

1. **Always use the parent number prefix**:
   * If adding to `00-System/` ➔ use `00-16-...`
   * If adding to `01-Master-Data-Standards/` ➔ use `01-04-...`
   * If adding to `03-Operations-SOP/` ➔ use `03-08-...`
   * If adding to `04-Templates-Samples/` ➔ use `04-02-...`
2. **Keep 3-digit sub-numbering for feature modules**:
   * E.g., `02-05-02-Bill-of-Quantities`, `02-05-03-Quantity-Take-Off`.
3. **Store binary files in `_assets/`**:
   * Keep `.png`, `.xlsx`, and `.docx` inside local `_assets/` subfolders.
