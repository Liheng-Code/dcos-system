-- Contract Administration — Critical Module #35
-- Contract register, employer instructions, notices, entitlements, correspondence

-- ── CONTRACT REGISTER ──
create table if not exists public.contract_register (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  contract_no     text not null,
  contract_type   text not null check (contract_type in ('head_contract','subcontract','consultant','supplier','other')),
  title           text not null,
  party_name      text not null,
  party_contact   text,
  contract_value  numeric(15,2) not null default 0,
  currency        text not null default 'USD',
  start_date      date,
  end_date        date,
  status          text not null default 'active' check (status in ('draft','active','completed','terminated','expired')),
  signed_date     date,
  termination_date date,
  governing_law   text,
  dispute_resolution text,
  notes           text,
  attachment_url  text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(project_id, contract_no)
);

create index if not exists idx_contract_reg_project on public.contract_register(project_id);
alter table public.contract_register enable row level security;
create policy "Authenticated users can view contract register"
  on public.contract_register for select to authenticated using (true);
create policy "Authenticated users can insert contracts"
  on public.contract_register for insert to authenticated with check (true);
create policy "Authenticated users can update contracts"
  on public.contract_register for update to authenticated using (true) with check (true);

-- ── EMPLOYER'S INSTRUCTIONS ──
create table if not exists public.contract_employer_instructions (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contract_register(id) on delete cascade,
  instruction_no  text not null,
  title           text not null,
  description     text not null,
  instruction_date date not null default current_date,
  response_date   date,
  type            text not null check (type in ('variation','direction','clarification','approval','rejection','information')),
  time_extension_days integer default 0,
  cost_impact     numeric(15,2) default 0,
  status          text not null default 'received' check (status in ('received','acknowledged','in_progress','complied','closed','disputed')),
  assigned_to     uuid references public.profiles(id) on delete set null,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(contract_id, instruction_no)
);

create index if not exists idx_ei_contract on public.contract_employer_instructions(contract_id);
alter table public.contract_employer_instructions enable row level security;
create policy "Authenticated users can view employer instructions"
  on public.contract_employer_instructions for select to authenticated using (true);
create policy "Authenticated users can manage employer instructions"
  on public.contract_employer_instructions for insert to authenticated with check (true);
create policy "Authenticated users can update employer instructions"
  on public.contract_employer_instructions for update to authenticated using (true) with check (true);

-- ── CONTRACTUAL NOTICES ──
create table if not exists public.contractual_notices (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contract_register(id) on delete cascade,
  notice_no       text not null,
  notice_type     text not null check (notice_type in ('notice_of_claim','notice_of_delay','notice_of_additional_cost','force_majeure','termination','default','variation_claim','extension_of_time')),
  title           text not null,
  description     text not null,
  trigger_event   text,
  contract_clause text,
  days_from_event integer,
  deadline_date   date not null,
  served_date     date,
  served_to       text,
  response_date   date,
  response_summary text,
  status          text not null default 'pending' check (status in ('pending','served','acknowledged','accepted','rejected','time_barred','closed')),
  is_time_barred  boolean default false,
  linked_to       text,
  linked_id       uuid,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(contract_id, notice_no)
);

create index if not exists idx_notices_contract on public.contractual_notices(contract_id);
create index if not exists idx_notices_deadline on public.contractual_notices(deadline_date);
create index if not exists idx_notices_status on public.contractual_notices(status);
alter table public.contractual_notices enable row level security;
create policy "Authenticated users can view contractual notices"
  on public.contractual_notices for select to authenticated using (true);
create policy "Authenticated users can manage notices"
  on public.contractual_notices for insert to authenticated with check (true);
create policy "Authenticated users can update notices"
  on public.contractual_notices for update to authenticated using (true) with check (true);

-- ── ENTITLEMENT REGISTER ──
create table if not exists public.entitlement_register (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contract_register(id) on delete cascade,
  entitlement_no  text not null,
  title           text not null,
  description     text not null,
  category        text not null check (category in ('time','cost','both')),
  trigger_event   text,
  contract_clause text,
  estimated_time_days integer default 0,
  estimated_cost  numeric(15,2) default 0,
  approved_time_days integer default 0,
  approved_cost   numeric(15,2) default 0,
  status          text not null default 'identified' check (status in ('identified','assessed','submitted','approved','rejected','partially_approved','closed')),
  notice_id       uuid references public.contractual_notices(id) on delete set null,
  variation_id    uuid,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(contract_id, entitlement_no)
);

create index if not exists idx_entitlement_contract on public.entitlement_register(contract_id);
alter table public.entitlement_register enable row level security;
create policy "Authenticated users can view entitlements"
  on public.entitlement_register for select to authenticated using (true);
create policy "Authenticated users can manage entitlements"
  on public.entitlement_register for insert to authenticated with check (true);
create policy "Authenticated users can update entitlements"
  on public.entitlement_register for update to authenticated using (true) with check (true);

-- ── CONTRACTUAL CORRESPONDENCE ──
create table if not exists public.contract_correspondence (
  id              uuid primary key default gen_random_uuid(),
  contract_id     uuid not null references public.contract_register(id) on delete cascade,
  correspondence_no text not null,
  direction       text not null check (direction in ('incoming','outgoing')),
  subject         text not null,
  body            text,
  correspondence_date date not null default current_date,
  from_party      text not null,
  to_party        text not null,
  category        text check (category in ('formal_letter','email','minutes_of_meeting','site_instruction','other')),
  attachment_url  text,
  linked_to       text,
  linked_id       uuid,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(contract_id, correspondence_no)
);

create index if not exists idx_correspondence_contract on public.contract_correspondence(contract_id);
create index if not exists idx_correspondence_date on public.contract_correspondence(correspondence_date);
alter table public.contract_correspondence enable row level security;
create policy "Authenticated users can view correspondence"
  on public.contract_correspondence for select to authenticated using (true);
create policy "Authenticated users can manage correspondence"
  on public.contract_correspondence for insert to authenticated with check (true);
create policy "Authenticated users can update correspondence"
  on public.contract_correspondence for update to authenticated using (true) with check (true);

-- ── TIME BAR ALERT VIEW ──
create or replace view public.time_bar_alerts as
select
  n.id,
  n.notice_no,
  n.title,
  n.contract_clause,
  n.deadline_date,
  n.days_from_event,
  n.trigger_event,
  n.status,
  c.contract_no,
  c.title as contract_title,
  c.project_id,
  p.project_name,
  case
    when n.deadline_date < current_date and n.status in ('pending') then 'overdue'
    when n.deadline_date <= current_date + interval '7 days' and n.status in ('pending') then 'approaching'
    else 'ok'
  end as alert_level,
  current_date as as_of_date
from public.contractual_notices n
join public.contract_register c on c.id = n.contract_id
left join public.projects p on p.id = c.project_id
where n.status not in ('closed', 'time_barred');

comment on view public.time_bar_alerts is 'Time-bar monitoring with approaching/overdue alerts';
