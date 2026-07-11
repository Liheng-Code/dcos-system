-- Stage Master Library: reusable design/construction stage definitions.

create table if not exists public.stage_master (
  id uuid primary key default gen_random_uuid(),
  stage_code text not null unique,
  stage_name text not null,
  sequence_no int not null default 0,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stage_master_sequence
  on public.stage_master(sequence_no);

alter table public.stage_master enable row level security;

drop policy if exists "stage_master authenticated view" on public.stage_master;
drop policy if exists "stage_master privileged manage" on public.stage_master;

create policy "stage_master authenticated view"
  on public.stage_master for select to authenticated
  using (true);

create policy "stage_master privileged manage"
  on public.stage_master for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

-- Seed default stages covering the design-to-completion lifecycle.
insert into public.stage_master (stage_code, stage_name, sequence_no, description) values
  ('STG-FEAS', 'Feasibility / Concept',       10, 'Project feasibility study, site analysis, and initial concept development.'),
  ('STG-DES-PRP', 'Design Proposal',          20, 'Preliminary design proposal with scope, budget, and schedule outline.'),
  ('STG-DES-CON', 'Design Concept',           30, 'Concept design with architectural and engineering options.'),
  ('STG-SCH-DES', 'Schematic Design',         40, 'Schematic design development including floor plans, sections, and elevations.'),
  ('STG-DES-DEV', 'Design Development',       50, 'Detailed design development with coordinated discipline inputs.'),
  ('STG-DET-DES', 'Detailed Design',          60, 'Final detailed design ready for construction documentation.'),
  ('STG-TENDER',  'Tender / Bidding',         70, 'Tender documentation, bid evaluation, and contractor award.'),
  ('STG-SHOP-DWG', 'Shop Drawing',            80, 'Shop drawing preparation and approval cycle.'),
  ('STG-CONST',   'Construction',             90, 'On-site construction, installation, and execution.'),
  ('STG-COMM',    'Commissioning',           100, 'Systems testing, commissioning, and performance verification.'),
  ('STG-AS-BLT',  'As-Built',                110, 'As-built documentation and record drawing submission.'),
  ('STG-HO',      'Handover / Closeout',      120, 'Project handover, final documentation, and closeout.')
on conflict (stage_code) do update set
  stage_name = excluded.stage_name,
  sequence_no = excluded.sequence_no,
  description = excluded.description,
  updated_at = now();
