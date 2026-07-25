-- Migration: 20260722000006_qs_audit_tender_boq_items.sql
-- Purpose: Attach the existing generic QS audit trail (qs_audit_trigger_fn() /
--          qs_audit_log, 20260612000004_qs_audit_log.sql, fixed in
--          20260711000001_fix_qs_audit_trigger_column_count.sql) to
--          public.tender_boq_items, per QS-SOP-003 Phase 9 step 4 §7.4
--          (docs/03-Business-Modules/12-Quantity-Surveying/08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md).
--          The parallel "Refresh from Library" write path being built for this
--          table is the first write path here that specifically needs an
--          audit trail, matching how qs_variation_orders / qs_progress_claims /
--          qs_retention_ledger / etc. are already audited.
-- Depends on: tender_boq_items (created in 20260531000055_tender_cost_estimation.sql;
--             columns later added by 20260711000006, 20260718000005,
--             20260720000016, 20260721000001, 20260722000004, 20260722000005 —
--             none of them added tenant_id, created_by, updated_by, or
--             updated_at; see verification note below),
--             public.qs_audit_trigger_fn() (20260612000004_qs_audit_log.sql,
--             fixed by 20260711000001_fix_qs_audit_trigger_column_count.sql)
--
-- Verification performed before writing this migration:
--   qs_audit_trigger_fn() only reads TG_TABLE_NAME (built-in), NEW.id / OLD.id,
--   to_jsonb(OLD) / to_jsonb(NEW), and auth.uid() — it does NOT assume a
--   tenant_id, created_by, updated_by, or updated_at column exists on the
--   audited table. tender_boq_items has `id uuid primary key` (confirmed in
--   both the migration source and the live remote schema via
--   information_schema.columns) and nothing else the function needs.
--   tender_boq_items has no tenant_id column at all (pre-existing gap,
--   flagged as OQ-2 in the SOP doc — not addressed here), but that is not a
--   blocker: qs_variation_orders — one of the tables this same trigger is
--   already attached to — also has no tenant_id column (it scopes by
--   project_id instead), confirming tenant_id was never a requirement of
--   this trigger/table pattern.
--
--   Also confirmed live (pg_trigger / pg_proc): this trigger is already
--   attached to 13 tables today — qs_boq, qs_boq_items, qs_boq_sections,
--   qs_budget_revisions, qs_claim_items, qs_contingency_drawdowns,
--   qs_cost_baseline, qs_cost_transactions, qs_progress_claims,
--   qs_retention_ledger, qs_variation_orders, qs_vo_items,
--   wbs_node_quantities — not 5 as SOP §7.4 states. The doc's "5" reflects
--   only the original 20260612000004 batch; two later migrations
--   (20260615000001_qs_data_integrity.sql,
--   20260718000002_create_wbs_node_quantities.sql) added the other 8 using
--   the same scoped do-block pattern reused below. Not a blocker for this
--   migration, just a note for whoever next updates the SOP doc.
--
-- Idempotent: guarded with DROP TRIGGER IF EXISTS inside the do-block,
-- matching the established pattern (see
-- 20260718000002_create_wbs_node_quantities.sql) — safe to re-run.
-- Scoped to just this one new table so all previously-applied migrations
-- that attach this trigger elsewhere are left untouched.

do $$
declare
  t text;
begin
  foreach t in array array[
    'tender_boq_items'
  ] loop
    execute format('
      drop trigger if exists qs_audit_%1$s on public.%1$s;
      create trigger qs_audit_%1$s
        after insert or update or delete on public.%1$s
        for each row execute function public.qs_audit_trigger_fn();
    ', t);
  end loop;
end;
$$;
