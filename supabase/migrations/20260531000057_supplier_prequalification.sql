-- Module 17: Supplier Prequalification

alter table public.procurement_suppliers
  add column if not exists pq_status text not null default 'not_started',
  add column if not exists pq_score numeric,
  add column if not exists pq_approved_at timestamptz,
  add column if not exists pq_expires_at date,
  add column if not exists pq_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists blacklist_reason text,
  add column if not exists blacklisted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'procurement_suppliers_pq_status_check'
  ) then
    alter table public.procurement_suppliers
      add constraint procurement_suppliers_pq_status_check
      check (pq_status in (
        'not_started', 'draft', 'submitted', 'under_review', 'approved',
        'rejected', 'expired', 'suspended', 'blacklisted'
      ));
  end if;
end $$;

create table if not exists public.supplier_pq_records (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.procurement_suppliers(id) on delete cascade,
  legal_status text,
  registration_number text,
  paid_up_capital numeric,
  years_in_business integer,
  audited_accounts_available boolean not null default false,
  annual_turnover numeric,
  credit_rating text,
  bank_reference text,
  scope_of_work text,
  equipment_summary text,
  key_personnel_summary text,
  project_references text,
  quality_certifications text,
  hse_incident_frequency numeric,
  hse_near_miss_rate numeric,
  hse_enforcement_history text,
  insurance_summary text,
  status text not null default 'draft',
  reviewer_notes text,
  final_score numeric,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_pq_records_status_check check (status in (
    'draft', 'submitted', 'under_review', 'approved', 'rejected', 'expired'
  ))
);

create table if not exists public.supplier_pq_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.procurement_suppliers(id) on delete cascade,
  pq_record_id uuid references public.supplier_pq_records(id) on delete cascade,
  document_category text not null,
  document_name text not null,
  file_url text,
  reference_number text,
  issue_date date,
  expiry_date date,
  verification_status text not null default 'pending',
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  constraint supplier_pq_documents_category_check check (document_category in (
    'company_registration', 'audited_accounts', 'bank_reference', 'credit_rating',
    'technical_reference', 'iso_9001', 'iso_14001', 'iso_45001',
    'public_liability', 'employer_liability', 'professional_indemnity',
    'plant_insurance', 'other'
  )),
  constraint supplier_pq_documents_verification_check check (verification_status in (
    'pending', 'verified', 'rejected', 'expired'
  ))
);

create table if not exists public.supplier_approved_trades (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.procurement_suppliers(id) on delete cascade,
  trade_category text not null,
  approval_scope text,
  approved_from date not null default current_date,
  approved_until date,
  status text not null default 'active',
  approved_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint supplier_approved_trades_status_check check (status in ('active', 'expired', 'suspended', 'revoked'))
);

create table if not exists public.supplier_performance_scores (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.procurement_suppliers(id) on delete cascade,
  score_period_start date,
  score_period_end date,
  delivery_score numeric,
  quality_score numeric,
  responsiveness_score numeric,
  commercial_score numeric,
  hse_score numeric,
  overall_score numeric,
  notes text,
  scored_by uuid references public.profiles(id) on delete set null,
  scored_at timestamptz not null default now(),
  constraint supplier_performance_scores_range_check check (
    (delivery_score is null or delivery_score between 0 and 100) and
    (quality_score is null or quality_score between 0 and 100) and
    (responsiveness_score is null or responsiveness_score between 0 and 100) and
    (commercial_score is null or commercial_score between 0 and 100) and
    (hse_score is null or hse_score between 0 and 100) and
    (overall_score is null or overall_score between 0 and 100)
  )
);

create index if not exists idx_procurement_suppliers_pq_status
  on public.procurement_suppliers(pq_status, pq_expires_at);
create index if not exists idx_supplier_pq_records_supplier
  on public.supplier_pq_records(supplier_id, created_at desc);
create index if not exists idx_supplier_pq_documents_supplier_expiry
  on public.supplier_pq_documents(supplier_id, expiry_date);
create index if not exists idx_supplier_approved_trades_supplier
  on public.supplier_approved_trades(supplier_id, status);
create index if not exists idx_supplier_performance_scores_supplier
  on public.supplier_performance_scores(supplier_id, scored_at desc);

alter table public.supplier_pq_records enable row level security;
alter table public.supplier_pq_documents enable row level security;
alter table public.supplier_approved_trades enable row level security;
alter table public.supplier_performance_scores enable row level security;

create policy "Authenticated users can view supplier pq records"
  on public.supplier_pq_records for select to authenticated using (true);
create policy "Authenticated users can insert supplier pq records"
  on public.supplier_pq_records for insert to authenticated with check (true);
create policy "Authenticated users can update supplier pq records"
  on public.supplier_pq_records for update to authenticated using (true);
create policy "Authenticated users can delete supplier pq records"
  on public.supplier_pq_records for delete to authenticated using (true);

create policy "Authenticated users can view supplier pq documents"
  on public.supplier_pq_documents for select to authenticated using (true);
create policy "Authenticated users can insert supplier pq documents"
  on public.supplier_pq_documents for insert to authenticated with check (true);
create policy "Authenticated users can update supplier pq documents"
  on public.supplier_pq_documents for update to authenticated using (true);
create policy "Authenticated users can delete supplier pq documents"
  on public.supplier_pq_documents for delete to authenticated using (true);

create policy "Authenticated users can view supplier approved trades"
  on public.supplier_approved_trades for select to authenticated using (true);
create policy "Authenticated users can insert supplier approved trades"
  on public.supplier_approved_trades for insert to authenticated with check (true);
create policy "Authenticated users can update supplier approved trades"
  on public.supplier_approved_trades for update to authenticated using (true);
create policy "Authenticated users can delete supplier approved trades"
  on public.supplier_approved_trades for delete to authenticated using (true);

create policy "Authenticated users can view supplier performance scores"
  on public.supplier_performance_scores for select to authenticated using (true);
create policy "Authenticated users can insert supplier performance scores"
  on public.supplier_performance_scores for insert to authenticated with check (true);
create policy "Authenticated users can update supplier performance scores"
  on public.supplier_performance_scores for update to authenticated using (true);
create policy "Authenticated users can delete supplier performance scores"
  on public.supplier_performance_scores for delete to authenticated using (true);

create trigger trg_proc_audit_supplier_pq_records
  after insert or update or delete on public.supplier_pq_records
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_supplier_pq_documents
  after insert or update or delete on public.supplier_pq_documents
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_supplier_approved_trades
  after insert or update or delete on public.supplier_approved_trades
  for each row execute function public.proc_audit_trigger();

create trigger trg_proc_audit_supplier_performance_scores
  after insert or update or delete on public.supplier_performance_scores
  for each row execute function public.proc_audit_trigger();
