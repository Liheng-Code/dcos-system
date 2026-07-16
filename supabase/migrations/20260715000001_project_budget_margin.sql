-- ══════════════════════════════════════════════════════════════════════════════
-- Project Budget: Cost vs Selling Price with Embedded Margin
-- ══════════════════════════════════════════════════════════════════════════════

-- A. Add margin_pct to tender_unit_rates (cost build-up → selling rate)
ALTER TABLE public.tender_unit_rates
  ADD COLUMN IF NOT EXISTS margin_pct numeric(6,2) DEFAULT 0;

-- B. Add net_cost to tender_boq_items (cost to company, before margin)
ALTER TABLE public.tender_boq_items
  ADD COLUMN IF NOT EXISTS net_cost numeric(15,2) DEFAULT 0;

-- C. Update recalc_from_price_item() to cascade net_cost + margin → unit_rate
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
  v_net_rate numeric;
  v_margin_pct numeric;
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
    SELECT productivity_factor INTO v_pf
    FROM public.tender_unit_rates WHERE id = v_rate_id;

    SELECT
      COALESCE(SUM(CASE WHEN l.category = 'material' THEN l.line_total ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN l.category IN ('labor','plant','subcon') THEN l.line_total ELSE 0 END), 0)
    INTO v_mat_sub, v_lp_sub
    FROM public.tender_unit_rate_lines l
    WHERE l.unit_rate_id = v_rate_id;

    v_net_rate := v_mat_sub + (v_lp_sub / v_pf);

    -- Get margin_pct from the rate
    SELECT margin_pct INTO v_margin_pct
    FROM public.tender_unit_rates WHERE id = v_rate_id;

    UPDATE public.tender_unit_rates
    SET net_rate = v_net_rate,
        updated_at = now()
    WHERE id = v_rate_id;

    -- Step 3: Propagate net_cost + selling rate to linked BOQ items
    UPDATE public.tender_boq_items
    SET net_cost = v_net_rate,
        unit_rate = v_net_rate * (1 + COALESCE(v_margin_pct, 0) / 100)
    WHERE unit_rate_id = v_rate_id
      AND is_manual_rate = false;

    v_rates_affected := v_rates_affected + 1;
  END LOOP;

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

-- D. RPC: recalc_from_unit_rate — cascade margin when a unit rate itself changes
CREATE OR REPLACE FUNCTION public.recalc_from_unit_rate(p_unit_rate_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_boq_affected int := 0;
  v_net_rate numeric;
  v_margin_pct numeric;
BEGIN
  SELECT net_rate, margin_pct INTO v_net_rate, v_margin_pct
  FROM public.tender_unit_rates WHERE id = p_unit_rate_id;

  UPDATE public.tender_boq_items
  SET net_cost = v_net_rate,
      unit_rate = v_net_rate * (1 + COALESCE(v_margin_pct, 0) / 100)
  WHERE unit_rate_id = p_unit_rate_id
    AND is_manual_rate = false;

  GET DIAGNOSTICS v_boq_affected = ROW_COUNT;

  RETURN jsonb_build_object('boq_items_affected', v_boq_affected);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
