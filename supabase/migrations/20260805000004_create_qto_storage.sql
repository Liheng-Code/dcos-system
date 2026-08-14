-- QTO drawings storage bucket for drawing files (PDF preferred, plus native CAD/image formats).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qto-files', 'qto-files', true, 52428800, array['application/pdf', 'application/octet-stream', 'application/x-dwg', 'image/tiff', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "QTO files are viewable by authenticated users"
on storage.objects for select
to authenticated
using (bucket_id = 'qto-files');

create policy "QTO files can be uploaded by authenticated users"
on storage.objects for insert
to authenticated
with check (bucket_id = 'qto-files');

create policy "QTO files can be updated by owner"
on storage.objects for update
to authenticated
using (bucket_id = 'qto-files' and owner = auth.uid());

create policy "QTO files can be deleted by owner"
on storage.objects for delete
to authenticated
using (bucket_id = 'qto-files' and owner = auth.uid());
