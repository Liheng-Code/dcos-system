-- Create procurement-attachments storage bucket for quotation documents, delivery photos, etc.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('procurement-attachments', 'procurement-attachments', true, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])
on conflict (id) do nothing;

-- Authenticated users can view any procurement attachment
create policy "Procurement attachments are viewable by authenticated users"
on storage.objects for select
to authenticated
using (bucket_id = 'procurement-attachments');

-- Authenticated users can upload procurement attachments
create policy "Procurement attachments can be uploaded by authenticated users"
on storage.objects for insert
to authenticated
with check (bucket_id = 'procurement-attachments');

-- Uploader can update their own attachments
create policy "Procurement attachments can be updated by owner"
on storage.objects for update
to authenticated
using (bucket_id = 'procurement-attachments' and owner = auth.uid());

-- Uploader can delete their own attachments
create policy "Procurement attachments can be deleted by owner"
on storage.objects for delete
to authenticated
using (bucket_id = 'procurement-attachments' and owner = auth.uid());
