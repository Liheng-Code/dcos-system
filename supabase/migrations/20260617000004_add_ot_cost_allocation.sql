-- Add cost allocation fields to overtime_requests
alter table public.overtime_requests
  add column if not exists cost_code text,
  add column if not exists cost_allocated boolean not null default false,
  add column if not exists cost_allocated_at timestamptz,
  add column if not exists cost_allocated_by uuid references public.profiles(id) on delete set null;
