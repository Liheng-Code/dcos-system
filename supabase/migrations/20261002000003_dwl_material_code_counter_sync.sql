-- Keep the material code counters ahead of any code inserted by other paths
-- (Excel import, seeds, manual SQL) so dwl_next_material_code() never hands
-- out a number that already exists.
create or replace function public.dwl_trg_material_code_counter_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.category = 'material' and NEW.code ~ '^MAT-[A-Z]{2,6}-\d+$' then
    insert into public.dwl_material_code_counters as c (group_code, last_seq)
    values (split_part(NEW.code, '-', 2), (substring(NEW.code from '-(\d+)$'))::int)
    on conflict (group_code) do update
      set last_seq = greatest(c.last_seq, excluded.last_seq);
  end if;
  return NEW;
end $$;

drop trigger if exists dwl_material_code_counter_sync on public.dwl_resources;
create trigger dwl_material_code_counter_sync
  after insert on public.dwl_resources
  for each row execute function public.dwl_trg_material_code_counter_sync();
