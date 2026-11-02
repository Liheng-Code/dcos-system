-- Phase R2 (doc 35; doc 22 P0.1 / D1-A): fill project_members so project-scoped Planning RLS
-- (is_project_member) works for the people who actually run a project, not only admins.
-- Sources: the project's named managers, Planning resources linked to a profile, task owners /
-- assignees / reviewers, and Daily Report approvers. From now on the same sources add members
-- automatically. Members are only ever added here, never removed (removal stays a deliberate act
-- on Planning > Members). role_code is left null: membership grants project access; what a member
-- may do still comes from their RBAC roles (has_permission).

create or replace function public.ensure_project_member(p_project_id uuid, p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.project_members (project_id, user_id)
  select p_project_id, p_user_id
  where p_project_id is not null and p_user_id is not null
    and exists (select 1 from public.profiles where id = p_user_id)
  on conflict (project_id, user_id) do nothing;
$$;

revoke all on function public.ensure_project_member(uuid, uuid) from public, anon, authenticated;

-- one-time backfill from every source
insert into public.project_members (project_id, user_id)
select distinct s.project_id, s.user_id
from (
  select id as project_id, project_manager_id as user_id from public.projects
  union all select id, engineering_manager_id from public.projects
  union all select id, planning_manager_id from public.projects
  union all select project_id, profile_id from public.plan_resources
  union all select project_id, owner_id from public.wbs_tasks
  union all select project_id, assignee_id from public.wbs_tasks
  union all select project_id, reviewer_id from public.wbs_tasks
  union all select project_id, user_id from public.dr_project_approvers
) s
join public.profiles p on p.id = s.user_id
where s.project_id is not null
on conflict (project_id, user_id) do nothing;

-- keep it filled: one trigger function per source table
create or replace function public.trg_members_from_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_project_member(new.id, new.project_manager_id);
  perform public.ensure_project_member(new.id, new.engineering_manager_id);
  perform public.ensure_project_member(new.id, new.planning_manager_id);
  return new;
end $$;

create or replace function public.trg_members_from_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_project_member(new.project_id, new.owner_id);
  perform public.ensure_project_member(new.project_id, new.assignee_id);
  perform public.ensure_project_member(new.project_id, new.reviewer_id);
  return new;
end $$;

create or replace function public.trg_members_from_plan_resource()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_project_member(new.project_id, new.profile_id);
  return new;
end $$;

create or replace function public.trg_members_from_dr_approver()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_project_member(new.project_id, new.user_id);
  return new;
end $$;

drop trigger if exists trg_project_members_from_project on public.projects;
create trigger trg_project_members_from_project
  after insert or update of project_manager_id, engineering_manager_id, planning_manager_id on public.projects
  for each row execute function public.trg_members_from_project();

drop trigger if exists trg_project_members_from_task on public.wbs_tasks;
create trigger trg_project_members_from_task
  after insert or update of owner_id, assignee_id, reviewer_id on public.wbs_tasks
  for each row
  when (new.owner_id is not null or new.assignee_id is not null or new.reviewer_id is not null)
  execute function public.trg_members_from_task();

drop trigger if exists trg_project_members_from_plan_resource on public.plan_resources;
create trigger trg_project_members_from_plan_resource
  after insert or update of profile_id on public.plan_resources
  for each row when (new.profile_id is not null)
  execute function public.trg_members_from_plan_resource();

drop trigger if exists trg_project_members_from_dr_approver on public.dr_project_approvers;
create trigger trg_project_members_from_dr_approver
  after insert or update of user_id on public.dr_project_approvers
  for each row execute function public.trg_members_from_dr_approver();
