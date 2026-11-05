-- Construction Work Library: where an activity is used in WBS templates (2026-11-05).
--
-- WBS template tasks point at an activity by code (content jsonb: sections.tasks[] and floor_blocks.<type>.tasks[],
-- key master_code). The code is version-agnostic, so a new version needs no repoint; this shows the activity dialog
-- which templates (and how many of their tasks) a change reaches. Read-only, invoker rights (wbs_templates is readable
-- by every authenticated user).

create or replace function public.wl_master_template_usage(p_code text)
 returns table (template_id uuid, template_name text, tasks integer)
 language sql
 stable
 set search_path to ''
as $function$
  with t as (
    select w.id, w.template_name, x.t
      from public.wbs_templates w, jsonb_array_elements(coalesce(w.content->'sections'->'tasks', '[]'::jsonb)) x(t)
    union all
    select w.id, w.template_name, x.t
      from public.wbs_templates w, jsonb_each(case when jsonb_typeof(w.content->'floor_blocks') = 'object' then w.content->'floor_blocks' else '{}'::jsonb end) fb(k, v),
           jsonb_array_elements(coalesce(fb.v->'tasks', '[]'::jsonb)) x(t))
  select t.id, t.template_name, count(*)::int
    from t
   where t.t->>'master_code' = p_code
   group by t.id, t.template_name
   order by t.template_name;
$function$;

revoke all on function public.wl_master_template_usage(text) from public, anon;
grant execute on function public.wl_master_template_usage(text) to authenticated;
