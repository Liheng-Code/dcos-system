# 10 – Deployment Notes
**Module:** 04-20-01 Quantity Take-off
**Version:** 1.1 (as built, P0)

## Migrations (apply in order; all additive)
1. `20261027131621_qs_qto_sessions.sql`: new tables, columns, triggers, RPCs, RLS on new tables.
2. `20261027131622_qs_qto_sessions_backfill.sql`:
   - RBAC actions and the `DCOS-STD` v1 ruleset.
   - tenant_id on existing rows.
   - One migrated session per tender for the V1 items.
3. `20261027131623_qs_qto_rls.sql`:
   - Tenant + permission RLS on the existing qto_* tables.
   - Tenant defaults.
   - Private `qto-files` bucket.

Production goes through `/dbpush` (the user runs it). Order matters: (3) assumes (2) has filled `tenant_id`.

## Effects to know before pushing
- **Private bucket:** after (3), `qto-files` is private. Old public links to drawings stop working. The app now uses signed URLs (1 h), and the AI BOQ draft route uses the service role, so it is unaffected.
- **Company scoping:** users whose profile has no `company_id` can still read legacy rows with a null tenant, but cannot create sessions (`QTO_NO_COMPANY`). Set their company first.
- **V1 item page:** the item-level screen is gone. `/dashboard/qto/<itemId>` redirects into the item's session.

## Release
- QTO pages are `development` status. Release them in `apps/web/lib/modules/release.ts` (core file) or switch them on in Module Settings.
- Locally: `NEXT_PUBLIC_DCOS_SHOW_DEV_FEATURES=true`.

## Configuration
| Setting | Where | Default |
|---|---|---|
| Measurement rules, factors and rounding | Quantity Take-off › Measurement Rules (`qto_measurement_rule_versions.definition`) | DCOS-STD v1: final-stage rounding, 3 dp, half up |
| Variance warning threshold | ruleset `validations.max_variance_pct` | 25 % |
| Auto-save | item panel | 30 s after the last edit; Ctrl+S saves now |
| Max drawing size | storage bucket `qto-files` | 50 MB (20260805000004) |

## Rollback
- **Data:** every guard has an admin escape hatch (`set local dcos.qto_unlock = 'on'`) for recovery scripts.
- **Schema:** migrations are additive. To roll back the app only, redeploy the previous build; the new tables are ignored.
- **RLS:** to undo the tightened RLS, restore the `using (true)` policies from `20260805000001`.
- **Bucket:** `update storage.buckets set public = true where id = 'qto-files'`.
