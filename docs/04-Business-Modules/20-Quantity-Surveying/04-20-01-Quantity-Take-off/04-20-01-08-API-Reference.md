# 08 – API Reference
**Module:** 04-20-01 Quantity Take-off
**Version:** 1.1 (as built, P0)

DCOS modules do not use a REST layer for this kind of work. The browser calls Supabase directly under RLS. Every rule-bearing write is a `SECURITY DEFINER` RPC that checks permissions and business rules in the database. The TypeScript wrapper is `apps/web/lib/qs/qto/session-service.ts`. The `/api/v1/qs/takeoff/*` paths in version 1.0 of this document are replaced by the table below.

## RPCs
Errors are raised as `QTO_<CODE>: message`. `toQtoError()` splits them into `code` and a readable message.

| RPC | Permission (module `qto`) | What it does | Main errors |
|---|---|---|---|
| `qto_create_session(p_tender_id, p_name, p_drawing_revision_id, p_ruleset_version_id, p_trade, p_building, p_description, p_scope, p_responsible_qs, p_purpose)` → session id | `qto_sessions.can_create` | Creates the session and v1 (DRAFT). The revision must belong to the tender and the ruleset version must be approved | `QTO_SOURCE_REQUIRED`, `QTO_SOURCE_INVALID`, `QTO_RULESET_INVALID`, `QTO_NO_COMPANY` |
| `qto_create_version(p_session_id, p_reason, p_drawing_revision_id, p_ruleset_version_id, p_carry_item_ids[], p_baseline_version_id)` → version id | `qto_sessions.can_create` | Adds version n+1 under a session row lock. Copies the chosen items (factors, calculations, lines, measurements, BOQ links) with `carry_status = UNVERIFIED`. The baseline defaults to the latest publication | `QTO_VERSION_OPEN`, `QTO_VALIDATION` |
| `qto_version_transition(p_version_id, p_to_status, p_comment)` | see doc 07 | Enforces the transition table. On submit: re-runs the blocking checks (`qto_version_blocking_problems`) and records the submitter. On approve or request changes: rejects self-approval; a request for changes needs a comment. On cancel: needs a reason. Every transition appends `qto_version_reviews` | `QTO_INVALID_TRANSITION`, `QTO_BLOCKING_ISSUES`, `QTO_SELF_APPROVAL`, `QTO_FORBIDDEN` |
| `qto_publish_version(p_version_id)` → publication id | `qto_publish.approve` | APPROVED → PUBLISHED. Builds the snapshot (`qto_build_snapshot`) and hashes it (`qto_snapshot_hash`) | `QTO_INVALID_TRANSITION` |
| `qto_transfer_to_tender_boq(p_publication_id, p_tender_id, p_idempotency_key, p_include_provisional, p_allow_overwrite)` → transfer row + `replayed` | `qto_transfer.submit` | See "Transfer contract" | stored as `status = failed` with `error` |
| `qto_save_calibration(p_drawing_revision_id, p_page_no, p_points, p_pixel_distance, p_known_distance, p_known_unit)` | `qto_workspace.edit` | Deactivates the previous calibration for that revision and page, then stores the new one | `QTO_VALIDATION` |
| `qto_record_calculation(p_item_id, p_run)` → run id | `qto_workspace.edit` | Appends a calculation run and sets the item's gross / deduction / factor / quantity in one transaction. A carried item becomes REMEASURED | `QTO_UNIT_MISMATCH`, `QTO_LOCKED`, check violation when net ≠ gross − deductions |
| `qto_sync_issues(p_version_id, p_issues)` → `{open, resolved}` | `qto_workspace.edit` | Upserts the client validation result by fingerprint and resolves issues that are no longer detected | `QTO_LOCKED` once submitted |
| `qto_acknowledge_issue(p_issue_id, p_justification)` | `qto_sessions.edit` | Warnings only, and a justification is required | `QTO_BLOCKING` |

### Transfer contract
1. **Replay.** If a succeeded transfer with the same `idempotency_key` exists, it is returned (`replayed: true`) and nothing is written. The UI keeps one key per attempt, so a lost response cannot apply a transfer twice.
2. **Target.** The target must be the session's own tender (P0).
3. **Eligible items.** FIRM items are taken from the immutable snapshot, plus PROVISIONAL ones when `p_include_provisional`. EXCLUDED and PENDING_CLARIFICATION items are never transferred.
4. **Target line.** Each item goes to the BOQ line it was mapped to before publication (`qto_boq_links`), else the line an earlier transfer created for it. Otherwise items are grouped by section, code, description and unit into new lines.
5. **Overwrite protection.** A line whose quantity changed since the last QTO transfer, or which holds a non-zero quantity from another source, fails the transfer (`QTO_TRANSFER_CONFLICT`) unless `p_allow_overwrite` is set.
6. **Writing.** It writes `tender_boq_items.quantity`, so the tender price lock (`tender_lock_guard`) applies. It records the links with `transfer_id` and stores a `succeeded` row with per-line actions.
7. **Failure.** Any error rolls back the BOQ changes and is stored as a `failed` row with the message, so it is visible and retryable.

## Table access (RLS)
| Table | Read | Write from the client |
|---|---|---|
| `qto_sessions`, `qto_session_versions`, `qto_version_reviews`, `qto_publications`, `qto_transfers`, `qto_issues`, `qto_calculation_runs`, `qto_drawing_calibrations` | same company + `qto_sessions.view` | none (RPCs only) |
| `qto_items`, `qto_measurements`, `qto_calculations`, `qto_calculation_lines` | same company + `qto_register.view` | `qto_workspace.edit`, only while the version is editable |
| `qto_item_factors` | same company + `qto_sessions.view` | `qto_workspace.edit` |
| `qto_boq_links` | same company | `qto_boq_mapping.can_create`, editable version; transfer links cannot be deleted |
| `qto_measurement_rulesets` / `_rule_versions` | same company or global | `qto_rules.configure`; approved versions are frozen |

## Pure library (`apps/web/lib/qs/qto/`)
| File | Exports |
|---|---|
| `decimal.ts` | `dec`, `add`, `sub`, `mul`, `div`, `round(…, dp, mode)`, `toFixedString`: BigInt fixed point, 12 dp |
| `units.ts` | `ITEM_UNITS`, `convert`, `dimensionOf`, `toBase`, `fromBase`: dimensions L, M, N |
| `expression.ts` | `evaluate(formula, variables, definitions)`: allowlisted parser (numbers, names, + − × ÷, parentheses, min, max, abs, round); checks units; rejects division by zero, missing inputs and cycles |
| `calc-engine.ts` | `calculate(request)` → `CalculationRun`, `ENGINE_VERSION`, `toRunPayload` |
| `geometry.ts` | `calibrate`, `polylineLength`, `perimeter`, `polygonArea`, `lengthInMetres`, `areaInSquareMetres` |
| `validation.ts` | `validateVersion(input)` → issues with fingerprints |
| `compare.ts` | `compareItems(previous, current)` → change rows (`variancePct` is null when the previous quantity is 0) |
| `workflow.ts` | status lists, transition table mirror, `TRANSITION_NEEDS` |
| `export.ts` | `EXPORT_COLUMNS`, `buildExportRows`, `toCsv`, `toSheetRows` |

## Export column mapping
The export is made from a **publication snapshot** only, never from live rows. Excel has a sheet "Quantities" with these columns and a sheet "Baseline" (session, version, source, ruleset, published date, hash). CSV is UTF-8 with a BOM and RFC 4180 quoting; text starting with `= + - @` is prefixed with `'`.

| Column | Source |
|---|---|
| Session, Version | `snapshot.session.code`, `snapshot.version.no` |
| QTO No., Item code, Description | `items[].qto_no`, `item_code`, `description` |
| Work section, Element, Building, Level, Zone, Discipline | item classification |
| WBS, Budget code | `wbs_nodes.wbs_code`, `budget_codes.code` (looked up from the ids) |
| Unit, Gross, Deductions, Factor, Quantity | `unit`, `gross_qty`, `deduction_qty`, `factor_product`, `quantity` |
| Status, Assumption / exclusion reason | `quantity_status`, `provisional_assumption` or `exclusion_reason` |
| Factors applied, Formula, Engine, Rule | `factors[]`, `calculation.expression`, `calculation.engine_version`, `rule_code` |
| Drawing / revision, Page, Grid | `snapshot.source` (or the item's own revision id), `page_no`, `grid_location` |
| Carry-forward | `carry_status` |
| Ruleset, Snapshot hash | `snapshot.ruleset`, `qto_publications.snapshot_hash` |

Each export writes an `EXPORT` row to `qto_audit_log`.
