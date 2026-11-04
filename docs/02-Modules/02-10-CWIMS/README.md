# CWIMS Reference Package — Read Me

`CWIMS_Enterprise_Documentation_Package.docx` in this folder is the original **Construction Warehouse & Inventory Management System (CWIMS)** enterprise reference specification. It is a source document, not the living build spec — it is not updated as implementation decisions are made.

The **living, implementation-tracking specification** for what is actually being built in DCOS is the Inventory / Stock module doc pack at:

```
docs/03-Business-Modules/26-INV-Inventory/
```

That 12-doc pack (Business Requirement, Functional Specification, Workflow, Database Schema, API Specification, UI/UX Design, Permission Matrix, Notification Matrix, Audit Requirements, Reports & KPI, UAT Test Cases, SOP) is kept current with the actual schema, endpoints, and screens as they are built, and should be treated as the source of truth for developers, testers, and reviewers.

**Current build phase:** CWIMS Appendix A.3 **Stage 1 (Foundation)** + **Stage 2 (Control)** only — masters, warehouse/location setup, GRN, Material Requisition, transfers, returns, adjustments, cycle counts, tool custody, barcode/QR printing and scanning, and low-stock alerts. Stage 3 (batch/FEFO valuation period-close, full physical inventory, DG compliance) and Stage 4 (mobile offline, Equipment-module custody integration, reservation/ATP, external ERP webhooks) are deferred to a later phase and are called out as such in the `26-INV-Inventory` doc pack where relevant.
