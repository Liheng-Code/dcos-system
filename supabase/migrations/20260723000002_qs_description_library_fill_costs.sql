-- Migration: 20260723000002_qs_description_library_fill_costs.sql
-- Purpose: Fill all unpriced qs_description_library rows with Cambodia market rates
--          (Phnom Penh, Q2-2026 USD, ex. 10% VAT). Sets in_price_list=true,
--          current_rate=<rate>, and category='material'/'labor'.
-- Depends on: public.qs_description_library, public.qs_element_library
-- Source: RLB Singapore, CPAC/Chip Mong supplier lists, JICA, Scribd BOQs,
--         Cibes Lift, Liumeng MEP, Arcadis Asia-Pacific, market research.

BEGIN;

-- =====================================================================
-- CIVIL & STRUCTURE: Site Preparation & Earthwork
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 0.35, category = 'material'
WHERE in_price_list = false AND description = 'Site clearing, grubbing and removal of vegetation and debris off site';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Bulk excavation by machine incl. trimming and levelling of formation';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.00, category = 'material'
WHERE in_price_list = false AND description = 'Backfilling with approved material in 200mm layers incl. compaction to 95% MDD';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.00, category = 'material'
WHERE in_price_list = false AND description = 'Cart away surplus excavated material off site incl. tipping fee';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.40, category = 'material'
WHERE in_price_list = false AND description = 'Compaction of formation to 95% MDD incl. watering and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'material'
WHERE in_price_list = false AND description = 'Dewatering incl. pumps, sump pits, piping and maintenance during construction';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1200.00, category = 'labor'
WHERE in_price_list = false AND description = 'Setting out, levelling and establishment of benchmarks and grid lines';

-- =====================================================================
-- CIVIL & STRUCTURE: Shoring & Sheet Pile
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 950.00, category = 'material'
WHERE in_price_list = false AND description = 'Supply of steel sheet pile, hot rolled section as per design';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 250.00, category = 'labor'
WHERE in_price_list = false AND description = 'Driving of steel sheet pile to required depth incl. plant and equipment';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'labor'
WHERE in_price_list = false AND description = 'Extraction of steel sheet pile and making good of voids';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1800.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel strut and waler incl. fabrication, installation and removal';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Ground anchor incl. drilling, grouting, stressing and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 185.00, category = 'material'
WHERE in_price_list = false AND description = 'Reinforced concrete guide wall incl. concrete, rebar and formwork';

-- =====================================================================
-- CIVIL & STRUCTURE: Bored Pile (special items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Bored piling D1000mm incl. boring, casing and disposal of spoil';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 65.00, category = 'material'
WHERE in_price_list = false AND description = 'Bored piling D800mm incl. boring, casing and disposal of spoil';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28.00, category = 'material'
WHERE in_price_list = false AND description = 'Bentonite / polymer slurry incl. mixing, circulation and disposal';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 220.00, category = 'labor'
WHERE in_price_list = false AND description = 'Pile Integrity Test (PIT)';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 750.00, category = 'labor'
WHERE in_price_list = false AND description = 'Dynamic pile load test (PDA)';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5500.00, category = 'labor'
WHERE in_price_list = false AND description = 'Static pile load test to 200% design working load';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Concrete cube / cylinder test as per specification';

-- =====================================================================
-- CIVIL & STRUCTURE: Driven Pile / Micro Pile
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 16.00, category = 'material'
WHERE in_price_list = false AND description = 'Supply of precast / spun pile as per design section';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'labor'
WHERE in_price_list = false AND description = 'Driving of precast / spun pile to required set incl. plant';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'labor'
WHERE in_price_list = false AND description = 'Pile splicing by full penetration weld incl. splice plate';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'labor'
WHERE in_price_list = false AND description = 'Pile head cutting and trimming to required cut-off level';

-- =====================================================================
-- CIVIL & STRUCTURE: Common items (Concrete 25Mpa, 30Mpa, RB6, Formwork)
-- These repeat across multiple sub-sections; UPDATE targets ALL unpriced rows.
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 75.00, category = 'material'
WHERE in_price_list = false AND description = 'Normal Concrete, 25Mpa (Cylinder), Slump 10+-2.5';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 79.00, category = 'material'
WHERE in_price_list = false AND description = 'Normal Concrete, 30Mpa (Cylinder), Slump 13+-2.5';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 0.70, category = 'material'
WHERE in_price_list = false AND description = 'Round Bar, RB6(fy=250 Mpa)';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'labor'
WHERE in_price_list = false AND description = 'Formwork to curved / special shape incl. erection and striking';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'labor'
WHERE in_price_list = false AND description = 'Formwork, plywood 18mm thk. incl. erection, bracing, oiling and striking';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Cementitious waterproofing, 2 coats, to wet area incl. up-turn 300mm';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1.20, category = 'material'
WHERE in_price_list = false AND description = 'Polyethylene vapour barrier 0.15mm thk. laid with 300mm laps';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3.50, category = 'material'
WHERE in_price_list = false AND description = 'Protection board 6mm thk. to waterproofing membrane';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.00, category = 'material'
WHERE in_price_list = false AND description = 'Dimpled HDPE drainage board with filter fabric';

-- =====================================================================
-- CIVIL & STRUCTURE: Super Structure special items
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1.20, category = 'labor'
WHERE in_price_list = false AND description = 'Column starter bar incl. bending, fixing and tying';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Non-shrink cementitious grout to base plate / gap';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Post-tension strand incl. duct, anchorage, stressing and grouting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Galvanised steel deck 0.75mm thk. incl. shear stud and end closure';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 11.50, category = 'material'
WHERE in_price_list = false AND description = 'Structural steel section (H/I beam) SS400 incl. fabrication and erection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.80, category = 'material'
WHERE in_price_list = false AND description = 'Steel purlin C-channel incl. fabrication, erection and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 7.50, category = 'material'
WHERE in_price_list = false AND description = 'Steel bracing member incl. fabrication, erection and connection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.50, category = 'material'
WHERE in_price_list = false AND description = 'Steel base plate incl. drilling, welding and levelling';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3.50, category = 'material'
WHERE in_price_list = false AND description = 'Anchor bolt incl. template, setting and grouting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1.80, category = 'material'
WHERE in_price_list = false AND description = 'High tensile bolt, nut and washer grade 8.8';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.50, category = 'labor'
WHERE in_price_list = false AND description = 'Site welding incl. electrode, preparation and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1.80, category = 'material'
WHERE in_price_list = false AND description = 'Anti-corrosive primer and 2 coats finish paint to steelwork';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Hot dip galvanizing to steelwork, 85 micron minimum';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Intumescent fire protection coating to steelwork, 2 hour rating';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.50, category = 'material'
WHERE in_price_list = false AND description = 'Steel roof truss incl. fabrication, erection and connection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 150.00, category = 'labor'
WHERE in_price_list = false AND description = 'Non-destructive test (rebound hammer / ultrasonic) as per specification';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1500.00, category = 'labor'
WHERE in_price_list = false AND description = 'Setting out, survey and as-built record';

-- =====================================================================
-- ARCHITECTURE: Exterior Wall and Partition
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.50, category = 'labor'
WHERE in_price_list = false AND description = 'Hollow clay brick, thickness 100mm, laid in cement:sand mortar 1:4';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.50, category = 'labor'
WHERE in_price_list = false AND description = 'Hollow clay brick, thickness 200mm, laid in cement:sand mortar 1:4';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.50, category = 'labor'
WHERE in_price_list = false AND description = 'concrete block, thickness 100mm, laid in cement:sand mortar 1:4';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 7.50, category = 'labor'
WHERE in_price_list = false AND description = 'concrete block, thickness 150mm, laid in cement:sand mortar 1:4';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'labor'
WHERE in_price_list = false AND description = 'concrete block, thickness 200mm, laid in cement:sand mortar 1:4';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'labor'
WHERE in_price_list = false AND description = 'AAC lightweight block 100mm thk. laid in thin-bed adhesive mortar';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 11.00, category = 'labor'
WHERE in_price_list = false AND description = 'AAC lightweight block 150mm thk. laid in thin-bed adhesive mortar';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 14.00, category = 'labor'
WHERE in_price_list = false AND description = 'AAC lightweight block 200mm thk. laid in thin-bed adhesive mortar';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Precast concrete wall panel incl. lifting, setting and jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Panel joint backer rod and weatherproof silicone sealant';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'External façade';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium curtain wall system with 8mm tempered glass incl. framing and sealant';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium composite panel 4mm, PVDF finish, incl. sub-frame and sealant';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 65.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium louver screen incl. sub-frame and fixing';

-- =====================================================================
-- ARCHITECTURE: Exterior Wall Finishes
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.00, category = 'labor'
WHERE in_price_list = false AND description = '15mm cement plaster';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.00, category = 'labor'
WHERE in_price_list = false AND description = 'Skim coat, 2 coats, sanded ready to receive paint';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.50, category = 'labor'
WHERE in_price_list = false AND description = 'Cement molding / cornice incl. forming and finishing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.50, category = 'labor'
WHERE in_price_list = false AND description = 'Painting, primer + 2 coats emulsion (interior)';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.00, category = 'labor'
WHERE in_price_list = false AND description = 'Painting, primer + 2 coats weather-shield (exterior)';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1.20, category = 'material'
WHERE in_price_list = false AND description = 'Alkali resistant primer, 1 coat';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'labor'
WHERE in_price_list = false AND description = 'Weather-shield exterior coating, primer + 2 coats';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Natural stone cladding incl. adhesive, anchor and pointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Expansion joint incl. backer rod, sealant and cover profile';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Weatherproof silicone sealant incl. backer rod';

-- =====================================================================
-- ARCHITECTURE: Exterior Doors (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 180.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel Door, W:900,H:2100mm incl. frame, ironmongery and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 350.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire rated steel door 2 hour incl. frame, closer and panic bar';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 300.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium framed door with 6mm tempered glass incl. ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 380.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium sliding door with 6mm tempered glass incl. track and ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 380.00, category = 'material'
WHERE in_price_list = false AND description = 'Frameless tempered glass door 12mm incl. floor spring and patch fitting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 320.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium framed glass door incl. ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Galvanised steel rolling shutter incl. guide rail and lock';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 280.00, category = 'material'
WHERE in_price_list = false AND description = 'Roller shutter motor and control panel incl. wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'material'
WHERE in_price_list = false AND description = 'Mortice lockset, stainless steel lever handle';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Overhead door closer, adjustable';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel butt hinge 100mm';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Floor / wall mounted door stopper';

-- =====================================================================
-- ARCHITECTURE: Exterior Window and Louver
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 38.00, category = 'material'
WHERE in_price_list = false AND description = 'Windoor Aluminium frame with 6mm tempered glass, fix + slide panel';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 30.00, category = 'material'
WHERE in_price_list = false AND description = 'Windoor Aluminium frame with 6mm tempered glass, fix panel';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 30.00, category = 'material'
WHERE in_price_list = false AND description = 'Fixed aluminium window with 6mm tempered glass incl. sealant';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 42.00, category = 'material'
WHERE in_price_list = false AND description = 'Sliding aluminium window with 6mm tempered glass incl. track and lock';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 52.00, category = 'material'
WHERE in_price_list = false AND description = 'Casement aluminium window with 6mm glass incl. friction stay';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium louver incl. frame and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel louver incl. frame, fixing and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel window grille incl. painting and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium frame mosquito / insect screen';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Weatherproof silicone sealant incl. backer rod';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'labor'
WHERE in_price_list = false AND description = 'Cement / stone window sill incl. forming and finishing';

-- =====================================================================
-- ARCHITECTURE: Exterior Floor, Soffit, Stair Ramp
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.00, category = 'labor'
WHERE in_price_list = false AND description = 'Cement:sand screed 1:3, 40mm thk. steel trowel finish';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3.50, category = 'material'
WHERE in_price_list = false AND description = 'Non-metallic floor hardener 3kg/m2 incl. power trowel finish';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 7.50, category = 'labor'
WHERE in_price_list = false AND description = 'Floor tile Size 0.3x0.3m incl. adhesive and grout';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.50, category = 'labor'
WHERE in_price_list = false AND description = 'Floor tile Size 0.6x0.6m incl. adhesive and grout';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 9.50, category = 'labor'
WHERE in_price_list = false AND description = 'Anti-slip ceramic tile incl. adhesive and grout';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.00, category = 'labor'
WHERE in_price_list = false AND description = 'Protection screed 40mm thk. to waterproofing membrane';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Soffit cladding board incl. sub-frame and jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 14.00, category = 'labor'
WHERE in_price_list = false AND description = 'Stair tread and riser tile / stone finish incl. adhesive';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'labor'
WHERE in_price_list = false AND description = 'Ramp anti-slip floor finish incl. adhesive and grout';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.50, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium stair nosing with anti-slip insert';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Tactile warning paving for accessibility incl. adhesive';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 55.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel / glass balustrade H=1.1m incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel guard rail incl. fabrication, painting and fixing';

-- =====================================================================
-- ARCHITECTURE: Roofing (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.50, category = 'material'
WHERE in_price_list = false AND description = 'Metal roof sheet 0.47mm thk. colour coated incl. fixing accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'material'
WHERE in_price_list = false AND description = 'Concrete / clay roof tile incl. batten, ridge and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Translucent polycarbonate roof sheet incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.00, category = 'material'
WHERE in_price_list = false AND description = 'Colour coated ridge cap incl. sealing and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 7.50, category = 'material'
WHERE in_price_list = false AND description = 'Torch-on bituminous waterproofing membrane 3mm incl. primer and up-turn';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.50, category = 'material'
WHERE in_price_list = false AND description = 'Roof thermal insulation, glasswool 50mm with foil facing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1.20, category = 'material'
WHERE in_price_list = false AND description = 'Vapour barrier; supply and install complete incl. all accessories, jointing and making good.';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Colour coated metal gutter incl. bracket and outlet';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'uPVC downpipe incl. bracket, bend and shoe';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Cast iron / uPVC roof drain with dome grating';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Skylight with laminated glass incl. aluminium frame and flashing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Roof access hatch incl. frame, cover and lock';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 180.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel cat ladder incl. safety hoop and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Lightning air terminal base incl. fixing to roof structure';

-- =====================================================================
-- ARCHITECTURE: Interior Wall and Partition
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Gypsum board partition 2x12mm both sides on 76mm metal stud incl. jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28.00, category = 'material'
WHERE in_price_list = false AND description = 'Fibre cement board partition 2x9mm both sides on metal stud incl. jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.50, category = 'material'
WHERE in_price_list = false AND description = 'Galvanised metal stud and track framing at 600mm c/c';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Rockwool acoustic infill 50mm thk. density 60kg/m3 to partition cavity';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 75.00, category = 'material'
WHERE in_price_list = false AND description = 'Frameless tempered glass partition 12mm thk. incl. patch fitting and sealant';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 55.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium framed glass partition with 8mm tempered glass';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Toilet cubicle, compact laminate 12mm thk. incl. door, hardware and pilaster';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Urinal divider, compact laminate 12mm thk. incl. bracket';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'material'
WHERE in_price_list = false AND description = 'Wall mounted guard rail / crash rail incl. bracket and fixing';

-- =====================================================================
-- ARCHITECTURE: Interior Doors (unpriced items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 180.00, category = 'material'
WHERE in_price_list = false AND description = 'Double leaf wood door, W:1600,H:2100mm incl. frame and ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 110.00, category = 'material'
WHERE in_price_list = false AND description = 'Wood door, W:800,H:2100mm incl. frame, ironmongery and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 135.00, category = 'material'
WHERE in_price_list = false AND description = 'Wood door, W:900,H:2100mm incl. frame, ironmongery and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 165.00, category = 'material'
WHERE in_price_list = false AND description = 'Solid core timber door with laminate finish incl. frame and ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'PVC door, W:700,H:2000mm incl. frame and ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 40.00, category = 'material'
WHERE in_price_list = false AND description = 'PVC door, W:800,H:2000mm incl. frame and ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'PVC door, W:900,H:2000mm incl. frame and ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 155.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel Door, W:900,H:2100mm incl. frame, ironmongery and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 280.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire rated door 1 hour, steel, incl. frame, closer and ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 300.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium framed door with 6mm tempered glass incl. ironmongery';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 320.00, category = 'material'
WHERE in_price_list = false AND description = 'Tempered glass door 12mm thk. incl. patch fitting and floor spring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Panic exit device / push bar to fire escape door';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 42.00, category = 'material'
WHERE in_price_list = false AND description = 'Interior aluminium framed glass window with 6mm glass';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 30.00, category = 'material'
WHERE in_price_list = false AND description = 'Interior aluminium louver incl. frame';

-- =====================================================================
-- ARCHITECTURE: Special installation
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2500.00, category = 'material'
WHERE in_price_list = false AND description = 'LPG gas piping system incl. regulator, valve and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1800.00, category = 'material'
WHERE in_price_list = false AND description = 'Laboratory gas outlet point incl. piping, valve and testing';

-- =====================================================================
-- ARCHITECTURE: Interior Wall Finishes (unpriced items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'labor'
WHERE in_price_list = false AND description = 'Toilet Wall tile Size 0.3x0.6m incl. adhesive and grout';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Decorative wall cladding panel incl. sub-frame and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Acoustic wall panel incl. sub-frame and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.50, category = 'material'
WHERE in_price_list = false AND description = 'Vinyl wallpaper incl. adhesive and surface preparation';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Silver mirror 5mm thk. incl. backing and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'labor'
WHERE in_price_list = false AND description = 'Tile / cement skirting 100mm high incl. adhesive and grout';

-- =====================================================================
-- ARCHITECTURE: Interior Floor Finishes (unpriced items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.00, category = 'labor'
WHERE in_price_list = false AND description = 'Self-levelling screed 5mm thk. to receive floor finish';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 14.96, category = 'labor'
WHERE in_price_list = false AND description = 'Toilet Floor tile Size 0.3x0.3m, anti-slip, incl. adhesive and grout';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 16.00, category = 'labor'
WHERE in_price_list = false AND description = 'Homogeneous tile 600x600mm incl. adhesive and grout';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28.00, category = 'material'
WHERE in_price_list = false AND description = 'Marble slab flooring 20mm thk. incl. bedding, polishing and sealing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 32.00, category = 'material'
WHERE in_price_list = false AND description = 'Granite slab flooring 20mm thk. incl. bedding and polishing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Homogeneous vinyl sheet flooring 2mm thk. incl. adhesive and welding rod';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Epoxy floor coating, self-levelling 2mm thk. incl. primer';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'material'
WHERE in_price_list = false AND description = 'Engineered timber flooring incl. underlay and skirting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'material'
WHERE in_price_list = false AND description = 'Carpet tile 500x500mm incl. adhesive';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Raised access floor 600x600mm panel incl. pedestal';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium floor trim / divider strip';

-- =====================================================================
-- ARCHITECTURE: Ceiling Finishes (ALL unpriced items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 7.60, category = 'labor'
WHERE in_price_list = false AND description = 'Gypsum board ceiling 9mm thk. on metal furring incl. jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 9.00, category = 'labor'
WHERE in_price_list = false AND description = 'Fibre cement board ceiling 4.5mm thk. on metal furring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.50, category = 'labor'
WHERE in_price_list = false AND description = 'Acoustic ceiling tile 600x600mm on exposed T-grid';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'labor'
WHERE in_price_list = false AND description = 'Mineral fibre ceiling board 600x1200mm on T-grid system';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'material'
WHERE in_price_list = false AND description = 'Aluminium strip ceiling incl. carrier and trim';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'material'
WHERE in_price_list = false AND description = 'Metal open grid ceiling incl. suspension system';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Ceiling access panel 600x600mm incl. frame and lock';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.50, category = 'labor'
WHERE in_price_list = false AND description = 'Gypsum cornice incl. fixing and jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 14.00, category = 'labor'
WHERE in_price_list = false AND description = 'Ceiling bulkhead incl. framing, board and jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.50, category = 'labor'
WHERE in_price_list = false AND description = 'Ceiling painting, primer + 2 coats emulsion';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'labor'
WHERE in_price_list = false AND description = 'Curtain box / pelmet incl. framing and finishing';

-- =====================================================================
-- ARCHITECTURE: Fittings, Furnishings and Equipment
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Toilet accessories set: paper holder, soap dispenser, coat hook, grab bar';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 150.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel locker unit incl. lock and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Melamine faced shelving incl. bracket and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Roller blind / curtain incl. track and bracket';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 65.00, category = 'material'
WHERE in_price_list = false AND description = 'Magnetic white board incl. frame and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 180.00, category = 'material'
WHERE in_price_list = false AND description = 'Kitchen cabinet, melamine faced carcass incl. hardware';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 95.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel sink incl. tap, waste and P-trap';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'Laboratory bench with chemical resistant top incl. base cabinet';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Library shelving unit incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 500.00, category = 'material'
WHERE in_price_list = false AND description = 'Sport / gymnasium equipment as per schedule';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 150.00, category = 'material'
WHERE in_price_list = false AND description = 'Signage';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Wayfinding directional sign incl. frame and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Room identification sign incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Statutory / safety signage incl. fixing';

-- =====================================================================
-- MEP: Sanitary Installations (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 90.00, category = 'material'
WHERE in_price_list = false AND description = 'Water closet, close-couple, vitreous china, incl. seat cover, cistern and connector';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 75.00, category = 'material'
WHERE in_price_list = false AND description = 'Wash basin, vitreous china, incl. tap, bottle trap, waste and bracket';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 95.00, category = 'material'
WHERE in_price_list = false AND description = 'Urinal, vitreous china, incl. flush valve, waste and bracket';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Shower set incl. mixer, riser rail, hand shower and hose';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Squat pan incl. flush pipe, connector and floor fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 65.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel sink incl. tap, waste and P-trap';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Chromed brass tap / faucet incl. connector';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28.00, category = 'material'
WHERE in_price_list = false AND description = 'Flush valve, exposed type, incl. connector';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'material'
WHERE in_price_list = false AND description = 'Chromed brass angle valve incl. flexible connector';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 10.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel floor drain with removable grating';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Floor trap with water seal incl. grating';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.00, category = 'material'
WHERE in_price_list = false AND description = 'Clean out / rodding eye incl. cover';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel toilet paper holder incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Wall mounted soap dispenser incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel grab bar for accessible toilet incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Electric hand dryer incl. wiring connection';

-- =====================================================================
-- MEP: Air-Conditioning System (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 550.00, category = 'material'
WHERE in_price_list = false AND description = 'Wall mounted split type air conditioner incl. indoor unit, bracket and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'material'
WHERE in_price_list = false AND description = 'Ceiling cassette type air conditioner incl. panel and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'Outdoor condensing unit incl. base, anti-vibration mount and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 650.00, category = 'material'
WHERE in_price_list = false AND description = 'VRF indoor unit incl. drain pump, control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'VRF outdoor unit incl. base, anti-vibration mount and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'VRF refnet joint / header incl. insulation';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 350.00, category = 'material'
WHERE in_price_list = false AND description = 'Water cooled / air cooled chiller incl. base, connection and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6000.00, category = 'material'
WHERE in_price_list = false AND description = 'Air handling unit incl. filter, coil, fan, drain pan and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'Fan coil unit incl. filter, drain pan, valve and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1200.00, category = 'material'
WHERE in_price_list = false AND description = 'Chilled water pump incl. base, coupling, valve and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5500.00, category = 'material'
WHERE in_price_list = false AND description = 'Cooling tower incl. base, make-up water and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'material'
WHERE in_price_list = false AND description = 'Copper refrigerant piping incl. insulation, fitting and gas charging';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Chilled water piping incl. valve, fitting, insulation and support';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Condensate drain piping uPVC incl. insulation, fitting and support';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.50, category = 'material'
WHERE in_price_list = false AND description = 'Closed cell / rockwool pipe insulation incl. vapour barrier and cladding';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Room thermostat / wired controller incl. wiring';

-- =====================================================================
-- MEP: Mechanical Ventilation System (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Toilet exhaust fan incl. bracket, damper and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Kitchen exhaust fan incl. bracket, damper and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 350.00, category = 'material'
WHERE in_price_list = false AND description = 'Car park ventilation fan incl. support and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 180.00, category = 'material'
WHERE in_price_list = false AND description = 'Fresh air supply fan incl. filter, damper and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 650.00, category = 'material'
WHERE in_price_list = false AND description = 'Staircase pressurization fan incl. relief damper and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'Stainless steel kitchen hood incl. grease filter and light';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'material'
WHERE in_price_list = false AND description = 'Smoke extraction fan, 250Â°C/2hr rated, incl. control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1200.00, category = 'material'
WHERE in_price_list = false AND description = 'Laboratory fume hood incl. exhaust fan, duct and control';

-- =====================================================================
-- MEP: MV Distribution System (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Galvanised iron ductwork incl. flange, gasket, support and sealing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'material'
WHERE in_price_list = false AND description = 'Insulated flexible duct incl. clamp and connection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Duct thermal insulation incl. vapour barrier and finish';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.50, category = 'material'
WHERE in_price_list = false AND description = 'Duct hanger and support incl. anchor and rod';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Supply air diffuser incl. plenum box and damper';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'material'
WHERE in_price_list = false AND description = 'Return air grille incl. filter and frame';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'material'
WHERE in_price_list = false AND description = 'Exhaust air grille incl. frame and damper';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Weather louver with bird screen incl. frame';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Volume control damper incl. actuator quadrant';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire damper 2 hour rated incl. fusible link and access panel';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Motorized damper incl. actuator and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2500.00, category = 'labor'
WHERE in_price_list = false AND description = 'Air / water testing, adjusting and balancing incl. report';

-- =====================================================================
-- MEP: Electrical System (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5500.00, category = 'material'
WHERE in_price_list = false AND description = 'Main switchboard incl. ACB/MCCB, busbar, metering and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 250.00, category = 'material'
WHERE in_price_list = false AND description = 'Sub distribution board incl. MCB/RCBO, enclosure and labelling';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Busduct / busway incl. joint, support and tap-off unit';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8500.00, category = 'material'
WHERE in_price_list = false AND description = 'Distribution transformer incl. base, connection and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3500.00, category = 'material'
WHERE in_price_list = false AND description = 'Automatic power factor correction capacitor bank incl. controller';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'material'
WHERE in_price_list = false AND description = 'Metering panel incl. CT, meter and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.50, category = 'material'
WHERE in_price_list = false AND description = 'XLPE/PVC power cable incl. termination, gland and lug';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.50, category = 'material'
WHERE in_price_list = false AND description = 'Control cable incl. termination and gland';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Hot dip galvanised cable tray incl. support, bend and accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Metal cable trunking incl. cover, support and accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.00, category = 'material'
WHERE in_price_list = false AND description = 'uPVC / GI conduit incl. bend, coupling, box and support';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'material'
WHERE in_price_list = false AND description = 'Cable ladder incl. support, bend and accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = '13A switched socket outlet point incl. wiring, conduit and accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Lighting switch point incl. wiring, conduit and accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Weatherproof isolator incl. wiring and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.50, category = 'labor'
WHERE in_price_list = false AND description = 'Wiring point incl. cable, conduit and termination';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'LED interior luminaire incl. lamp, driver, wiring and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'LED exterior / flood luminaire IP65 incl. pole/bracket and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'LED emergency light with 3 hour battery backup incl. testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'material'
WHERE in_price_list = false AND description = 'LED exit sign with battery backup incl. fixing and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Occupancy / daylight sensor incl. wiring and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 800.00, category = 'labor'
WHERE in_price_list = false AND description = 'Earthing system incl. conductor, bonding and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Copper earth rod with inspection pit incl. clamp and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Lightning air terminal incl. base, mast and connection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'material'
WHERE in_price_list = false AND description = 'Lightning down conductor incl. clamp, tape and test joint';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15000.00, category = 'material'
WHERE in_price_list = false AND description = 'Diesel generator set incl. canopy, base, exhaust and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'material'
WHERE in_price_list = false AND description = 'Automatic transfer switch incl. controller and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3500.00, category = 'material'
WHERE in_price_list = false AND description = 'Uninterruptible power supply incl. battery, cabinet and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1200.00, category = 'material'
WHERE in_price_list = false AND description = 'Diesel fuel tank incl. piping, valve, level gauge and bund';

-- =====================================================================
-- MEP: ELV Installation (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 950.00, category = 'material'
WHERE in_price_list = false AND description = 'Addressable fire alarm control panel incl. battery and programming';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'Addressable smoke / heat detector incl. base and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Manual call point incl. back box and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Alarm bell / sounder incl. wiring and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'IP CCTV camera incl. bracket, cabling and configuration';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 650.00, category = 'material'
WHERE in_price_list = false AND description = 'Network video recorder incl. hard disk, rack and configuration';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'Door access control set incl. reader, EM lock, button and controller';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 280.00, category = 'material'
WHERE in_price_list = false AND description = 'Audio / video intercom incl. wiring and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'material'
WHERE in_price_list = false AND description = 'Cat6 data outlet incl. cable, patch panel termination and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1200.00, category = 'material'
WHERE in_price_list = false AND description = 'Network switch and 19" rack incl. patch panel, PDU and accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2500.00, category = 'material'
WHERE in_price_list = false AND description = 'Telephone system incl. exchange, handset and cabling';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'MATV / TV outlet incl. coaxial cable, splitter and termination';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Wireless access point incl. PoE cabling and configuration';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3500.00, category = 'material'
WHERE in_price_list = false AND description = 'Public address system incl. amplifier, mixer, microphone and zoning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'material'
WHERE in_price_list = false AND description = 'Ceiling / wall speaker incl. cabling and termination';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1800.00, category = 'material'
WHERE in_price_list = false AND description = 'School bell and master clock system incl. programming';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2500.00, category = 'material'
WHERE in_price_list = false AND description = 'Projector with motorized screen incl. mount, cabling and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3500.00, category = 'material'
WHERE in_price_list = false AND description = 'Classroom audio visual system incl. panel, speaker and cabling';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5500.00, category = 'material'
WHERE in_price_list = false AND description = 'Building management system panel incl. controller and graphics';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45.00, category = 'material'
WHERE in_price_list = false AND description = 'BMS field device / sensor incl. wiring and calibration';

-- =====================================================================
-- MEP: Plumbing System (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'labor'
WHERE in_price_list = false AND description = 'PPR / uPVC cold water piping incl. fitting, valve, support and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'labor'
WHERE in_price_list = false AND description = 'PPR hot water piping incl. insulation, fitting and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'material'
WHERE in_price_list = false AND description = 'Gate / check / ball valve incl. flange, gasket and bolt';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 65.00, category = 'material'
WHERE in_price_list = false AND description = 'Water meter incl. strainer, valve and connection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'Water storage tank incl. base, level control, pipework and cleaning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'material'
WHERE in_price_list = false AND description = 'Water transfer pump set incl. base, valve, control panel and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1200.00, category = 'material'
WHERE in_price_list = false AND description = 'Booster pump set with pressure vessel incl. control panel';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 150.00, category = 'material'
WHERE in_price_list = false AND description = 'Electric water heater incl. safety valve, bracket and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 180.00, category = 'material'
WHERE in_price_list = false AND description = 'Water level control system incl. electrode, relay and wiring';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'labor'
WHERE in_price_list = false AND description = 'uPVC soil pipe incl. fitting, support, jointing and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.00, category = 'labor'
WHERE in_price_list = false AND description = 'uPVC waste pipe incl. fitting, trap, support and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5.00, category = 'labor'
WHERE in_price_list = false AND description = 'uPVC vent pipe incl. fitting, cowl and support';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8.00, category = 'labor'
WHERE in_price_list = false AND description = 'uPVC rainwater downpipe incl. fitting, bracket and shoe';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'labor'
WHERE in_price_list = false AND description = 'Manhole / inspection chamber incl. excavation, concrete, benching and cover';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 650.00, category = 'labor'
WHERE in_price_list = false AND description = 'Grease trap incl. excavation, installation, cover and connection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 500.00, category = 'labor'
WHERE in_price_list = false AND description = 'Precast septic tank incl. excavation, bedding, connection and backfill';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8500.00, category = 'material'
WHERE in_price_list = false AND description = 'Package sewage treatment plant incl. blower, control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1500.00, category = 'labor'
WHERE in_price_list = false AND description = 'Connection to public sewer incl. excavation, pipe, chamber and reinstatement';

-- =====================================================================
-- MEP: Fire Fighting System (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2500.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire hydrant / landing valve incl. cabinet, hose and accessories';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 800.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire hose reel 30m incl. cabinet, nozzle and valve';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 180.00, category = 'material'
WHERE in_price_list = false AND description = 'Landing valve incl. cabinet and blank cap';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'labor'
WHERE in_price_list = false AND description = 'Fire riser piping, galvanised steel, incl. fitting, support and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 6.50, category = 'material'
WHERE in_price_list = false AND description = 'Pendent / upright sprinkler head incl. escutcheon and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'labor'
WHERE in_price_list = false AND description = 'Sprinkler piping incl. fitting, hanger, support and hydrostatic testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 650.00, category = 'material'
WHERE in_price_list = false AND description = 'Sprinkler alarm valve set incl. gauge, drain and trim';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Flow switch / tamper switch incl. wiring to fire alarm panel';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8500.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire pump set (electric + diesel + jockey) incl. controller and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1200.00, category = 'material'
WHERE in_price_list = false AND description = 'Jockey pump incl. pressure switch and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3500.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire water storage tank incl. base, level control and connection';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Portable fire extinguisher incl. bracket, sign and servicing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Fire blanket incl. cabinet and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12000.00, category = 'material'
WHERE in_price_list = false AND description = 'FM200 / CO2 clean agent suppression system incl. cylinder, nozzle and panel';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4500.00, category = 'material'
WHERE in_price_list = false AND description = 'Kitchen hood wet chemical suppression system incl. nozzle and control';

-- =====================================================================
-- MEP: Specialist Installations (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 850.00, category = 'material'
WHERE in_price_list = false AND description = 'Solar PV system incl. panel, inverter, mounting, cabling and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15000.00, category = 'material'
WHERE in_price_list = false AND description = 'Water treatment plant incl. filter, dosing, control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 8500.00, category = 'material'
WHERE in_price_list = false AND description = 'Swimming pool filtration system incl. pump, filter, dosing and control';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12000.00, category = 'material'
WHERE in_price_list = false AND description = 'Commercial kitchen equipment incl. connection and commissioning';

-- =====================================================================
-- MEP: Vertical Transportation System (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 60000.00, category = 'material'
WHERE in_price_list = false AND description = 'Passenger lift, 1000kg / 13 person, incl. car, door, control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 55000.00, category = 'material'
WHERE in_price_list = false AND description = 'Service / goods lift incl. car, door, control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 75000.00, category = 'material'
WHERE in_price_list = false AND description = 'Firefighting lift incl. fireman switch, control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25000.00, category = 'material'
WHERE in_price_list = false AND description = 'Platform / accessibility lift incl. control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45000.00, category = 'material'
WHERE in_price_list = false AND description = 'Escalator incl. truss, balustrade, control and commissioning';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 450.00, category = 'material'
WHERE in_price_list = false AND description = 'Lift pit access ladder incl. fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Lift shaft lighting and socket incl. wiring and switch';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2500.00, category = 'material'
WHERE in_price_list = false AND description = 'Lift machine room equipment incl. ventilation, lighting and hoisting beam';

-- =====================================================================
-- MEP: Services (Testing & Commissioning)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 5000.00, category = 'labor'
WHERE in_price_list = false AND description = 'Testing, adjusting and commissioning of complete installation incl. report';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2500.00, category = 'labor'
WHERE in_price_list = false AND description = 'As-built drawings incl. printing and soft copy submission';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 1500.00, category = 'labor'
WHERE in_price_list = false AND description = 'Operation and maintenance manual incl. warranty documents';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 800.00, category = 'labor'
WHERE in_price_list = false AND description = 'Training of client operating personnel';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2000.00, category = 'material'
WHERE in_price_list = false AND description = 'Recommended spare parts as per specification';

-- =====================================================================
-- EXTERNAL WORKS (ALL items)
-- =====================================================================
UPDATE public.qs_description_library SET in_price_list = true, current_rate = 0.35, category = 'material'
WHERE in_price_list = false AND description = 'Site clearing; supply and lay complete incl. base preparation and jointing.';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.00, category = 'labor'
WHERE in_price_list = false AND description = 'Cut and fill to formation level incl. compaction';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.40, category = 'labor'
WHERE in_price_list = false AND description = 'Compaction of formation to 95% MDD incl. watering and testing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 20.00, category = 'material'
WHERE in_price_list = false AND description = 'Reinforced concrete paving 150mm thk. incl. base, mesh and joint';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 16.00, category = 'material'
WHERE in_price_list = false AND description = 'Asphalt concrete wearing course 50mm thk. incl. prime coat and base';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 15.00, category = 'material'
WHERE in_price_list = false AND description = 'Interlocking concrete paver 60mm thk. incl. sand bedding and jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 12.00, category = 'material'
WHERE in_price_list = false AND description = 'Precast concrete kerb incl. bedding, haunching and jointing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3.50, category = 'labor'
WHERE in_price_list = false AND description = 'Thermoplastic road marking incl. surface preparation';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 22.00, category = 'labor'
WHERE in_price_list = false AND description = 'Car park surfacing incl. marking, wheel stop and signage';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 2.50, category = 'material'
WHERE in_price_list = false AND description = 'Approved top soil spread and levelled';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 4.50, category = 'labor'
WHERE in_price_list = false AND description = 'Turfing incl. top soil, fertiliser and watering to establishment';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'labor'
WHERE in_price_list = false AND description = 'Supply and plant tree / shrub incl. pit, soil mix, stake and maintenance';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'labor'
WHERE in_price_list = false AND description = 'Planter box incl. waterproofing, drainage layer and soil';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 18.00, category = 'material'
WHERE in_price_list = false AND description = 'Landscape irrigation system incl. piping, sprinkler, valve and controller';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 25.00, category = 'labor'
WHERE in_price_list = false AND description = 'Boundary fence incl. post, mesh/panel, foundation and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3500.00, category = 'labor'
WHERE in_price_list = false AND description = 'Main entrance gate incl. frame, leaf, hardware, motor and painting';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28.00, category = 'material'
WHERE in_price_list = false AND description = 'Steel guard rail incl. fabrication, painting and fixing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 35.00, category = 'labor'
WHERE in_price_list = false AND description = 'Boundary wall incl. foundation, blockwork, plaster and paint';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 350.00, category = 'material'
WHERE in_price_list = false AND description = 'Flag pole incl. foundation, halyard and finishing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Bollard incl. foundation and finishing';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 3500.00, category = 'material'
WHERE in_price_list = false AND description = 'Bicycle rack incl. fixing to slab';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 120.00, category = 'material'
WHERE in_price_list = false AND description = 'Covered walkway incl. steel structure, roofing and finishes';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 28000.00, category = 'material'
WHERE in_price_list = false AND description = 'Guard house incl. structure, finishes and services';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 45000.00, category = 'material'
WHERE in_price_list = false AND description = 'Playground / sport court incl. surfacing, marking and equipment';

UPDATE public.qs_description_library SET in_price_list = true, current_rate = 85.00, category = 'material'
WHERE in_price_list = false AND description = 'Solid surface counter top 12mm thk. incl. support and sealing';

COMMIT;

-- =====================================================================
-- VERIFICATION QUERIES (run after migration)
-- =====================================================================
-- Count remaining unpriced rows (should be 0):
-- SELECT COUNT(*) FROM qs_description_library WHERE in_price_list = false;
--
-- Count newly priced rows:
-- SELECT COUNT(*) FROM qs_description_library WHERE in_price_list = true;
--
-- Verify no NULL current_rate on priced rows:
-- SELECT COUNT(*) FROM qs_description_library WHERE in_price_list = true AND current_rate IS NULL;
--
-- Category distribution:
-- SELECT category, COUNT(*) FROM qs_description_library GROUP BY category;
