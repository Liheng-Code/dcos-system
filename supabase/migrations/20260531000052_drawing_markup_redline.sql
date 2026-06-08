-- Drawing Markup & Redline — Critical Module #26
-- Drawing annotations, redline layers, markup assignments

-- ── DRAWING MARKUPS ──
create table if not exists public.drawing_markups (
  id              uuid primary key default gen_random_uuid(),
  drawing_id      uuid not null references public.design_drawings(id) on delete cascade,
  revision_id     uuid references public.document_revisions(id) on delete set null,
  title           text not null,
  description     text,
  markup_type     text not null check (markup_type in ('redline','as_built','review','comment','approval')),
  status          text not null default 'open' check (status in ('open','responded','accepted','closed')),
  layer_name      text default 'default',
  created_by      uuid references public.profiles(id) on delete set null,
  assigned_to     uuid references public.profiles(id) on delete set null,
  due_date        date,
  wbs_node_id     uuid references public.wbs_nodes(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_dm_drawing on public.drawing_markups(drawing_id);
create index if not exists idx_dm_assigned on public.drawing_markups(assigned_to);
create index if not exists idx_dm_status on public.drawing_markups(status);
alter table public.drawing_markups enable row level security;
create policy "Authenticated users can view drawing markups"
  on public.drawing_markups for select to authenticated using (true);
create policy "Authenticated users can create markups"
  on public.drawing_markups for insert to authenticated with check (true);
create policy "Authenticated users can update markups"
  on public.drawing_markups for update to authenticated using (true) with check (true);

-- ── MARKUP ANNOTATIONS ──
create table if not exists public.markup_annotations (
  id              uuid primary key default gen_random_uuid(),
  markup_id       uuid not null references public.drawing_markups(id) on delete cascade,
  annotation_type text not null check (annotation_type in (
    'cloud','arrow','text_box','dimension','freehand','highlight','stamp','rectangle','circle','note'
  )),
  content         text,
  x               numeric(10,2) not null default 0,
  y               numeric(10,2) not null default 0,
  width           numeric(10,2),
  height          numeric(10,2),
  rotation        numeric(5,2) default 0,
  color           text default '#FF0000',
  font_size       integer default 12,
  data            jsonb,
  sort_order      integer default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ma_markup on public.markup_annotations(markup_id);
alter table public.markup_annotations enable row level security;
create policy "Authenticated users can view annotations"
  on public.markup_annotations for select to authenticated using (true);
create policy "Authenticated users can manage annotations"
  on public.markup_annotations for insert to authenticated with check (true);
create policy "Authenticated users can update annotations"
  on public.markup_annotations for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete annotations"
  on public.markup_annotations for delete to authenticated using (true);

-- ── REDLINE LAYERS ──
create table if not exists public.redline_layers (
  id              uuid primary key default gen_random_uuid(),
  drawing_id      uuid not null references public.design_drawings(id) on delete cascade,
  name            text not null,
  description     text,
  layer_type      text not null default 'markup' check (layer_type in ('markup','as_built','review','approved','rejected','for_information')),
  visible         boolean not null default true,
  locked          boolean not null default false,
  color           text default '#FF0000',
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique(drawing_id, name)
);

create index if not exists idx_rl_drawing on public.redline_layers(drawing_id);
alter table public.redline_layers enable row level security;
create policy "Authenticated users can view redline layers"
  on public.redline_layers for select to authenticated using (true);
create policy "Authenticated users can manage redline layers"
  on public.redline_layers for insert to authenticated with check (true);
create policy "Authenticated users can update redline layers"
  on public.redline_layers for update to authenticated using (true) with check (true);

-- ── MARKUP ASSIGNMENTS ──
create table if not exists public.markup_assignments (
  id              uuid primary key default gen_random_uuid(),
  markup_id       uuid not null references public.drawing_markups(id) on delete cascade,
  assigned_to     uuid not null references public.profiles(id) on delete cascade,
  assigned_by     uuid references public.profiles(id) on delete set null,
  status          text not null default 'pending' check (status in ('pending','in_progress','completed','accepted','rejected')),
  due_date        date,
  response        text,
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_massign_markup on public.markup_assignments(markup_id);
create index if not exists idx_massign_user on public.markup_assignments(assigned_to);
alter table public.markup_assignments enable row level security;
create policy "Authenticated users can view markup assignments"
  on public.markup_assignments for select to authenticated using (true);
create policy "Authenticated users can manage assignments"
  on public.markup_assignments for insert to authenticated with check (true);
create policy "Authenticated users can update assignments"
  on public.markup_assignments for update to authenticated using (true) with check (true);

-- ── TRIGGER: Set updated_at on drawing_markups change ──
create or replace function public.markup_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_markup_updated_at
  before update on public.drawing_markups
  for each row
  execute function public.markup_updated_at();
