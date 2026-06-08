DO $$
DECLARE
  sid uuid;
  uid uuid;
  rid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users LIMIT 1;

  -- 1. Approved supplier — full PQ
  INSERT INTO public.procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, phone, address, tax_id, bank_name, bank_account, payment_terms, status, pq_status, pq_score, pq_approved_at, pq_expires_at, notes)
  VALUES ('SUP-001', 'ABC Construction Corp', 'contractor', 'Heng Kimseng', 'kimseng@abcconstruction.com', '+855 12 345 678', 'Phnom Penh, Cambodia', 'KH-001-ABC', 'ABA Bank', 'ABA-123456789', 'net_45', 'active', 'approved', 87, '2026-01-15', '2027-01-15', 'Main building contractor — approved for all structural works')
  RETURNING id INTO sid;

  INSERT INTO public.supplier_pq_records (supplier_id, legal_status, registration_number, paid_up_capital, years_in_business, audited_accounts_available, annual_turnover, credit_rating, bank_reference, scope_of_work, equipment_summary, key_personnel_summary, project_references, quality_certifications, hse_incident_frequency, hse_near_miss_rate, insurance_summary, status, reviewer_notes, final_score, submitted_at, reviewed_at)
  VALUES (sid, 'Private Limited Company', 'KH-ABC-2025-001', 2000000, 15, true, 8500000, 'BBB+', 'ABA Bank — Good standing since 2018', 'General building construction, reinforced concrete structures, finishing works', 'Tower crane x3, excavator x8, concrete pump x4, scaffolding (50,000 sqm)', 'Project Director: Chhay Vuthy (20yr), QA/QC Manager: Meas Sophat (12yr), HSE Manager: Sok Dara (10yr)', '1) Twin Tower 32F — $28M (2023), 2) Factory Phase 2 — $12M (2024), 3) Hospital Wing — $8M (2025)', 'ISO 9001:2020, ISO 14001:2021, ISO 45001:2021', 0.8, 2.1, 'Public Liability $5M, Employer Liability $2M, Professional Indemnity $3M, Plant All Risk $10M, CAR $25M', 'approved', 'Strong financials and excellent track record. All certs valid.', 87, '2026-01-10', '2026-01-15');
  rid := (SELECT id FROM public.supplier_pq_records WHERE supplier_id = sid LIMIT 1);

  INSERT INTO public.supplier_pq_documents (supplier_id, pq_record_id, document_category, document_name, reference_number, issue_date, expiry_date, verification_status)
  VALUES
    (sid, rid, 'company_registration', 'Business Registration Certificate', 'KH-ABC-REG-001', '2020-01-01', '2030-01-01', 'verified'),
    (sid, rid, 'audited_accounts', 'FY2024 Audited Financial Statements', 'AUD-2024-001', '2025-03-15', NULL, 'verified'),
    (sid, rid, 'bank_reference', 'ABA Bank Reference Letter', 'ABA-REF-2025-001', '2025-01-10', NULL, 'verified'),
    (sid, rid, 'iso_9001', 'ISO 9001:2020 Certificate', 'QMS-2020-001', '2020-06-01', '2026-06-01', 'verified'),
    (sid, rid, 'iso_14001', 'ISO 14001:2021 Certificate', 'EMS-2021-001', '2021-08-01', '2027-08-01', 'verified'),
    (sid, rid, 'iso_45001', 'ISO 45001:2021 Certificate', 'OHS-2021-001', '2021-08-01', '2027-08-01', 'verified'),
    (sid, rid, 'public_liability', 'Public Liability Insurance', 'PLI-2026-001', '2026-01-01', '2026-12-31', 'verified'),
    (sid, rid, 'professional_indemnity', 'Professional Indemnity Insurance', 'PII-2026-001', '2026-01-01', '2026-12-31', 'verified');

  INSERT INTO public.supplier_approved_trades (supplier_id, trade_category, approval_scope, approved_until, status)
  VALUES
    (sid, 'Structural Works (RC Frame)', 'Reinforced concrete structures up to 40 storeys', '2027-01-15', 'active'),
    (sid, 'Finishing Works', 'Internal & external finishing, plastering, tiling, painting', '2027-01-15', 'active'),
    (sid, 'Excavation & Earthworks', 'Bulk excavation, shoring, dewatering up to 15m depth', '2027-01-15', 'active');

  INSERT INTO public.supplier_performance_scores (supplier_id, score_period_start, score_period_end, delivery_score, quality_score, responsiveness_score, commercial_score, hse_score, overall_score, notes)
  VALUES
    (sid, '2026-Q1', '2026-03-31', 85, 90, 88, 82, 95, 88, 'Consistent performer. HSE exceeds expectations.'),
    (sid, '2026-01-01', '2026-03-31', 80, 92, 85, 78, 90, 85, 'Quality remains excellent. Delivery slightly behind schedule.');

  -- 2. Submitted — under review
  INSERT INTO public.procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, phone, address, tax_id, bank_name, bank_account, payment_terms, status, pq_status, notes)
  VALUES ('SUP-002', 'MEP Solutions Ltd', 'subcontractor', 'Chen Dara', 'dara@mepsolutions.com', '+855 23 567 890', 'Phnom Penh, Cambodia', 'KH-002-MEP', 'ACLEDA Bank', 'ACL-987654321', 'net_30', 'active', 'under_review', 'MEP subcontractor — under evaluation')
  RETURNING id INTO sid;

  INSERT INTO public.supplier_pq_records (supplier_id, legal_status, registration_number, paid_up_capital, years_in_business, audited_accounts_available, annual_turnover, credit_rating, bank_reference, scope_of_work, equipment_summary, key_personnel_summary, project_references, quality_certifications, hse_incident_frequency, hse_near_miss_rate, insurance_summary, status, submitted_at)
  VALUES (sid, 'Private Limited Company', 'KH-MEP-2025-002', 800000, 10, true, 3200000, 'BB+', 'ACLEDA Bank — Good standing since 2016', 'MEP design, supply, installation & commissioning for commercial buildings', 'HVAC duct fabrication line, test rigs, calibration equipment', 'MEP Director: Srey Mom (18yr), Design Lead: Kimly (12yr), Project Engineer: Sarach (8yr)', '1) Hotel 25F MEP — $5M (2024), 2) Office Tower MEP upgrade — $3M (2023)', 'ISO 9001:2020, ISO 14001:2021', 1.2, 3.5, 'Public Liability $3M, Professional Indemnity $2M, CAR $8M', 'submitted', '2026-05-20');
  rid := (SELECT id FROM public.supplier_pq_records WHERE supplier_id = sid LIMIT 1);

  INSERT INTO public.supplier_pq_documents (supplier_id, pq_record_id, document_category, document_name, reference_number, expiry_date, verification_status)
  VALUES
    (sid, rid, 'company_registration', 'Business Registration Certificate', 'KH-MEP-REG-002', '2030-06-01', 'pending'),
    (sid, rid, 'audited_accounts', 'FY2024 Audited Financial Statements', 'AUD-MEP-2024', NULL, 'pending'),
    (sid, rid, 'technical_reference', 'Hotel 25F MEP Completion Certificate', 'REF-MEP-2024-001', NULL, 'pending'),
    (sid, rid, 'iso_9001', 'ISO 9001:2020 Certificate', 'QMS-MEP-2020', '2026-09-15', 'pending'),
    (sid, rid, 'professional_indemnity', 'Professional Indemnity Insurance', 'PII-MEP-2026', '2026-12-31', 'verified');

  INSERT INTO public.supplier_approved_trades (supplier_id, trade_category, approval_scope, approved_until, status)
  VALUES (sid, 'MEP Installation', 'HVAC, electrical, plumbing, fire protection for commercial buildings up to 30 storeys', NULL, 'active');

  -- 3. Draft — incomplete
  INSERT INTO public.procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, phone, address, tax_id, bank_name, bank_account, payment_terms, status, pq_status, notes)
  VALUES ('SUP-003', 'SteelMaster Pte Ltd', 'subcontractor', 'Ratanak Vann', 'ratanak@steelmaster.com', '+65 6789 0123', 'Singapore', 'SG-SM-003', 'DBS Singapore', 'DBS-1122334455', 'net_60', 'active', 'draft', 'Steel fabrication & erection — PQ in progress')
  RETURNING id INTO sid;

  INSERT INTO public.supplier_pq_records (supplier_id, legal_status, registration_number, paid_up_capital, years_in_business, audited_accounts_available, annual_turnover, credit_rating, scope_of_work, equipment_summary, key_personnel_summary, project_references, quality_certifications, hse_incident_frequency, hse_near_miss_rate, insurance_summary, status)
  VALUES (sid, 'Private Limited Company (Singapore)', 'SG-SM-REG-003', 1500000, 20, true, 12000000, 'A-', 'Steel fabrication, supply & erection, structural steel design-build', 'CNC plasma cutter, welding robots x12, overhead cranes x6', 'Managing Director: Thida Heng (25yr), Fabrication Manager: Kosal (18yr), Erection Manager: Visal (15yr)', '1) Sports Complex Steel Roof — $6M (2025), 2) Airport Terminal Steel Structure — $15M (2024)', 'ISO 9001:2020, ISO 14001:2021, ISO 45001:2021, AWS Certified', 0.3, 1.5, 'Public Liability $5M, Employer Liability $2M, All Risk $12M, CAR $18M', 'draft');

  INSERT INTO public.supplier_pq_documents (supplier_id, document_category, document_name, reference_number, expiry_date, verification_status)
  VALUES
    (sid, 'company_registration', 'Singapore Business Registration', 'SG-SM-REG-003', '2030-03-01', 'pending'),
    (sid, 'iso_9001', 'ISO 9001:2020 Certificate', 'QMS-SM-2020', '2026-11-30', 'pending');

  -- 4. Expired PQ
  INSERT INTO public.procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, phone, address, tax_id, bank_name, bank_account, payment_terms, status, pq_status, pq_score, pq_approved_at, pq_expires_at, notes)
  VALUES ('SUP-004', 'EarthWorks Co', 'subcontractor', 'Sokun Theara', 'theara@earthworks.com', '+855 16 789 012', 'Phnom Penh, Cambodia', 'KH-004-EW', 'CANADIA Bank', 'CAN-5544332211', 'net_30', 'inactive', 'expired', 72, '2024-01-10', '2025-01-10', 'Excavation subcontractor — PQ expired, needs renewal')
  RETURNING id INTO sid;

  INSERT INTO public.supplier_pq_records (supplier_id, legal_status, registration_number, paid_up_capital, years_in_business, audited_accounts_available, annual_turnover, credit_rating, bank_reference, scope_of_work, equipment_summary, key_personnel_summary, project_references, quality_certifications, hse_incident_frequency, hse_near_miss_rate, insurance_summary, status, final_score, submitted_at, reviewed_at)
  VALUES (sid, 'Sole Proprietorship', 'KH-EW-REG-004', 300000, 8, false, 950000, 'B', 'CANADIA Bank — satisfactory', 'Bulk excavation, backfilling, compaction, site clearance, demolition', 'Excavator x12, bulldozer x4, dump truck x20, roller compactor x4', 'Owner: Sokun Theara (15yr), Site Supervisor: Samnang (10yr)', '1) Housing Estate Earthworks — $2M (2023), 2) Factory Pad & Infrastructure — $1.5M (2024)', NULL, 2.1, 4.8, 'Public Liability $1M, Motor Vehicle Insurance only', 'expired', 72, '2024-01-05', '2024-01-10');

  -- 5. Blacklisted
  INSERT INTO public.procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, phone, address, tax_id, bank_name, bank_account, payment_terms, status, pq_status, pq_score, blacklist_reason, blacklisted_at, notes)
  VALUES ('SUP-005', 'QuickFix Services', 'general', 'Ly Vannak', 'vannak@quickfix.com', '+855 92 111 222', 'Phnom Penh, Cambodia', 'KH-005-QF', 'None', 'N/A', 'cash_on_delivery', 'blacklisted', 'blacklisted', 25, 'Failed to deliver on 3 consecutive POs. Safety violations on site (2x). Outstanding debt $45,000.', '2026-04-01', 'Blacklisted Q2 2026. Do not engage.')
  RETURNING id INTO sid;

  INSERT INTO public.supplier_pq_records (supplier_id, legal_status, registration_number, paid_up_capital, years_in_business, audited_accounts_available, annual_turnover, credit_rating, scope_of_work, insurance_summary, status, final_score, submitted_at, reviewed_at, reviewer_notes)
  VALUES (sid, 'Sole Proprietorship', 'KH-QF-REG-005', 20000, 3, false, 120000, 'C', 'General maintenance, plumbing, electrical repairs, cleaning', 'Public Liability $250K only', 'rejected', 25, '2025-12-01', '2025-12-15', 'Unacceptable financial position. No audited accounts. Overpriced. Poor references.');

  -- 6. Not started
  INSERT INTO public.procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, phone, address, tax_id, payment_terms, status, pq_status, notes)
  VALUES ('SUP-006', 'Premium Finishes Co', 'subcontractor', 'Bophea Kim', 'bophea@premiumfinishes.com', '+855 15 333 444', 'Siem Reap, Cambodia', 'KH-006-PF', 'net_45', 'active', 'not_started', 'New supplier — PQ not yet initiated')
  RETURNING id INTO sid;

  -- 7. Approved — expiring soon (triggers badge)
  INSERT INTO public.procurement_suppliers (supplier_code, supplier_name, supplier_type, contact_person, email, phone, address, tax_id, bank_name, bank_account, payment_terms, status, pq_status, pq_score, pq_approved_at, pq_expires_at, notes)
  VALUES ('SUP-007', 'TechLift Elevators', 'subcontractor', 'Nalin Soeung', 'nalin@techlift.com', '+855 77 555 666', 'Phnom Penh, Cambodia', 'KH-007-TL', 'Prudential Bank', 'PBL-9988776655', 'net_30', 'active', 'approved', 91, '2023-06-01', '2026-06-15', 'Elevator specialist — PQ expiring in <30 days, renewal needed')
  RETURNING id INTO sid;

  INSERT INTO public.supplier_pq_records (supplier_id, legal_status, registration_number, paid_up_capital, years_in_business, audited_accounts_available, annual_turnover, credit_rating, bank_reference, scope_of_work, equipment_summary, key_personnel_summary, project_references, quality_certifications, hse_incident_frequency, hse_near_miss_rate, insurance_summary, status, final_score, submitted_at, reviewed_at)
  VALUES (sid, 'Private Limited Company', 'KH-TL-REG-007', 500000, 12, true, 2800000, 'A-', 'Prudential Bank — excellent relationship since 2019', 'Elevator design, supply, installation, maintenance for low & high rise buildings', 'Installation tools, test weights, calibration equipment, service vehicle fleet', 'Technical Director: Sovann (20yr), Installation Manager: Sophea (14yr), Service Manager: Seyha (10yr)', '1) Tower Twin 32F — 8 elevators installed (2024), 2) Hospital 12F — 4 bed lifts (2025)', 'ISO 9001:2020, ISO 14001:2021, ISO 45001:2021, TÜV Certified', 0.0, 1.2, 'Public Liability $4M, Professional Indemnity $3M, Product Liability $5M, CAR $10M', 'approved', 91, '2023-05-15', '2023-06-01');

  INSERT INTO public.supplier_pq_documents (supplier_id, document_category, document_name, reference_number, issue_date, expiry_date, verification_status)
  VALUES
    (sid, 'iso_9001', 'ISO 9001:2020 Certificate', 'QMS-TL-2020', '2020-03-01', '2026-06-15', 'verified'),
    (sid, 'public_liability', 'Public Liability Insurance', 'PLI-TL-2026', '2026-01-01', '2026-12-31', 'verified');

  INSERT INTO public.supplier_approved_trades (supplier_id, trade_category, approval_scope, approved_until, status)
  VALUES
    (sid, 'Elevator Installation', 'Passenger & freight elevators up to 36 stops, speed ≤ 4 m/s', '2026-06-15', 'active'),
    (sid, 'Elevator Maintenance', 'Full maintenance contract including 24h call-out', '2026-06-15', 'active');

END;
$$;
