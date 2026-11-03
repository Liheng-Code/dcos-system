-- Phase B (doc 35; PRD doc 34 MOD-04): BOQ mapping integrity.
-- A BOQ line reaches an activity three ways:
--   programme  plan_task_boq_lines (Generate from BOQ, doc 24): share % and quantity per task
--   link       plan_act_quantity_links (activity library Generate): factor per WBS node and metric
--   direct     plan_task_work.tender_boq_item_id / qs_boq_item_id on a task without programme lines
-- B1/B2  plan_boq_mapping_facts(project): per BOQ line, its quantity and what each path maps of it.
--        The app classifies the lines (lib/planning/boq-mapping/reconcile.ts): unmapped, partial,
--        complete, over-mapped (counted twice), mapped by more than one path, stale.
-- B3     plan_boq_mapping_history: every insert / update / delete of programme lines and links.
--        A programme regeneration deletes and re-inserts a task's lines in one transaction; such a
--        pair is folded into one 'update' row, or dropped when nothing changed.
-- B4     plan_boq_change_reviews: a change to the quantity of a mapped BOQ line (or its deletion)
--        opens a review. plan_decide_boq_change applies the new quantity to the programme and
--        direct tasks, or keeps the plan with a reason. One open review per line; it closes itself
--        when the quantity returns to the earlier value. The capture never blocks the QS edit.
-- B5     plan_location_map.zone_split: split a level's share over its zone child nodes.
-- Additive only.

-- ---------------------------------------------------------------- B5 zone split

alter table public.plan_location_map
  add column if not exists zone_split text not null default 'none';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_location_map_zone_split_check') then
    alter table public.plan_location_map add constraint plan_location_map_zone_split_check
      check (zone_split in ('none', 'equal', 'gfa'));
  end if;
end $$;

-- ---------------------------------------------------------------- B1/B2 facts

create or replace function public.plan_boq_mapping_facts(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  if not (public.is_project_member(p_project_id) and public.has_permission('planning', 'schedule', 'view')) then
    raise exception 'Not allowed to view this project''s programme' using errcode = '42501';
  end if;

  with tender as (
    select id from public.tender_register
     where project_id = p_project_id and status <> 'cancelled'
     order by (status = 'awarded') desc, created_at desc, id desc
     limit 1
  ),
  prog as (
    select case when tender_boq_item_id is not null then 'tender_boq' else 'qs_boq' end as src,
           coalesce(tender_boq_item_id, qs_boq_item_id) as item_id,
           sum(share_pct) as share_pct, sum(quantity) as quantity, count(distinct task_id) as tasks
      from public.plan_task_boq_lines
     where project_id = p_project_id
     group by 1, 2
  ),
  lnk as (
    select boq_source as src, boq_item_id as item_id, metric_code,
           coalesce(metric_unit, boq_unit) as unit, sum(factor) as factor_sum, count(*) as nodes,
           array_agg(boq_quantity_at_link) as snapshots
      from public.plan_act_quantity_links
     where project_id = p_project_id
     group by 1, 2, 3, 4
  ),
  dir as (
    select case when w.tender_boq_item_id is not null then 'tender_boq' else 'qs_boq' end as src,
           coalesce(w.tender_boq_item_id, w.qs_boq_item_id) as item_id,
           sum(w.quantity) as quantity, count(*) as tasks, max(w.quantity_unit) as unit
      from public.plan_task_work w
     where w.project_id = p_project_id
       and w.quantity_source in ('boq', 'tender_boq')
       and coalesce(w.tender_boq_item_id, w.qs_boq_item_id) is not null
       and not exists (select 1 from public.plan_task_boq_lines b where b.task_id = w.task_id)
     group by 1, 2
  ),
  mapped as (
    select src, item_id from prog union select src, item_id from lnk union select src, item_id from dir
  ),
  lines as (
    -- in scope: the contract main-works BOQ and the programme tender's lines
    select 'qs_boq'::text as src, q.id, true as in_scope
      from public.qs_boq_items q
      join public.qs_boq_sections s on s.id = q.boq_section_id
      join public.qs_boq b on b.id = s.boq_id
     where q.project_id = p_project_id and b.boq_type = 'main_works'
    union
    select 'tender_boq', t.id, true from public.tender_boq_items t where t.tender_id in (select id from tender)
    union
    -- mapped lines of other BOQs of the project still count (they may be mapped twice)
    select m.src, m.item_id, false from mapped m
  ),
  scoped as (
    select src, id, bool_or(in_scope) as in_scope from lines group by 1, 2
  ),
  item as (
    select s.src, s.id, s.in_scope, q.item_code, q.item_no, q.description, q.unit, q.quantity,
           q.building_code, q.level, q.dwl_work_item_id
      from scoped s join public.qs_boq_items q on q.id = s.id and q.project_id = p_project_id
     where s.src = 'qs_boq'
    union all
    select s.src, s.id, s.in_scope, t.item_code, null, t.description, t.unit, t.quantity,
           t.building_code, t.level, t.dwl_work_item_id
      from scoped s
      join public.tender_boq_items t on t.id = s.id
      join public.tender_register tr on tr.id = t.tender_id and tr.project_id = p_project_id
     where s.src = 'tender_boq'
  ),
  wi_share as (
    select mw.work_item_id, sum(mw.share_pct) as share_pct, count(*) as masters
      from public.plan_act_master_work_items mw
      join public.plan_act_masters m on m.id = mw.master_id
     where m.status not in ('superseded', 'archived')
       and mw.work_item_id in (select dwl_work_item_id from item where dwl_work_item_id is not null)
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'source', i.src, 'id', i.id, 'in_scope', i.in_scope,
           'ref', coalesce(i.item_code, i.item_no), 'description', i.description, 'unit', i.unit,
           'quantity', coalesce(i.quantity, 0), 'building', i.building_code, 'level', i.level,
           'work_item_id', i.dwl_work_item_id,
           'work_item_share_pct', ws.share_pct, 'work_item_masters', ws.masters,
           'programme', case when p.item_id is null then null else jsonb_build_object(
               'share_pct', p.share_pct, 'quantity', p.quantity, 'tasks', p.tasks) end,
           'links', (select jsonb_agg(jsonb_build_object(
               'metric_code', l.metric_code, 'unit', l.unit, 'factor_sum', l.factor_sum, 'nodes', l.nodes,
               'stale', (select count(*) from unnest(l.snapshots) x where x is not null and x is distinct from i.quantity)))
               from lnk l where l.src = i.src and l.item_id = i.id),
           'direct', case when d.item_id is null then null else jsonb_build_object(
               'quantity', d.quantity, 'tasks', d.tasks, 'unit', d.unit) end
         ) order by i.src, coalesce(i.item_code, i.item_no), i.id), '[]'::jsonb)
    into v_out
    from item i
    left join prog p on p.src = i.src and p.item_id = i.id
    left join dir d on d.src = i.src and d.item_id = i.id
    left join wi_share ws on ws.work_item_id = i.dwl_work_item_id;

  return v_out;
end;
$$;

revoke all on function public.plan_boq_mapping_facts(uuid) from public, anon;
grant execute on function public.plan_boq_mapping_facts(uuid) to authenticated;

-- ---------------------------------------------------------------- B3 mapping history

create table if not exists public.plan_boq_mapping_history (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  mapping      text not null check (mapping in ('programme', 'link')),
  row_id       uuid not null,
  action       text not null check (action in ('insert', 'update', 'delete')),
  boq_source   text,
  boq_item_id  uuid,
  task_id      uuid,
  wbs_node_id  uuid,
  metric_code  text,
  old_values   jsonb,
  new_values   jsonb,
  changed_by   uuid default auth.uid(),
  changed_at   timestamptz not null default now(),
  tx_id        bigint not null default txid_current()
);
create index if not exists idx_plan_boq_mapping_history_project on public.plan_boq_mapping_history (project_id, changed_at desc);
create index if not exists idx_plan_boq_mapping_history_item on public.plan_boq_mapping_history (boq_item_id, changed_at desc);
create index if not exists idx_plan_boq_mapping_history_tx on public.plan_boq_mapping_history (tx_id) where action = 'delete';

alter table public.plan_boq_mapping_history enable row level security;
drop policy if exists plan_boq_mapping_history_select on public.plan_boq_mapping_history;
create policy plan_boq_mapping_history_select on public.plan_boq_mapping_history
  for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));
revoke insert, update, delete on public.plan_boq_mapping_history from anon, authenticated;
grant select on public.plan_boq_mapping_history to authenticated;

create or replace function public.plan_boq_mapping_history_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        record;
  v_row    record;
  v_old    jsonb;
  v_new    jsonb;
  v_src    text;
  v_item   uuid;
  v_prior  public.plan_boq_mapping_history%rowtype;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  -- the project itself is being deleted: nothing to keep
  if not exists (select 1 from public.projects where id = r.project_id) then
    return null;
  end if;

  if tg_table_name = 'plan_task_boq_lines' then
    v_src  := case when r.tender_boq_item_id is not null then 'tender_boq' else 'qs_boq' end;
    v_item := coalesce(r.tender_boq_item_id, r.qs_boq_item_id);
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('share_pct', old.share_pct, 'quantity', old.quantity, 'amount', old.amount, 'run_id', old.run_id);
    end if;
    if tg_op <> 'DELETE' then
      v_new := jsonb_build_object('share_pct', new.share_pct, 'quantity', new.quantity, 'amount', new.amount, 'run_id', new.run_id);
    end if;

    if tg_op = 'INSERT' then
      -- a regeneration deleted this task's line earlier in the same transaction: fold the pair
      select * into v_prior from public.plan_boq_mapping_history
       where tx_id = txid_current() and action = 'delete' and mapping = 'programme'
         and task_id = new.task_id and boq_item_id = v_item
       order by changed_at desc limit 1;
      if found then
        if (v_prior.old_values - 'run_id') = (v_new - 'run_id') then
          delete from public.plan_boq_mapping_history where id = v_prior.id;
        else
          update public.plan_boq_mapping_history
             set action = 'update', row_id = new.id, new_values = v_new
           where id = v_prior.id;
        end if;
        return null;
      end if;
    elsif tg_op = 'UPDATE' and (v_old - 'run_id') = (v_new - 'run_id') then
      return null;
    end if;

    insert into public.plan_boq_mapping_history(project_id, mapping, row_id, action, boq_source, boq_item_id, task_id, old_values, new_values)
    values (r.project_id, 'programme', r.id, lower(tg_op), v_src, v_item, r.task_id, v_old, v_new);
  else
    if tg_op <> 'INSERT' then
      v_old := jsonb_build_object('factor', old.factor, 'boq_quantity_at_link', old.boq_quantity_at_link,
                                  'metric_unit', old.metric_unit, 'source', old.source, 'note', old.note);
    end if;
    if tg_op <> 'DELETE' then
      v_new := jsonb_build_object('factor', new.factor, 'boq_quantity_at_link', new.boq_quantity_at_link,
                                  'metric_unit', new.metric_unit, 'source', new.source, 'note', new.note);
    end if;
    if tg_op = 'UPDATE' and v_old = v_new then
      return null;
    end if;
    insert into public.plan_boq_mapping_history(project_id, mapping, row_id, action, boq_source, boq_item_id, wbs_node_id, metric_code, old_values, new_values)
    values (r.project_id, 'link', r.id, lower(tg_op), r.boq_source, r.boq_item_id, r.wbs_node_id, r.metric_code, v_old, v_new);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_plan_task_boq_lines_history on public.plan_task_boq_lines;
create trigger trg_plan_task_boq_lines_history
  after insert or update or delete on public.plan_task_boq_lines
  for each row execute function public.plan_boq_mapping_history_log();

drop trigger if exists trg_plan_act_quantity_links_history on public.plan_act_quantity_links;
create trigger trg_plan_act_quantity_links_history
  after insert or update or delete on public.plan_act_quantity_links
  for each row execute function public.plan_boq_mapping_history_log();

revoke all on function public.plan_boq_mapping_history_log() from public, anon, authenticated;

-- ---------------------------------------------------------------- B4 BOQ change reviews

create table if not exists public.plan_boq_change_reviews (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  boq_source      text not null check (boq_source in ('qs_boq', 'tender_boq')),
  boq_item_id     uuid not null,
  item_ref        text,
  description     text,
  unit            text,
  change_kind     text not null default 'quantity' check (change_kind in ('quantity', 'removed')),
  old_quantity    numeric,
  new_quantity    numeric,
  task_ids        uuid[] not null default '{}',
  link_count      integer not null default 0,
  status          text not null default 'open' check (status in ('open', 'applied', 'kept', 'reverted')),
  raised_by       uuid default auth.uid(),
  raised_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  decided_by      uuid,
  decided_at      timestamptz,
  decision_note   text,
  decision_result jsonb
);
create unique index if not exists uq_plan_boq_change_reviews_open
  on public.plan_boq_change_reviews (boq_source, boq_item_id) where status = 'open';
create index if not exists idx_plan_boq_change_reviews_project on public.plan_boq_change_reviews (project_id, status, raised_at desc);

alter table public.plan_boq_change_reviews enable row level security;
drop policy if exists plan_boq_change_reviews_select on public.plan_boq_change_reviews;
create policy plan_boq_change_reviews_select on public.plan_boq_change_reviews
  for select to authenticated
  using (public.is_project_member(project_id) and public.has_permission('planning', 'schedule', 'view'));
revoke insert, update, delete on public.plan_boq_change_reviews from anon, authenticated;
grant select on public.plan_boq_change_reviews to authenticated;

-- BEFORE UPDATE OF quantity OR DELETE on the BOQ tables (before the mapping rows cascade away).
-- Any failure is turned into a warning: the QS edit always goes through.
create or replace function public.plan_boq_change_capture()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_src     text := case when tg_table_name = 'tender_boq_items' then 'tender_boq' else 'qs_boq' end;
  v_project uuid;
  v_tasks   uuid[];
  v_links   integer;
  v_ref     text;
  v_rev     public.plan_boq_change_reviews%rowtype;
  v_ret     record;
begin
  if tg_op = 'DELETE' then v_ret := old; else v_ret := new; end if;
  if tg_op = 'UPDATE' and new.quantity is not distinct from old.quantity then
    return v_ret;
  end if;

  begin
    if v_src = 'qs_boq' then
      v_project := old.project_id;
      v_ref := coalesce(old.item_code, old.item_no);
    else
      select project_id into v_project from public.tender_register where id = old.tender_id;
      v_ref := old.item_code;
    end if;
    if v_project is null or not exists (select 1 from public.projects where id = v_project) then
      return v_ret;
    end if;

    select coalesce(array_agg(distinct task_id), '{}') into v_tasks from (
      select task_id from public.plan_task_boq_lines
       where (v_src = 'tender_boq' and tender_boq_item_id = old.id) or (v_src = 'qs_boq' and qs_boq_item_id = old.id)
      union
      select task_id from public.plan_task_work
       where (v_src = 'tender_boq' and tender_boq_item_id = old.id) or (v_src = 'qs_boq' and qs_boq_item_id = old.id)
    ) t;
    select count(*) into v_links from public.plan_act_quantity_links where boq_source = v_src and boq_item_id = old.id;
    if cardinality(v_tasks) = 0 and v_links = 0 then
      return v_ret;
    end if;

    select * into v_rev from public.plan_boq_change_reviews
     where boq_source = v_src and boq_item_id = old.id and status = 'open'
     for update;

    if found then
      if tg_op = 'DELETE' then
        update public.plan_boq_change_reviews
           set change_kind = 'removed', new_quantity = null, updated_at = now(),
               task_ids = (select array_agg(distinct x) from unnest(v_rev.task_ids || v_tasks) x), link_count = v_links
         where id = v_rev.id;
      elsif new.quantity is not distinct from v_rev.old_quantity then
        update public.plan_boq_change_reviews
           set status = 'reverted', new_quantity = new.quantity, decided_at = now(), updated_at = now(),
               decision_note = 'The BOQ quantity returned to its earlier value'
         where id = v_rev.id;
      else
        update public.plan_boq_change_reviews
           set new_quantity = new.quantity, updated_at = now(),
               task_ids = (select array_agg(distinct x) from unnest(v_rev.task_ids || v_tasks) x), link_count = v_links
         where id = v_rev.id;
      end if;
    else
      insert into public.plan_boq_change_reviews(project_id, boq_source, boq_item_id, item_ref, description, unit,
             change_kind, old_quantity, new_quantity, task_ids, link_count)
      values (v_project, v_src, old.id, v_ref, old.description, old.unit,
             case when tg_op = 'DELETE' then 'removed' else 'quantity' end,
             old.quantity, case when tg_op = 'DELETE' then null else new.quantity end, v_tasks, v_links);
    end if;
  exception when others then
    raise warning 'plan_boq_change_capture: % (%)', sqlerrm, sqlstate;
  end;
  return v_ret;
end;
$$;

revoke all on function public.plan_boq_change_capture() from public, anon, authenticated;

-- named to run before the *_unlink_task_work triggers (BEFORE triggers fire in name order)
drop trigger if exists trg_tender_boq_items_plan_boq_change on public.tender_boq_items;
create trigger trg_tender_boq_items_plan_boq_change
  before update of quantity or delete on public.tender_boq_items
  for each row execute function public.plan_boq_change_capture();

drop trigger if exists trg_qs_boq_items_plan_boq_change on public.qs_boq_items;
create trigger trg_qs_boq_items_plan_boq_change
  before update of quantity or delete on public.qs_boq_items
  for each row execute function public.plan_boq_change_capture();

-- Decide a review.
--   apply  the line's current quantity goes to its programme lines (share %) and their tasks'
--          Task Work quantity, and to tasks linked directly to the line. Links from the activity
--          library keep their snapshot: Generate shows them as "BOQ revised" for the per-activity
--          update. Tasks are found by their current link to the line (not the review's snapshot); tasks
--          under a locked WBS node are skipped unless the user is a WBS manager. Several direct tasks
--          on one line share the new quantity in proportion to what they held. A task whose installed
--          + pending quantity exceeds the new scope stops the apply.
--   keep   keep the plan as it is; a reason is required.
create or replace function public.plan_decide_boq_change(p_review_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rev      public.plan_boq_change_reviews%rowtype;
  v_qty      numeric;
  v_amount   numeric;
  v_task     record;
  v_used     numeric;
  v_reason   text;
  v_prog     integer := 0;
  v_direct   integer := 0;
  v_locked   integer := 0;
  v_dsum     numeric;
  v_dn       integer;
  v_target   numeric;
  v_manager  boolean := public.is_wbs_manager();
  v_result   jsonb;
begin
  select * into v_rev from public.plan_boq_change_reviews where id = p_review_id for update;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if not (public.is_project_member(v_rev.project_id) and public.has_permission('planning', 'schedule', 'edit')) then
    raise exception 'Not allowed to decide BOQ changes on this project' using errcode = '42501';
  end if;
  if v_rev.status <> 'open' then
    raise exception 'This review is already %', v_rev.status;
  end if;
  if p_decision not in ('apply', 'keep') then
    raise exception 'Decision must be apply or keep';
  end if;
  if p_decision = 'keep' and coalesce(btrim(p_note), '') = '' then
    raise exception 'A reason is required to keep the current plan';
  end if;

  if p_decision = 'apply' then
    if v_rev.change_kind = 'removed' then
      raise exception 'The BOQ line was deleted: there is no quantity to apply. Keep the plan with a reason, or regenerate the programme';
    end if;
    if v_rev.boq_source = 'tender_boq' then
      select quantity, total_amount into v_qty, v_amount from public.tender_boq_items where id = v_rev.boq_item_id;
    else
      select quantity, total_amount into v_qty, v_amount from public.qs_boq_items where id = v_rev.boq_item_id;
    end if;
    if v_qty is null then
      raise exception 'The BOQ line no longer has a quantity';
    end if;
    v_reason := format('BOQ change %s: %s to %s %s', coalesce(v_rev.item_ref, ''), round(coalesce(v_rev.old_quantity, 0), 3),
                       round(v_qty, 3), coalesce(v_rev.unit, ''))
                || case when coalesce(btrim(p_note), '') <> '' then ' (' || btrim(p_note) || ')' else '' end;

    -- programme lines by share, except on tasks under a locked node
    update public.plan_task_boq_lines b
       set quantity = round(v_qty * b.share_pct / 100, 4),
           amount = round(coalesce(v_amount, 0) * b.share_pct / 100, 2)
      from public.wbs_tasks t
     where t.id = b.task_id
       and ((v_rev.boq_source = 'tender_boq' and b.tender_boq_item_id = v_rev.boq_item_id)
         or (v_rev.boq_source = 'qs_boq' and b.qs_boq_item_id = v_rev.boq_item_id))
       and (v_manager or not public.wbs_node_effectively_locked(t.wbs_node_id));

    -- direct tasks (no programme lines) share the line in proportion to what they hold now
    select coalesce(sum(w.quantity), 0), count(*) into v_dsum, v_dn
      from public.plan_task_work w
     where w.quantity_source in ('boq', 'tender_boq')
       and ((v_rev.boq_source = 'tender_boq' and w.tender_boq_item_id = v_rev.boq_item_id)
         or (v_rev.boq_source = 'qs_boq' and w.qs_boq_item_id = v_rev.boq_item_id))
       and not exists (select 1 from public.plan_task_boq_lines b where b.task_id = w.task_id);

    for v_task in
      select w.task_id, w.quantity as cur, t.task_code, t.wbs_node_id,
             exists (select 1 from public.plan_task_boq_lines b where b.task_id = w.task_id) as programme
        from public.plan_task_work w
        join public.wbs_tasks t on t.id = w.task_id
       where w.quantity_source in ('boq', 'tender_boq')
         and (exists (select 1 from public.plan_task_boq_lines b
                       where b.task_id = w.task_id
                         and ((v_rev.boq_source = 'tender_boq' and b.tender_boq_item_id = v_rev.boq_item_id)
                           or (v_rev.boq_source = 'qs_boq' and b.qs_boq_item_id = v_rev.boq_item_id)))
              or (((v_rev.boq_source = 'tender_boq' and w.tender_boq_item_id = v_rev.boq_item_id)
                or (v_rev.boq_source = 'qs_boq' and w.qs_boq_item_id = v_rev.boq_item_id))
                  and not exists (select 1 from public.plan_task_boq_lines b where b.task_id = w.task_id)))
    loop
      if not v_manager and public.wbs_node_effectively_locked(v_task.wbs_node_id) then
        v_locked := v_locked + 1;
        continue;
      end if;
      if v_task.programme then
        select sum(b.quantity) into v_target from public.plan_task_boq_lines b where b.task_id = v_task.task_id;
      elsif v_dsum > 0 then
        v_target := round(v_qty * coalesce(v_task.cur, 0) / v_dsum, 4);
      else
        v_target := round(v_qty / greatest(v_dn, 1), 4);
      end if;
      if v_target is not distinct from v_task.cur then
        continue;
      end if;
      select coalesce(sum(quantity), 0) into v_used from public.plan_task_quantity_progress
       where task_id = v_task.task_id and status in ('approved', 'pending');
      if v_used > v_target then
        raise exception 'Activity % has % installed or pending, more than the new scope of %: correct its installed quantity first',
          coalesce(v_task.task_code, v_task.task_id::text), round(v_used, 3), round(v_target, 3);
      end if;
      update public.plan_task_work
         set quantity = v_target, quantity_reason = v_reason, updated_by = auth.uid()
       where task_id = v_task.task_id;
      if v_task.programme then v_prog := v_prog + 1; else v_direct := v_direct + 1; end if;
    end loop;
  end if;

  v_result := jsonb_build_object('programme_tasks', v_prog, 'direct_tasks', v_direct, 'locked_tasks', v_locked,
                                 'links_to_update_in_generate', v_rev.link_count, 'quantity', v_qty);
  update public.plan_boq_change_reviews
     set status = case when p_decision = 'apply' then 'applied' else 'kept' end,
         decided_by = auth.uid(), decided_at = now(), updated_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), ''), decision_result = v_result
   where id = v_rev.id;
  return v_result;
end;
$$;

revoke all on function public.plan_decide_boq_change(uuid, text, text) from public, anon;
grant execute on function public.plan_decide_boq_change(uuid, text, text) to authenticated;
