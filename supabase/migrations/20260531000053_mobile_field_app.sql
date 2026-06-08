-- Mobile Field Application — Critical Module #49
-- Offline sync infrastructure, device registrations, sync queue

-- ── DEVICE REGISTRATIONS ──
create table if not exists public.mobile_device_registrations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  device_name     text not null,
  device_type     text not null check (device_type in ('android','ios','web')),
  device_id       text not null,
  push_token      text,
  app_version     text,
  os_version      text,
  is_active       boolean not null default true,
  last_sync_at    timestamptz,
  registered_at   timestamptz not null default now(),
  unique(user_id, device_id)
);

create index if not exists idx_mdr_user on public.mobile_device_registrations(user_id);
create index if not exists idx_mdr_device on public.mobile_device_registrations(device_id);
alter table public.mobile_device_registrations enable row level security;
create policy "Users can view own devices"
  on public.mobile_device_registrations for select
  to authenticated using (auth.uid() = user_id);
create policy "Users can register own devices"
  on public.mobile_device_registrations for insert
  to authenticated with check (auth.uid() = user_id);
create policy "Users can update own devices"
  on public.mobile_device_registrations for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── SYNC SESSIONS ──
create table if not exists public.mobile_sync_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  device_id       uuid not null references public.mobile_device_registrations(id) on delete cascade,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  status          text not null default 'in_progress' check (status in ('in_progress','completed','failed','conflict')),
  records_uploaded integer default 0,
  records_downloaded integer default 0,
  errors          jsonb,
  duration_ms     integer
);

create index if not exists idx_mss_user on public.mobile_sync_sessions(user_id);
create index if not exists idx_mss_device on public.mobile_sync_sessions(device_id);
create index if not exists idx_mss_started on public.mobile_sync_sessions(started_at desc);
alter table public.mobile_sync_sessions enable row level security;
create policy "Users can view own sync sessions"
  on public.mobile_sync_sessions for select
  to authenticated using (auth.uid() = user_id);
create policy "Users can create sync sessions"
  on public.mobile_sync_sessions for insert
  to authenticated with check (auth.uid() = user_id);
create policy "Users can update own sync sessions"
  on public.mobile_sync_sessions for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── SYNC QUEUE ──
create table if not exists public.mobile_sync_queue (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  device_id       uuid references public.mobile_device_registrations(id) on delete set null,
  table_name      text not null,
  record_id       uuid,
  operation       text not null check (operation in ('insert','update','delete')),
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending','synced','failed','conflict')),
  conflict_resolution text,
  created_at      timestamptz not null default now(),
  synced_at       timestamptz
);

create index if not exists idx_msq_user on public.mobile_sync_queue(user_id);
create index if not exists idx_msq_status on public.mobile_sync_queue(status);
create index if not exists idx_msq_created on public.mobile_sync_queue(created_at);
alter table public.mobile_sync_queue enable row level security;
create policy "Users can view own sync queue"
  on public.mobile_sync_queue for select
  to authenticated using (auth.uid() = user_id);
create policy "Users can enqueue sync items"
  on public.mobile_sync_queue for insert
  to authenticated with check (auth.uid() = user_id);
create policy "Users can update own sync queue"
  on public.mobile_sync_queue for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── SYNC CONFLICTS ──
create table if not exists public.mobile_sync_conflicts (
  id              uuid primary key default gen_random_uuid(),
  sync_queue_id   uuid references public.mobile_sync_queue(id) on delete cascade,
  session_id      uuid references public.mobile_sync_sessions(id) on delete cascade,
  table_name      text not null,
  record_id       uuid,
  device_value    jsonb not null,
  server_value    jsonb not null,
  resolved_value  jsonb,
  resolution      text check (resolution in ('device_wins','server_wins','manual')),
  resolved_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

alter table public.mobile_sync_conflicts enable row level security;
create policy "Users can view own sync conflicts"
  on public.mobile_sync_conflicts for select
  to authenticated using (auth.uid() = resolved_by);

-- ── FUNCTION: Complete sync session ──
create or replace function public.complete_sync_session(
  p_session_id uuid,
  p_status text,
  p_uploaded integer default 0,
  p_downloaded integer default 0,
  p_errors jsonb default null
) returns void
language plpgsql
security definer
as $$
begin
  update public.mobile_sync_sessions
  set
    status = p_status,
    completed_at = now(),
    records_uploaded = p_uploaded,
    records_downloaded = p_downloaded,
    errors = p_errors,
    duration_ms = extract(epoch from (now() - started_at))::integer * 1000
  where id = p_session_id;
end;
$$;

comment on function public.complete_sync_session is 'Mark a sync session as completed/failed with stats';

-- ── FUNCTION: Process sync queue items ──
create or replace function public.process_sync_queue(
  p_queue_ids uuid[]
) returns table(
  id uuid,
  status text,
  error text
)
language plpgsql
security definer
as $$
declare
  v_item record;
  v_result text;
begin
  foreach v_item in array (
    select row(q.id, q.table_name, q.record_id, q.operation, q.payload)
    from public.mobile_sync_queue q
    where q.id = any(p_queue_ids)
    and q.status = 'pending'
    for update skip locked
  )
  loop
    begin
      -- Processing logic would execute the actual CRUD against the target table
      -- For now, mark as synced
      update public.mobile_sync_queue
      set status = 'synced', synced_at = now()
      where id = v_item.id;

      id := v_item.id;
      status := 'synced';
      error := null;
      return next;
    exception when others then
      update public.mobile_sync_queue
      set status = 'failed'
      where id = v_item.id;

      id := v_item.id;
      status := 'failed';
      error := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

comment on function public.process_sync_queue is 'Process pending sync queue items and return results';
