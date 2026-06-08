DO $$
DECLARE
  pid uuid;
  uid uuid;
BEGIN
  -- Get or create a demo project
  SELECT id INTO pid FROM public.projects LIMIT 1;
  IF pid IS NULL THEN
    INSERT INTO public.projects (project_name, project_code, status, start_date, end_date)
    VALUES ('Demo Construction Project', 'DCP-2026', 'active', '2026-01-01', '2027-12-31')
    RETURNING id INTO pid;
  END IF;

  -- Get a demo user
  SELECT id INTO uid FROM auth.users LIMIT 1;

  -- Insert sample contracts
  INSERT INTO public.contract_register (project_id, contract_no, contract_type, title, party_name, contract_value, currency, start_date, end_date, status, governing_law, dispute_resolution, notes, created_by)
  VALUES
    (pid, 'HC-001', 'head_contract', 'Main Building Works', 'ABC Construction Corp', 15000000, 'USD', '2026-01-15', '2027-12-31', 'active', 'Laws of Cambodia', 'Arbitration', 'Main contract for Phase 1 & 2', uid),
    (pid, 'HC-002', 'head_contract', 'MEP Installation', 'MEP Solutions Ltd', 3500000, 'USD', '2026-03-01', '2027-06-30', 'active', 'Laws of Cambodia', 'Mediation then Arbitration', uid),
    (pid, 'SC-001', 'subcontract', 'Steel Structure Works', 'SteelMaster Pte Ltd', 2200000, 'SGD', '2026-02-01', '2027-03-31', 'active', 'Singapore Law', 'Arbitration in Singapore', uid),
    (pid, 'SC-002', 'subcontract', 'Excavation & Earthworks', 'EarthWorks Co', 850000, 'USD', '2026-01-20', '2026-08-31', 'completed', 'Laws of Cambodia', 'Court', uid);

  -- Insert sample employer instructions
  INSERT INTO public.contract_employer_instructions (contract_id, instruction_no, title, description, type, instruction_date, time_extension_days, cost_impact, status, created_by)
  SELECT c.id, 'EI-001', 'Revised Foundation Depth', 'Increase foundation depth by 0.5m due to soil conditions', 'variation', '2026-03-15', 14, 120000, 'complied', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001'
  UNION ALL
  SELECT c.id, 'EI-002', 'Accelerate Steel Works', 'Request to expedite steel erection for critical path recovery', 'direction', '2026-04-01', 0, 0, 'received', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001'
  UNION ALL
  SELECT c.id, 'EI-003', 'MEP Design Clarification', 'Clarification on HVAC duct routing through core walls', 'clarification', '2026-05-10', 0, 0, 'closed', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-002';

  -- Insert sample contractual notices
  INSERT INTO public.contractual_notices (contract_id, notice_no, notice_type, title, description, trigger_event, contract_clause, days_from_event, deadline_date, status, created_by)
  SELECT c.id, 'NOC-001', 'notice_of_claim', 'Additional Piling Works', 'Encountered unexpected rock layer requiring deeper piling', 'Rock layer encountered during piling at Grid B-12', 'Clause 12.3', 14, '2026-06-15', 'pending', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001'
  UNION ALL
  SELECT c.id, 'NOD-001', 'notice_of_delay', 'Steel Import Delay', 'Steel fabrication delayed due to port congestion in Singapore', 'Port closure notice received', 'Clause 8.4', 7, '2026-07-01', 'served', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001'
  UNION ALL
  SELECT c.id, 'EOT-001', 'extension_of_time', 'Weather-Related Delay', 'Monsoon season caused 18 lost days on excavation', 'Continuous rainfall exceeding 50mm for 5 days', 'Clause 8.5', 21, '2026-08-30', 'acknowledged', uid
  FROM public.contract_register c WHERE c.contract_no = 'SC-002';

  -- Insert sample entitlements
  INSERT INTO public.entitlement_register (contract_id, entitlement_no, title, description, category, trigger_event, contract_clause, estimated_time_days, estimated_cost, approved_time_days, approved_cost, status, created_by)
  SELECT c.id, 'ENT-001', 'Additional Piling Entitlement', 'Time and cost for unexpected rock layer piling', 'both', 'Rock layer at Grid B-12', 'Clause 12.3', 21, 180000, 14, 150000, 'partially_approved', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001'
  UNION ALL
  SELECT c.id, 'ENT-002', 'Monsoon Recovery Entitlement', 'Time extension for weather-related excavation delay', 'time', 'Monsoon rainfall', 'Clause 8.5', 18, 0, 14, 0, 'approved', uid
  FROM public.contract_register c WHERE c.contract_no = 'SC-002';

  -- Insert sample correspondence
  INSERT INTO public.contract_correspondence (contract_id, correspondence_no, direction, subject, body, correspondence_date, from_party, to_party, category, created_by)
  SELECT c.id, 'CORR-001', 'outgoing', 'Foundation Design Approval Request', 'Please find attached the revised foundation design for your approval as per EI-001.', '2026-03-20', 'Contractor', 'Employer', 'formal_letter', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001'
  UNION ALL
  SELECT c.id, 'CORR-002', 'incoming', 'Steel Works Acceleration Confirmation', 'We acknowledge receipt of EI-002 and confirm acceleration measures are in place.', '2026-04-05', 'Employer', 'Contractor', 'formal_letter', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001'
  UNION ALL
  SELECT c.id, 'CORR-003', 'outgoing', 'Monthly Progress Meeting Minutes - May 2026', 'Minutes of meeting held on 25 May 2026 covering progress, issues, andlookahead.', '2026-05-26', 'Contractor', 'All Parties', 'minutes_of_meeting', uid
  FROM public.contract_register c WHERE c.contract_no = 'HC-001';

END;
$$;
