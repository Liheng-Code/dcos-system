-- Add 'manual' as a valid attendance log method (for supervisor entries)
alter table public.attendance_logs
  drop constraint if exists attendance_logs_method_check;

alter table public.attendance_logs
  add constraint attendance_logs_method_check
  check (method in ('web', 'biometric', 'rfid', 'gps', 'qr', 'mobile', 'manual'));

-- Create storage bucket for attendance selfies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attendance-selfies',
  'attendance-selfies',
  false,
  5242880,  -- 5 MB limit
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage RLS: users can upload their own selfies; HR can read all
create policy "Users can upload own selfie"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attendance-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own selfie"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "HR can read all selfies"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('admin', 'HR_Manager', 'hr_manager')
    )
  );
