-- Document types lookup
create table public.document_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.document_types (code, name) values
  ('DWG', 'Drawing'),
  ('SPEC', 'Specification'),
  ('CALC', 'Calculation Note'),
  ('RFI', 'Request for Information'),
  ('MAR', 'Material Approval Request'),
  ('MS', 'Method Statement'),
  ('SHOP', 'Shop Drawing'),
  ('IR', 'Inspection Request'),
  ('DLY', 'Daily Report'),
  ('WLY', 'Weekly Report'),
  ('MTH', 'Monthly Report'),
  ('NCR', 'Non-Conformance Report'),
  ('SI', 'Site Instruction'),
  ('LTR', 'Letter'),
  ('MOM', 'Minutes of Meeting'),
  ('PC', 'Payment Certificate'),
  ('VO', 'Variation Order'),
  ('HDO', 'Handover Document'),
  ('SUBM', 'Submittal'),
  ('OMM', 'Operation & Maintenance Manual'),
  ('ASB', 'As-Built Drawing'),
  ('OTHER', 'Other');

-- Document register
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  wbs_node_id       uuid references public.wbs_nodes(id) on delete set null,
  document_type_id  uuid not null references public.document_types(id),
  document_number   text not null,
  title             text not null,
  discipline        text,
  status            text not null default 'draft' check (status in (
    'draft', 'submitted', 'under_review', 'approved',
    'approved_with_comment', 'rejected', 'ifc',
    'superseded', 'archived'
  )),
  current_revision  int not null default 0,
  description       text,
  created_by        uuid not null references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(project_id, document_number)
);

-- Document revisions
create table public.document_revisions (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.documents(id) on delete cascade,
  revision_number int not null,
  file_url        text,
  file_name       text,
  file_size       bigint,
  notes           text,
  uploaded_by     uuid not null references public.profiles(id),
  status          text not null default 'draft' check (status in (
    'draft', 'submitted', 'under_review', 'approved',
    'approved_with_comment', 'rejected', 'ifc',
    'superseded', 'archived'
  )),
  created_at      timestamptz not null default now(),
  unique(document_id, revision_number)
);

create index idx_documents_project_id on public.documents(project_id);
create index idx_documents_wbs_node_id on public.documents(wbs_node_id);
create index idx_documents_status on public.documents(status);
create index idx_document_revisions_document_id on public.document_revisions(document_id);

alter table public.document_types enable row level security;
alter table public.documents enable row level security;
alter table public.document_revisions enable row level security;

-- Document types: all authenticated users can view
create policy "Authenticated users can view document types"
  on public.document_types for select to authenticated using (true);

-- Documents
create policy "Authenticated users can view documents"
  on public.documents for select to authenticated using (true);

create policy "Authenticated users can create documents"
  on public.documents for insert to authenticated with check (true);

create policy "Authenticated users can update documents"
  on public.documents for update to authenticated using (true) with check (true);

create policy "Admins can delete documents"
  on public.documents for delete to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- Document revisions
create policy "Authenticated users can view revisions"
  on public.document_revisions for select to authenticated using (true);

create policy "Authenticated users can create revisions"
  on public.document_revisions for insert to authenticated with check (true);

create policy "Authenticated users can update revisions"
  on public.document_revisions for update to authenticated using (true) with check (true);

create policy "Admins can delete revisions"
  on public.document_revisions for delete to authenticated using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );
