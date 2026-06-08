-- Create task-attachments storage bucket and set RLS policies

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 52428800, null)
on conflict (id) do nothing;

-- Allow authenticated users to read any file in task-attachments
create policy "Authenticated users can read task-attachments"
on storage.objects for select
to authenticated
using (bucket_id = 'task-attachments');

-- Allow authenticated users to upload files to task-attachments
create policy "Authenticated users can insert into task-attachments"
on storage.objects for insert
to authenticated
with check (bucket_id = 'task-attachments');

-- Allow authenticated users to update files they own
create policy "Authenticated users can update own files in task-attachments"
on storage.objects for update
to authenticated
using (bucket_id = 'task-attachments' and owner = auth.uid());

-- Allow authenticated users to delete files they own
create policy "Authenticated users can delete own files in task-attachments"
on storage.objects for delete
to authenticated
using (bucket_id = 'task-attachments' and owner = auth.uid());
