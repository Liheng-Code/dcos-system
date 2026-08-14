-- PO Revision Log — manual amendment notes (REV/DESCRIPTION/DATE), matching
-- the paper PO form's revision table. This is a descriptive log only; it does
-- not modify the PO's own stored fields, items, or totals (no PO edit
-- capability exists in this codebase today).

create table if not exists public.procurement_po_revisions (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.procurement_pos(id) on delete cascade,
  rev_no       integer not null,
  description  text not null,
  rev_date     date not null default current_date,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (po_id, rev_no)
);

create index if not exists idx_po_revisions_po on public.procurement_po_revisions(po_id, rev_no);

alter table public.procurement_po_revisions enable row level security;

create policy "Authenticated users can view PO revisions"
  on public.procurement_po_revisions for select to authenticated using (true);
create policy "Authenticated users can insert PO revisions"
  on public.procurement_po_revisions for insert to authenticated with check (true);
create policy "Authenticated users can update PO revisions"
  on public.procurement_po_revisions for update to authenticated using (true);
create policy "Authenticated users can delete PO revisions"
  on public.procurement_po_revisions for delete to authenticated using (true);

create trigger trg_proc_audit_po_revisions
  after insert or update or delete on public.procurement_po_revisions
  for each row execute function public.proc_audit_trigger();
