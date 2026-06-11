alter table public.attendance_logs
  add column if not exists selfie_url      text,
  add column if not exists gps_accuracy    decimal,
  add column if not exists site_id         uuid references public.site_locations(id),
  add column if not exists is_valid        boolean default true,
  add column if not exists invalid_reason  text;
