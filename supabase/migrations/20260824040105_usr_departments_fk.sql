-- Migration: 20260824040105_usr_departments_fk.sql
-- Purpose: Add profiles.department_id FK to the real, hierarchical departments
--          table per 00-Master.md §5 / 04-Database-Schema.md §3. Backfilled by
--          case-insensitive match against departments.department_name; unmatched
--          rows are left NULL for manual admin reconciliation (no fuzzy matching —
--          an unresolved match is safer than a wrong one). The legacy
--          profiles.department text column is KEPT as a deprecated display
--          fallback, not dropped, in this release.
-- Depends on: public.profiles (20260526_0001), public.departments (20260527000030),
--             fn_guard_profiles_protected_columns() fix (20260824040047 — this
--             backfill UPDATE touches department_id and must run through the
--             fixed trigger, not the buggy one from 20260824035908)

alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_profiles_department_id on public.profiles(department_id);

comment on column public.profiles.department_id is
  'FK to departments(id). New source of truth for department. profiles.department '
  '(text) is kept as a deprecated display fallback for rows this backfill could not '
  'match — see 00-Master.md §5.';

-- Backfill: case-insensitive, trimmed exact match only. Rows that don''t match keep
-- department_id = NULL and retain their original department text for manual
-- reconciliation. Verified live: 11/36 rows matched (departments table currently
-- has only 8 seeded rows); the 25 unmatched rows carry free-text department values
-- (e.g. "Architecture", "MEP", "Quantity Surveying") that don't yet exist as a
-- departments row — left NULL as designed, for HR/admin to reconcile.
update public.profiles p
set department_id = d.id
from public.departments d
where p.department_id is null
  and p.department is not null
  and lower(trim(p.department)) = lower(trim(d.department_name));
