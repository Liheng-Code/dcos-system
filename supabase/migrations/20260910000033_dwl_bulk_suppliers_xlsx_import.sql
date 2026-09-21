-- Migration: 20260910000033_dwl_bulk_suppliers_xlsx_import.sql
-- Purpose: Cost & Rate Library — Supplier Master. Loads the 19 real
--          suppliers from docs/DCOS_Supplier_Master_2026-09-15.xlsx (sheet
--          "Suppliers") into dwl_suppliers + dwl_supplier_profiles.
--
-- Depends on: 20260910000003_dwl_supplier_profiles_and_materials.sql,
--             20260910000032_dwl_supplier_master_view.sql (overall_rating).
--
-- Rating: dwl_suppliers.rating (A/B/C) is banded from the Excel's 1-5
--   "Rating" column using the same >=4.5 A / >=3.5 B / else C thresholds as
--   ratingBand() in dwl-import-lib.ts. The raw value is preserved verbatim
--   in dwl_supplier_profiles.overall_rating, and also copied into
--   reliability_rating (the Excel has one rating column, not two — the
--   Register Vendor form's separate "Reliability Rating" field is for
--   future manual refinement per supplier, not asserted differently here).
--
-- Idempotent: guarded by "no existing dwl_supplier_profiles row for this
--   supplier_code" — safe to re-run, never creates a duplicate supplier.
--
-- Additive only: inserts into existing tables, no schema change.

do $$
declare
  v_tenant uuid := (select id from public.companies where code = 'MCC');
begin

drop table if exists tmp_bulk_suppliers;
create temp table tmp_bulk_suppliers (
  supplier_code   text,
  company_name    text,
  trading_name    text,
  supplier_type   text,
  contact_person  text,
  phone           text,
  email           text,
  city            text,
  country         text,
  payment_terms   text,
  delivery_terms  text,
  lead_time_days  integer,
  rating          numeric(2,1),
  competitiveness text
);

insert into tmp_bulk_suppliers
  (supplier_code, company_name, trading_name, supplier_type, contact_person, phone, email, city, country, payment_terms, delivery_terms, lead_time_days, rating, competitiveness)
values
  ('SUP-CON-001','Siam City Concrete & Cement Co.','SCCC Insee','Manufacturer','Somchai Prasert','+855 23 881 290','somchai.p@siamcitycement.com','Phnom Penh','Cambodia / Thailand','30 Days Net','FOB Jobsite Plant Mixer',2,4.8,'Competitive'),
  ('SUP-CON-002','Mekong Ready-Mix & Precast Corp.','Mekong Concrete','Local Supplier','Vannak Heng','+855 12 773 992','v.heng@mekongreadymix.com.kh','Phnom Penh','Cambodia','15 Days Net','FOB Jobsite',3,4.3,'Very Competitive'),
  ('SUP-STL-001','Hoa Phat Steel International Ltd.','Hoa Phat Steel','Manufacturer','Nguyen Van Thang','+84 24 6284 8666','thangnv@hoaphat.com.vn','Hanoi','Vietnam','LC at Sight / 30 Days CAD','CIF Phnom Penh Port / Delivered Duty Paid Site',7,4.7,'Very Competitive'),
  ('SUP-STL-002','Nippon Steel Trading SE Asia','Nippon Steel','Importer','Kenji Takahashi','+65 6223 6777','takahashi.k@nipponsteel.sg','Singapore','Singapore / Japan','45 Days Net','CIF Sihanoukville Port',21,4.9,'Premium'),
  ('SUP-FIN-001','SCG Building Materials International','SCG Cotto & Smartboard','Distributor','Chanchai Wongsuwan','+855 23 990 120','chanchaiw@scg.com','Phnom Penh','Thailand / Cambodia','30 Days Net','Delivered Jobsite Warehouse',4,4.6,'Competitive'),
  ('SUP-WTR-001','Sika Cambodia & Regional Chemical Co.','Sika Chemical','Manufacturer','Dara Rath','+855 23 901 450','rath.dara@kh.sika.com','Phnom Penh','Switzerland / Cambodia','30 Days Net','Ex-Works Warehouse / FOB Site',3,4.9,'Moderate'),
  ('SUP-MEP-001','Schneider Electric Indo-China Supply','Schneider Electric','Manufacturer','Bastien Renaud','+855 23 214 000','bastien.renaud@se.com','Phnom Penh','France / Cambodia','45 Days Net','FOB Site',14,4.8,'Premium'),
  ('SUP-MEP-002','Thai Plastic and Chemicals (TPC Piping)','Elephant Brand SCG Pipe','Manufacturer','Prasit Boonmee','+66 2 586 7777','prasitb@scg.com','Bangkok','Thailand','30 Days Net','CIF Phnom Penh Depot',5,4.6,'Competitive'),
  ('SUP-GLS-001','AGC Flat Glass Indochina Co.','Asahi Glass / AGC','Specialist Supplier','Chea Sambath','+855 17 888 123','sambath.c@agc-indochina.com','Phnom Penh','Japan / Cambodia','50% Down, 50% Before Delivery','Delivered to Glazing Crate Site',28,4.7,'Moderate'),
  ('SUP-GEN-001','Apex Construction Supply & Hardware','Apex Trading','Local Supplier','Kosal Meng','+855 11 556 677','sales@apexsupply.com.kh','Phnom Penh','Cambodia','7 Days Net / Cash on Delivery','Same-day or next-day truck delivery',1,4.2,'Moderate'),
  ('SUP-PNT-001','TOA Paint (Cambodia) Co., Ltd.','TOA Paint Cambodia','Manufacturer','Sok Vichea','+855 23 888 765','vichea.sok@toagroup.com','Phnom Penh','Cambodia / Thailand','30 Days Net','Delivered Jobsite',2,4.8,'Competitive'),
  ('SUP-GYP-001','Saint-Gobain Gyproc & Knauf Cambodia','Gyproc Cambodia','Distributor','Khem Piseth','+855 23 993 421','piseth.khem@saint-gobain.com','Phnom Penh','Cambodia / France','30 Days Net','Delivered Jobsite Warehouse',3,4.9,'Competitive'),
  ('SUP-TRM-001','PestLab Exterminator Cambodia','PestLab Cambodia','Specialist Supplier','David Laurent / Kimly Seng','+855 12 905 111','contact@pestlabcambodia.com','Phnom Penh','Cambodia','50% Upon Sub-slab Piping / 50% Post-drenching','On-site Specialist Application',2,4.9,'Competitive'),
  ('SUP-DOR-001','Cambodia Doors JSC & Royal Door Co.','Cambodia Doors','Manufacturer','Hout Somaly','+855 77 444 890','sales@cambodiadoors.com','Phnom Penh','Cambodia','40% Deposit, 60% Before Final Installation','Delivered & Installed on Site',14,4.7,'Competitive'),
  ('SUP-FLR-001','Dawn Floors & Mekong Interior Solutions','Dawn Floors Cambodia','Distributor','Chenda Prum','+855 15 678 234','c.prum@dawnfloors.com.kh','Phnom Penh','Cambodia','30 Days Net','Delivered Jobsite with Lifting',10,4.8,'Competitive'),
  ('SUP-MRB-001','Dongpeng & Cotto Stone Trading Phnom Penh','Dongpeng & Cotto Stone Center','Distributor','Ly Mengkheang','+855 23 881 990','mengkheang.ly@dongpeng.com.kh','Phnom Penh','Cambodia / China / Thailand','30% Advance, 70% Prior to Delivery','Crated Pallet Delivery to Site',7,4.7,'Competitive'),
  ('SUP-HRD-001','Häfele Cambodia Co., Ltd.','Häfele Indochina & Cambodia','Manufacturer','Martin Sommer / Sophal Chan','+855 23 900 780','info@hafele.com.kh','Phnom Penh','Germany / Cambodia','30 Days Net','Delivered Jobsite Warehouse',7,4.9,'Moderate'),
  ('SUP-INS-001','Rockwool & Insulation Systems Cambodia','Rockwool Firesafe Cambodia','Distributor','Kalyan Seng','+855 23 884 190','sales@rockwoolcambodia.com','Phnom Penh','Denmark / Cambodia','30 Days Net','Delivered Jobsite',5,4.8,'Competitive'),
  ('SUP-ROOF-001','Lysaght BlueScope Cambodia Ltd.','BlueScope Lysaght','Manufacturer','Veasna Lim','+855 23 883 400','veasna.lim@bluescope.com','Phnom Penh','Australia / Cambodia','30% Advance, 70% LC / Delivery','Delivered Jobsite with Mobile Roll-forming',14,4.9,'Competitive');

-- 1. dwl_suppliers — one row per new supplier_code (skip if a profile with
--    this code already exists anywhere for the tenant).
insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
select
  v_tenant, t.company_name, t.contact_person,
  case when t.rating >= 4.5 then 'A' when t.rating >= 3.5 then 'B' else 'C' end,
  true
from tmp_bulk_suppliers t
where not exists (
  select 1 from public.dwl_supplier_profiles p
  where p.tenant_id = v_tenant and p.supplier_code = t.supplier_code
)
and not exists (
  select 1 from public.dwl_suppliers x
  where x.tenant_id = v_tenant and x.name = t.company_name
);

-- 2. dwl_supplier_profiles — companion row, matched back to the resource
--    just inserted (or a same-named pre-existing one) by name + tenant.
insert into public.dwl_supplier_profiles
  (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, phone, email,
   country, province_city, payment_terms, delivery_terms, lead_time_days, overall_rating,
   reliability_rating, price_competitiveness, lifecycle_status)
select
  s.id, v_tenant, t.supplier_code, t.trading_name, t.supplier_type, t.contact_person, t.phone, t.email,
  t.country, t.city, t.payment_terms, t.delivery_terms, t.lead_time_days, t.rating,
  t.rating::text, t.competitiveness, 'active'
from tmp_bulk_suppliers t
join public.dwl_suppliers s on s.tenant_id = v_tenant and s.name = t.company_name
where not exists (
  select 1 from public.dwl_supplier_profiles p
  where p.tenant_id = v_tenant and p.supplier_code = t.supplier_code
);

drop table tmp_bulk_suppliers;

end $$;
