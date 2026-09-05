-- Migration: 20260905100449_plan_schedule_streams.sql
-- Purpose: Additive multi-schedule comparison feature — "Internal" and
--          "External" construction schedule streams, each with its own
--          revision history, for a new comparison UI to read from
--          (Baseline vs. Internal vs. External).
-- Depends on:
--   public.projects (20260527000008_create_projects.sql)
--   public.profiles (20260526_0001_create_profiles.sql)
--   public.wbs_tasks (20260527000016_create_wbs_enterprise_tables.sql)
--
-- This is a fully separate, additive system. It does NOT touch
-- public.wbs_baselines, set_baseline(), clear_baseline(),
-- activate_baseline(), or get_schedule_variance() — those keep working
-- exactly as today. RLS policy style deliberately mirrors the existing
-- blanket-authenticated pattern used for wbs_baselines / wbs_tasks in
-- 20260527000016_create_wbs_enterprise_tables.sql (lines 126-137), for
-- consistency with the rest of this schema.

-- ── 1. Schedule streams (one per Internal/External schedule track) ────────
create table public.plan_schedule_streams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stream_type text not null check (stream_type in ('internal','external')),
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index idx_plan_schedule_streams_project on public.plan_schedule_streams(project_id);

-- ── 2. Schedule revisions (append-only history per stream) ────────────────
create table public.plan_schedule_revisions (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.plan_schedule_streams(id) on delete cascade,
  revision_number int not null,
  note text,
  snapshot_data jsonb not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (stream_id, revision_number)
);
create index idx_plan_schedule_revisions_stream on public.plan_schedule_revisions(stream_id);

-- ── 3. RLS ──────────────────────────────────────────────────────────────
alter table public.plan_schedule_streams enable row level security;
alter table public.plan_schedule_revisions enable row level security;

create policy "Authenticated users can view plan_schedule_streams"
  on public.plan_schedule_streams for select to authenticated using (true);

create policy "Authenticated users can insert plan_schedule_streams"
  on public.plan_schedule_streams for insert to authenticated with check (true);

create policy "Authenticated users can update plan_schedule_streams"
  on public.plan_schedule_streams for update to authenticated using (true) with check (true);

create policy "Admins can delete plan_schedule_streams"
  on public.plan_schedule_streams for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Authenticated users can view plan_schedule_revisions"
  on public.plan_schedule_revisions for select to authenticated using (true);

create policy "Authenticated users can insert plan_schedule_revisions"
  on public.plan_schedule_revisions for insert to authenticated with check (true);

create policy "Authenticated users can update plan_schedule_revisions"
  on public.plan_schedule_revisions for update to authenticated using (true) with check (true);

create policy "Admins can delete plan_schedule_revisions"
  on public.plan_schedule_revisions for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ── 4. RPC: capture a revision snapshot of the project's current schedule ──
create or replace function public.capture_schedule_revision(p_stream_id uuid, p_note text default null)
returns int
language plpgsql
security invoker
as $$
declare
  v_project_id uuid;
  v_next int;
  v_snapshot jsonb;
begin
  select project_id into v_project_id from public.plan_schedule_streams where id = p_stream_id;
  if v_project_id is null then
    raise exception 'Schedule stream not found';
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_next
    from public.plan_schedule_revisions where stream_id = p_stream_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'start_date', start_date, 'end_date', end_date, 'budget_cost', budget_cost)
           order by id), '[]'::jsonb)
    into v_snapshot
    from public.wbs_tasks
   where project_id = v_project_id
     and start_date is not null and end_date is not null;

  insert into public.plan_schedule_revisions (stream_id, revision_number, note, snapshot_data, created_by)
  values (p_stream_id, v_next, p_note, jsonb_build_object('captured_at', now(), 'tasks', v_snapshot), auth.uid());

  return v_next;
end;
$$;

grant execute on function public.capture_schedule_revision(uuid, text) to authenticated;
