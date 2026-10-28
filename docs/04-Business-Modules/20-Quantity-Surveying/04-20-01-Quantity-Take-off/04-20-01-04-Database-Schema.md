# 04 – Database Schema
**Module:** 04-20-01 Quantity Take-off
**Version:** 1.1 (as built, P0)
**Date:** 2026-10-27

The module extends the tender-stage QTO schema of 2026-08 (`20260805000001_create_qto_tables.sql`).
It does not use new `qs_takeoff_*` tables. Each spec table maps to a `qto_*` table:

| Spec table (Master Plan §14.1) | As built | Migration |
|---|---|---|
| `qs_takeoff_session` | `qto_sessions` | `20261027131621_qs_qto_sessions.sql` |
| `qs_takeoff_session_version` | `qto_session_versions` | same |
| `qs_takeoff_item` | `qto_items` (new columns) | same |
| `qs_takeoff_source` | `qto_drawing_register` + `qto_drawing_revisions` (+ optional `document_revision_id`) | 20260805000001 + same |
| `qs_takeoff_geometry` | `qto_measurements` (+ `calibration_id`) and `qto_drawing_calibrations` | same |
| `qs_takeoff_calculation` | `qto_calculation_runs` (append-only) | same |
| `qs_takeoff_item_factor` | `qto_item_factors` | same |
| `qs_measurement_ruleset` / `_rule_version` | `qto_measurement_rulesets` / `qto_measurement_rule_versions` | same |
| `qs_takeoff_review` | `qto_version_reviews` (append-only) | same |
| `qs_takeoff_issue` | `qto_issues` | same |
| `qs_takeoff_revision_change` | Not stored. Computed on demand (`lib/qs/qto/compare.ts`) | — |
| `qs_takeoff_publication` | `qto_publications` (immutable) | same |
| `qs_takeoff_transfer` | `qto_transfers` (append-only) + `qto_boq_links.transfer_id` | same |

Seed and backfill: `20261027131622_qs_qto_sessions_backfill.sql`. RLS: `20261027131623_qs_qto_rls.sql`.

## Tables

### qto_sessions
One logical take-off, linked to a tender (and through it, a project).

| Column | Type | Notes |
|---|---|---|
| tenant_id | uuid | defaults to `dwl_current_tenant()` (the user's company) |
| tender_id | uuid FK → tender_register, not null | cascade |
| project_id | uuid FK → projects | copied from the tender |
| session_code | text, not null | `QTS-001`, generated per tender; UNIQUE (tender_id, session_code) |
| name, description, scope | text | name required |
| purpose | text | `TENDER` \| `CONSTRUCTION` (the UI offers TENDER only in P0) |
| trade, building | text | |
| responsible_qs | uuid FK → profiles | defaults to the creator |
| current_version_id | uuid FK → qto_session_versions | |
| is_deleted | boolean | soft delete |

### qto_session_versions
One measurement iteration. Statuses: DRAFT, IN_PROGRESS, SUBMITTED_FOR_REVIEW, CHANGES_REQUESTED, APPROVED, PUBLISHED, CANCELLED.

| Column | Notes |
|---|---|
| session_id, version_no | UNIQUE (session_id, version_no); the number is assigned under a row lock on the session |
| parent_version_id, baseline_version_id | trigger: must belong to the same session |
| reason | required for v2+ |
| drawing_revision_id | FK → qto_drawing_revisions: the exact source revision |
| ruleset_version_id | FK → qto_measurement_rule_versions: an approved version |
| engine_version | set at submission from the calculation runs |
| submitted/approved/published/cancelled `_by` and `_at`, cancel_reason | |

A PUBLISHED version cannot be updated (trigger `qto_version_lineage_check`).

### qto_items (new columns)
- **New columns:**
  - `session_version_id` (FK, cascade), `tenant_id`.
  - `quantity_status` (FIRM / PROVISIONAL / EXCLUDED / PENDING_CLARIFICATION, default FIRM), `exclusion_reason`, `provisional_assumption`.
  - `wbs_node_id` → wbs_nodes, `budget_code_id` → budget_codes, `level`, `zone`, `rule_code`.
  - `gross_qty`, `deduction_qty`, `factor_product`.
  - `carried_from_item_id` (self FK), `carry_status` (REMEASURED / REVALIDATED / UNVERIFIED), `is_deleted`.
- **Quantity:** `quantity` stays the final quantity, with CHECK 0 ≤ quantity < 10¹². UNIQUE (session_version_id, qto_no).
- **Legacy:** the V1 `status` column is no longer driven by the UI.

### qto_drawing_calibrations
| Column | Notes |
|---|---|
| drawing_revision_id, page_no | one active row per revision + page (partial unique index) |
| points | two points in PDF page units (zoom-independent) |
| pixel_distance, known_distance, known_unit (mm/cm/m) | |
| metres_per_unit | known distance in metres ÷ pixel_distance |
| is_active | older calibrations stay as history |

### qto_item_factors
`item_id`, `factor_name`, `factor_value` (0 < v < 1000), `sequence`, `reason`. The ruleset decides which factors are allowed and their ranges.

### qto_calculation_runs (append-only)
- **Columns:** `item_id`, `version_id`, `rule_version_id`, `rule_code`, `engine_version`, `expression`, `inputs` jsonb (`values`, `deductions` and `factors` as entered), `gross`, `deductions`, `net`, `factor_product`, `result`, `unit`, `rounding` jsonb.
- **Checks:** `net = gross − deductions`, `result ≥ 0`. Update and delete are rejected.
- The latest run is the item's calculation.

### qto_issues
- **Columns:** `version_id`, `item_id`, `rule_code`, `severity` (BLOCKING / WARNING), `message`, `evidence`, `fingerprint`, `status` (open / acknowledged / resolved), `justification` (required to acknowledge; warnings only), resolved/acknowledged by and at.
- **No duplicates:** a partial UNIQUE (version_id, fingerprint) WHERE status ≠ resolved.

### qto_measurement_rulesets / qto_measurement_rule_versions
- **Ruleset:** `code`, `name`, `standard`, and a `tenant_id`. A null tenant is the global DCOS default, which is read-only.
- **Version:** `version_no`, `status` (draft → approved → retired), `definition` jsonb, `change_note`, and `approved_by` / `approved_at` (set by trigger).
- **Frozen once approved:** an approved version's definition never changes (trigger `qto_rule_version_guard`).
- **Seeded:** `DCOS-STD` v1 (global, approved).

Definition shape:
```json
{ "rounding": {"stage": "net|final|none", "dp": 3, "mode": "half_up|up|down"},
  "validations": {"max_variance_pct": 25},
  "factors": [{"name": "Waste", "min": 1, "max": 1.2}],
  "rules": [{"code": "VOL-LWD", "name": "…", "unit": "m3", "formula": "L * W * D",
             "inputs": [{"name": "L", "unit": "m"}], "deduction_policy": "…", "allowed_factors": ["Waste"]}] }
```

### qto_version_reviews (append-only)
`version_id`, `actor_id`, `from_status`, `to_status`, `comment`. One row per transition, including creation and publication.

### qto_publications (immutable)
- **Columns:** `version_id` (unique), `session_id`, `snapshot` jsonb, `snapshot_hash`, `item_count`, `published_by`, `published_at`.
- **Snapshot** (`dcos.qto.snapshot/1`): session, version, source, ruleset, and the items with their factors, latest calculation and BOQ links.
- **Hash:** `snapshot_hash` = sha256 of `snapshot::text`.
- Update and delete are rejected.

### qto_transfers (append-only)
- **Columns:** `publication_id`, `target` (`tender_boq`), `target_tender_id`, `idempotency_key`, `include_provisional`, `allow_overwrite`, `status` (succeeded / failed), `error`.
- **`lines` jsonb:** one entry per BOQ line, with `boq_item_id`, `action`, `previous_qty`, `new_qty` and `item_ids`.
- **Idempotency:** partial UNIQUE (idempotency_key) WHERE status = succeeded.

### CAD drawings (migration `20261028090015_qs_qto_cad`)
- **qto_drawing_revisions:** `source_format` (pdf / dxf / dwg), `cad_path` (DXF to read: the upload, or a DXF converted from a DWG), `cad_units` (chosen at upload when the DXF has none: mm / cm / m / in / ft), `cad_meta` jsonb (version, units, bounds, view, `frame {ox, oy, k}`, layer and object counts, skipped entity types), `conversion_status` (not_needed / pending / processing / done / failed), `conversion_error`. Backfilled from `file_path` / `pdf_path`.
- **Points on CAD drawings** are stored in sheet units: `sheet = ((x − ox)·k, (oy − y)·k)` with the revision's `frame` (k a power of ten), so they never move and model coordinates are recoverable.
- **qto_drawing_calibrations.method:** manual / preset / cad_units. `qto_save_cad_calibration(revision, metres_per_unit)` saves the scale from the drawing units.
- **qto_session_versions.source_format:** the file a version is measured on.
- **qto_measurements:** `source_format`, `source_entity_handles text[]`, `source_layer`, `source_block`, `source_selection jsonb` (e.g. `{"by":"hatch","pattern":"ANSI33","layer":"Cam-PT Beam","scope":"model"}`).
- **qto_require_revision(revision):** both calibration RPCs now reject a revision of another company (found by the SQL suite: before this, a user of another company could save a scale on someone else's revision).

## Triggers
| Trigger | On | Effect |
|---|---|---|
| `qto_version_edit_guard` | qto_items, qto_measurements, qto_calculations, qto_calculation_lines, qto_item_factors | rejects writes unless the version is DRAFT / IN_PROGRESS / CHANGES_REQUESTED (`QTO_LOCKED`); cascaded deletes pass |
| `qto_reject_mutation` | reviews, calculation runs, publications, transfers | append-only (`QTO_IMMUTABLE`) |
| `qto_inherit_tenant` | items, measurements, calculations, factors, revisions | child rows take the parent's tenant |
| `qto_audit_*` | every new table + measurements, calculations, lines | writes `qto_audit_log` |

Admin escape hatch for all guards: `set local dcos.qto_unlock = 'on'`. It is meant for recovery only.

## RLS
- **Tenant check `qto_tenant_ok(tenant_id)`:** the user's company, a null tenant (global/legacy) or an admin.
- **New tables:** read = tenant + `has_permission('qto','qto_sessions','view')`. Workflow tables have no write policies; writes go through the RPCs. `qto_item_factors` and rulesets have direct write policies (`qto_workspace.edit` / `qto_rules.configure`).
- **`qto_items`, `qto_measurements`, `qto_calculations`, `qto_calculation_lines`:**
  - Read: tenant + `qto_register.view`.
  - Write: tenant + `qto_workspace.edit`.
  - Hard delete of items: admin only (BR-03).
- **Drawing and document registers:** tenant only, because the project precontract screens also use them.
- **`qto_boq_links`:** the item's tenant + `qto_boq_mapping.can_create` + an editable version. Links written by a transfer cannot be deleted.
- **Storage:** bucket `qto-files` is private; files are read through signed URLs.
- **Unchanged (legacy, no tenant column):** qto_packages, qto_assumptions, qto_clarifications, qto_reviews, qto_revisions.
