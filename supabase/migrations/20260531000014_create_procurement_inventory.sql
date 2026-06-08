create table if not exists procurement_inventory (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  item_description text not null,
  unit text not null,
  quantity_on_hand numeric(15,2) not null default 0,
  minimum_stock numeric(15,2) not null default 0,
  unit_cost numeric(15,2),
  location text,
  category text,
  last_gr_id uuid references procurement_goods_receipts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table procurement_inventory enable row level security;

create policy "Users can read inventory"
  on procurement_inventory for select
  to authenticated
  using (true);

create policy "Users can insert inventory"
  on procurement_inventory for insert
  to authenticated
  with check (true);

create policy "Users can update inventory"
  on procurement_inventory for update
  to authenticated
  using (true);

-- Trigger to auto-update updated_at
create or replace function proc_inventory_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_inventory_updated_at
  before update on procurement_inventory
  for each row execute function proc_inventory_updated_at();
