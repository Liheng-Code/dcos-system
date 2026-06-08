-- Negative values = lead time (start before predecessor finishes).
-- No CHECK constraint — negative lag is valid for lead time.
alter table public.wbs_tasks
  add column lag_days numeric not null default 0;
