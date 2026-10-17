-- Activity Library - Phase 3.5: AI assistance (advisory only).
-- The model never writes project data. It writes SUGGESTIONS; a planner accepts or rejects each one, and accepting runs the
-- same audited service call a planner would run by hand.
--   * plan_act_ai_settings     organisation switch (OFF by default), monthly USD cap, per-call token limit, token prices
--   * plan_act_ai_runs         one row per model call: tool, model, prompt version, tokens, cost, outcome, what was sent
--   * plan_act_ai_suggestions  recommendation + reason + source + confidence + affected records + required approval
--   * plan_act_ai_decide()     the only way to change a suggestion's status
-- Rows are written by the server route (service role); clients can only read them and decide.
-- Depends on 20261006000001-8.

create table if not exists public.plan_act_ai_settings (
  id boolean primary key default true check (id),           -- single row
  enabled boolean not null default false,
  monthly_cap_usd numeric not null default 50 check (monthly_cap_usd >= 0),
  run_token_limit integer not null default 20000 check (run_token_limit between 1000 and 200000),
  model text,                                               -- null = server default (PLAN_AI_MODEL or claude-sonnet-5-5)
  price_in_per_mtok numeric not null default 2.00 check (price_in_per_mtok >= 0),    -- USD per 1M input tokens
  price_out_per_mtok numeric not null default 10.00 check (price_out_per_mtok >= 0), -- USD per 1M output tokens
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.plan_act_ai_settings(id) values (true) on conflict (id) do nothing;

alter table public.plan_act_ai_settings enable row level security;
drop policy if exists plan_act_ai_settings_select on public.plan_act_ai_settings;
create policy plan_act_ai_settings_select on public.plan_act_ai_settings for select to authenticated using (true);
drop policy if exists plan_act_ai_settings_update on public.plan_act_ai_settings;
create policy plan_act_ai_settings_update on public.plan_act_ai_settings for update to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

create table if not exists public.plan_act_ai_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  tool text not null check (tool in ('find_activity_master','suggest_quantity_mapping','suggest_productivity','detect_schedule_conflict','explain_generation')),
  model text,
  prompt_version text,
  status text not null check (status in ('ok','error','blocked','refused','empty')),
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric,
  error text,
  request_summary jsonb not null default '{}'::jsonb,       -- the ids and counts that were sent, never free-form personal data
  requested_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_plan_act_ai_runs_project on public.plan_act_ai_runs(project_id, started_at desc);
create index if not exists idx_plan_act_ai_runs_month on public.plan_act_ai_runs(started_at);

create table if not exists public.plan_act_ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.plan_act_ai_runs(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null check (kind in ('match_master','quantity_mapping','productivity','conflict','explanation')),
  target_type text not null check (target_type in ('query','generation_item','generation_run','standard')),
  target_id uuid,
  recommendation text not null,
  reason text not null,
  source text not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  affected jsonb not null default '[]'::jsonb,
  required_approval text not null default 'planner',
  payload jsonb not null default '{}'::jsonb,               -- machine-readable action, validated against the shortlist the model was given
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_act_ai_sugg_target on public.plan_act_ai_suggestions(target_type, target_id, status);
create index if not exists idx_plan_act_ai_sugg_project on public.plan_act_ai_suggestions(project_id, created_at desc);
create index if not exists idx_plan_act_ai_sugg_run on public.plan_act_ai_suggestions(run_id);

alter table public.plan_act_ai_runs enable row level security;
alter table public.plan_act_ai_suggestions enable row level security;

-- project-less runs (activity search, standards) are visible to the person who asked
drop policy if exists plan_act_ai_runs_select on public.plan_act_ai_runs;
create policy plan_act_ai_runs_select on public.plan_act_ai_runs for select to authenticated
  using ((project_id is not null and public.is_project_member(project_id)) or requested_by = auth.uid());
drop policy if exists plan_act_ai_sugg_select on public.plan_act_ai_suggestions;
create policy plan_act_ai_sugg_select on public.plan_act_ai_suggestions for select to authenticated
  using ((project_id is not null and public.is_project_member(project_id))
         or exists (select 1 from public.plan_act_ai_runs r where r.id = run_id and r.requested_by = auth.uid()));
-- no insert / update / delete policies: only the service role (server route) writes, and decisions go through the function

create or replace function public.plan_act_ai_decide(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare s public.plan_act_ai_suggestions%rowtype;
begin
  if p_status not in ('accepted', 'rejected') then
    raise exception 'A suggestion is either accepted or rejected';
  end if;
  select * into s from public.plan_act_ai_suggestions where id = p_id;
  if not found then raise exception 'Suggestion not found'; end if;
  if s.status <> 'pending' then raise exception 'This suggestion was already %', s.status; end if;
  if s.project_id is not null then
    if not (public.is_project_member(s.project_id) and public.has_permission('planning', 'schedule', 'edit')) then
      raise exception 'Deciding on a suggestion requires planning/schedule edit permission';
    end if;
  elsif not exists (select 1 from public.plan_act_ai_runs r where r.id = s.run_id and r.requested_by = auth.uid()) then
    raise exception 'Only the person who asked can decide on this suggestion';
  end if;
  update public.plan_act_ai_suggestions
     set status = p_status, decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
end $$;
grant execute on function public.plan_act_ai_decide(uuid, text, text) to authenticated;

-- spend of the current calendar month (all users); readable by the settings screen and the server
create or replace function public.plan_act_ai_month_spend()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cost_usd), 0) from public.plan_act_ai_runs
  where started_at >= date_trunc('month', now()) and status in ('ok', 'refused');
$$;
grant execute on function public.plan_act_ai_month_spend() to authenticated;
