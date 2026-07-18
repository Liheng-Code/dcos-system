-- =====================================================================================
-- DCOS Seed Data — Price List: MEP (Mechanical / Electrical / Plumbing / Fire)
-- Market basis : Cambodia — Phnom Penh, delivered to site, USD, EXCLUDING VAT (10%)
-- Price date   : Q2-2026 indicative. Rates reflect typical PP electrical/plumbing shop
--   prices for standard commercial grades — cables per common KH brands (Phelps Dodge
--   TH/KH, LS, local), PVC pipe per Thai/local class 13.5, PPR per SCG/Thai PN20,
--   sanitary wares mid-range (Cotto/American Standard economy lines & equivalents).
--   Branded/spec items (fire-rated, HVAC, pumps) vary widely — ALWAYS verify by spec.
-- VERIFY with supplier quotes before live tender use. Provinces: +5–15% transport.
-- NOTE: shared labor codes (helper) repeat STR codes — ON CONFLICT dedupes.
-- =====================================================================================

WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000001'::uuid AS tenant_id,   -- << your tenant_id
    '00000000-0000-0000-0000-000000000002'::uuid AS tender_id    -- << your tender_id
)
INSERT INTO price_list_items
  (tenant_id, tender_id, code, description, category, unit, unit_price, currency,
   supplier_name, quote_ref, quote_date, valid_until, is_active, notes)
SELECT p.tenant_id, p.tender_id,
       v.code, v.description, v.category, v.unit, v.unit_price, 'USD',
       v.supplier_name, 'MKT-2026Q2', DATE '2026-07-01', DATE '2026-09-30', true, v.notes
FROM params p,
(VALUES
-- ── Electrical: cables & wiring ────────────────────────────────────────────────────
 ('PL-CBL-01','Cable THW/CV 1.5mm2 Cu','material','m',0.28,'Electrical shop PP','Per m from 100m roll'),
 ('PL-CBL-02','Cable THW/CV 2.5mm2 Cu','material','m',0.40,'Electrical shop PP',''),
 ('PL-CBL-03','Cable THW/CV 4.0mm2 Cu','material','m',0.60,'Electrical shop PP',''),
 ('PL-CBL-04','Cable THW/CV 6.0mm2 Cu','material','m',0.88,'Electrical shop PP',''),
 ('PL-CBL-05','Cable CV 10mm2 Cu','material','m',1.45,'Electrical shop PP',''),
 ('PL-CBL-06','Cable CV 16mm2 Cu','material','m',2.20,'Electrical shop PP',''),
 ('PL-CBL-07','Cable CV 25mm2 Cu','material','m',3.40,'Electrical shop PP',''),
 ('PL-CBL-08','Cable NYY 4x16mm2 Cu (feeder)','material','m',6.50,'Electrical shop PP',''),
 ('PL-CBL-09','Bare copper earth cable 25mm2','material','m',2.60,'Electrical shop PP','Earthing/lightning'),
-- ── Electrical: containment ────────────────────────────────────────────────────────
 ('PL-CND-01','PVC conduit 20mm, white/orange','material','m',0.45,'Electrical shop PP','Per m from 2.9m stick'),
 ('PL-CND-02','PVC conduit 25mm','material','m',0.60,'Electrical shop PP',''),
 ('PL-CND-03','Flexible corrugated conduit 20mm','material','m',0.55,'Electrical shop PP',''),
 ('PL-CND-04','Conduit fittings avg (bend/coupler/saddle)','material','ea',0.20,'Electrical shop PP',''),
 ('PL-TRY-01','Cable tray galvanised 100mm + cover','material','m',3.20,'Tray fabricator PP',''),
 ('PL-TRY-02','Cable tray galvanised 200mm + cover','material','m',4.50,'Tray fabricator PP',''),
 ('PL-TRY-03','Cable tray galvanised 300mm + cover','material','m',6.20,'Tray fabricator PP',''),
 ('PL-TRK-01','Wire trunking PVC 100x50mm','material','m',3.80,'Electrical shop PP',''),
 ('PL-TRS-01','Tray support / hanger set','material','set',1.80,'Tray fabricator PP','Per 1.5m spacing typical'),
-- ── Electrical: accessories & distribution ─────────────────────────────────────────
 ('PL-BOX-01','Back box galvanised 1-gang','material','ea',0.55,'Electrical shop PP',''),
 ('PL-SWT-01','Switch 1-gang 1-way, standard series','material','ea',2.80,'Panasonic/Schneider dealer','Mid-range brand'),
 ('PL-SWT-02','Switch 2-gang 1-way','material','ea',3.60,'Panasonic/Schneider dealer',''),
 ('PL-SKT-01','Socket outlet 13A/16A twin, universal','material','ea',4.20,'Panasonic/Schneider dealer',''),
 ('PL-DBX-01','Distribution board enclosure 12-way, plastic/metal','material','ea',38.00,'Schneider/ABB dealer','Excl. breakers'),
 ('PL-MCB-01','MCB 1P 6-32A','material','ea',4.50,'Schneider/ABB dealer',''),
 ('PL-MCB-02','MCB 3P 16-63A','material','ea',12.50,'Schneider/ABB dealer',''),
 ('PL-RCB-01','RCBO 1P+N 16-32A 30mA','material','ea',16.00,'Schneider/ABB dealer',''),
 ('PL-MCC-01','MCCB 3P 100A','material','ea',65.00,'Schneider/ABB dealer',''),
-- ── Electrical: lighting & earthing ────────────────────────────────────────────────
 ('PL-LGT-01','LED downlight 9W, recessed','material','ea',4.80,'Lighting shop PP','Standard commercial grade'),
 ('PL-LGT-02','LED panel 600x600 36-40W','material','ea',13.50,'Lighting shop PP',''),
 ('PL-LGT-03','LED batten/tube set 1.2m 18-20W','material','ea',6.00,'Lighting shop PP',''),
 ('PL-LGT-04','LED floodlight 50W IP65','material','ea',14.00,'Lighting shop PP',''),
 ('PL-LGT-05','Emergency light twin-head, battery','material','ea',16.00,'Electrical shop PP',''),
 ('PL-LGT-06','Exit sign LED, battery','material','ea',18.00,'Electrical shop PP',''),
 ('PL-ERT-01','Earth rod copper-bonded 5/8" x 2.4m + clamp','material','ea',8.50,'Electrical shop PP',''),
 ('PL-ERT-02','Lightning protection air terminal (ESE) set','material','set',850.00,'Specialist supplier','Verify radius class & cert'),
-- ── Plumbing: pipes & fittings ─────────────────────────────────────────────────────
 ('PL-PVC-01','PVC pipe 21mm (1/2") class 13.5','material','m',0.55,'Pipe shop PP (Thai/local)','Per m from 4m length'),
 ('PL-PVC-02','PVC pipe 27mm (3/4") class 13.5','material','m',0.75,'Pipe shop PP',''),
 ('PL-PVC-03','PVC pipe 34mm (1") class 13.5','material','m',1.00,'Pipe shop PP',''),
 ('PL-PVC-04','PVC pipe 42mm (1-1/4") class 13.5','material','m',1.30,'Pipe shop PP',''),
 ('PL-PVC-05','PVC pipe 60mm (2") class 8.5','material','m',2.00,'Pipe shop PP','Waste/vent'),
 ('PL-PVC-06','PVC pipe 90mm (3") class 8.5','material','m',3.60,'Pipe shop PP','Soil/waste'),
 ('PL-PVC-07','PVC pipe 114mm (4") class 8.5','material','m',5.20,'Pipe shop PP','Soil/rainwater'),
 ('PL-PVF-01','PVC fittings, average (elbow/tee/socket)','material','ea',0.60,'Pipe shop PP','Weighted average'),
 ('PL-SOL-01','PVC solvent cement, can 500g','material','can',3.20,'Pipe shop PP',''),
 ('PL-PPR-01','PPR pipe 20mm PN20','material','m',1.10,'SCG/Thai PPR dealer','Hot/cold supply'),
 ('PL-PPR-02','PPR pipe 25mm PN20','material','m',1.35,'SCG/Thai PPR dealer',''),
 ('PL-PPR-03','PPR pipe 32mm PN20','material','m',1.90,'SCG/Thai PPR dealer',''),
 ('PL-PPF-01','PPR fittings, average','material','ea',0.85,'PPR dealer',''),
 ('PL-GIP-01','GI pipe 2" medium class','material','m',5.50,'Steel pipe shop PP','Risers/exposed'),
-- ── Plumbing: valves, tanks & pumps ────────────────────────────────────────────────
 ('PL-VLV-01','Stop valve 1/2" brass','material','ea',3.50,'Plumbing shop PP',''),
 ('PL-VLV-02','Gate valve 2" brass','material','ea',18.00,'Plumbing shop PP',''),
 ('PL-VLV-03','Float valve 3/4" + ball','material','ea',6.00,'Plumbing shop PP',''),
 ('PL-MTR-01','Water meter 1/2" domestic','material','ea',12.00,'Plumbing shop PP',''),
 ('PL-TNK-01','PE water tank 1000L','material','ea',95.00,'Tank dealer PP','e.g. local PE brands'),
 ('PL-TNK-02','PE water tank 2000L','material','ea',165.00,'Tank dealer PP',''),
 ('PL-PMP-01','Water pump 1HP automatic, domestic','material','ea',95.00,'Pump dealer PP','Mid-range brand'),
 ('PL-PMP-02','Booster pump set 1.5-2HP + tank','material','set',260.00,'Pump dealer PP',''),
-- ── Sanitary wares & fixtures ──────────────────────────────────────────────────────
 ('PL-SAN-01','WC, close-coupled dual flush, standard','material','ea',95.00,'Sanitary shop PP','Economy line big brand'),
 ('PL-SAN-02','WC, single flush budget','material','ea',65.00,'Sanitary shop PP',''),
 ('PL-SAN-03','Wash basin + pedestal, standard','material','ea',48.00,'Sanitary shop PP',''),
 ('PL-SAN-04','Kitchen sink SS single bowl + drainer','material','ea',32.00,'Sanitary shop PP',''),
 ('PL-SAN-05','Shower mixer + rain head set, standard','material','set',38.00,'Sanitary shop PP',''),
 ('PL-SAN-06','Basin faucet, standard','material','ea',14.00,'Sanitary shop PP',''),
 ('PL-SAN-07','Bib tap 1/2" brass-chrome','material','ea',4.50,'Plumbing shop PP',''),
 ('PL-SAN-08','Floor drain SS 100x100 anti-odour','material','ea',3.20,'Plumbing shop PP',''),
 ('PL-SAN-09','Bidet spray set (hand shower)','material','set',6.50,'Sanitary shop PP','Standard in KH bathrooms'),
 ('PL-SAN-10','Instant water heater 3.5-4.5kW','material','ea',85.00,'Appliance shop PP',''),
 ('PL-DRN-01','Gully trap PVC 4"','material','ea',8.00,'Pipe shop PP',''),
 ('PL-DRN-02','Manhole cover + frame CI 600mm','material','set',45.00,'Foundry/hardware PP',''),
-- ── Fire protection ────────────────────────────────────────────────────────────────
 ('PL-FIR-01','Fire extinguisher ABC dry powder 6kg','material','ea',32.00,'Fire equipment shop PP','With bracket'),
 ('PL-FIR-02','Fire hose reel cabinet set 30m, complete','material','set',260.00,'Fire equipment supplier','Verify local FD approval'),
 ('PL-FIR-03','Sprinkler head pendent 68C K5.6','material','ea',6.50,'Fire equipment supplier',''),
 ('PL-FIR-04','Black steel pipe sch40 2-1/2" (fire main)','material','m',9.50,'Steel pipe shop PP','Painting extra'),
 ('PL-FIR-05','Smoke detector, addressable/conventional','material','ea',18.00,'Fire alarm supplier','Verify system type'),
 ('PL-FIR-06','Fire alarm bell 6"','material','ea',15.00,'Fire alarm supplier',''),
 ('PL-FIR-07','Manual call point (break glass)','material','ea',12.00,'Fire alarm supplier',''),
-- ── HVAC & ventilation ─────────────────────────────────────────────────────────────
 ('PL-HVC-01','Split AC 1.5HP inverter, supply only','material','ea',420.00,'AC dealer PP (Daikin/LG/mid)','Verify brand/spec'),
 ('PL-HVC-02','Split AC 2.0HP inverter, supply only','material','ea',560.00,'AC dealer PP',''),
 ('PL-HVC-03','Copper pipe pair 1/4"+1/2" insulated','material','m',6.50,'AC supply shop',''),
 ('PL-HVC-04','AC drain pipe PVC insulated 21mm','material','m',1.20,'AC supply shop',''),
 ('PL-HVC-05','Refrigerant R32','material','kg',12.00,'AC supply shop',''),
 ('PL-VEN-01','Exhaust fan 8", wall/ceiling','material','ea',22.00,'Electrical shop PP',''),
 ('PL-VEN-02','Galvanised duct, fabricated','material','m2',12.00,'Duct fabricator PP','Sheet area basis'),
 ('PL-VEN-03','Flexible insulated duct 10"','material','m',4.50,'HVAC supplier',''),
 ('PL-VEN-04','Supply/return air diffuser 600x600','material','ea',16.00,'HVAC supplier',''),
-- ── Labor — day rates (8h) ─────────────────────────────────────────────────────────
 ('PL-LAB-01','General laborer / helper','labor','day',12.00,NULL,'Shared code with STR'),
 ('PL-LAB-20','Electrician, skilled','labor','day',18.00,NULL,''),
 ('PL-LAB-21','Plumber, skilled','labor','day',17.00,NULL,''),
 ('PL-LAB-22','AC/refrigeration technician','labor','day',20.00,NULL,''),
 ('PL-LAB-23','Duct/sheet-metal worker','labor','day',18.00,NULL,''),
 ('PL-LAB-24','Fire protection fitter','labor','day',18.00,NULL,''),
-- ── Labor-only subcontract rates (common Cambodia practice) ────────────────────────
 ('PL-LOS-20','Labor-only: wiring point (conduit+wire+accessory)','labor','point',6.50,'MEP labor subcontractor','Per point complete'),
 ('PL-LOS-21','Labor-only: light fixture installation','labor','ea',3.50,'MEP labor subcontractor',''),
 ('PL-LOS-22','Labor-only: pipe installation (avg all sizes)','labor','m',0.80,'MEP labor subcontractor',''),
 ('PL-LOS-23','Labor-only: sanitary fixture installation','labor','ea',8.00,'MEP labor subcontractor',''),
 ('PL-LOS-24','Labor-only: split AC installation, per set','labor','set',35.00,'AC subcontractor','Std 3-4m pipe run'),
-- ── Plant (MEP-specific) ───────────────────────────────────────────────────────────
 ('PL-PLT-30','Hammer drill / rotary hammer, rental','plant','day',6.00,'Plant hire PP',''),
 ('PL-PLT-31','Pipe threading machine, rental','plant','day',10.00,'Plant hire PP','GI/fire pipe'),
 ('PL-PLT-32','Cable pulling winch, rental','plant','day',15.00,'Plant hire PP',''),
 ('PL-PLT-33','Megger / insulation tester, rental','plant','day',8.00,'Plant hire PP','T&C works')
) AS v(code, description, category, unit, unit_price, supplier_name, notes)
ON CONFLICT (tender_id, code) DO NOTHING;

-- End of MEP price list seed (100 items)
