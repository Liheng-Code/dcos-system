-- =====================================================================================
-- DCOS Seed Data — Company Rate Library: MEP (Mechanical / Electrical / Plumbing)
-- Market basis : Cambodia — Phnom Penh, USD
-- Price date   : Q2-2026 indicative. Rates are flat (resource) prices for the
--   company-wide rate library. Import into any tender's Unit Rates tab.
-- VERIFY with supplier quotes and project specifications before tendering.
-- =====================================================================================

INSERT INTO public.company_rate_library
  (tenant_id, code, description, trade, discipline, unit, mode, base_rate, net_rate, category_tags, region, is_active, notes)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  v.code, v.description, v.trade, v.discipline, v.unit, 'flat', v.unit_price, v.unit_price,
  v.tags, 'Cambodia', true, v.notes
FROM (VALUES
-- ── Cables (electrical) ────────────────────────────────────────────────────
 ('PL-CBL-01','XLPE/SWA/LSOH cable 3.5C+2E 10mm2','Electrical','MEP','m',3.50,ARRAY['electrical','cable'],'LSOH sheathed, fire-safe; 9-12 m/m'),
 ('PL-CBL-02','XLPE/SWA/LSOH cable 4C 2.5mm2','Electrical','MEP','m',2.40,ARRAY['electrical','cable'],'Lighting circuits; 5-7 m/m'),
 ('PL-CBL-03','LSZH cable 4C 6mm2','Electrical','MEP','m',5.80,ARRAY['electrical','cable'],'Smoke-free; 15-20 m/m'),
 ('PL-CBL-04','Fire-resistant cable 4C 16mm2','Electrical','MEP','m',11.20,ARRAY['electrical','cable'],'Survives 90 min flame; 25-30 m/m'),
-- ── Conduits, trunking & accessories ────────────────────────────────────────
 ('PL-CND-01','PVC conduit 20mm','Electrical','MEP','m',0.35,ARRAY['electrical','conduit'],'Surface/floor chase'),
 ('PL-CND-02','Flexible conduit + connectors','Electrical','MEP','m',1.50,ARRAY['electrical','conduit'],'Motor/DB tails'),
 ('PL-CND-03','Galvanized steel trunking 100x50mm','Electrical','MEP','m',3.50,ARRAY['electrical','conduit'],'Vertical risers'),
-- ── Mini trunking & EMT ─────────────────────────────────────────────────────
 ('PL-TRY-01','PVC mini trunking 25x16mm','Electrical','MEP','m',0.45,ARRAY['electrical','conduit'],'Surface-mounted wiring'),
 ('PL-TRY-02','Galvanized conduit 20mm (EMT)','Electrical','MEP','m',0.80,ARRAY['electrical','conduit'],'Exposed locations'),
-- ── Cable tray & ladders ───────────────────────────────────────────────────
 ('PL-TRK-01','Cable tray perforated 300x1.2mm','Electrical','MEP','m',3.20,ARRAY['electrical','cable_tray'],'Horizontal runs'),
 ('PL-TRK-02','Cable tray perforated 600x2.0mm','Electrical','MEP','m',6.50,ARRAY['electrical','cable_tray'],'Main feeders'),
-- ── Cable tray accessories ──────────────────────────────────────────────────
 ('PL-TRS-01','GI cable tray ladder 500x50mm','Electrical','MEP','m',4.80,ARRAY['electrical','cable_tray'],''),
 ('PL-TRS-02','Saddle clamp + fastener set','Electrical','MEP','set',0.40,ARRAY['electrical','cable_tray'],'Tray fixing'),
 ('PL-TRS-03','Cable gland M20 brass','Electrical','MEP','ea',0.65,ARRAY['electrical','cable_tray'],'SWA termination'),
 ('PL-TRS-04','Cable tie 200mm, nylon','Electrical','MEP','pc',0.02,ARRAY['electrical','cable_tray'],''),
 ('PL-TRS-05','Black heat-shrink 1m, 2:1','Electrical','MEP','m',1.80,ARRAY['electrical','cable_tray'],'Cable joint insulation'),
 ('PL-TRS-06','Ferrule crimp end-sleeve 6mm² (100pc)','Electrical','MEP','bag',3.20,ARRAY['electrical','cable_tray'],'Termination'),
 ('PL-TRS-07','PVC tape, 33m roll','Electrical','MEP','roll',1.20,ARRAY['electrical','cable_tray'],''),
 ('PL-TRS-08','XLPE heat-shrink straight joint','Electrical','MEP','ea',5.00,ARRAY['electrical','cable_tray'],''),
 ('PL-TRS-09','PVC electrical insulation tape 18mm','Electrical','MEP','roll',0.80,ARRAY['electrical','cable_tray'],''),
 ('PL-TRS-10','PVC cable duct 100x50mm','Electrical','MEP','m',2.10,ARRAY['electrical','cable_tray'],''),
 ('PL-TRS-11','Nylon conduit clip 20mm','Electrical','MEP','pc',0.03,ARRAY['electrical','cable_tray'],''),
 ('PL-TRS-12','Multi-size conduit bender','Electrical','MEP','ea',45.00,ARRAY['electrical','cable_tray'],'Tool purchase'),
-- ── Switchgear & panels ────────────────────────────────────────────────────
 ('PL-BOX-01','Plastic surface pattress box 50mm','Electrical','MEP','ea',0.25,ARRAY['electrical','box'],''),
 ('PL-BOX-02','Plastic flush pattress box 50mm','Electrical','MEP','ea',0.35,ARRAY['electrical','box'],''),
 ('PL-SWT-01','Miniature circuit breaker (MCB) 16A 1P','Electrical','MEP','ea',3.00,ARRAY['electrical','switchgear'],'Type C; 6kA'),
 ('PL-SWT-02','Miniature circuit breaker (MCB) 32A 1P','Electrical','MEP','ea',3.50,ARRAY['electrical','switchgear'],'Type C; 6kA'),
 ('PL-SWT-03','Residual current circuit breaker (RCCB) 40A 4P 30mA','Electrical','MEP','ea',22.00,ARRAY['electrical','switchgear'],'Type A; 25kA'),
 ('PL-SWT-04','Moulded case circuit breaker (MCCB) 100A 3P','Electrical','MEP','ea',85.00,ARRAY['electrical','switchgear'],'Thermal-magnetic; 36kA'),
 ('PL-SWT-05','Changeover switch 63A 3P','Electrical','MEP','ea',45.00,ARRAY['electrical','switchgear'],'Manual; DIN rail'),
 ('PL-SWT-06','Mini distribution board 12-way 3-phase','Electrical','MEP','ea',180.00,ARRAY['electrical','switchgear'],'Wall-mount; incl. busbars'),
 ('PL-SKT-01','Power socket outlet, single 13A, surface','Electrical','MEP','ea',2.80,ARRAY['electrical','socket'],'IP20; 1-gang'),
 ('PL-SKT-02','Data/telephone outlet RJ45, Cat6','Electrical','MEP','ea',3.50,ARRAY['electrical','socket'],'Single-gang faceplate'),
-- ── Main panels & VFDs ─────────────────────────────────────────────────────
 ('PL-DBX-01','MCCB panel board 800A 3P 43-way, complete with breakers','Electrical','MEP','ea',8500.00,ARRAY['electrical','panel'],'Incl. earth/neutral bar, metering'),
 ('PL-DBX-02','11kW 3-phase VFD incl. panel & bypass','Electrical','MEP','ea',1200.00,ARRAY['electrical','vfd'],'Pump/fan motor drives'),
 ('PL-DBX-03','3-phase power factor correction panel 150kVAr','Electrical','MEP','ea',11000.00,ARRAY['electrical','pfc'],'Automatic multi-step; verify kVAr'),
-- ── Breaker & switchgear (loose) ────────────────────────────────────────────
 ('PL-MCB-01','MCB SP 20A Type C (single)','Electrical','MEP','ea',2.50,ARRAY['electrical','switchgear'],''),
 ('PL-MCB-02','MCB TP 32A Type C (single)','Electrical','MEP','ea',9.00,ARRAY['electrical','switchgear'],''),
 ('PL-RCB-01','RCCB 40A 4P 30mA (single)','Electrical','MEP','ea',18.00,ARRAY['electrical','switchgear'],''),
 ('PL-MCC-01','MCCB 250A 3P (single)','Electrical','MEP','ea',120.00,ARRAY['electrical','switchgear'],''),
-- ── Lighting fixtures ──────────────────────────────────────────────────────
 ('PL-LGT-01','LED panel light 600x600 40W','Electrical','MEP','ea',18.00,ARRAY['electrical','lighting'],'Ceiling grid mount'),
 ('PL-LGT-02','LED downlight 10W','Electrical','MEP','ea',3.50,ARRAY['electrical','lighting'],'Recessed; cutout 75mm'),
 ('PL-LGT-03','LED tri-proof light 40W IP65','Electrical','MEP','ea',22.00,ARRAY['electrical','lighting'],'Warehouse/car park'),
 ('PL-LGT-04','Emergency bulkhead light LED 10W','Electrical','MEP','ea',12.00,ARRAY['electrical','lighting'],'3h battery; IP20'),
 ('PL-LGT-05','External LED wall light 15W IP65','Electrical','MEP','ea',15.00,ARRAY['electrical','lighting'],''),
 ('PL-LGT-06','Linear LED batten 1.2m 18W','Electrical','MEP','ea',8.00,ARRAY['electrical','lighting'],'T8 replacement'),
-- ── Earthing ───────────────────────────────────────────────────────────────
 ('PL-ERT-01','Copper earth rod 16x1500mm','Electrical','MEP','ea',12.00,ARRAY['electrical','earthing'],''),
-- ── PVC drainage pipes (Plumbing) ──────────────────────────────────────────
 ('PL-PVC-01','PVC-U water pipe 20mm','Plumbing','MEP','m',0.45,ARRAY['plumbing','pipe'],'Supply/return runs'),
 ('PL-PVC-02','PVC-U water pipe 25mm','Plumbing','MEP','m',0.65,ARRAY['plumbing','pipe'],''),
 ('PL-PVC-03','PVC-U water pipe 32mm','Plumbing','MEP','m',0.90,ARRAY['plumbing','pipe'],''),
 ('PL-PVC-04','PVC-U water pipe 40mm','Plumbing','MEP','m',1.20,ARRAY['plumbing','pipe'],''),
 ('PL-PVC-05','PVC-U waste pipe 50mm','Plumbing','MEP','m',0.80,ARRAY['plumbing','pipe'],''),
 ('PL-PVC-06','PVC-U waste pipe 110mm','Plumbing','MEP','m',1.50,ARRAY['plumbing','pipe'],''),
 ('PL-PVC-07','ABS waste pipe 110mm','Plumbing','MEP','m',2.50,ARRAY['plumbing','pipe'],'DWV/soil stacks'),
-- ── PVC / PPR fittings ─────────────────────────────────────────────────────
 ('PL-PVF-01','PVC fitting coupling 25mm (single)','Plumbing','MEP','ea',0.20,ARRAY['plumbing','fitting'],''),
 ('PL-SOL-01','SWR PVC pipe 110mm','Plumbing','MEP','m',2.50,ARRAY['plumbing','pipe'],'Soil/waste/rain'),
-- ── PPR pipes (hot & cold) ─────────────────────────────────────────────────
 ('PL-PPR-01','PPR pipe hot & cold 20mm','Plumbing','MEP','m',0.80,ARRAY['plumbing','pipe'],'S3.2 PN20'),
 ('PL-PPR-02','PPR pipe hot & cold 25mm','Plumbing','MEP','m',1.05,ARRAY['plumbing','pipe'],''),
 ('PL-PPR-03','PPR pipe hot & cold 32mm','Plumbing','MEP','m',1.40,ARRAY['plumbing','pipe'],''),
 ('PL-PPF-01','PPR fitting equal tee 25mm (single)','Plumbing','MEP','ea',0.55,ARRAY['plumbing','fitting'],''),
-- ── GIP fire protection pipe ───────────────────────────────────────────────
 ('PL-GIP-01','GIP pipe galvanized 25mm (fire protection)','Plumbing','MEP','m',1.80,ARRAY['plumbing','fire_pipe'],'Threaded; fire sprinkler branch'),
-- ── Valves ─────────────────────────────────────────────────────────────────
 ('PL-VLV-01','Full bore gate valve brass 25mm','Plumbing','MEP','ea',8.00,ARRAY['plumbing','valve'],''),
 ('PL-VLV-02','Butterfly valve ductile iron 100mm','Plumbing','MEP','ea',35.00,ARRAY['plumbing','valve'],'Main isolation'),
-- ── Meters & storage ───────────────────────────────────────────────────────
 ('PL-MTR-01','Single jet water meter 25mm','Plumbing','MEP','ea',22.00,ARRAY['plumbing','meter'],''),
 ('PL-TNK-01','Polyethylene water storage tank 2000L','Plumbing','MEP','ea',135.00,ARRAY['plumbing','tank'],''),
-- ── Pumps ──────────────────────────────────────────────────────────────────
 ('PL-PMP-01','Centrifugal pump 1.5kW (transfer)','Plumbing','MEP','ea',210.00,ARRAY['plumbing','pump'],''),
 ('PL-PMP-02','Sewage pump 3kW (macerating)','Plumbing','MEP','ea',380.00,ARRAY['plumbing','pump'],''),
-- ── Sanitaryware & fittings ────────────────────────────────────────────────
 ('PL-SAN-01','Stainless steel kitchen sink 1200x600mm','Plumbing','MEP','ea',95.00,ARRAY['plumbing','sanitary'],'Incl. waste coupling'),
 ('PL-SAN-02','Wash hand basin, vitreous china','Plumbing','MEP','ea',45.00,ARRAY['plumbing','sanitary'],''),
 ('PL-SAN-03','WC suite, P-trap, close-coupled','Plumbing','MEP','ea',85.00,ARRAY['plumbing','sanitary'],''),
 ('PL-SAN-04','Shower mixer tap, SS, single-lever','Plumbing','MEP','ea',38.00,ARRAY['plumbing','sanitary'],''),
-- ── Floor drains ───────────────────────────────────────────────────────────
 ('PL-DRN-01','Stainless steel floor drain 150x150mm','Plumbing','MEP','ea',8.00,ARRAY['plumbing','drain'],''),
 ('PL-DRN-02','Stainless steel floor trap 150mm','Plumbing','MEP','ea',6.00,ARRAY['plumbing','drain'],''),
-- ── Fire protection equipment ───────────────────────────────────────────────
 ('PL-FIR-01','Fire sprinkler head, pendant, K80','Fire Protection','MEP','ea',6.50,ARRAY['fire','sprinkler'],'68°C rating; verify spec'),
 ('PL-FIR-02','Fire hose reel DN25, complete unit','Fire Protection','MEP','ea',180.00,ARRAY['fire','hose_reel'],''),
 ('PL-FIR-03','Steel fire pipe black 25mm','Fire Protection','MEP','m',2.50,ARRAY['fire','pipe'],'Threaded; sprinkler branch'),
 ('PL-FIR-04','Steel fire pipe black 50mm','Fire Protection','MEP','m',5.50,ARRAY['fire','pipe'],''),
 ('PL-FIR-05','Steel fire pipe black 100mm','Fire Protection','MEP','m',12.00,ARRAY['fire','pipe'],'Riser/feeder'),
 ('PL-FIR-06','PVC waste pipe 110mm (DWV)','Fire Protection','MEP','m',1.50,ARRAY['fire','pipe'],''),
 ('PL-FIR-07','Flexible SS braided hose 450mm','Fire Protection','MEP','ea',5.00,ARRAY['fire','fitting'],'Appliance connection'),
-- ── HVAC / AC equipment ─────────────────────────────────────────────────────
 ('PL-HVC-01','Cassette-type inverter AC unit 2.5kW','HVAC','MEP','ea',650.00,ARRAY['hvac','ac_unit'],''),
 ('PL-HVC-02','Ducted fan coil unit 5.0kW','HVAC','MEP','ea',950.00,ARRAY['hvac','ac_unit'],''),
 ('PL-HVC-03','FCU controller (BACnet/Modbus)','HVAC','MEP','ea',85.00,ARRAY['hvac','controls'],''),
-- ── Ductwork ───────────────────────────────────────────────────────────────
 ('PL-HVC-04','GI ductwork 200x100mm','HVAC','MEP','m',8.50,ARRAY['hvac','ductwork'],'Insulated double skin; verify spec'),
 ('PL-HVC-05','Flexible duct connector 300mm dia','HVAC','MEP','m',3.50,ARRAY['hvac','ductwork'],'Vibration isolation'),
-- ── Ventilation fans ───────────────────────────────────────────────────────
 ('PL-VEN-01','Axial exhaust fan 300mm','HVAC','MEP','ea',55.00,ARRAY['hvac','fan'],'Bathroom/wet area'),
 ('PL-VEN-02','Centrifugal exhaust fan 500mm','HVAC','MEP','ea',135.00,ARRAY['hvac','fan'],'Car park/kitchen extract'),
-- ── MEP labor — day rates (8h) ─────────────────────────────────────────────
 ('PL-LAB-20','Electrician, licensed','Labor','MEP','day',22.00,ARRAY['labor'],''),
 ('PL-LAB-21','Plumber, licensed','Labor','MEP','day',22.00,ARRAY['labor'],''),
 ('PL-LAB-22','HVAC technician','Labor','MEP','day',28.00,ARRAY['labor'],''),
 ('PL-LAB-23','Fire protection fitter','Labor','MEP','day',20.00,ARRAY['labor'],''),
 ('PL-LAB-24','BMS/commissioning technician','Labor','MEP','day',40.00,ARRAY['labor'],''),
-- ── MEP labor-only subcontract rates ───────────────────────────────────────
 ('PL-LOS-20','Labor-only: electrical conduit + wiring','Labor','MEP','m2',4.50,ARRAY['labor','subcon'],'Floor area rate'),
 ('PL-LOS-21','Labor-only: plumbing waste/water','Labor','MEP','m2',3.80,ARRAY['labor','subcon'],'Floor area rate'),
 ('PL-LOS-22','Labor-only: HVAC duct + install','Labor','MEP','m2',3.50,ARRAY['labor','subcon'],'Floor area rate'),
 ('PL-LOS-23','Labor-only: fire sprinkler fitting','Labor','MEP','m2',2.20,ARRAY['labor','subcon'],'Floor area rate'),
-- ── MEP plant & consumables ────────────────────────────────────────────────
 ('PL-PLT-30','Pipe threading machine (electric), rental','Plant','MEP','day',18.00,ARRAY['plant'],''),
 ('PL-PLT-31','Hydraulic crimping tool, rental','Plant','MEP','day',12.00,ARRAY['plant'],''),
 ('PL-PLT-32','Pipe bender (manual), rental','Plant','MEP','day',5.00,ARRAY['plant'],''),
 ('PL-PLT-33','Pressure test pump (electric), rental','Plant','MEP','day',15.00,ARRAY['plant'],''),
 ('PL-PLT-34','Duct leakage tester, rental','Plant','MEP','day',30.00,ARRAY['plant'],''),
-- ── Refrigerant & consumables ──────────────────────────────────────────────
 ('PL-FUE-02','R-410A refrigerant, per kg','HVAC','MEP','kg',8.50,ARRAY['hvac','refrigerant'],''),
 ('PL-FUE-03','Nitrogen gas cylinder (for purging/testing)','HVAC','MEP','ea',12.00,ARRAY['hvac','consumable'],'')
) AS v(code, description, trade, discipline, unit, unit_price, tags, notes)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- End of MEP rate library seed (103 items)
