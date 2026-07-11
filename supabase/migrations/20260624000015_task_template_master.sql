-- Task Template Library: reusable master task definitions for future project task generation.

create table if not exists public.task_template_master (
  id uuid primary key default gen_random_uuid(),
  template_code text not null unique,
  task_name text not null,
  category text not null default 'Construction Tasks',
  phase_id uuid references public.phase_master(id) on delete set null,
  discipline_id uuid references public.discipline_master(id) on delete set null,
  task_group_id uuid references public.task_group_master(id) on delete set null,
  default_duration numeric not null default 1 check (default_duration >= 0),
  duration_unit text not null default 'days',
  default_weight numeric check (default_weight is null or default_weight >= 0),
  predecessor text,
  successor text,
  milestone boolean not null default false,
  approval_required boolean not null default false,
  default_priority text not null default 'medium'
    check (default_priority in ('low', 'medium', 'high', 'critical')),
  requires_document boolean not null default false,
  requires_photo boolean not null default false,
  requires_checklist boolean not null default false,
  requires_inspection boolean not null default false,
  auto_assign_role text,
  deliverable text,
  required_document text,
  approval_workflow text,
  dependency text,
  description text,
  remarks text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_task_template_master_category
  on public.task_template_master(category);

create index if not exists idx_task_template_master_phase
  on public.task_template_master(phase_id);

create index if not exists idx_task_template_master_discipline
  on public.task_template_master(discipline_id);

create index if not exists idx_task_template_master_task_group
  on public.task_template_master(task_group_id);

alter table public.task_template_master enable row level security;

drop policy if exists "task_template_master authenticated view" on public.task_template_master;
drop policy if exists "task_template_master privileged manage" on public.task_template_master;

create policy "task_template_master authenticated view"
  on public.task_template_master for select to authenticated
  using (true);

create policy "task_template_master privileged manage"
  on public.task_template_master for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

insert into public.task_template_master (
  template_code,
  task_name,
  category,
  phase_id,
  discipline_id,
  task_group_id,
  default_duration,
  default_priority,
  predecessor,
  successor,
  milestone,
  approval_required,
  requires_document,
  requires_photo,
  requires_checklist,
  requires_inspection,
  auto_assign_role,
  deliverable,
  required_document,
  description
)
select
  seed.template_code,
  seed.task_name,
  seed.category,
  phase.id,
  discipline.id,
  task_group.id,
  seed.default_duration,
  seed.default_priority,
  seed.predecessor,
  seed.successor,
  seed.milestone,
  seed.approval_required,
  seed.requires_document,
  seed.requires_photo,
  seed.requires_checklist,
  seed.requires_inspection,
  seed.auto_assign_role,
  seed.deliverable,
  seed.required_document,
  seed.description
from (
  values
    ('STR-D-001', 'Prepare Design Criteria', 'Design Tasks', 'PH-002', 'STR', 'TG-DES', 3, 'medium', null, 'STR-D-002', false, true, true, false, true, false, 'Design Engineer', 'Design Criteria', 'PDF', 'Prepare structural design criteria.'),
    ('STR-D-002', 'Prepare Loading Summary', 'Design Tasks', 'PH-002', 'STR', 'TG-CALC', 2, 'medium', 'STR-D-001', 'STR-D-003', false, true, true, false, true, false, 'Design Engineer', 'Loading Summary', 'PDF', 'Prepare design loading summary.'),
    ('STR-D-003', 'ETABS Modelling', 'Design Tasks', 'PH-002', 'STR', 'TG-CALC', 5, 'high', 'STR-D-002', 'STR-D-005', false, false, true, false, true, false, 'Design Engineer', 'ETABS File', 'ETABS File', 'Create ETABS model.'),
    ('STR-D-010', 'Issue IFC Drawing', 'Design Tasks', 'PH-002', 'STR', 'TG-DRW', 2, 'critical', 'STR-D-009', null, true, true, true, false, true, false, 'Design Engineer', 'IFC Drawing', 'DWG/PDF', 'Issue structural IFC drawing.'),
    ('ARC-D-001', 'Layout Plan', 'Design Tasks', 'PH-002', 'ARC', 'TG-DES', 3, 'medium', null, 'ARC-D-002', false, true, true, false, true, false, 'Design Engineer', 'Layout Plan', 'DWG/PDF', 'Prepare architectural layout plan.'),
    ('ARC-D-010', 'Issue IFC Drawing', 'Design Tasks', 'PH-002', 'ARC', 'TG-DRW', 2, 'critical', 'ARC-D-009', null, true, true, true, false, true, false, 'Design Engineer', 'IFC Drawing', 'DWG/PDF', 'Issue architectural IFC drawing.'),
    ('MEP-D-001', 'HVAC Design', 'Design Tasks', 'PH-002', 'MEP', 'TG-DES', 4, 'medium', null, 'MEP-D-008', false, true, true, false, true, false, 'Design Engineer', 'HVAC Design', 'PDF/DWG', 'Prepare HVAC design.'),
    ('MEP-D-008', 'Clash Coordination', 'Design Tasks', 'PH-002', 'MEP', 'TG-DES', 3, 'high', 'MEP-D-001', 'MEP-D-010', false, true, true, false, true, false, 'BIM Engineer', 'Clash Report', 'PDF', 'Coordinate MEP clashes.'),
    ('PROC-001', 'Raise Material Request', 'Procurement Tasks', 'PH-003', 'PRC', 'TG-PRC', 1, 'medium', null, 'PROC-002', false, false, true, false, false, false, 'Procurement Officer', 'Material Request', 'MR', 'Raise material request.'),
    ('PROC-004', 'RFQ Issue', 'Procurement Tasks', 'PH-003', 'PRC', 'TG-PRC', 2, 'high', 'PROC-003', 'PROC-005', false, true, true, false, false, false, 'Procurement Manager', 'RFQ', 'RFQ', 'Issue request for quotation.'),
    ('PROC-008', 'Issue PO', 'Procurement Tasks', 'PH-003', 'PRC', 'TG-PRC', 1, 'critical', 'PROC-007', 'PROC-009', true, true, true, false, false, false, 'Procurement Manager', 'Purchase Order', 'PO', 'Issue purchase order.'),
    ('CON-001', 'Survey Setting Out', 'Construction Tasks', 'PH-004', 'CON', 'TG-CON', 1, 'medium', null, 'CON-002', false, false, false, true, true, true, 'Site Engineer', 'Survey Record', null, 'Set out work location.'),
    ('CON-002', 'Install Formwork', 'Construction Tasks', 'PH-004', 'CON', 'TG-CON', 2, 'medium', 'CON-001', 'CON-003', false, false, false, true, true, true, 'Site Engineer', 'Formwork Ready', null, 'Install formwork.'),
    ('CON-003', 'Install Rebar', 'Construction Tasks', 'PH-004', 'CON', 'TG-CON', 2, 'high', 'CON-002', 'CON-004', false, false, false, true, true, true, 'Site Engineer', 'Rebar Installed', null, 'Install reinforcement.'),
    ('CON-006', 'Consultant Inspection', 'Construction Tasks', 'PH-004', 'QAQC', 'TG-INS', 1, 'critical', 'CON-005', 'CON-007', true, true, true, true, true, true, 'QAQC Engineer', 'Inspection Approval', 'IR', 'Consultant inspection before casting.'),
    ('CON-007', 'Concrete Casting', 'Construction Tasks', 'PH-004', 'CON', 'TG-CON', 1, 'critical', 'CON-006', 'CON-008', true, true, true, true, true, true, 'Site Engineer', 'Pour Card', 'Pour Card', 'Cast concrete.'),
    ('QA-001', 'Prepare ITP', 'QAQC Tasks', 'PH-004', 'QAQC', 'TG-INS', 2, 'high', null, 'QA-002', false, true, true, false, true, true, 'QAQC Engineer', 'ITP', 'PDF', 'Prepare inspection and test plan.'),
    ('QA-002', 'Inspection Request', 'QAQC Tasks', 'PH-004', 'QAQC', 'TG-INS', 1, 'high', 'QA-001', 'QA-003', false, true, true, false, true, true, 'QAQC Engineer', 'IR', 'IR', 'Submit inspection request.'),
    ('QA-004', 'Raise NCR', 'QAQC Tasks', 'PH-004', 'QAQC', 'TG-INS', 1, 'high', 'QA-003', 'QA-005', false, true, true, true, true, true, 'QAQC Engineer', 'NCR', 'NCR', 'Raise non-conformance report.'),
    ('HSE-001', 'Toolbox Meeting', 'HSE Tasks', 'PH-004', 'HSE', 'TG-CON', 1, 'medium', null, null, false, false, true, true, true, false, 'HSE Officer', 'Toolbox Record', 'Attendance Record', 'Conduct toolbox meeting.'),
    ('HSE-003', 'Work Permit', 'HSE Tasks', 'PH-004', 'HSE', 'TG-CON', 1, 'high', null, null, false, true, true, false, true, true, 'HSE Officer', 'Work Permit', 'Permit', 'Issue work permit.'),
    ('HSE-004', 'Safety Inspection', 'HSE Tasks', 'PH-004', 'HSE', 'TG-INS', 1, 'high', null, null, false, true, true, true, true, true, 'HSE Officer', 'Safety Inspection Report', 'Report', 'Perform safety inspection.')
) as seed (
  template_code,
  task_name,
  category,
  phase_code,
  discipline_code,
  task_group_code,
  default_duration,
  default_priority,
  predecessor,
  successor,
  milestone,
  approval_required,
  requires_document,
  requires_photo,
  requires_checklist,
  requires_inspection,
  auto_assign_role,
  deliverable,
  required_document,
  description
)
left join public.phase_master phase on phase.phase_code = seed.phase_code
left join public.discipline_master discipline on discipline.discipline_code = seed.discipline_code
left join public.task_group_master task_group on task_group.task_group_code = seed.task_group_code
on conflict (template_code) do update set
  task_name = excluded.task_name,
  category = excluded.category,
  phase_id = excluded.phase_id,
  discipline_id = excluded.discipline_id,
  task_group_id = excluded.task_group_id,
  default_duration = excluded.default_duration,
  default_priority = excluded.default_priority,
  predecessor = excluded.predecessor,
  successor = excluded.successor,
  milestone = excluded.milestone,
  approval_required = excluded.approval_required,
  requires_document = excluded.requires_document,
  requires_photo = excluded.requires_photo,
  requires_checklist = excluded.requires_checklist,
  requires_inspection = excluded.requires_inspection,
  auto_assign_role = excluded.auto_assign_role,
  deliverable = excluded.deliverable,
  required_document = excluded.required_document,
  description = excluded.description,
  updated_at = now();
