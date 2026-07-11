-- Seed data for Budget Code master classification.
-- Source: the firm's standard elemental cost classification (A.00-Z.70), reused per tender.
-- Descriptions are kept verbatim from the source classification (including its original wording).

insert into public.budget_code_groups (code_letter, name, sort_order) values
  ('A', 'Early Work', 1),
  ('B', 'Structure (Sub / Super)', 2),
  ('C', 'Architecture', 3),
  ('D', 'Interior Finish', 4),
  ('E', 'Fittings, Furnishings & Equipment', 5),
  ('F', 'Services (MEP)', 6),
  ('G', 'External Work', 7),
  ('X', 'Authority, Insurance & Permits', 8),
  ('Z', 'Preliminaries & Contractor''s Overhead', 9)
on conflict (code_letter) do nothing;

-- code_level 2 rows (X.NN pattern), parent_code_id NULL
insert into public.budget_codes (code, code_letter, parent_code_id, code_level, description, sort_order) values
  ('A.00', 'A', null, 2, 'Early Work', 1),
  ('A.01', 'A', null, 2, 'Topography Survey', 2),
  ('A.02', 'A', null, 2, 'Soil Investigation', 3),
  ('A.03', 'A', null, 2, 'Mine / UXO Clearance', 4),
  ('A.04', 'A', null, 2, 'Soil Leveling', 5),
  ('A.05', 'A', null, 2, 'Demolition', 6),
  ('A.06', 'A', null, 2, 'Cleaning', 7),
  ('A.07', 'A', null, 2, 'Repair exiting services', 8),
  ('A.08', 'A', null, 2, 'Renovation', 9),
  ('B.00', 'B', null, 2, 'Sub Structure', 10),
  ('B.01', 'B', null, 2, 'Piling Work', 11),
  ('B.02', 'B', null, 2, 'Basement', 12),
  ('B.03', 'B', null, 2, 'Ground Floor', 13),
  ('B.04', 'B', null, 2, 'Super structure', 14),
  ('C.00', 'C', null, 2, 'Architecture', 15),
  ('C.01', 'C', null, 2, 'Exterior Wall and Partition', 16),
  ('C.02', 'C', null, 2, 'Exterior Wall Finishes', 17),
  ('C.03', 'C', null, 2, 'Exterior Door', 18),
  ('C.04', 'C', null, 2, 'Exterior Window and Louver', 19),
  ('C.05', 'C', null, 2, 'Exterior floor', 20),
  ('C.06', 'C', null, 2, 'Exterior soffit', 21),
  ('C.07', 'C', null, 2, 'Exterior Stair Ramp', 22),
  ('C.08', 'C', null, 2, 'Roofing', 23),
  ('C.09', 'C', null, 2, 'Interior Wall and Partition', 24),
  ('C.10', 'C', null, 2, 'Interior Doors', 25),
  ('C.11', 'C', null, 2, 'Special installation', 26),
  ('C.12', 'C', null, 2, 'Exterior Finishes', 27),
  ('D.00', 'D', null, 2, 'Interior Finish', 28),
  ('D.01', 'D', null, 2, 'Interior Wall Finishes', 29),
  ('D.02', 'D', null, 2, 'Interior Floor Finishes', 30),
  ('D.03', 'D', null, 2, 'Ceiling Finishes', 31),
  ('E.00', 'E', null, 2, 'Fittings, furnishings and equipment', 32),
  ('E.01', 'E', null, 2, 'General Fitting', 33),
  ('E.02', 'E', null, 2, 'Domestic Kitchen Fitting', 34),
  ('E.03', 'E', null, 2, 'Special purpose Fitting', 35),
  ('E.04', 'E', null, 2, 'Signage', 36),
  ('E.05', 'E', null, 2, 'Art', 37),
  ('E.06', 'E', null, 2, 'Non-Mechanical and Non Electrical Equipement', 38),
  ('E.07', 'E', null, 2, 'Internal Planting', 39),
  ('E.08', 'E', null, 2, 'Bird and Vermin Control', 40),
  ('F.00', 'F', null, 2, 'Services', 41),
  ('F.01', 'F', null, 2, 'Sanitary Installations', 42),
  ('F.02', 'F', null, 2, 'AIR-CONDITIONAL SYSTEM', 43),
  ('F.03', 'F', null, 2, 'MECHANICAL VENTILATION SYSTEM', 44),
  ('F.04', 'F', null, 2, 'MV DISTRIBUTION SYSTEM', 45),
  ('F.05', 'F', null, 2, 'ELECTRICAL SYSTEM', 46),
  ('F.06', 'F', null, 2, 'ELV INSTALLATION', 47),
  ('F.07', 'F', null, 2, 'PLUMBING SYSTEM', 48),
  ('F.08', 'F', null, 2, 'FIRE FIGHTING SYSTEM', 49),
  ('F.09', 'F', null, 2, 'Specialist Installations', 50),
  ('F.10', 'F', null, 2, 'VERTICAL TRANSPORTATION SYSTEM', 51),
  ('G.00', 'G', null, 2, 'External Work', 52),
  ('G.01', 'G', null, 2, 'Site preparation', 53),
  ('G.02', 'G', null, 2, 'Roads, path, paveing Surfacing', 54),
  ('G.03', 'G', null, 2, 'Land scape', 55),
  ('G.04', 'G', null, 2, 'Fence Railing wall', 56),
  ('G.05', 'G', null, 2, 'Exteranal Fixture', 57),
  ('X.00', 'X', null, 2, 'AUTHORITY RELATED , INSURANCE', 58),
  ('X.01', 'X', null, 2, 'CONSTRUCTION PERMIT, OPEN SITE AND CLOSE SITE PERMITS', 59),
  ('X.02', 'X', null, 2, 'CAR Insurance + DLP Insurance', 60),
  ('X.03', 'X', null, 2, 'DLP 24 Month Budget', 61),
  ('X.04', 'X', null, 2, 'E.I.A', 62),
  ('Z.00', 'Z', null, 2, 'CONTRACTOR''S PRELIMINARIES / DESIGN / OTHERS', 63),
  ('Z.01', 'Z', null, 2, 'Temporary Works', 64),
  ('Z.50', 'Z', null, 2, 'Design expenses', 75),
  ('Z.70', 'Z', null, 2, 'Risks and Opportunities', 76)
on conflict (code) do nothing;

-- code_level 3 rows under Z.01 (Temporary Works)
insert into public.budget_codes (code, code_letter, parent_code_id, code_level, description, sort_order)
select v.code, 'Z', p.id, 3, v.description, v.sort_order
from (values
  ('Z.01.01', 'Site Preparation', 65),
  ('Z.01.02', 'General Protection', 66),
  ('Z.01.03', 'Temporary Building', 67),
  ('Z.01.04', 'Temporary site labor', 68),
  ('Z.01.05', 'Machinery', 69),
  ('Z.01.06', 'Light equiment hand tools', 70),
  ('Z.01.07', 'Temporary Elecrical Plumbing Drainage', 71),
  ('Z.01.08', 'Safe and environment control', 72)
) as v(code, description, sort_order)
join public.budget_codes p on p.code = 'Z.01'
on conflict (code) do nothing;

-- code_level 3 rows for Z.30.xx (site overhead / payroll expenses) — no explicit Z.30 parent
-- exists in the source classification, so these are kept parentless under the Z group.
insert into public.budget_codes (code, code_letter, parent_code_id, code_level, description, sort_order) values
  ('Z.30.01', 'Z', null, 3, 'Foreign Country Employee', 73),
  ('Z.30.02', 'Z', null, 3, 'Local Country employee', 73),
  ('Z.30.03', 'Z', null, 3, 'Other personnel', 73),
  ('Z.30.04', 'Z', null, 3, 'Welfare expense', 73),
  ('Z.30.05', 'Z', null, 3, 'office supplies expenses', 73),
  ('Z.30.06', 'Z', null, 3, 'Communication & Travel expense', 73),
  ('Z.30.07', 'Z', null, 3, 'Social expense', 73),
  ('Z.30.08', 'Z', null, 3, 'Taxes & Public imposition', 73),
  ('Z.30.09', 'Z', null, 3, 'Meeting expense', 73),
  ('Z.30.10', 'Z', null, 3, 'Miscellaneous expense', 74)
on conflict (code) do nothing;
