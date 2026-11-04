-- Sample data seed: prices for the PRJ-2026-004-PC sample labour / equipment resources (SMP-LAB-*, SMP-EQP-*).
-- LOCAL DB ONLY, like sample_prj_2026_004_pc_boq.sql (those resources do not exist on production).
-- Without a price their BOQ items (SMP-*) have no net rate, which the Work Library BOQ tab reports as "No rate".
-- Hourly price = the matching company resource's base day rate / 8 (labour; dwl_v_resource_costing_rates then adds the
-- labour all-in on-costs) or its hourly rate (equipment). Rates with no company source are marked ASSUMPTION and filed as source_type 'estimate' (BOQ tab "Estimated price").
-- Idempotent: deletes and re-inserts only its own rows (notes start with 'Sample data PRJ-2026-004-PC price').
-- Run from Git Bash after sample_prj_2026_004_pc_boq.sql:
--   docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/sample_prj_2026_004_pc_resource_prices.sql
begin;

delete from public.dwl_resource_prices where notes like 'Sample data PRJ-2026-004-PC price%';

insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, price_status, notes)
select r.tenant_id, r.id,
       round(coalesce(src_price.unit_price / v.divisor, v.assumed), 4),
       'USD', date '2026-11-04', case when src_price.unit_price is null then 'estimate' else 'market_survey' end, 'approved',
       'Sample data PRJ-2026-004-PC price: ' ||
         case when src_price.unit_price is not null then 'from ' || v.src || case when v.divisor = 8 then ' day rate / 8' else ' hourly rate' end
              else 'ASSUMPTION ' || v.assumed || '/hr, no company rate; replace with a quotation' end
from (values
  ('SMP-LAB-HELPER',          'L-HLP-001', 8, null::numeric),
  ('SMP-LAB-CARPENTER',       'L-CAR-001', 8, null),
  ('SMP-LAB-MASON',           'L-MAS-001', 8, null),
  ('SMP-LAB-STEEL-FIXER',     'L-STL-001', 8, null),
  ('SMP-LAB-PAINTER',         'PL-LAB-12', 8, null),
  ('SMP-LAB-DUCTWORK-FITTER', 'PL-LAB-23', 8, null),
  ('SMP-LAB-PIPE-FITTER',     'PL-LAB-24', 8, null),
  ('SMP-LAB-WELDER',          'PL-LAB-05', 8, null),
  ('SMP-LAB-TILER',           'PL-LAB-11', 8, null),
  ('SMP-LAB-OPERATOR',        null,        8, 2.25),
  ('SMP-EQP-EXCAVATOR',       'E-EXC-001', 1, null),
  ('SMP-EQP-TOWER-CRANE',     null,        1, 40),
  ('SMP-EQP-PILING-RIG',      null,        1, 90),
  ('SMP-EQP-ROLLER',          null,        1, 25),
  ('SMP-EQP-CONCRETE-PUMP',   null,        1, 60)
) as v(code, src, divisor, assumed)
join public.dwl_resources r on r.code = v.code
left join lateral (
  select p.unit_price from public.dwl_resource_prices p join public.dwl_resources s on s.id = p.resource_id
  where s.code = v.src and p.price_status = 'approved'
  order by p.valid_from desc, p.created_at desc limit 1
) src_price on true
where not exists (
  -- keep any real price someone already entered for the resource
  select 1 from public.dwl_resource_prices p where p.resource_id = r.id and coalesce(p.notes, '') not like 'Sample data PRJ-2026-004-PC price%'
);

commit;
