-- Prelim Cost Library is a shared library reused across every tender — restrict
-- write access (insert/update/delete) to admins only. Read access stays open to
-- all authenticated users. Mirrors the admin-check pattern already used for
-- wbs_node_quantities' delete policy (20260718000010_fix_wbs_node_quantities_missing_columns.sql).

drop policy if exists "Auth users can manage prelim library items" on public.prelim_library_items;
drop policy if exists "Auth users can update prelim library items" on public.prelim_library_items;
drop policy if exists "Auth users can delete prelim library items" on public.prelim_library_items;

create policy "Admins can insert prelim library items"
  on public.prelim_library_items for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Admins can update prelim library items"
  on public.prelim_library_items for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Admins can delete prelim library items"
  on public.prelim_library_items for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

drop policy if exists "Auth users can manage prelim library components" on public.prelim_library_components;
drop policy if exists "Auth users can update prelim library components" on public.prelim_library_components;
drop policy if exists "Auth users can delete prelim library components" on public.prelim_library_components;

create policy "Admins can insert prelim library components"
  on public.prelim_library_components for insert to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Admins can update prelim library components"
  on public.prelim_library_components for update to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'))
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Admins can delete prelim library components"
  on public.prelim_library_components for delete to authenticated
  using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
