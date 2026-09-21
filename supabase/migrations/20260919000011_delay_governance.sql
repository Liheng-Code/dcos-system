-- Migration: 20260919000011_delay_governance.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.5 — turn
--          delay_register's single-task link into multi-task, and add
--          float/criticality-at-open/close and a formal lifecycle.
-- Depends on:
--   public.delay_register (20260609000002_delay_register.sql)
--   public.wbs_tasks (20260527000016_create_wbs_enterprise_tables.sql)
--   public.contractual_notices (20260531000051_contract_administration.sql)
--   public.is_project_member(uuid), public.has_permission(text,text,text)
--     (20260919000001)
--
-- Schema verification notes:
--   - delay_register's exact current columns (read in full from
--     20260609000002_delay_register.sql): id, project_id, wbs_task_id
--     (nullable, single-task link, ON DELETE SET NULL), delay_code, description,
--     delay_type, cause, responsible_party, start_date, finish_date,
--     impact_days (GENERATED ALWAYS AS finish_date - start_date, STORED),
--     status ('open'|'resolved'|'disputed'), notes, created_by, created_at,
--     updated_at. Its only existing RLS policy is "delay_register_auth_all"
--     (FOR ALL, using(true)/with check(true)) — replaced in
--     20260919000008_planning_rls_v2.sql, not here. The existing single-task
--     wbs_task_id column is left untouched (not dropped) — it stays as a
--     legacy/first-task convenience column; delay_register_tasks below is
--     the new multi-task source of truth going forward.
--   - contractual_notices (20260531000051_contract_administration.sql) has
--     `id uuid primary key` — eot_notice_id below is therefore a real
--     `references public.contractual_notices(id)` FK, not a bare uuid.

-- ── 1. delay_register_tasks (multi-task link) ──────────────────────────────
create table public.delay_register_tasks (
  delay_id    uuid not null references public.delay_register(id) on delete cascade,
  wbs_task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  primary key (delay_id, wbs_task_id)
);

create index idx_delay_register_tasks_task on public.delay_register_tasks(wbs_task_id);

-- Backfill: preserve every existing single-task link as the first row.
insert into public.delay_register_tasks (delay_id, wbs_task_id)
select id, wbs_task_id from public.delay_register where wbs_task_id is not null
on conflict do nothing;

alter table public.delay_register_tasks enable row level security;

create policy "delay_register_tasks_select" on public.delay_register_tasks for select to authenticated
  using (
    exists (
      select 1 from public.delay_register dr
      where dr.id = delay_register_tasks.delay_id
        and is_project_member(dr.project_id)
    )
    and has_permission('planning', 'delays', 'view')
  );

create policy "delay_register_tasks_insert" on public.delay_register_tasks for insert to authenticated
  with check (
    exists (
      select 1 from public.delay_register dr
      where dr.id = delay_register_tasks.delay_id
        and is_project_member(dr.project_id)
    )
    and has_permission('planning', 'delays', 'edit')
  );

create policy "delay_register_tasks_update" on public.delay_register_tasks for update to authenticated
  using (
    exists (
      select 1 from public.delay_register dr
      where dr.id = delay_register_tasks.delay_id
        and is_project_member(dr.project_id)
    )
    and has_permission('planning', 'delays', 'edit')
  )
  with check (
    exists (
      select 1 from public.delay_register dr
      where dr.id = delay_register_tasks.delay_id
        and is_project_member(dr.project_id)
    )
    and has_permission('planning', 'delays', 'edit')
  );

create policy "delay_register_tasks_delete" on public.delay_register_tasks for delete to authenticated
  using (
    exists (
      select 1 from public.delay_register dr
      where dr.id = delay_register_tasks.delay_id
        and is_project_member(dr.project_id)
    )
    and has_permission('planning', 'delays', 'delete')
  );

-- ── 2. delay_register: float/criticality-at-open/close + lifecycle ─────────
alter table public.delay_register
  add column if not exists float_at_open      integer,
  add column if not exists float_at_close     integer,
  add column if not exists critical_at_open   boolean,
  add column if not exists opened_at          timestamptz not null default now(),
  add column if not exists closed_at          timestamptz,
  add column if not exists closed_by          uuid references public.profiles(id),
  add column if not exists lifecycle          text not null default 'notified'
    check (lifecycle in ('notified', 'assessed', 'submitted', 'agreed', 'rejected', 'closed')),
  add column if not exists eot_notice_id      uuid references public.contractual_notices(id);

comment on column public.delay_register.float_at_open is
  'Total float (working days) of the affected task(s) at the moment this delay event was opened — captured once, not recomputed.';
comment on column public.delay_register.float_at_close is
  'Total float (working days) of the affected task(s) at the moment this delay event was closed.';
comment on column public.delay_register.critical_at_open is
  'Whether the affected task(s) were on the critical path at the moment this delay event was opened.';
comment on column public.delay_register.lifecycle is
  'Formal delay-event lifecycle, independent of the older `status` (open/resolved/disputed) column: notified -> assessed -> submitted -> agreed/rejected -> closed.';
comment on column public.delay_register.eot_notice_id is
  'Set by create_eot_notice_from_delay() (20260919000012) when this delay event is turned into a formal Extension of Time contractual notice.';
