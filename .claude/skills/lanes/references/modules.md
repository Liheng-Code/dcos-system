# Lane modules

One row per business module that can run as a lane. `key` is the `MODULE_PATHS` key in `apps/web/module-boundaries.mjs`; that file is the source of truth for the paths, so they aren't copied here. To add a module, add a row.

| key | Module | Domain agent(s) for step 1 | Gotchas the lead must know |
|---|---|---|---|
| `planning` | Planning | `planning-manager` | Look-ahead routes and views sit under `app/dashboard/wbs/lookahead` and `components/project/wbs/wbs-lookahead-*`, `wbs-gantt-view`, `wbs-scurve-chart`. These are planning-owned even though they're under project/. Durations are input and dates are calculated (CPM); a DB trigger syncs duration↔dates. Bridge code (`lib/planning/activity-library/*bridge*`) is shared with QS: changing its exports is cross-module. |
| `qs` | Quantity Surveying | `qs-manager`; add `commercial-qs` for IPC, retention, VO or totals logic | Tender price lock: `tender_stage` is owned by `lib/qs/tender-lifecycle.ts`, and the DB lock guard (`tender_lock_guard`) must cover any new tender_* table. BOQ → Procurement PR (`raise-pr-from-boq-dialog`) and the Planning bridge are cross-module. Other modules read QS only via `lib/qs/public.ts` / `public-tender.ts`. |
| `procurement` | Procurement | `procurement-manager` | Tables are `procurement_*` (e.g. `procurement_rfqs`, `procurement_quotation_items`). RLS on procurement tables is open to all authenticated users (known gap). Award goes through the RPC `procurement_award_rfq`. |
| `inventory` | Inventory | `procurement-manager` (no inventory agent yet) | Stores, stock, GRN and tools. A GRN against a PO touches Procurement, which makes it cross-module. API routes are under `app/api/inv`. |
| `hr` | HR Management | `hr-manager` | The attendance bot (@dcos_Attendance_bot) and @DCOSNotifyBot are different bots and tokens. Telegram code is in `lib/hr/telegram`, and the Mini App is in `app/telegram-app`. The leave year-end page lives under `app/dashboard/administration/year-end` but is HR-owned. |
| `construction` | Construction (site, QA/QC, HSE) | `construction-manager`; `hse-manager` for HSE; `qaqc-manager` for inspections and NCRs | Daily Reporting has its own bot (@DCOSSiteReport_Bot, `TELEGRAM_DR_BOT_TOKEN`, webhook `/api/dr/telegram/webhook`), with no fallback to the attendance bot. Routes: `app/dashboard/site`, `qaqc`, `hse`, `app/field`, `app/dr-miniapp`. |
| `document_control` | Document Control | `document-control-manager` | Routes `app/dashboard/documents` and `app/verify/doc`. Numbering and revision rules are in the `domain-document-control` skill. |
| `design` | Design & BIM | `design-manager` | BIM viewer hook `hooks/use-bim-viewer.ts`, API routes under `app/api/bim`. |
| `account` | Account | `finance-manager` | Chart of accounts, AP/AR and ledger. Payroll postings from HR are cross-module. |
| `reporting` | Reporting | `system-architect` (design) | Reads other modules only through their `PUBLIC_API`. Charts and report frames are core (`components/report-kit`), so changes there are core requests. |

Not lanes (core, main window only): **Project** (`components/project` projects/wbs/tasks/stakeholders) and **Administration** (`components/administration`, settings, licensing).
