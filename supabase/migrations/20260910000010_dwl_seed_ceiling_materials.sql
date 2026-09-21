-- Migration: 20260910000010_dwl_seed_ceiling_materials.sql
-- Purpose: 45 ceiling materials (dwl_resources category=material) + dwl_material_attributes.
--          Cost & Rate Library — Ceiling seed (DCOS-DS-12-012 Phase C-H,
--          QS-SOP-004). Source: docs/DCOS_Cost_Rate_Library_Material_Spec_Price_Template.xlsx.
--
-- DEMO DATA — all suppliers, prices and quotations below are FICTIONAL,
-- for training / illustration only. They are NOT real market data and must
-- be superseded by real quotations before use in live tendering
-- (master-prompt §57, QS-SOP-004 §10).
--
-- Coding: template MAT-CL-* codes are remapped to the locked DWL standard
-- {M/L/E/S}-{GRP3}-{NNN} (QS-SOP-002 §6 D2): M-CLG-* systems, M-CLF-* frame,
-- M-CLA-* accessories. The original template code is kept in
-- dwl_material_attributes.legacy_code.
--
-- Depends on: 20260910000001..06 (dwl_material_attributes, dwl_material_specs,
--   dwl_supplier_profiles, dwl_supplier_materials, dwl_resource_prices
--   breakdown cols, dwl_price_submissions, dwl_quotations), public.companies.
-- Idempotent: tenant resolved from companies.code='MCC'; every insert guarded
--   (on conflict / where not exists).

do $$
declare
  v_tenant uuid;
begin
  select id into v_tenant from public.companies where code = 'MCC';
  if v_tenant is null then
    raise exception 'ceiling seed: no company with code = MCC — cannot determine tenant_id';
  end if;

  -- ── dwl_resources ────────────────────────────────────────────────────
  insert into public.dwl_resources (tenant_id, code, category, description, unit, spec_reference)
  values
    (v_tenant, 'M-CLG-001', 'material', 'Gypsum Board Suspended Ceiling — Standard gypsum board suspended ceiling system (12.5mm gypsum board on GI framing)', 'm2', 'EN 520 / Local'),
    (v_tenant, 'M-CLG-002', 'material', 'Gypsum Board Direct-Fixed Ceiling — Gypsum board fixed directly to soffit or framing (12.5mm board direct fixed)', 'm2', 'EN 520'),
    (v_tenant, 'M-CLG-003', 'material', 'Moisture-Resistant Gypsum Ceiling — MR gypsum board for wet areas (MR 12.5mm + suspended framing)', 'm2', 'EN 520 Type H'),
    (v_tenant, 'M-CLG-004', 'material', 'Fire-Rated Gypsum Ceiling — Fire-rated gypsum board system (Fire-rated board + tested framing)', 'm2', 'EN 520 / Fire tested'),
    (v_tenant, 'M-CLG-005', 'material', 'Cement Board Ceiling — Cement board ceiling for wet/external (Cement board + metal framing)', 'm2', 'Local / ASTM'),
    (v_tenant, 'M-CLG-006', 'material', 'Mineral Fiber Acoustic Tile — Mineral fiber acoustic ceiling tiles on T-grid (T-grid + mineral fiber tiles)', 'm2', 'ASTM / Local'),
    (v_tenant, 'M-CLG-007', 'material', 'Metal Lay-In Ceiling — Exposed or tegular metal tiles on T-grid (Metal tiles + T-grid)', 'm2', 'Local / EN'),
    (v_tenant, 'M-CLG-008', 'material', 'Metal Clip-In Ceiling — Concealed carrier + clip-in metal panels (Clip-in system)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-009', 'material', 'Metal Hook-On Ceiling — Carrier + hook-on metal panels (Hook-on system)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-010', 'material', 'Aluminium Linear Ceiling — Linear aluminium strips + carriers (Linear strip system)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-011', 'material', 'Aluminium Strip Ceiling — Aluminium strips suspended from carrier (Strip system)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-012', 'material', 'Aluminium Baffle Ceiling — Vertical/horizontal aluminium baffles (Baffle system)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-013', 'material', 'Metal Baffle Ceiling — Metal baffles suspended independently (Independent baffle)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-014', 'material', 'Open Cell / Open Grid Ceiling — Grid modules suspended from slab (Open cell modules)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-015', 'material', 'Expanded Metal Ceiling — Expanded metal panels / grid (Expanded metal)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-016', 'material', 'PVC Panel Ceiling — Interlocking PVC panels (PVC interlocking panels)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-017', 'material', 'Wood Panel Ceiling — Timber / veneer panels + framing (Wood panels)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-018', 'material', 'Wood Slat Ceiling — Timber slats + carrier system (Slat system)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-019', 'material', 'Acoustic Wood Ceiling — Perforated / slatted acoustic timber (Acoustic wood)', 'm2', 'Local / EN'),
    (v_tenant, 'M-CLG-020', 'material', 'Acoustic Fabric Ceiling — Fabric membrane / panels + acoustic backing (Fabric acoustic)', 'm2', 'Local'),
    (v_tenant, 'M-CLG-021', 'material', 'Stretch Ceiling — PVC / fabric membrane + perimeter track (Stretch membrane)', 'm2', 'Local / Manufacturer'),
    (v_tenant, 'M-CLG-022', 'material', 'Decorative Feature Ceiling — Custom levels, shapes, profiles (Custom feature)', 'm2', 'Project specific'),
    (v_tenant, 'M-CLG-023', 'material', 'Acoustic Cloud Ceiling — Independent suspended acoustic panels / clouds (Acoustic clouds)', 'm2', 'Local / EN'),
    (v_tenant, 'M-CLG-024', 'material', 'Exposed Structure Ceiling — Exposed slab / steel + architectural finish (Exposed structure)', 'm2', 'Project specific'),
    (v_tenant, 'M-CLG-025', 'material', 'Exposed MEP Ceiling — Exposed structure + visible MEP services (Exposed MEP)', 'm2', 'Project specific'),
    (v_tenant, 'M-CLF-001', 'material', 'GI Main Runner & Cross Tee System (T-Grid) — Exposed or tegular T-grid suspension system (T24/T15 main & cross tees + hangers + wall angle)', 'm2', 'EN 13964 / Local'),
    (v_tenant, 'M-CLF-002', 'material', 'Concealed Carrier / Clip-In Suspension — Concealed carrier system for clip-in metal panels (Carrier channels + clips + hangers)', 'm2', 'Local / Manufacturer'),
    (v_tenant, 'M-CLF-003', 'material', 'Linear / Strip Carrier System — Carrier system for aluminium linear / strip ceilings (Carrier channels + suspensions)', 'm2', 'Local / Manufacturer'),
    (v_tenant, 'M-CLF-004', 'material', 'Baffle / Independent Suspension System — Independent suspension for baffle ceilings (Hangers + carriers for vertical/horizontal baffles)', 'm2', 'Local / Manufacturer'),
    (v_tenant, 'M-CLF-005', 'material', 'GI Channel Framing (Gypsum Suspended) — Primary & secondary channel framing for gypsum board ceilings (Main channel, furring channel, hangers, perimeter)', 'm2', 'Local / EN'),
    (v_tenant, 'M-CLF-006', 'material', 'Direct-Fixed / Soffit Framing — Framing fixed directly to soffit or structure (Channels or battens direct fixed)', 'm2', 'Local'),
    (v_tenant, 'M-CLF-007', 'material', 'Perimeter Channel / Wall Angle — Perimeter trim and wall angle for suspended ceilings (Wall angle, perimeter channel, shadow gap)', 'm', 'Local'),
    (v_tenant, 'M-CLF-008', 'material', 'Primary Hanger / Suspension Rod System — Threaded rod hangers, soffit cleats and brackets (Rod + cleat + adjustment)', 'no', 'Local'),
    (v_tenant, 'M-CLF-009', 'material', 'Open Cell / Grid Module Suspension — Suspension system for open cell and open grid modules (Module hangers + grid support)', 'm2', 'Local / Manufacturer'),
    (v_tenant, 'M-CLF-010', 'material', 'Stretch Ceiling Perimeter Track — Perimeter track / profile for stretch membrane ceilings (Aluminium or PVC perimeter track)', 'm', 'Manufacturer'),
    (v_tenant, 'M-CLA-001', 'material', 'Standard Access Panel (Gypsum / Metal) — Standard removable or hinged access panel for ceilings (Gypsum or metal faced, various sizes)', 'no', 'Local / Manufacturer'),
    (v_tenant, 'M-CLA-002', 'material', 'Fire-Rated Access Panel — Fire-rated access hatch with tested fire performance (Intumescent seal, fire-rated board/core)', 'no', 'Fire Test Report'),
    (v_tenant, 'M-CLA-003', 'material', 'Acoustic Access Panel — Acoustic-rated access panel maintaining ceiling performance (Sealed, acoustic core or lining)', 'no', 'Local / Acoustic test'),
    (v_tenant, 'M-CLA-004', 'material', 'Metal Lay-In Access Tile / Panel — Matching metal tile designed for access in lay-in systems (Same finish as surrounding tiles)', 'no', 'Manufacturer'),
    (v_tenant, 'M-CLA-005', 'material', 'Hinged Access Door (Lockable) — Hinged access door with lock or latch (Metal or gypsum faced, key or tool lock)', 'no', 'Local / Manufacturer'),
    (v_tenant, 'M-CLA-006', 'material', 'Push-Up / Lift-Out Access Panel — Simple lift-out panel without hinge (Removable panel resting on frame)', 'no', 'Local'),
    (v_tenant, 'M-CLA-007', 'material', 'Circular / Specialty Shape Access Panel — Non-rectangular access panel for architectural ceilings (Circular, oval or custom shape)', 'no', 'Manufacturer / Custom'),
    (v_tenant, 'M-CLA-008', 'material', 'Access Panel with Smoke Seal / Gasket — Sealed access panel for smoke or pressure control (Gasketed frame and panel)', 'no', 'Local / Manufacturer'),
    (v_tenant, 'M-CLA-009', 'material', 'Ceiling Trap Door / Larger Access Hatch — Larger access hatch for equipment or major services (600x600 or larger, often hinged)', 'no', 'Local / Manufacturer'),
    (v_tenant, 'M-CLA-010', 'material', 'Shadow Gap / Feature Trim Accessory — Shadow gap profiles and feature trims at access or edges (Extruded or formed profiles)', 'm', 'Local / Manufacturer')
  on conflict (code) do nothing;

  -- ── dwl_material_attributes ─────────────────────────────────────────
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Gypsum Board Suspended Ceiling', 'Suspended Ceiling', 'Architectural', 'Ceiling System',
     '12.5mm gypsum board on GI framing', 'EN 520 / Local', 'Standard', 'Various', null, 'Various', 'Sheet',
     '12.5mm thk', 'White / Smooth', 'Office, hotel, residential', 'active', '{"ceiling","gypsum","suspended"}', 'MAT-CL-001', 'Typical commercial fit-out'
  from public.dwl_resources r where r.code = 'M-CLG-001' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Gypsum Board Direct-Fixed Ceiling', 'Direct-Fixed Ceiling', 'Architectural', 'Ceiling System',
     '12.5mm board direct fixed', 'EN 520', 'Standard', 'Various', null, 'Various', 'Sheet',
     '12.5mm thk', 'White', 'Residential, corridors', 'active', '{"ceiling","gypsum","direct"}', 'MAT-CL-002', null
  from public.dwl_resources r where r.code = 'M-CLG-002' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Moisture-Resistant Gypsum Ceiling', 'Suspended Ceiling', 'Architectural', 'Ceiling System',
     'MR 12.5mm + suspended framing', 'EN 520 Type H', 'MR', 'Various', null, 'Various', 'Sheet',
     '12.5mm thk', 'Green face', 'Toilet, kitchen, wet areas', 'active', '{"ceiling","MR","wet"}', 'MAT-CL-003', null
  from public.dwl_resources r where r.code = 'M-CLG-003' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Fire-Rated Gypsum Ceiling', 'Suspended Ceiling', 'Architectural', 'Ceiling System',
     'Fire-rated board + tested framing', 'EN 520 / Fire tested', 'FR', 'Various', null, 'Various', 'Sheet',
     '15mm / 18mm', 'Pink / Red', 'Fire compartments', 'active', '{"ceiling","fire-rated"}', 'MAT-CL-004', null
  from public.dwl_resources r where r.code = 'M-CLG-004' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Cement Board Ceiling', 'Direct-Fixed / Suspended', 'Architectural', 'Ceiling System',
     'Cement board + metal framing', 'Local / ASTM', 'Standard', 'Various', null, 'Various', 'Sheet',
     '6–12mm', 'Grey', 'Wet / external / semi-external', 'active', '{"ceiling","cement board"}', 'MAT-CL-005', null
  from public.dwl_resources r where r.code = 'M-CLG-005' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Mineral Fiber Acoustic Tile', 'Suspended Ceiling', 'Architectural', 'Acoustic Ceiling',
     'T-grid + mineral fiber tiles', 'ASTM / Local', 'Acoustic', 'Armstrong / Equivalent', null, 'Armstrong / Local', 'Tile 600x600',
     '15–19mm', 'White / Textured', 'Office, school, hospital', 'active', '{"ceiling","acoustic","mineral fiber"}', 'MAT-CL-006', null
  from public.dwl_resources r where r.code = 'M-CLG-006' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Metal Lay-In Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Metal tiles + T-grid', 'Local / EN', 'Standard', 'Various', null, 'Various', 'Tile 600x600',
     '0.5–0.7mm', 'Powder coat / Anodised', 'Office, commercial', 'active', '{"ceiling","metal","lay-in"}', 'MAT-CL-007', null
  from public.dwl_resources r where r.code = 'M-CLG-007' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Metal Clip-In Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Clip-in system', 'Local', 'Standard', 'Various', null, 'Various', 'Panel',
     '0.5–0.8mm', 'Powder coat', 'Mall, airport, lobby', 'active', '{"ceiling","metal","clip-in"}', 'MAT-CL-008', null
  from public.dwl_resources r where r.code = 'M-CLG-008' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Metal Hook-On Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Hook-on system', 'Local', 'Standard', 'Various', null, 'Various', 'Panel',
     '0.6–1.0mm', 'Powder coat', 'Commercial, transport', 'active', '{"ceiling","metal","hook-on"}', 'MAT-CL-009', null
  from public.dwl_resources r where r.code = 'M-CLG-009' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Aluminium Linear Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Linear strip system', 'Local', 'Standard', 'Various', null, 'Various', 'Strip',
     'Various widths', 'Anodised / Powder', 'Lobby, corridor', 'active', '{"ceiling","aluminium","linear"}', 'MAT-CL-010', null
  from public.dwl_resources r where r.code = 'M-CLG-010' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Aluminium Strip Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Strip system', 'Local', 'Standard', 'Various', null, 'Various', 'Strip',
     'Various', 'Anodised', 'Commercial, exterior', 'active', '{"ceiling","aluminium","strip"}', 'MAT-CL-011', null
  from public.dwl_resources r where r.code = 'M-CLG-011' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Aluminium Baffle Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Baffle system', 'Local', 'Standard', 'Various', null, 'Various', 'Baffle',
     'Various heights', 'Powder / Anodised', 'Lobby, mall, airport', 'active', '{"ceiling","aluminium","baffle"}', 'MAT-CL-012', null
  from public.dwl_resources r where r.code = 'M-CLG-012' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Metal Baffle Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Independent baffle', 'Local', 'Standard', 'Various', null, 'Various', 'Baffle',
     'Various', 'Powder coat', 'Acoustic / open areas', 'active', '{"ceiling","metal","baffle"}', 'MAT-CL-013', null
  from public.dwl_resources r where r.code = 'M-CLG-013' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Open Cell / Open Grid Ceiling', 'Suspended Ceiling', 'Architectural', 'Open Ceiling',
     'Open cell modules', 'Local', 'Standard', 'Various', null, 'Various', 'Module',
     'Various cell sizes', 'Powder coat', 'Retail, office', 'active', '{"ceiling","open cell"}', 'MAT-CL-014', null
  from public.dwl_resources r where r.code = 'M-CLG-014' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Expanded Metal Ceiling', 'Suspended Ceiling', 'Architectural', 'Metal Ceiling',
     'Expanded metal', 'Local', 'Standard', 'Various', null, 'Various', 'Panel',
     'Various mesh', 'Powder / Galv', 'Industrial, commercial', 'active', '{"ceiling","expanded metal"}', 'MAT-CL-015', null
  from public.dwl_resources r where r.code = 'M-CLG-015' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'PVC Panel Ceiling', 'Direct-Fixed Ceiling', 'Architectural', 'Ceiling System',
     'PVC interlocking panels', 'Local', 'Standard', 'Various', null, 'Various', 'Panel',
     'Various widths', 'White / Coloured', 'Residential, wet areas', 'active', '{"ceiling","PVC"}', 'MAT-CL-016', null
  from public.dwl_resources r where r.code = 'M-CLG-016' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Wood Panel Ceiling', 'Suspended / Direct', 'Architectural', 'Timber Ceiling',
     'Wood panels', 'Local', 'Standard', 'Various', null, 'Various', 'Panel',
     'Various', 'Natural / Stained', 'Hotel, lobby', 'active', '{"ceiling","wood","panel"}', 'MAT-CL-017', null
  from public.dwl_resources r where r.code = 'M-CLG-017' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Wood Slat Ceiling', 'Suspended Ceiling', 'Architectural', 'Timber Ceiling',
     'Slat system', 'Local', 'Standard', 'Various', null, 'Various', 'Slat',
     'Various spacing', 'Natural / Stained', 'Acoustic / architectural', 'active', '{"ceiling","wood","slat"}', 'MAT-CL-018', null
  from public.dwl_resources r where r.code = 'M-CLG-018' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Acoustic Wood Ceiling', 'Suspended Ceiling', 'Architectural', 'Acoustic Ceiling',
     'Acoustic wood', 'Local / EN', 'Acoustic', 'Various', null, 'Various', 'Panel / Slat',
     'Various', 'Natural / Painted', 'Auditorium, office', 'active', '{"ceiling","acoustic","wood"}', 'MAT-CL-019', null
  from public.dwl_resources r where r.code = 'M-CLG-019' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Acoustic Fabric Ceiling', 'Suspended Ceiling', 'Architectural', 'Acoustic Ceiling',
     'Fabric acoustic', 'Local', 'Acoustic', 'Various', null, 'Various', 'Panel / Membrane',
     'Various', 'Fabric finish', 'Auditorium, meeting rooms', 'active', '{"ceiling","acoustic","fabric"}', 'MAT-CL-020', null
  from public.dwl_resources r where r.code = 'M-CLG-020' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Stretch Ceiling', 'Specialty Ceiling', 'Architectural', 'Specialty Ceiling',
     'Stretch membrane', 'Local / Manufacturer', 'Standard', 'Barrisol / Equivalent', null, 'Various', 'Membrane',
     'Custom', 'Matt / Gloss / Printed', 'Luxury interior', 'active', '{"ceiling","stretch"}', 'MAT-CL-021', null
  from public.dwl_resources r where r.code = 'M-CLG-021' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Decorative Feature Ceiling', 'Specialty Ceiling', 'Architectural', 'Specialty Ceiling',
     'Custom feature', 'Project specific', 'Custom', 'Various', null, 'Various', 'Custom',
     'Project specific', 'Various', 'Lobby, feature areas', 'active', '{"ceiling","decorative","feature"}', 'MAT-CL-022', null
  from public.dwl_resources r where r.code = 'M-CLG-022' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Acoustic Cloud Ceiling', 'Specialty Ceiling', 'Architectural', 'Acoustic Ceiling',
     'Acoustic clouds', 'Local / EN', 'Acoustic', 'Various', null, 'Various', 'Panel / No.',
     'Various shapes', 'Fabric / Painted', 'Office, auditorium', 'active', '{"ceiling","acoustic","cloud"}', 'MAT-CL-023', null
  from public.dwl_resources r where r.code = 'M-CLG-023' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Exposed Structure Ceiling', 'Exposed Ceiling', 'Architectural', 'Exposed Finish',
     'Exposed structure', 'Project specific', 'N/A', 'N/A', null, 'N/A', 'N/A',
     'N/A', 'Painted / Sealed', 'Industrial, modern office', 'active', '{"ceiling","exposed","structure"}', 'MAT-CL-024', null
  from public.dwl_resources r where r.code = 'M-CLG-024' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Exposed MEP Ceiling', 'Exposed Ceiling', 'Architectural / MEP', 'Exposed Finish',
     'Exposed MEP', 'Project specific', 'N/A', 'N/A', null, 'N/A', 'N/A',
     'N/A', 'Painted services', 'Industrial, retail, office', 'active', '{"ceiling","exposed","MEP"}', 'MAT-CL-025', null
  from public.dwl_resources r where r.code = 'M-CLG-025' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'GI Main Runner & Cross Tee System (T-Grid)', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'T24/T15 main & cross tees + hangers + wall angle', 'EN 13964 / Local', 'Standard', 'Various', null, 'Various', 'System',
     'T24 / T15', 'Galvanised / White', 'Mineral fiber, metal lay-in, gypsum tile', 'active', '{"ceiling","frame","t-grid","suspension"}', 'MAT-CL-FRAME-001', 'Often included in tile rate but tracked separately for analysis'
  from public.dwl_resources r where r.code = 'M-CLF-001' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Concealed Carrier / Clip-In Suspension', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Carrier channels + clips + hangers', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'System',
     'As specified', 'Galvanised', 'Metal clip-in ceilings', 'active', '{"ceiling","frame","clip-in","carrier"}', 'MAT-CL-FRAME-002', null
  from public.dwl_resources r where r.code = 'M-CLF-002' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Linear / Strip Carrier System', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Carrier channels + suspensions', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'System',
     'As specified', 'Galvanised / Aluminium', 'Aluminium linear & strip', 'active', '{"ceiling","frame","linear","carrier"}', 'MAT-CL-FRAME-003', null
  from public.dwl_resources r where r.code = 'M-CLF-003' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Baffle / Independent Suspension System', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Hangers + carriers for vertical/horizontal baffles', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'System',
     'As specified', 'Galvanised', 'Baffle ceilings', 'active', '{"ceiling","frame","baffle"}', 'MAT-CL-FRAME-004', null
  from public.dwl_resources r where r.code = 'M-CLF-004' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'GI Channel Framing (Gypsum Suspended)', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Main channel, furring channel, hangers, perimeter', 'Local / EN', 'Standard', 'Various', null, 'Various', 'System',
     'As specified', 'Galvanised', 'Gypsum board suspended ceilings', 'active', '{"ceiling","frame","gi","gypsum"}', 'MAT-CL-FRAME-005', 'Core framing for most gypsum suspended ceilings'
  from public.dwl_resources r where r.code = 'M-CLF-005' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Direct-Fixed / Soffit Framing', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Channels or battens direct fixed', 'Local', 'Standard', 'Various', null, 'Various', 'System',
     'As specified', 'Galvanised / Timber', 'Direct-fixed gypsum / cement board', 'active', '{"ceiling","frame","direct-fixed"}', 'MAT-CL-FRAME-006', null
  from public.dwl_resources r where r.code = 'M-CLF-006' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Perimeter Channel / Wall Angle', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Wall angle, perimeter channel, shadow gap', 'Local', 'Standard', 'Various', null, 'Various', 'Length',
     'As specified', 'Galvanised / Painted', 'All suspended ceiling types', 'active', '{"ceiling","frame","perimeter","wall angle"}', 'MAT-CL-FRAME-007', 'Usually measured in linear metres'
  from public.dwl_resources r where r.code = 'M-CLF-007' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Primary Hanger / Suspension Rod System', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Rod + cleat + adjustment', 'Local', 'Standard', 'Various', null, 'Various', 'Set / No.',
     'As specified', 'Galvanised', 'Heavy or high-level ceilings', 'active', '{"ceiling","frame","hanger","rod"}', 'MAT-CL-FRAME-008', null
  from public.dwl_resources r where r.code = 'M-CLF-008' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Open Cell / Grid Module Suspension', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Module hangers + grid support', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'System',
     'As specified', 'Galvanised', 'Open cell, expanded metal', 'active', '{"ceiling","frame","open cell"}', 'MAT-CL-FRAME-009', null
  from public.dwl_resources r where r.code = 'M-CLF-009' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Stretch Ceiling Perimeter Track', 'Ceiling Frame / Suspension', 'Architectural', 'Ceiling Frame',
     'Aluminium or PVC perimeter track', 'Manufacturer', 'Standard', 'Barrisol / Equivalent', null, 'Various', 'Length',
     'As specified', 'White / Coloured', 'Stretch ceilings', 'active', '{"ceiling","frame","stretch","track"}', 'MAT-CL-FRAME-010', 'Critical component of stretch ceiling system'
  from public.dwl_resources r where r.code = 'M-CLF-010' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Standard Access Panel (Gypsum / Metal)', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Gypsum or metal faced, various sizes', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'No.',
     '300x300 to 600x600 typical', 'White / Matching', 'General inspection access', 'active', '{"ceiling","access panel","hatch"}', 'MAT-CL-ACC-001', 'Most common access panel type'
  from public.dwl_resources r where r.code = 'M-CLA-001' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Fire-Rated Access Panel', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Intumescent seal, fire-rated board/core', 'Fire Test Report', 'FR', 'Various', null, 'Various', 'No.',
     'As tested size', 'As specified', 'Fire compartments, escape routes', 'active', '{"ceiling","access panel","fire-rated"}', 'MAT-CL-ACC-002', 'Must match ceiling fire rating'
  from public.dwl_resources r where r.code = 'M-CLA-002' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Acoustic Access Panel', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Sealed, acoustic core or lining', 'Local / Acoustic test', 'Acoustic', 'Various', null, 'Various', 'No.',
     'As specified', 'Matching finish', 'Acoustic ceilings, meeting rooms', 'active', '{"ceiling","access panel","acoustic"}', 'MAT-CL-ACC-003', null
  from public.dwl_resources r where r.code = 'M-CLA-003' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Metal Lay-In Access Tile / Panel', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Same finish as surrounding tiles', 'Manufacturer', 'Standard', 'Various', null, 'Various', 'No.',
     '600x600 typical', 'Matching metal finish', 'Metal lay-in ceilings', 'active', '{"ceiling","access panel","metal","lay-in"}', 'MAT-CL-ACC-004', null
  from public.dwl_resources r where r.code = 'M-CLA-004' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Hinged Access Door (Lockable)', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Metal or gypsum faced, key or tool lock', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'No.',
     'As specified', 'White / Matching', 'Plant rooms, secure areas', 'active', '{"ceiling","access panel","hinged","lockable"}', 'MAT-CL-ACC-005', null
  from public.dwl_resources r where r.code = 'M-CLA-005' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Push-Up / Lift-Out Access Panel', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Removable panel resting on frame', 'Local', 'Standard', 'Various', null, 'Various', 'No.',
     'As specified', 'Matching', 'Low-traffic ceilings', 'active', '{"ceiling","access panel","lift-out"}', 'MAT-CL-ACC-006', null
  from public.dwl_resources r where r.code = 'M-CLA-006' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Circular / Specialty Shape Access Panel', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Circular, oval or custom shape', 'Manufacturer / Custom', 'Custom', 'Various', null, 'Various', 'No.',
     'Custom', 'Matching / Feature', 'Feature ceilings, lobbies', 'active', '{"ceiling","access panel","circular","specialty"}', 'MAT-CL-ACC-007', null
  from public.dwl_resources r where r.code = 'M-CLA-007' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Access Panel with Smoke Seal / Gasket', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     'Gasketed frame and panel', 'Local / Manufacturer', 'Sealed', 'Various', null, 'Various', 'No.',
     'As specified', 'Matching', 'Smoke compartments, clean rooms', 'active', '{"ceiling","access panel","smoke seal"}', 'MAT-CL-ACC-008', null
  from public.dwl_resources r where r.code = 'M-CLA-008' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Ceiling Trap Door / Larger Access Hatch', 'Ceiling Accessories', 'Architectural', 'Access Panel',
     '600x600 or larger, often hinged', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'No.',
     '600x600 and above', 'Matching', 'AHU, major MEP access', 'active', '{"ceiling","access panel","trap door","large"}', 'MAT-CL-ACC-009', null
  from public.dwl_resources r where r.code = 'M-CLA-009' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
  insert into public.dwl_material_attributes
    (resource_id, tenant_id, material_name, subcategory, discipline, material_type,
     tech_spec_summary, standard, grade, brand, model, manufacturer, package_size,
     dimension, color_finish, application_element, lifecycle_status, tags, legacy_code, notes)
  select r.id, v_tenant, 'Shadow Gap / Feature Trim Accessory', 'Ceiling Accessories', 'Architectural', 'Ceiling Accessory',
     'Extruded or formed profiles', 'Local / Manufacturer', 'Standard', 'Various', null, 'Various', 'Length',
     'As specified', 'Matching / Contrast', 'Architectural detailing', 'active', '{"ceiling","accessory","shadow gap","trim"}', 'MAT-CL-ACC-010', 'Usually measured in linear metres'
  from public.dwl_resources r where r.code = 'M-CLA-010' and r.tenant_id = v_tenant
  on conflict (resource_id) do nothing;
end $$;
