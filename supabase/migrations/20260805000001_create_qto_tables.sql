-- Migration: 20260805000001_create_qto_tables.sql
-- Purpose: Quantity Takeoff (QTO) module for the tender stage — schema for
--          document register, drawing register + revision control, QTO items,
--          calculations, measurements, assumptions, clarifications, reviews,
--          revisions, BOQ links and audit log.
-- Depends on: tender_register (20260531000054), tender_boq_items
--             (20260531000055), design_rfi (20260531000040), profiles.

-- ──────────────────────────────────────────────────────────────────────────
-- Helper: touch updated_at
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.qto_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. QTO DOCUMENT REGISTER
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_document_register (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id      uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  document_no    text NOT NULL,
  title          text NOT NULL,
  document_type  text NOT NULL DEFAULT 'other'
    CHECK (document_type IN ('dwg','pdf','xlsx','docx','specification','boq',
                             'tender_instruction','addendum','clarification','other')),
  discipline     text,
  building       text,
  revision       text,
  issue_date     date,
  received_date  date,
  source         text,
  file_path      text,
  file_type      text,
  file_version   text,
  status         text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','registered','superseded','archived')),
  remarks        text,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_doc_tender    ON public.qto_document_register(tender_id);
CREATE INDEX IF NOT EXISTS idx_qto_doc_type      ON public.qto_document_register(document_type);
CREATE INDEX IF NOT EXISTS idx_qto_doc_discipline ON public.qto_document_register(discipline);
CREATE INDEX IF NOT EXISTS idx_qto_doc_building  ON public.qto_document_register(building);
CREATE INDEX IF NOT EXISTS idx_qto_doc_number    ON public.qto_document_register(document_no);

ALTER TABLE public.qto_document_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_doc_select" ON public.qto_document_register FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_doc_insert" ON public.qto_document_register FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_doc_update" ON public.qto_document_register FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_doc_delete" ON public.qto_document_register FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_doc_updated_at ON public.qto_document_register;
CREATE TRIGGER qto_doc_updated_at
  BEFORE UPDATE ON public.qto_document_register
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. QTO DRAWING REGISTER
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_drawing_register (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id            uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  drawing_no           text NOT NULL,
  title                text NOT NULL,
  discipline           text,
  building             text,
  drawing_type         text,
  status               text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered','current','superseded','archived')),
  related_document_id  uuid REFERENCES public.qto_document_register(id) ON DELETE SET NULL,
  current_revision_id  uuid, -- FK added after qto_drawing_revisions is created
  uploaded_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  remarks              text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tender_id, drawing_no)
);

CREATE INDEX IF NOT EXISTS idx_qto_draw_tender    ON public.qto_drawing_register(tender_id);
CREATE INDEX IF NOT EXISTS idx_qto_draw_discipline ON public.qto_drawing_register(discipline);
CREATE INDEX IF NOT EXISTS idx_qto_draw_building  ON public.qto_drawing_register(building);

ALTER TABLE public.qto_drawing_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_draw_select" ON public.qto_drawing_register FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_draw_insert" ON public.qto_drawing_register FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_draw_update" ON public.qto_drawing_register FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_draw_delete" ON public.qto_drawing_register FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_draw_updated_at ON public.qto_drawing_register;
CREATE TRIGGER qto_draw_updated_at
  BEFORE UPDATE ON public.qto_drawing_register
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 3. QTO DRAWING REVISIONS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_drawing_revisions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id              uuid NOT NULL REFERENCES public.qto_drawing_register(id) ON DELETE CASCADE,
  revision                text NOT NULL,
  revision_date           date,
  status                  text NOT NULL DEFAULT 'current'
    CHECK (status IN ('current','superseded','obsolete')),
  file_path               text,
  file_type               text CHECK (file_type IN ('dwg','pdf')),
  pdf_path                text,
  scale                   text,
  units                   text DEFAULT 'mm',
  supersedes_revision_id  uuid REFERENCES public.qto_drawing_revisions(id) ON DELETE SET NULL,
  uploaded_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  remarks                 text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (drawing_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_qto_rev_drawing ON public.qto_drawing_revisions(drawing_id);
CREATE INDEX IF NOT EXISTS idx_qto_rev_status  ON public.qto_drawing_revisions(status);

ALTER TABLE public.qto_drawing_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_rev_select" ON public.qto_drawing_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_rev_insert" ON public.qto_drawing_revisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_rev_update" ON public.qto_drawing_revisions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_rev_delete" ON public.qto_drawing_revisions FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_rev_updated_at ON public.qto_drawing_revisions;
CREATE TRIGGER qto_rev_updated_at
  BEFORE UPDATE ON public.qto_drawing_revisions
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- Drawing -> current revision FK (created after revisions table)
ALTER TABLE public.qto_drawing_register
  ADD CONSTRAINT qto_draw_current_rev_fk
  FOREIGN KEY (current_revision_id) REFERENCES public.qto_drawing_revisions(id) ON DELETE SET NULL;

-- Maintain current_revision_id and supersede older revisions
CREATE OR REPLACE FUNCTION public.qto_keep_current_revision_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.status = 'current') THEN
    UPDATE public.qto_drawing_register
       SET current_revision_id = NEW.id,
           status = 'current'
     WHERE id = NEW.drawing_id;
    UPDATE public.qto_drawing_revisions
       SET status = 'superseded'
     WHERE drawing_id = NEW.drawing_id
       AND id <> NEW.id
       AND status = 'current';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qto_keep_current_revision ON public.qto_drawing_revisions;
CREATE TRIGGER qto_keep_current_revision
  AFTER INSERT OR UPDATE OF status ON public.qto_drawing_revisions
  FOR EACH ROW EXECUTE FUNCTION public.qto_keep_current_revision_fn();

-- ──────────────────────────────────────────────────────────────────────────
-- 4. QTO PACKAGES
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id     uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  building      text NOT NULL,
  discipline    text NOT NULL,
  work_section  text,
  package_code  text,
  assigned_to   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','self_checked','submitted','approved')),
  progress_pct  numeric(5,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_pkg_tender ON public.qto_packages(tender_id);
CREATE INDEX IF NOT EXISTS idx_qto_pkg_assign ON public.qto_packages(assigned_to);

ALTER TABLE public.qto_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_pkg_select" ON public.qto_packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_pkg_insert" ON public.qto_packages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_pkg_update" ON public.qto_packages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_pkg_delete" ON public.qto_packages FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_pkg_updated_at ON public.qto_packages;
CREATE TRIGGER qto_pkg_updated_at
  BEFORE UPDATE ON public.qto_packages
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 5. QTO ITEMS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id             uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  qto_no                text NOT NULL,
  building              text,
  discipline            text,
  work_section          text,
  element               text,
  item_code             text,
  description           text NOT NULL,
  unit                  text NOT NULL DEFAULT 'm'
    CHECK (unit IN ('m','m2','m3','No.','kg','tonne')),
  quantity              numeric(15,3) NOT NULL DEFAULT 0,
  measurement_method    text DEFAULT 'formula'
    CHECK (measurement_method IN ('formula','area','schedule','estimate','count','measure')),
  source_type           text NOT NULL DEFAULT 'D1'
    CHECK (source_type IN ('D1','S1','F1','A1','B1','H1','P1','E1')),
  confidence            text NOT NULL DEFAULT 'MEDIUM'
    CHECK (confidence IN ('HIGH','MEDIUM','LOW','PROVISIONAL')),
  drawing_id            uuid REFERENCES public.qto_drawing_register(id) ON DELETE SET NULL,
  drawing_revision_id   uuid REFERENCES public.qto_drawing_revisions(id) ON DELETE SET NULL,
  page_no               int,
  grid_location         text,
  detail_ref            text,
  specification_ref     text,
  status                text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','MEASURED','SELF CHECKED','SUBMITTED FOR CHECK',
                      'QS CHECKED','APPROVED','REJECTED','REVISION REQUIRED',
                      'POSTED TO BOQ')),
  revision_no           int NOT NULL DEFAULT 1,
  is_locked             boolean NOT NULL DEFAULT false,
  assumption            text,
  prepared_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  prepared_date         timestamptz,
  checked_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  checked_date          timestamptz,
  approved_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_date         timestamptz,
  remarks               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_item_tender    ON public.qto_items(tender_id);
CREATE INDEX IF NOT EXISTS idx_qto_item_no        ON public.qto_items(qto_no);
CREATE INDEX IF NOT EXISTS idx_qto_item_status    ON public.qto_items(status);
CREATE INDEX IF NOT EXISTS idx_qto_item_draw      ON public.qto_items(drawing_id);
CREATE INDEX IF NOT EXISTS idx_qto_item_rev       ON public.qto_items(drawing_revision_id);
CREATE INDEX IF NOT EXISTS idx_qto_item_bld_disc  ON public.qto_items(building, discipline);

ALTER TABLE public.qto_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_item_select" ON public.qto_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_item_insert" ON public.qto_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_item_update" ON public.qto_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_item_delete" ON public.qto_items FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_item_updated_at ON public.qto_items;
CREATE TRIGGER qto_item_updated_at
  BEFORE UPDATE ON public.qto_items
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- Next running QTO number for a tender, e.g. QTO-000001
CREATE OR REPLACE FUNCTION public.qto_next_no(p_tender_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_next int;
BEGIN
  SELECT COALESCE(MAX((substr(qto_no, 5))::int), 0) + 1
    INTO v_next
    FROM public.qto_items
   WHERE tender_id = p_tender_id;
  RETURN 'QTO-' || lpad(v_next::text, 6, '0');
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 6. QTO CALCULATIONS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_calculations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qto_item_id  uuid NOT NULL REFERENCES public.qto_items(id) ON DELETE CASCADE,
  formula      text NOT NULL,
  display_text text,
  result       numeric(15,3),
  method       text NOT NULL DEFAULT 'formula'
    CHECK (method IN ('formula','area','schedule','estimate')),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_calc_item ON public.qto_calculations(qto_item_id);

ALTER TABLE public.qto_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_calc_select" ON public.qto_calculations FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_calc_insert" ON public.qto_calculations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_calc_update" ON public.qto_calculations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_calc_delete" ON public.qto_calculations FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_calc_updated_at ON public.qto_calculations;
CREATE TRIGGER qto_calc_updated_at
  BEFORE UPDATE ON public.qto_calculations
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 7. QTO MEASUREMENTS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_measurements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qto_item_id          uuid NOT NULL REFERENCES public.qto_items(id) ON DELETE CASCADE,
  drawing_revision_id  uuid REFERENCES public.qto_drawing_revisions(id) ON DELETE SET NULL,
  drawing_id           uuid REFERENCES public.qto_drawing_register(id) ON DELETE SET NULL,
  page_no              int,
  measure_type         text NOT NULL
    CHECK (measure_type IN ('point','length','polyline','area','perimeter','count')),
  points               jsonb,
  length               numeric(15,3),
  area                 numeric(15,3),
  count                int,
  unit                 text,
  scale_calibration    jsonb,
  label                text,
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_meas_item ON public.qto_measurements(qto_item_id);
CREATE INDEX IF NOT EXISTS idx_qto_meas_rev  ON public.qto_measurements(drawing_revision_id);

ALTER TABLE public.qto_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_meas_select" ON public.qto_measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_meas_insert" ON public.qto_measurements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_meas_update" ON public.qto_measurements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_meas_delete" ON public.qto_measurements FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_meas_updated_at ON public.qto_measurements;
CREATE TRIGGER qto_meas_updated_at
  BEFORE UPDATE ON public.qto_measurements
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 8. QTO CALCULATION LINES (add / deduct / dimension lines)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_calculation_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id  uuid NOT NULL REFERENCES public.qto_calculations(id) ON DELETE CASCADE,
  seq             int NOT NULL,
  sign            text NOT NULL DEFAULT '+',
  description     text,
  amount          numeric(15,3) NOT NULL DEFAULT 0,
  unit            text,
  measurement_id  uuid REFERENCES public.qto_measurements(id) ON DELETE SET NULL,
  source          text
);

CREATE INDEX IF NOT EXISTS idx_qto_line_calc ON public.qto_calculation_lines(calculation_id);

ALTER TABLE public.qto_calculation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_line_select" ON public.qto_calculation_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_line_insert" ON public.qto_calculation_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_line_update" ON public.qto_calculation_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_line_delete" ON public.qto_calculation_lines FOR DELETE TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 9. QTO ASSUMPTIONS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_assumptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id     uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  qto_item_id   uuid REFERENCES public.qto_items(id) ON DELETE SET NULL,
  drawing_id    uuid REFERENCES public.qto_drawing_register(id) ON DELETE SET NULL,
  assumption_no text,
  description   text NOT NULL,
  reason        text,
  risk_level    text NOT NULL DEFAULT 'MEDIUM'
    CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  status        text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','RESOLVED','PENDING_RFI')),
  rfi_id        uuid REFERENCES public.design_rfi(id) ON DELETE SET NULL,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_assume_tender ON public.qto_assumptions(tender_id);
CREATE INDEX IF NOT EXISTS idx_qto_assume_item   ON public.qto_assumptions(qto_item_id);

ALTER TABLE public.qto_assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_assume_select" ON public.qto_assumptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_assume_insert" ON public.qto_assumptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_assume_update" ON public.qto_assumptions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_assume_delete" ON public.qto_assumptions FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_assume_updated_at ON public.qto_assumptions;
CREATE TRIGGER qto_assume_updated_at
  BEFORE UPDATE ON public.qto_assumptions
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 10. QTO CLARIFICATIONS (RFI link)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_clarifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  qto_item_id     uuid REFERENCES public.qto_items(id) ON DELETE SET NULL,
  drawing_id      uuid REFERENCES public.qto_drawing_register(id) ON DELETE SET NULL,
  clarification_no text,
  description     text NOT NULL,
  reason          text,
  status          text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','RESPONDED','CLOSED')),
  response        text,
  risk_level      text NOT NULL DEFAULT 'MEDIUM'
    CHECK (risk_level IN ('LOW','MEDIUM','HIGH')),
  rfi_id          uuid REFERENCES public.design_rfi(id) ON DELETE SET NULL,
  rfi_no          text,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_clar_tender ON public.qto_clarifications(tender_id);
CREATE INDEX IF NOT EXISTS idx_qto_clar_item   ON public.qto_clarifications(qto_item_id);
CREATE INDEX IF NOT EXISTS idx_qto_clar_rfi    ON public.qto_clarifications(rfi_id);

ALTER TABLE public.qto_clarifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_clar_select" ON public.qto_clarifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_clar_insert" ON public.qto_clarifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_clar_update" ON public.qto_clarifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "qto_clar_delete" ON public.qto_clarifications FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS qto_clar_updated_at ON public.qto_clarifications;
CREATE TRIGGER qto_clar_updated_at
  BEFORE UPDATE ON public.qto_clarifications
  FOR EACH ROW EXECUTE FUNCTION public.qto_set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- 11. QTO REVIEWS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qto_item_id   uuid NOT NULL REFERENCES public.qto_items(id) ON DELETE CASCADE,
  reviewer_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision      text NOT NULL
    CHECK (decision IN ('approve','reject','return','comment')),
  comment       text,
  from_status   text,
  to_status     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_review_item ON public.qto_reviews(qto_item_id);

ALTER TABLE public.qto_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_review_select" ON public.qto_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_review_insert" ON public.qto_reviews FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_review_update" ON public.qto_reviews FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 12. QTO REVISIONS (QTO item history)
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_revisions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qto_item_id          uuid NOT NULL REFERENCES public.qto_items(id) ON DELETE CASCADE,
  revision_no          int NOT NULL,
  quantity             numeric(15,3),
  unit                 text,
  drawing_revision_id  uuid REFERENCES public.qto_drawing_revisions(id) ON DELETE SET NULL,
  status               text,
  change_reason        text,
  snapshot             jsonb,
  created_by           uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qto_item_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_qto_revhist_item ON public.qto_revisions(qto_item_id);

ALTER TABLE public.qto_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_revhist_select" ON public.qto_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_revhist_insert" ON public.qto_revisions FOR INSERT TO authenticated WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 13. QTO -> BOQ LINKS
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_boq_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qto_item_id  uuid NOT NULL REFERENCES public.qto_items(id) ON DELETE CASCADE,
  boq_item_id  uuid NOT NULL REFERENCES public.tender_boq_items(id) ON DELETE CASCADE,
  quantity     numeric(15,3) NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (qto_item_id, boq_item_id)
);

CREATE INDEX IF NOT EXISTS idx_qto_boqlink_item ON public.qto_boq_links(qto_item_id);
CREATE INDEX IF NOT EXISTS idx_qto_boqlink_boq  ON public.qto_boq_links(boq_item_id);

ALTER TABLE public.qto_boq_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_boqlink_select" ON public.qto_boq_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_boqlink_insert" ON public.qto_boq_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "qto_boqlink_delete" ON public.qto_boq_links FOR DELETE TO authenticated USING (true);

-- ──────────────────────────────────────────────────────────────────────────
-- 14. QTO AUDIT LOG
-- ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.qto_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text NOT NULL,
  record_id   uuid NOT NULL,
  action      text NOT NULL,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qto_audit_table  ON public.qto_audit_log(table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_qto_audit_record ON public.qto_audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_qto_audit_user   ON public.qto_audit_log(changed_by);

ALTER TABLE public.qto_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qto_audit_select" ON public.qto_audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "qto_audit_insert" ON public.qto_audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.qto_audit_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.qto_audit_log(table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.qto_audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.qto_audit_log(table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', NULL, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Attach audit to QTO item + drawing revision history
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['qto_items', 'qto_drawing_revisions'] LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS qto_audit_%1$s ON public.%1$s;
      CREATE TRIGGER qto_audit_%1$s
        AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
        FOR EACH ROW EXECUTE FUNCTION public.qto_audit_trigger_fn();
    ', t);
  END LOOP;
END;
$$;
