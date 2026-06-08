-- Document Control Enhancements — Phase 9
-- Audit log, distribution tracking, task links, status change notifications

-- ─────────────────────────────────────────────────────────────
-- 1. Document Audit Log
-- ─────────────────────────────────────────────────────────────
create table if not exists public.document_audit_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  revision_id uuid references public.document_revisions(id) on delete set null,
  action      text not null check (action in (
    'created', 'updated', 'status_change', 'revision_uploaded',
    'viewed', 'downloaded', 'transmitted', 'commented'
  )),
  field_name  text,
  old_value   text,
  new_value   text,
  comment     text,
  user_id     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_doc_audit_document on public.document_audit_log(document_id, created_at desc);
create index if not exists idx_doc_audit_user     on public.document_audit_log(user_id);

alter table public.document_audit_log enable row level security;

create policy "Authenticated users can view document audit log"
  on public.document_audit_log for select
  to authenticated
  using (true);

create policy "Authenticated users can insert document audit log"
  on public.document_audit_log for insert
  to authenticated
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 2. Document Distribution Log (viewers)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.document_viewers (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  email        text,
  company_name text,
  viewed_at    timestamptz,
  transmitted_at timestamptz not null default now(),
  purpose      text not null default 'info' check (purpose in (
    'info', 'review', 'approval', 'distribution'
  )),
  created_at   timestamptz not null default now(),
  unique(document_id, user_id, purpose)
);

create index if not exists idx_doc_viewers_document on public.document_viewers(document_id);

alter table public.document_viewers enable row level security;

create policy "Authenticated users can view document viewers"
  on public.document_viewers for select
  to authenticated
  using (true);

create policy "Authenticated users can manage document viewers"
  on public.document_viewers for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update document viewers"
  on public.document_viewers for update
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 3. Document Revision ↔ Task Links
-- ─────────────────────────────────────────────────────────────
create table if not exists public.document_revision_task_links (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.document_revisions(id) on delete cascade,
  task_id     uuid not null references public.wbs_tasks(id) on delete cascade,
  link_type   text not null default 'reference' check (link_type in (
    'reference', 'input', 'output', 'constraint'
  )),
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique(revision_id, task_id)
);

create index if not exists idx_doc_task_links_revision on public.document_revision_task_links(revision_id);
create index if not exists idx_doc_task_links_task    on public.document_revision_task_links(task_id);

alter table public.document_revision_task_links enable row level security;

create policy "Authenticated users can view task links"
  on public.document_revision_task_links for select
  to authenticated
  using (true);

create policy "Authenticated users can create task links"
  on public.document_revision_task_links for insert
  to authenticated
  with check (true);

create policy "Authenticated users can delete task links"
  on public.document_revision_task_links for delete
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────────
-- 4. Document Notification Triggers
-- ─────────────────────────────────────────────────────────────
create or replace function public.doc_notify_status_change()
returns trigger
language plpgsql
security definer
as $$
declare
  v_event_type text;
  v_title text;
  v_message text;
begin
  if new.status = 'submitted' and old.status = 'draft' then
    v_event_type := 'doc_submitted';
    v_title := 'Document Submitted';
    v_message := 'Document ' || new.document_number || ' has been submitted for review.';
  elsif new.status = 'under_review' and old.status = 'submitted' then
    v_event_type := 'doc_under_review';
    v_title := 'Document Under Review';
    v_message := 'Document ' || new.document_number || ' is now under review.';
  elsif new.status = 'approved' and old.status in ('submitted', 'under_review') then
    v_event_type := 'doc_approved';
    v_title := 'Document Approved';
    v_message := 'Document ' || new.document_number || ' has been approved.';
  elsif new.status = 'approved_with_comment' and old.status in ('submitted', 'under_review') then
    v_event_type := 'doc_approved_with_comment';
    v_title := 'Document Approved with Comments';
    v_message := 'Document ' || new.document_number || ' has been approved with comments.';
  elsif new.status = 'rejected' then
    v_event_type := 'doc_rejected';
    v_title := 'Document Rejected';
    v_message := 'Document ' || new.document_number || ' has been rejected.';
  elsif new.status = 'ifc' and old.status in ('approved', 'approved_with_comment') then
    v_event_type := 'doc_ifc';
    v_title := 'Document Issued for Construction';
    v_message := 'Document ' || new.document_number || ' has been issued for construction.';
  else
    return new;
  end if;

  insert into public.document_audit_log (document_id, action, field_name, old_value, new_value, user_id)
  values (new.id, 'status_change', 'status', old.status, new.status, auth.uid());

  return new;
end;
$$;

create trigger trg_doc_notify_status_change
  after update of status on public.documents
  for each row
  when (old.status is distinct from new.status)
  execute function public.doc_notify_status_change();

-- ─────────────────────────────────────────────────────────────
-- 5. Document Audit Trigger
-- ─────────────────────────────────────────────────────────────
create or replace function public.doc_audit_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.document_audit_log (document_id, action, user_id)
    values (new.id, 'created', auth.uid());
  elsif tg_op = 'UPDATE' and new.status is not distinct from old.status then
    insert into public.document_audit_log (document_id, action, user_id)
    values (new.id, 'updated', auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.doc_revision_audit_trigger()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.document_audit_log (document_id, revision_id, action, user_id)
  values (new.document_id, new.id, 'revision_uploaded', auth.uid());
  return new;
end;
$$;

create trigger trg_doc_audit_insert
  after insert on public.documents
  for each row
  execute function public.doc_audit_trigger();

create trigger trg_doc_audit_update
  after update on public.documents
  for each row
  when (old.* is distinct from new.*)
  execute function public.doc_audit_trigger();

create trigger trg_doc_revision_audit
  after insert on public.document_revisions
  for each row
  execute function public.doc_revision_audit_trigger();
