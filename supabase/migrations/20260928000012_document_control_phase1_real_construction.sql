-- ============================================================
-- Migration: 20260928000012_document_control_phase1_real_construction.sql
-- Description: Phase 1 Real Construction Document Control
--   - Alphanumeric revisions (R00, P01, C01, AB01) & ISO 19650 Suitability
--   - File hashes (SHA-256), Sheet sizes & Evidentiary metadata
--   - Consultant Review Codes (Code A / B / C / D / E)
--   - Submittal Packages (SD, MRA, MSRA) with physical sample tracking
--   - Comment Resolution Sheet (CRS) table
--   - Transmittal Note (DTN) upgrades with AOR acknowledgement
--   - Controlled Copy & Jobsite Print Log
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Document Revisions: Alphanumeric & Evidentiary Enhancements
-- ─────────────────────────────────────────────────────────────

alter table public.document_revisions
  add column if not exists revision_code text not null default 'R00',
  add column if not exists suitability_code text not null default 'S0',
  add column if not exists file_sha256 text,
  add column if not exists page_count integer,
  add column if not exists sheet_size text,
  add column if not exists review_code text check (review_code in ('code_a', 'code_b', 'code_c', 'code_d', 'code_e')),
  add column if not exists review_comments text,
  add column if not exists is_latest boolean not null default true;

create index if not exists idx_doc_rev_code on public.document_revisions(document_id, revision_code);
create index if not exists idx_doc_rev_latest on public.document_revisions(document_id) where is_latest = true;

-- Trigger to maintain is_latest flag on document_revisions
create or replace function public.maintain_document_revision_latest()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.document_revisions
  set is_latest = false
  where document_id = new.document_id
    and id <> new.id;
  return new;
end;
$$;

drop trigger if exists trg_maintain_document_revision_latest on public.document_revisions;
create trigger trg_maintain_document_revision_latest
  after insert on public.document_revisions
  for each row
  execute function public.maintain_document_revision_latest();

-- ─────────────────────────────────────────────────────────────
-- 2. Documents: Metadata & Consultant Review Alignment
-- ─────────────────────────────────────────────────────────────

alter table public.documents
  add column if not exists current_revision_code text not null default 'R00',
  add column if not exists review_code text check (review_code in ('code_a', 'code_b', 'code_c', 'code_d', 'code_e')),
  add column if not exists planned_submission_date date,
  add column if not exists actual_submission_date date,
  add column if not exists consultant_due_date date,
  add column if not exists consultant_returned_at timestamptz,
  add column if not exists originator_company_id uuid references public.companies(id) on delete set null,
  add column if not exists package_code text,
  add column if not exists building_code text,
  add column if not exists level_code text,
  add column if not exists zone_code text;

create index if not exists idx_documents_review_code on public.documents(review_code);
create index if not exists idx_documents_pkg on public.documents(project_id, package_code);

-- ─────────────────────────────────────────────────────────────
-- 3. Submittal Packages (Shop Drawings, Materials, Method Statements)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.submittal_packages (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.projects(id) on delete cascade,
  submittal_number        text not null,
  title                   text not null,
  submittal_type          text not null check (submittal_type in (
    'shop_drawing', 'material_approval', 'method_statement', 'prequal', 'test_commissioning', 'sample'
  )),
  discipline              text not null,
  wbs_node_id             uuid references public.wbs_nodes(id) on delete set null,
  package_code            text,
  originator_id           uuid references public.profiles(id) on delete set null,
  originator_company_id   uuid references public.companies(id) on delete set null,
  contractor_qc_status    text not null default 'pending' check (contractor_qc_status in ('pending', 'passed', 'rejected')),
  contractor_qc_by        uuid references public.profiles(id) on delete set null,
  contractor_qc_at        timestamptz,
  contractor_qc_remarks   text,
  consultant_status       text not null default 'draft' check (consultant_status in (
    'draft', 'submitted', 'under_review', 'code_a_approved',
    'code_b_approved_as_noted', 'code_c_revise_resubmit', 'code_d_rejected', 'code_e_for_information'
  )),
  current_revision_code   text not null default 'R00',
  target_submission_date  date,
  actual_submission_date  date,
  consultant_due_date     date,
  consultant_returned_at  timestamptz,
  consultant_reviewer_id  uuid references public.profiles(id) on delete set null,
  sla_days                integer not null default 14,
  remarks                 text,
  created_by              uuid not null references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(project_id, submittal_number)
);

create index if not exists idx_submittals_project on public.submittal_packages(project_id);
create index if not exists idx_submittals_status on public.submittal_packages(consultant_status);
create index if not exists idx_submittals_type on public.submittal_packages(submittal_type);
create index if not exists idx_submittals_due on public.submittal_packages(consultant_due_date);

alter table public.submittal_packages enable row level security;

create policy "Authenticated users can view submittal packages"
  on public.submittal_packages for select
  to authenticated
  using (true);

create policy "Authenticated users can create submittal packages"
  on public.submittal_packages for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update submittal packages"
  on public.submittal_packages for update
  to authenticated
  using (true)
  with check (true);

create policy "Admins can delete submittal packages"
  on public.submittal_packages for delete
  to authenticated
  using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- Trigger for submittal_packages.updated_at
create or replace function public.submittal_packages_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_submittal_packages_updated_at on public.submittal_packages;
create trigger trg_submittal_packages_updated_at
  before update on public.submittal_packages
  for each row
  execute function public.submittal_packages_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. Submittal Items (Documents & Physical Samples Mapping)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.submittal_items (
  id                      uuid primary key default gen_random_uuid(),
  submittal_id            uuid not null references public.submittal_packages(id) on delete cascade,
  document_id             uuid references public.documents(id) on delete set null,
  document_revision_id    uuid references public.document_revisions(id) on delete set null,
  item_type               text not null default 'document' check (item_type in (
    'document', 'physical_sample', 'test_cert', 'catalog_cut', 'calculation'
  )),
  item_description        text not null,
  sample_quantity         integer,
  sample_location         text,
  sample_returned         boolean not null default false,
  consultant_item_status  text check (consultant_item_status in ('code_a', 'code_b', 'code_c', 'code_d', 'code_e')),
  consultant_comments     text,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now()
);

create index if not exists idx_submittal_items_sub on public.submittal_items(submittal_id);
create index if not exists idx_submittal_items_doc on public.submittal_items(document_id);

alter table public.submittal_items enable row level security;

create policy "Authenticated users can view submittal items"
  on public.submittal_items for select
  to authenticated
  using (true);

create policy "Authenticated users can manage submittal items"
  on public.submittal_items for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 5. Comment Resolution Sheet (CRS) Table
-- ─────────────────────────────────────────────────────────────

create table if not exists public.submittal_comments (
  id                  uuid primary key default gen_random_uuid(),
  submittal_id        uuid not null references public.submittal_packages(id) on delete cascade,
  revision_code       text not null default 'R00',
  item_reference      text,
  consultant_comment  text not null,
  commented_by        uuid references public.profiles(id) on delete set null,
  commented_at        timestamptz not null default now(),
  contractor_response text,
  responded_by        uuid references public.profiles(id) on delete set null,
  responded_at        timestamptz,
  resolved            boolean not null default false,
  verified_by         uuid references public.profiles(id) on delete set null,
  verified_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_submittal_comments_sub on public.submittal_comments(submittal_id, revision_code);

alter table public.submittal_comments enable row level security;

create policy "Authenticated users can view submittal comments"
  on public.submittal_comments for select
  to authenticated
  using (true);

create policy "Authenticated users can manage submittal comments"
  on public.submittal_comments for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 6. Transmittal Enhancements: Purpose of Issue & AOR Tracking
-- ─────────────────────────────────────────────────────────────

alter table public.transmittals
  add column if not exists issue_reason text not null default 'for_review' check (issue_reason in (
    'for_review', 'for_approval', 'for_construction', 'for_information', 'for_record', 'for_tender', 'for_fabrication'
  )),
  add column if not exists requires_acknowledgement boolean not null default true,
  add column if not exists acknowledgement_due_date date,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by_name text,
  add column if not exists signed_aor_file_url text,
  add column if not exists courier_tracking_no text,
  add column if not exists physical_copies_summary text;

alter table public.transmittal_documents
  add column if not exists revision_id uuid references public.document_revisions(id) on delete set null,
  add column if not exists copies_count integer not null default 1,
  add column if not exists media_format text not null default 'pdf' check (media_format in (
    'pdf', 'cad_dwg', 'bim_rvt', 'bim_ifc', 'hardcopy', 'physical_sample', 'excel', 'word'
  )),
  add column if not exists notes text;

create index if not exists idx_transmittal_docs_rev on public.transmittal_documents(revision_id);

-- ─────────────────────────────────────────────────────────────
-- 7. Controlled Copy & Jobsite Print Log
-- ─────────────────────────────────────────────────────────────

create table if not exists public.document_print_logs (
  id                    uuid primary key default gen_random_uuid(),
  document_revision_id  uuid not null references public.document_revisions(id) on delete cascade,
  printed_by            uuid references public.profiles(id) on delete set null,
  copy_number           integer not null default 1,
  issued_to_party       text not null,
  is_controlled_copy    boolean not null default true,
  issued_at             timestamptz not null default now(),
  recalled_at           timestamptz,
  recall_reason         text
);

create index if not exists idx_doc_print_rev on public.document_print_logs(document_revision_id);

alter table public.document_print_logs enable row level security;

create policy "Authenticated users can view print logs"
  on public.document_print_logs for select
  to authenticated
  using (true);

create policy "Authenticated users can manage print logs"
  on public.document_print_logs for all
  to authenticated
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 8. QR Verification Helper Function
-- ─────────────────────────────────────────────────────────────

create or replace function public.get_document_verification_payload(p_doc_id uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  v_doc record;
  v_rev record;
  v_project record;
begin
  select id, project_id, document_number, title, discipline, status, current_revision_code
  into v_doc
  from public.documents
  where id = p_doc_id;

  if not found then
    return jsonb_build_object('valid', false, 'error', 'Document not found');
  end if;

  select project_code, project_name
  into v_project
  from public.projects
  where id = v_doc.project_id;

  select id, revision_code, suitability_code, review_code, created_at, is_latest, file_name
  into v_rev
  from public.document_revisions
  where document_id = p_doc_id and is_latest = true
  limit 1;

  return jsonb_build_object(
    'document_id', v_doc.id,
    'document_number', v_doc.document_number,
    'title', v_doc.title,
    'discipline', v_doc.discipline,
    'status', v_doc.status,
    'current_revision_code', v_doc.current_revision_code,
    'is_ifc', (v_doc.status = 'ifc'),
    'project_code', v_project.project_code,
    'project_name', v_project.project_name,
    'latest_revision_id', v_rev.id,
    'latest_revision_code', v_rev.revision_code,
    'latest_suitability', v_rev.suitability_code,
    'latest_review_code', v_rev.review_code,
    'latest_issued_at', v_rev.created_at
  );
end;
$$;
