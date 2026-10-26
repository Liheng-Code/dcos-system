-- Task Team Planning, slice 1: assignment semantics + department backfill.
-- See docs/04-Business-Modules/04-04-Task-Management/13-Team-Planning-Addendum.md

-- 1. wbs_tasks.assignee_id historically held the ASSIGNING user (assignTaskToProfile wrote
--    the actor). owner_id is the person in charge. Record the assigner explicitly.
alter table public.wbs_tasks
  add column if not exists assigned_by uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_at timestamptz;

update public.wbs_tasks
   set assigned_by = assignee_id
 where assigned_by is null
   and assignee_id is not null
   and owner_id is not null
   and exists (select 1 from public.profiles p where p.id = wbs_tasks.assignee_id);

comment on column public.wbs_tasks.assignee_id is
  'DEPRECATED: historically the user who made the assignment. Use owner_id (person in charge) and assigned_by.';
comment on column public.wbs_tasks.assigned_by is 'User who assigned owner_id.';

-- 2. Backfill wbs_tasks.department_id from the free-text discipline. Only rows with no
--    department are touched; unmapped disciplines stay NULL.
with map(discipline_key, department_code) as (values
  ('architectural','DESIGN'), ('structural','DESIGN'), ('mep','DESIGN'), ('civil','DESIGN'),
  ('bim','DESIGN'), ('shopdrawings','DESIGN'), ('design','DESIGN'), ('electrical','DESIGN'),
  ('hvac','DESIGN'), ('plumbing','DESIGN'), ('elv','DESIGN'), ('firefighting','DESIGN'),
  ('firealarm','DESIGN'), ('landscape','DESIGN'),
  ('qa/qc','QA'),
  ('procurement','PROC'),
  ('commissioning','CONST'), ('handover','CONST')
)
update public.wbs_tasks t
   set department_id = d.id
  from map m
  join public.departments d on d.department_code = m.department_code
 where t.department_id is null
   and t.discipline is not null
   and lower(regexp_replace(t.discipline, '\s', '', 'g')) = m.discipline_key;

create index if not exists wbs_tasks_department_idx on public.wbs_tasks (department_id);
create index if not exists wbs_tasks_owner_idx on public.wbs_tasks (owner_id);
