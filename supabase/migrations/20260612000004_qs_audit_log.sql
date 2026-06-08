-- QS Financial Audit Log — captures INSERT/UPDATE/DELETE on key QS tables

CREATE TABLE IF NOT EXISTS public.qs_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  TEXT NOT NULL,
  record_id   UUID NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data    JSONB,
  new_data    JSONB,
  changed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qs_audit_table  ON public.qs_audit_log(table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_qs_audit_record ON public.qs_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_qs_audit_user   ON public.qs_audit_log(changed_by);

ALTER TABLE public.qs_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qs_audit_select" ON public.qs_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "qs_audit_insert" ON public.qs_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- Trigger function
CREATE OR REPLACE FUNCTION public.qs_audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.qs_audit_log(table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.qs_audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.qs_audit_log(table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', NULL, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach triggers to key QS financial tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'qs_variation_orders',
    'qs_progress_claims',
    'qs_retention_ledger',
    'qs_contingency_drawdowns',
    'qs_budget_revisions'
  ] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS qs_audit_%1$s ON public.%1$s;
      CREATE TRIGGER qs_audit_%1$s
        AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
        FOR EACH ROW EXECUTE FUNCTION public.qs_audit_trigger_fn();
    ', t);
  END LOOP;
END;
$$;
