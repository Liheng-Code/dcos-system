-- ============================================================================
-- MS Project Sync (Phase 0) — sync provenance columns + session/event tables
-- ============================================================================

-- ── 1. wbs_tasks sync provenance columns ─────────────────────────────────────
alter table public.wbs_tasks add column if not exists msp_uid           text;
alter table public.wbs_tasks add column if not exists msp_outline_number text;
alter table public.wbs_tasks add column if not exists sync_source       text
  default 'manual' check (sync_source in ('manual', 'library', 'template', 'ms_project'));
alter table public.wbs_tasks add column if not exists last_synced_at    timestamptz;
alter table public.wbs_tasks add column if not exists sync_hash         text;

create index if not exists idx_wbs_tasks_msp_uid
  on public.wbs_tasks(project_id, msp_uid);

-- ── 2. Per-project sync config ───────────────────────────────────────────────
create table if not exists public.wbs_projects_sync (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null unique references public.projects(id) on delete cascade,
  source_type          text not null default 'ms_project'
                         check (source_type in ('ms_project', 'primavera')),
  source_identifier    text,
  source_name          text,
  mode                 text not null default 'merge'
                         check (mode in ('merge', 'replace')),
  sync_level           int not null default 3 check (sync_level between 1 and 5),
  sync_progress        boolean not null default false,
  default_wbs_node_id  uuid references public.wbs_nodes(id) on delete set null,
  settings             jsonb not null default '{}'::jsonb,
  status               text not null default 'inactive'
                         check (status in ('inactive', 'active', 'error')),
  last_synced_at       timestamptz,
  last_sync_hash       text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── 3. Sync sessions (one per import/export attempt) ────────────────────────
create table if not exists public.wbs_sync_sessions (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  sync_config_id    uuid references public.wbs_projects_sync(id) on delete set null,
  direction         text not null check (direction in ('import', 'export')),
  status            text not null default 'preview'
                      check (status in ('preview', 'committed', 'rejected', 'exported', 'error')),
  file_name         text,
  source_hash       text,
  payload           jsonb not null default '{}'::jsonb,
  summary           jsonb not null default '{}'::jsonb,
  error             text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  committed_at      timestamptz
);

-- ── 4. Per-task ops within a session ────────────────────────────────────────
create table if not exists public.wbs_sync_events (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.wbs_sync_sessions(id) on delete cascade,
  wbs_task_id     uuid references public.wbs_tasks(id) on delete set null,
  action          text not null check (action in ('create', 'update', 'unchanged', 'orphan', 'skip')),
  status          text not null default 'pending'
                    check (status in ('pending', 'applied', 'skipped', 'failed')),
  msp_uid         text,
  outline_number  text,
  changes         jsonb not null default '{}'::jsonb,
  error           text,
  created_at      timestamptz not null default now(),
  applied_at      timestamptz
);

-- ── 5. Indexes ──────────────────────────────────────────────────────────────
create index if not exists idx_wbs_projects_sync_project
  on public.wbs_projects_sync(project_id);
create index if not exists idx_wbs_sync_sessions_project
  on public.wbs_sync_sessions(project_id);
create index if not exists idx_wbs_sync_events_session
  on public.wbs_sync_events(session_id);

-- ── 6. updated_at maintenance ────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_wbs_projects_sync_updated_at on public.wbs_projects_sync;
create trigger trg_wbs_projects_sync_updated_at
  before update on public.wbs_projects_sync
  for each row execute function public.touch_updated_at();

-- ── 7. RLS ──────────────────────────────────────────────────────────────────
alter table public.wbs_projects_sync enable row level security;
alter table public.wbs_sync_sessions enable row level security;
alter table public.wbs_sync_events enable row level security;

create policy "Authenticated users can view wbs_projects_sync"
  on public.wbs_projects_sync for select to authenticated using (true);
create policy "Authenticated users can manage wbs_projects_sync"
  on public.wbs_projects_sync for all to authenticated
  using (true) with check (true);

create policy "Authenticated users can view wbs_sync_sessions"
  on public.wbs_sync_sessions for select to authenticated using (true);
create policy "Authenticated users can manage wbs_sync_sessions"
  on public.wbs_sync_sessions for all to authenticated
  using (true) with check (true);

create policy "Authenticated users can view wbs_sync_events"
  on public.wbs_sync_events for select to authenticated using (true);
create policy "Authenticated users can manage wbs_sync_events"
  on public.wbs_sync_events for all to authenticated
  using (true) with check (true);

-- ── 8. Realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.wbs_projects_sync;
alter publication supabase_realtime add table public.wbs_sync_sessions;
alter publication supabase_realtime add table public.wbs_sync_events;

-- ── 9. Storage bucket for optional archive of imported files ────────────────
insert into storage.buckets (id, name, public)
select 'planning-sync', 'planning-sync', false
where not exists (select 1 from storage.buckets where id = 'planning-sync');
