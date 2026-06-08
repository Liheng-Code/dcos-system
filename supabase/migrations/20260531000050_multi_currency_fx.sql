-- Multi-Currency & Foreign Exchange — Critical Module #43
-- Currencies, exchange rates, FX transactions, exposure tracking

-- ── CURRENCIES ──
create table if not exists public.currencies (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  symbol          text not null,
  decimal_places  integer not null default 2,
  is_base         boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.currencies enable row level security;
create policy "Authenticated users can view currencies"
  on public.currencies for select to authenticated using (true);
create policy "Admin can manage currencies"
  on public.currencies for insert to authenticated with check (true);
create policy "Admin can update currencies"
  on public.currencies for update to authenticated using (true) with check (true);

-- Seed common currencies
insert into public.currencies (code, name, symbol, decimal_places, is_base) values
  ('USD', 'US Dollar', '$', 2, true),
  ('KHR', 'Cambodian Riel', '៛', 0, false),
  ('THB', 'Thai Baht', '฿', 2, false),
  ('VND', 'Vietnamese Dong', '₫', 0, false),
  ('SGD', 'Singapore Dollar', 'S$', 2, false),
  ('MYR', 'Malaysian Ringgit', 'RM', 2, false),
  ('JPY', 'Japanese Yen', '¥', 0, false),
  ('EUR', 'Euro', '€', 2, false),
  ('GBP', 'British Pound', '£', 2, false),
  ('AUD', 'Australian Dollar', 'A$', 2, false),
  ('CNY', 'Chinese Yuan', '¥', 2, false),
  ('KRW', 'South Korean Won', '₩', 0, false)
on conflict (code) do nothing;

-- ── EXCHANGE RATES ──
create table if not exists public.exchange_rates (
  id              uuid primary key default gen_random_uuid(),
  from_currency   text not null references public.currencies(code),
  to_currency     text not null references public.currencies(code),
  rate            numeric(15,6) not null,
  effective_date  date not null default current_date,
  source          text default 'manual' check (source in ('manual','api','bank','central_bank')),
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(from_currency, to_currency, effective_date)
);

create index if not exists idx_exchange_rates_pair on public.exchange_rates(from_currency, to_currency);
create index if not exists idx_exchange_rates_date on public.exchange_rates(effective_date);
alter table public.exchange_rates enable row level security;
create policy "Authenticated users can view exchange rates"
  on public.exchange_rates for select to authenticated using (true);
create policy "Authenticated users can manage exchange rates"
  on public.exchange_rates for insert to authenticated with check (true);
create policy "Authenticated users can update exchange rates"
  on public.exchange_rates for update to authenticated using (true) with check (true);

-- ── FX TRANSACTIONS ──
create table if not exists public.fx_transactions (
  id              uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  from_currency   text not null references public.currencies(code),
  to_currency     text not null references public.currencies(code),
  from_amount     numeric(15,2) not null,
  to_amount       numeric(15,2) not null,
  exchange_rate   numeric(15,6) not null,
  reference_type  text check (reference_type in ('payment','invoice','receipt','conversion','revaluation')),
  reference_id    text,
  description     text,
  project_id      uuid references public.projects(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_fx_tx_date on public.fx_transactions(transaction_date);
create index if not exists idx_fx_tx_project on public.fx_transactions(project_id);
create index if not exists idx_fx_tx_currency on public.fx_transactions(from_currency, to_currency);
alter table public.fx_transactions enable row level security;
create policy "Authenticated users can view FX transactions"
  on public.fx_transactions for select to authenticated using (true);
create policy "Authenticated users can create FX transactions"
  on public.fx_transactions for insert to authenticated with check (true);

-- ── CURRENCY EXPOSURE LEDGER ──
create table if not exists public.currency_exposure_ledger (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references public.projects(id) on delete cascade,
  currency        text not null references public.currencies(code),
  receivable_amount numeric(15,2) not null default 0,
  payable_amount  numeric(15,2) not null default 0,
  net_exposure    numeric(15,2) generated always as (receivable_amount - payable_amount) stored,
  as_of_date      date not null default current_date,
  created_at      timestamptz not null default now(),
  unique(project_id, currency, as_of_date)
);

create index if not exists idx_fx_exposure_project on public.currency_exposure_ledger(project_id);
create index if not exists idx_fx_exposure_date on public.currency_exposure_ledger(as_of_date);
alter table public.currency_exposure_ledger enable row level security;
create policy "Authenticated users can view FX exposure"
  on public.currency_exposure_ledger for select to authenticated using (true);
create policy "Authenticated users can manage FX exposure"
  on public.currency_exposure_ledger for insert to authenticated with check (true);

-- ── HELPER FUNCTION: Convert amount between currencies ──
create or replace function public.convert_currency(
  p_from_currency text,
  p_to_currency text,
  p_amount numeric,
  p_date date default current_date
) returns numeric
language plpgsql
security definer
as $$
declare
  v_rate numeric(15,6);
  v_result numeric;
begin
  if p_from_currency = p_to_currency then
    return p_amount;
  end if;
  select rate into v_rate
  from public.exchange_rates
  where from_currency = p_from_currency
    and to_currency = p_to_currency
    and effective_date <= p_date
  order by effective_date desc
  limit 1;
  if v_rate is null then
    -- Try inverse rate
    select (1 / rate) into v_rate
    from public.exchange_rates
    where from_currency = p_to_currency
      and to_currency = p_from_currency
      and effective_date <= p_date
    order by effective_date desc
    limit 1;
  end if;
  if v_rate is null then
    raise exception 'No exchange rate found for % to % as of %', p_from_currency, p_to_currency, p_date;
  end if;
  v_result := p_amount * v_rate;
  return round(v_result, 2);
end;
$$;

comment on function public.convert_currency is 'Convert amount between currencies using latest available rate';
