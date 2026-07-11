-- ============================================================
-- Assign department to all employees based on job title
-- Matches the UI dropdown values used in employee detail form:
--   Management, Architecture, Structure, MEP, Procurement,
--   Quantity Surveying, Construction, Account & Finance, HR & Admin
-- ============================================================

update public.profiles
  set department = case
    -- Site Engineer → Construction (always site-based, regardless of specialty suffix)
    when job_title ilike 'Site Engineer%' then 'Construction'

    -- Construction Manager / Construction Senior
    when job_title ilike '%Construction%' then 'Construction'

    -- Architecture: Architect Manager, Architectural Senior, Architectural Design, etc.
    when job_title ilike '%Architect%' then 'Architecture'

    -- Structure: Structure Manager, Structure Senior, Structure Design, etc.
    when job_title ilike '%Structure%' then 'Structure'

    -- MEP: MEP Manager, MEP Senior, MEP Design
    when job_title ilike '%MEP%' then 'MEP'

    -- HR & Admin: HR Manager, HR Senior, HR-01/02
    when job_title ilike '%HR%' then 'HR & Admin'

    -- Account & Finance: Account Manager/Senior, Accountant, Account
    when job_title ilike '%Account%' then 'Account & Finance'

    -- Procurement: Procurement Manager, Procurement Senior, Procurement-01/02
    when job_title ilike '%Procurement%' then 'Procurement'

    -- Management: Managing Director, General Manager, Project Manager
    when job_title in ('Managing Director', 'General Manager', 'Project Manager') then 'Management'

    -- Fallback: keep existing department if job title is unrecognised
    else department
  end
where job_title is not null
  and (
    department is null
    or department != case
      when job_title ilike 'Site Engineer%' then 'Construction'
      when job_title ilike '%Construction%' then 'Construction'
      when job_title ilike '%Architect%' then 'Architecture'
      when job_title ilike '%Structure%' then 'Structure'
      when job_title ilike '%MEP%' then 'MEP'
      when job_title ilike '%HR%' then 'HR & Admin'
      when job_title ilike '%Account%' then 'Account & Finance'
      when job_title ilike '%Procurement%' then 'Procurement'
      when job_title in ('Managing Director', 'General Manager', 'Project Manager') then 'Management'
      else department
    end
  );
