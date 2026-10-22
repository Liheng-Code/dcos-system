-- Local demo seed: RFQ quotation comparison (procurement). Idempotent, fixed UUIDs, all names prefixed DEMO.
-- Demo RFQ id: de000000-0000-4000-8000-000000000100 (RFQ-DEMO-CMP-001, under_evaluation, lowest_price)
--   Supplier A: covers all 4 lines, lowest total.
--   Supplier B: covers all 4 lines, lowest on lines 2 and 3, higher total.
--   Supplier C: omits line 4, cheapest on line 1 (partial coverage), lead time + notes on lines.
do $$
declare
  v_pr   constant uuid := 'de000000-0000-4000-8000-000000000010';
  v_rfq  constant uuid := 'de000000-0000-4000-8000-000000000100';
  v_sa   constant uuid := 'de000000-0000-4000-8000-000000000001';
  v_sb   constant uuid := 'de000000-0000-4000-8000-000000000002';
  v_sc   constant uuid := 'de000000-0000-4000-8000-000000000003';
  v_qa   constant uuid := 'de000000-0000-4000-8000-000000000201';
  v_qb   constant uuid := 'de000000-0000-4000-8000-000000000202';
  v_qc   constant uuid := 'de000000-0000-4000-8000-000000000203';
  v_l1   constant uuid := 'de000000-0000-4000-8000-000000000011';
  v_l2   constant uuid := 'de000000-0000-4000-8000-000000000012';
  v_l3   constant uuid := 'de000000-0000-4000-8000-000000000013';
  v_l4   constant uuid := 'de000000-0000-4000-8000-000000000014';
begin
  insert into public.procurement_suppliers (id, supplier_code, supplier_name, supplier_type, currency, status)
  values
    (v_sa, 'DEMO-SUP-A', 'DEMO Supplier A', 'materials', 'USD', 'active'),
    (v_sb, 'DEMO-SUP-B', 'DEMO Supplier B', 'materials', 'USD', 'active'),
    (v_sc, 'DEMO-SUP-C', 'DEMO Supplier C', 'materials', 'USD', 'active')
  on conflict do nothing;

  insert into public.procurement_prs (id, pr_number, approval_status, required_date, notes)
  values (v_pr, 'PR-DEMO-CMP-001', 'approved', current_date + 45, 'DEMO purchase requisition for RFQ comparison')
  on conflict do nothing;

  insert into public.procurement_pr_items (id, pr_id, line_no, item_code, item_description, unit, quantity)
  values
    (v_l1, v_pr, 1, 'DEMO-CEM', 'DEMO Portland cement 50kg bag', 'bag', 100),
    (v_l2, v_pr, 2, 'DEMO-REB', 'DEMO Deformed rebar D16', 'ton', 50),
    (v_l3, v_pr, 3, 'DEMO-SAN', 'DEMO River sand', 'm3', 200),
    (v_l4, v_pr, 4, 'DEMO-GRV', 'DEMO Crushed gravel 20mm', 'm3', 150)
  on conflict do nothing;

  insert into public.procurement_rfqs (id, pr_id, rfq_number, issue_date, response_deadline, evaluation_method, status, notes)
  values (v_rfq, v_pr, 'RFQ-DEMO-CMP-001', current_date - 10, current_date - 3, 'lowest_price',
          'under_evaluation', 'DEMO RFQ for quotation comparison')
  on conflict do nothing;

  insert into public.procurement_rfq_suppliers (id, rfq_id, supplier_id, responded)
  values
    ('de000000-0000-4000-8000-000000000301', v_rfq, v_sa, true),
    ('de000000-0000-4000-8000-000000000302', v_rfq, v_sb, true),
    ('de000000-0000-4000-8000-000000000303', v_rfq, v_sc, true)
  on conflict do nothing;

  insert into public.procurement_quotations
    (id, rfq_id, supplier_id, quotation_ref, received_at, currency, valid_until, payment_terms,
     delivery_lead_time, total_amount, status, notes)
  values
    (v_qa, v_rfq, v_sa, 'DEMO-QA-001', now() - interval '5 days', 'USD', current_date + 30, 'Net 30', 14, 13750, 'pending', 'DEMO quotation A'),
    (v_qb, v_rfq, v_sb, 'DEMO-QB-001', now() - interval '4 days', 'USD', current_date + 30, 'Net 45', 10, 14100, 'pending', 'DEMO quotation B'),
    (v_qc, v_rfq, v_sc, 'DEMO-QC-001', now() - interval '3 days', 'USD', current_date + 20, 'Net 30', 21, 10550, 'pending', 'DEMO quotation C (partial)')
  on conflict do nothing;

  insert into public.procurement_quotation_items
    (id, quotation_id, pr_item_id, line_no, item_code, item_description, unit, quantity, unit_price, total,
     delivery_date, lead_time_days, notes)
  values
    -- A: total 13750
    ('de000000-0000-4000-8000-000000000401', v_qa, v_l1, 1, 'DEMO-CEM', 'DEMO Portland cement 50kg bag', 'bag', 100, 10, 1000, current_date + 14, 14, 'Ex-works'),
    ('de000000-0000-4000-8000-000000000402', v_qa, v_l2, 2, 'DEMO-REB', 'DEMO Deformed rebar D16', 'ton', 50, 100, 5000, current_date + 14, 14, null),
    ('de000000-0000-4000-8000-000000000403', v_qa, v_l3, 3, 'DEMO-SAN', 'DEMO River sand', 'm3', 200, 20, 4000, current_date + 10, 10, 'Delivered to site'),
    ('de000000-0000-4000-8000-000000000404', v_qa, v_l4, 4, 'DEMO-GRV', 'DEMO Crushed gravel 20mm', 'm3', 150, 25, 3750, current_date + 10, 10, null),
    -- B: total 14100, lowest on lines 2 and 3
    ('de000000-0000-4000-8000-000000000411', v_qb, v_l1, 1, 'DEMO-CEM', 'DEMO Portland cement 50kg bag', 'bag', 100, 12, 1200, current_date + 10, 10, null),
    ('de000000-0000-4000-8000-000000000412', v_qb, v_l2, 2, 'DEMO-REB', 'DEMO Deformed rebar D16', 'ton', 50, 90, 4500, current_date + 12, 12, 'Mill certificates included'),
    ('de000000-0000-4000-8000-000000000413', v_qb, v_l3, 3, 'DEMO-SAN', 'DEMO River sand', 'm3', 200, 18, 3600, current_date + 7, 7, null),
    ('de000000-0000-4000-8000-000000000414', v_qb, v_l4, 4, 'DEMO-GRV', 'DEMO Crushed gravel 20mm', 'm3', 150, 32, 4800, current_date + 7, 7, 'Price valid for full quantity only'),
    -- C: omits line 4, total 10550, cheapest on line 1
    ('de000000-0000-4000-8000-000000000421', v_qc, v_l1, 1, 'DEMO-CEM', 'DEMO Portland cement 50kg bag', 'bag', 100, 9, 900, current_date + 21, 21, 'Bulk discount applied'),
    ('de000000-0000-4000-8000-000000000422', v_qc, v_l2, 2, 'DEMO-REB', 'DEMO Deformed rebar D16', 'ton', 50, 105, 5250, current_date + 21, 21, null),
    ('de000000-0000-4000-8000-000000000423', v_qc, v_l3, 3, 'DEMO-SAN', 'DEMO River sand', 'm3', 200, 22, 4400, current_date + 18, 18, 'Washed sand')
  on conflict do nothing;
end $$;
