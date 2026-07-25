-- Force PostgREST to reload its schema cache so newly created tables
-- (qs_contract_snapshots, qs_risk_items, qs_price_list_items) are visible.
notify pgrst, 'reload schema';
