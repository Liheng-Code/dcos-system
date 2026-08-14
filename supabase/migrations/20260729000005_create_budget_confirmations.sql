-- Budget Confirmation (BC) — QS budget-review sign-off record for Purchase Requisitions

create table if not exists public.procurement_budget_confirmations (
  id                              uuid primary key default gen_random_uuid(),
  bc_number                       text not null unique,
  pr_id                           uuid not null references public.procurement_prs(id) on delete cascade,
  project_id                      uuid references public.projects(id) on delete set null,

  to_name                         text,
  to_role                         text,
  cc                              text,
  bc_title                        text,
  bc_type                         text check (bc_type in ('ARC', 'STR', 'MEP', 'GEN')),
  ai_ref_no                       text,
  registered_after_approved       boolean not null default false,
  signature_pic                   text,

  reason_design_defect            boolean not null default false,
  reason_design_missing           boolean not null default false,
  reason_design_change_vo         boolean not null default false,
  reason_change_order             boolean not null default false,
  reason_design_change_no_cost    boolean not null default false,
  reason_design_change_mgmt_no_cost boolean not null default false,
  reason_other                    text,

  budget_status                   text check (budget_status in ('under_budget', 'over_budget')),
  reason_over_budget              text,

  attachment_detail_comparison    boolean not null default false,
  attachment_quotation            boolean not null default false,
  attachment_detail_budget        boolean not null default false,
  attachment_drawing              boolean not null default false,
  attachment_other                text,

  prepared_by                     uuid references public.profiles(id) on delete set null,
  prepared_by_position            text,
  prepared_at                     date,
  verified_by                     uuid references public.profiles(id) on delete set null,
  verified_by_position            text,
  verified_at                     date,
  approved_by                     uuid references public.profiles(id) on delete set null,
  approved_by_position            text,
  approved_at                     date,

  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create table if not exists public.procurement_budget_confirmation_items (
  id                    uuid primary key default gen_random_uuid(),
  bc_id                 uuid not null references public.procurement_budget_confirmations(id) on delete cascade,
  pr_item_id            uuid references public.procurement_pr_items(id) on delete set null,
  line_no               integer not null,
  budget_code           text,
  item_description      text not null,
  contract_target_budget numeric,
  approved_ptb_amount   numeric,
  estimated_amount      numeric,
  committed_amount      numeric,
  remaining_work_amount numeric,
  total_up_to_date      numeric,
  savings_up_to_date    numeric,
  created_at            timestamptz not null default now()
);

alter table public.procurement_prs
  add column if not exists budget_confirmation_id uuid references public.procurement_budget_confirmations(id) on delete set null;

-- Enable RLS
alter table public.procurement_budget_confirmations enable row level security;
alter table public.procurement_budget_confirmation_items enable row level security;

-- RLS Policies — all authenticated users can read/write (MVP; tighten later)
create policy "Authenticated users can view budget confirmations"
  on public.procurement_budget_confirmations for select to authenticated using (true);
create policy "Authenticated users can insert budget confirmations"
  on public.procurement_budget_confirmations for insert to authenticated with check (true);
create policy "Authenticated users can update budget confirmations"
  on public.procurement_budget_confirmations for update to authenticated using (true);
create policy "Authenticated users can delete budget confirmations"
  on public.procurement_budget_confirmations for delete to authenticated using (true);

create policy "Authenticated users can view budget confirmation items"
  on public.procurement_budget_confirmation_items for select to authenticated using (true);
create policy "Authenticated users can insert budget confirmation items"
  on public.procurement_budget_confirmation_items for insert to authenticated with check (true);
create policy "Authenticated users can update budget confirmation items"
  on public.procurement_budget_confirmation_items for update to authenticated using (true);
create policy "Authenticated users can delete budget confirmation items"
  on public.procurement_budget_confirmation_items for delete to authenticated using (true);
