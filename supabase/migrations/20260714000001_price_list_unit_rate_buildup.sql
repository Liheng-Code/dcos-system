-- Price List, Unit Rate Build-Up & Tender BOQ Linking
-- Migration: Replace old tender_price_list (labor/material split) with new resource-based schema
-- Adds: tender_price_list_items, tender_unit_rates, tender_unit_rate_lines
-- Modifies: tender_boq_items (add unit_rate_id, is_manual_rate, sourcing)
-- Adds: 4 snapshot tables, recalc_from_price_item() function, RLS policies

-- ══════════════════════════════════════════════════════════════════════════════
-- A. DROP OLD tender_price_list (replaced by tender_price_list_items)
-- ══════════════════════════════════════════════════════════════════════════════
-- First remove FK references from tender_boq_items that point to old table
ALTER TABLE IF EXISTS public.tender_boq_items
  DROP CONSTRAINT IF EXISTS tender_boq_items_price_list_item_id_fkey;

ALTER TABLE IF EXISTS public.tender_boq_items
  DROP COLUMN IF EXISTS price_list_item_id,
  DROP COLUMN IF EXISTS rate_source;

DROP TABLE IF EXISTS public.tender_price_list CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- B. NEW: tender_price_list_items — per-tender resource database
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tender_price_list_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  tender_id     uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  code          text NOT NULL,
  description   text NOT NULL,
  category      text NOT NULL CHECK (category IN ('material','labor','plant','subcon')),
  unit          text NOT NULL,
  unit_price    numeric(14,4) NOT NULL CHECK (unit_price > 0),
  currency      text NOT NULL DEFAULT 'USD',
  supplier_name text,
  quote_ref     text,
  quote_date    date,
  valid_until   date,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tender_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tpi_tender ON public.tender_price_list_items(tender_id);
CREATE INDEX IF NOT EXISTS idx_tpi_category ON public.tender_price_list_items(tender_id, category);
ALTER TABLE public.tender_price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view tender price list items"
  ON public.tender_price_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert tender price list items"
  ON public.tender_price_list_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update tender price list items"
  ON public.tender_price_list_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can delete tender price list items"
  ON public.tender_price_list_items FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- C. NEW: tender_unit_rates — per-tender rate definitions (flat or build-up)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tender_unit_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  tender_id     uuid NOT NULL REFERENCES public.tender_register(id) ON DELETE CASCADE,
  code          text NOT NULL,
  description   text NOT NULL,
  trade         text,
  unit          text NOT NULL,
  mode          text NOT NULL DEFAULT 'flat' CHECK (mode IN ('flat','buildup')),
  base_rate     numeric(14,4),
  wastage_pct   numeric(6,3) DEFAULT 0,
  productivity_factor numeric(6,3) DEFAULT 1 CHECK (productivity_factor > 0),
  net_rate      numeric(14,4) NOT NULL DEFAULT 0,
  library_rate_id uuid,
  is_active     boolean NOT NULL DEFAULT true,
  notes         text,
  created_by    uuid REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tender_id, code)
);

CREATE INDEX IF NOT EXISTS idx_tur_tender ON public.tender_unit_rates(tender_id);
CREATE INDEX IF NOT EXISTS idx_tur_trade ON public.tender_unit_rates(tender_id, trade);
ALTER TABLE public.tender_unit_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view tender unit rates"
  ON public.tender_unit_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert tender unit rates"
  ON public.tender_unit_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update tender unit rates"
  ON public.tender_unit_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can delete tender unit rates"
  ON public.tender_unit_rates FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- D. NEW: tender_unit_rate_lines — build-up composition lines
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tender_unit_rate_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  unit_rate_id      uuid NOT NULL REFERENCES public.tender_unit_rates(id) ON DELETE CASCADE,
  category          text NOT NULL CHECK (category IN ('material','labor','plant','subcon')),
  price_list_item_id uuid NOT NULL REFERENCES public.tender_price_list_items(id) ON DELETE RESTRICT,
  qty_per_unit      numeric(14,6) NOT NULL CHECK (qty_per_unit > 0),
  wastage_pct       numeric(6,3) DEFAULT 0,
  line_total        numeric(14,4) NOT NULL DEFAULT 0,
  sort_order        int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_turl_rate ON public.tender_unit_rate_lines(unit_rate_id);
CREATE INDEX IF NOT EXISTS idx_turl_price_item ON public.tender_unit_rate_lines(price_list_item_id);
ALTER TABLE public.tender_unit_rate_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view tender unit rate lines"
  ON public.tender_unit_rate_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert tender unit rate lines"
  ON public.tender_unit_rate_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update tender unit rate lines"
  ON public.tender_unit_rate_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can delete tender unit rate lines"
  ON public.tender_unit_rate_lines FOR DELETE TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- E. ALTER tender_boq_items — add unit_rate_id, is_manual_rate, sourcing
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.tender_boq_items
  ADD COLUMN IF NOT EXISTS unit_rate_id uuid REFERENCES public.tender_unit_rates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_manual_rate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sourcing text NOT NULL DEFAULT 'self' CHECK (sourcing IN ('self','subcon'));

-- ══════════════════════════════════════════════════════════════════════════════
-- F. SNAPSHOT TABLES (bid revision freeze — insert-only)
-- ══════════════════════════════════════════════════════════════════════════════

-- F1. snap_price_list_items
CREATE TABLE IF NOT EXISTS public.snap_price_list_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_revision_id uuid NOT NULL REFERENCES public.tender_bid_summaries(id) ON DELETE CASCADE,
  source_id     uuid NOT NULL,
  tender_id     uuid NOT NULL,
  code          text NOT NULL,
  description   text NOT NULL,
  category      text NOT NULL,
  unit          text NOT NULL,
  unit_price    numeric(14,4) NOT NULL,
  currency      text NOT NULL,
  supplier_name text,
  quote_ref     text,
  quote_date    date,
  valid_until   date,
  is_active     boolean NOT NULL,
  notes         text,
  snapped_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snap_pli_revision ON public.snap_price_list_items(bid_revision_id);
ALTER TABLE public.snap_price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view snap price list"
  ON public.snap_price_list_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert snap price list"
  ON public.snap_price_list_items FOR INSERT TO authenticated WITH CHECK (true);

-- F2. snap_unit_rates
CREATE TABLE IF NOT EXISTS public.snap_unit_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_revision_id uuid NOT NULL REFERENCES public.tender_bid_summaries(id) ON DELETE CASCADE,
  source_id     uuid NOT NULL,
  tender_id     uuid NOT NULL,
  code          text NOT NULL,
  description   text NOT NULL,
  trade         text,
  unit          text NOT NULL,
  mode          text NOT NULL,
  base_rate     numeric(14,4),
  wastage_pct   numeric(6,3) DEFAULT 0,
  productivity_factor numeric(6,3) DEFAULT 1,
  net_rate      numeric(14,4) NOT NULL,
  is_active     boolean NOT NULL,
  notes         text,
  snapped_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snap_ur_revision ON public.snap_unit_rates(bid_revision_id);
ALTER TABLE public.snap_unit_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view snap unit rates"
  ON public.snap_unit_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert snap unit rates"
  ON public.snap_unit_rates FOR INSERT TO authenticated WITH CHECK (true);

-- F3. snap_unit_rate_lines
CREATE TABLE IF NOT EXISTS public.snap_unit_rate_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_revision_id   uuid NOT NULL REFERENCES public.tender_bid_summaries(id) ON DELETE CASCADE,
  source_id         uuid NOT NULL,
  unit_rate_id      uuid NOT NULL,
  category          text NOT NULL,
  price_list_item_id uuid NOT NULL,
  qty_per_unit      numeric(14,6) NOT NULL,
  wastage_pct       numeric(6,3) DEFAULT 0,
  line_total        numeric(14,4) NOT NULL,
  sort_order        int NOT NULL,
  snapped_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snap_url_revision ON public.snap_unit_rate_lines(bid_revision_id);
ALTER TABLE public.snap_unit_rate_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view snap unit rate lines"
  ON public.snap_unit_rate_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert snap unit rate lines"
  ON public.snap_unit_rate_lines FOR INSERT TO authenticated WITH CHECK (true);

-- F4. snap_tender_boq_items
CREATE TABLE IF NOT EXISTS public.snap_tender_boq_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_revision_id   uuid NOT NULL REFERENCES public.tender_bid_summaries(id) ON DELETE CASCADE,
  source_id         uuid NOT NULL,
  tender_id         uuid NOT NULL,
  section           text NOT NULL,
  item_code         text NOT NULL,
  description       text NOT NULL,
  unit              text NOT NULL,
  quantity          numeric(15,2) NOT NULL,
  unit_rate         numeric(15,2),
  total_amount      numeric(15,2),
  unit_rate_id      uuid,
  is_manual_rate    boolean NOT NULL,
  sourcing          text NOT NULL,
  discipline        text,
  notes             text,
  snapped_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snap_tboq_revision ON public.snap_tender_boq_items(bid_revision_id);
ALTER TABLE public.snap_tender_boq_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can view snap tender boq"
  ON public.snap_tender_boq_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert snap tender boq"
  ON public.snap_tender_boq_items FOR INSERT TO authenticated WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- G. RECALCULATION FUNCTION: recalc_from_price_item(price_item_id uuid)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalc_from_price_item(p_price_item_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_rates_affected int := 0;
  v_boq_affected int := 0;
  v_line record;
  v_rate_id uuid;
  v_mat_sub numeric;
  v_lp_sub numeric;
  v_pf numeric;
BEGIN
  -- Step 1: Recompute line_total for every unit_rate_line referencing this price item
  FOR v_line IN
    SELECT l.id, l.unit_rate_id, l.qty_per_unit, l.wastage_pct, l.category,
           p.unit_price
    FROM public.tender_unit_rate_lines l
    JOIN public.tender_price_list_items p ON p.id = l.price_list_item_id
    WHERE l.price_list_item_id = p_price_item_id
  LOOP
    UPDATE public.tender_unit_rate_lines
    SET line_total = CASE
      WHEN v_line.category = 'material'
      THEN v_line.qty_per_unit * v_line.unit_price * (1 + v_line.wastage_pct / 100)
      ELSE v_line.qty_per_unit * v_line.unit_price
    END
    WHERE id = v_line.id;
  END LOOP;

  -- Step 2: Recompute net_rate for each affected unit_rate (build-up mode)
  FOR v_rate_id IN
    SELECT DISTINCT l.unit_rate_id
    FROM public.tender_unit_rate_lines l
    WHERE l.price_list_item_id = p_price_item_id
  LOOP
    -- Get productivity factor
    SELECT productivity_factor INTO v_pf
    FROM public.tender_unit_rates WHERE id = v_rate_id;

    -- Sum material lines and labor+plant+subcon lines
    SELECT
      COALESCE(SUM(CASE WHEN l.category = 'material' THEN l.line_total ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN l.category IN ('labor','plant','subcon') THEN l.line_total ELSE 0 END), 0)
    INTO v_mat_sub, v_lp_sub
    FROM public.tender_unit_rate_lines l
    WHERE l.unit_rate_id = v_rate_id;

    -- Update net_rate
    UPDATE public.tender_unit_rates
    SET net_rate = v_mat_sub + (v_lp_sub / v_pf),
        updated_at = now()
    WHERE id = v_rate_id;

    v_rates_affected := v_rates_affected + 1;
  END LOOP;

  -- Step 3: Recompute BOQ items linked to affected rates (non-manual)
  UPDATE public.tender_boq_items
  SET unit_rate = (SELECT net_rate FROM public.tender_unit_rates WHERE id = tender_boq_items.unit_rate_id)
  WHERE unit_rate_id IN (
    SELECT DISTINCT l.unit_rate_id
    FROM public.tender_unit_rate_lines l
    WHERE l.price_list_item_id = p_price_item_id
  )
  AND is_manual_rate = false;

  GET DIAGNOSTICS v_boq_affected = ROW_COUNT;

  -- Step 4: Audit log entry
  INSERT INTO public.qs_audit_log (tenant_id, table_name, record_id, action, new_data, changed_by)
  VALUES (
    (SELECT tenant_id FROM public.tender_price_list_items WHERE id = p_price_item_id),
    'tender_price_list_items',
    p_price_item_id,
    'RECALC',
    jsonb_build_object('rates_affected', v_rates_affected, 'boq_items_affected', v_boq_affected),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'rates_affected', v_rates_affected,
    'boq_items_affected', v_boq_affected
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════════════════
-- H. SNAPSHOT FUNCTION: create_bid_snapshot(bid_revision_id uuid)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_bid_snapshot(p_bid_revision_id uuid)
RETURNS void AS $$
DECLARE
  v_tender_id uuid;
BEGIN
  -- Get tender_id from the bid summary
  SELECT tender_id INTO v_tender_id
  FROM public.tender_bid_summaries WHERE id = p_bid_revision_id;

  IF v_tender_id IS NULL THEN
    RAISE EXCEPTION 'Bid revision not found: %', p_bid_revision_id;
  END IF;

  -- Snapshot price list items
  INSERT INTO public.snap_price_list_items (
    bid_revision_id, source_id, tender_id, code, description, category, unit,
    unit_price, currency, supplier_name, quote_ref, quote_date, valid_until, is_active, notes
  )
  SELECT p_bid_revision_id, id, tender_id, code, description, category, unit,
    unit_price, currency, supplier_name, quote_ref, quote_date, valid_until, is_active, notes
  FROM public.tender_price_list_items
  WHERE tender_id = v_tender_id;

  -- Snapshot unit rates
  INSERT INTO public.snap_unit_rates (
    bid_revision_id, source_id, tender_id, code, description, trade, unit, mode,
    base_rate, wastage_pct, productivity_factor, net_rate, is_active, notes
  )
  SELECT p_bid_revision_id, id, tender_id, code, description, trade, unit, mode,
    base_rate, wastage_pct, productivity_factor, net_rate, is_active, notes
  FROM public.tender_unit_rates
  WHERE tender_id = v_tender_id;

  -- Snapshot unit rate lines
  INSERT INTO public.snap_unit_rate_lines (
    bid_revision_id, source_id, unit_rate_id, category, price_list_item_id,
    qty_per_unit, wastage_pct, line_total, sort_order
  )
  SELECT p_bid_revision_id, id, unit_rate_id, category, price_list_item_id,
    qty_per_unit, wastage_pct, line_total, sort_order
  FROM public.tender_unit_rate_lines
  WHERE unit_rate_id IN (
    SELECT id FROM public.tender_unit_rates WHERE tender_id = v_tender_id
  );

  -- Snapshot tender BOQ items
  INSERT INTO public.snap_tender_boq_items (
    bid_revision_id, source_id, tender_id, section, item_code, description, unit,
    quantity, unit_rate, total_amount, unit_rate_id, is_manual_rate, sourcing, discipline, notes
  )
  SELECT p_bid_revision_id, id, tender_id, section, item_code, description, unit,
    quantity, unit_rate, total_amount, unit_rate_id, is_manual_rate, sourcing, discipline, notes
  FROM public.tender_boq_items
  WHERE tender_id = v_tender_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
