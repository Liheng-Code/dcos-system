-- Migration: 20260905000001_create_user_ui_preferences.sql
-- Purpose: Generic per-user UI preference key/value store. First consumer is
--          the Planning > Schedule Gantt left panel column layout
--          (preference_key = 'schedule_grid_columns', storing column order,
--          visibility, and widths). The WBS Builder grid
--          (apps/web/components/wbs/builder/wbs-builder-grid.tsx) has a
--          near-identical resize-only column system and is expected to reuse
--          this same table under a different preference_key later, without
--          another migration.
-- Depends on: auth.users (built-in Supabase Auth table).
--
-- Note: this table is intentionally NOT tenant-scoped. It holds purely
-- personal, per-user UI state (column order/visibility/width), not shared
-- project or business data, so a tenant_id column would add nothing that
-- user_id = auth.uid() doesn't already guarantee. This mirrors the existing
-- personal-data pattern used by public.task_alerts
-- (20260527000024_create_task_alerts.sql), which is also isolated purely by
-- owner id rather than tenant_id.

create table if not exists public.user_ui_preferences (
  user_id        uuid not null references auth.users(id) on delete cascade,
  preference_key text not null,
  value          jsonb not null,
  updated_at     timestamptz not null default now(),
  primary key (user_id, preference_key)
);

alter table public.user_ui_preferences enable row level security;

-- Tenant isolation is not applicable here (see header note); isolation is by
-- owning user only.
create policy "Users can view own ui preferences"
  on public.user_ui_preferences for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own ui preferences"
  on public.user_ui_preferences for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own ui preferences"
  on public.user_ui_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own ui preferences"
  on public.user_ui_preferences for delete to authenticated
  using (user_id = auth.uid());

-- updated_at trigger — reuses the shared public.set_updated_at() function
-- established in earlier migrations (e.g.
-- 20260720000002_reconcile_rate_library_schema_drift.sql).
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_user_ui_preferences_updated_at on public.user_ui_preferences;
create trigger set_user_ui_preferences_updated_at
  before update on public.user_ui_preferences
  for each row execute function public.set_updated_at();

comment on table public.user_ui_preferences is
  'Generic per-user UI preference key/value store (grid column layouts, panel '
  'state, etc). value is opaque jsonb owned by the frontend; no schema '
  'validation beyond not null. First key: schedule_grid_columns.';
