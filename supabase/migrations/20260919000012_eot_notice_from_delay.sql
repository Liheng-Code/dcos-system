-- Migration: 20260919000012_eot_notice_from_delay.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 2, item 2.6 — a
--          minimal, documented bridge turning an agreed delay event into a
--          formal Extension of Time contractual_notices record, since no
--          dedicated EOT module exists yet in DCOS.
-- Depends on:
--   public.delay_register (20260609000002, extended 20260919000011)
--   public.contractual_notices / public.contract_register
--     (20260531000051_contract_administration.sql)
--
-- Schema verification notes:
--   - contractual_notices' exact current columns (read in full from
--     20260531000051_contract_administration.sql): id, contract_id (NOT NULL,
--     references contract_register(id)), notice_no (NOT NULL, unique with
--     contract_id), notice_type (NOT NULL, CHECK includes 'extension_of_time'
--     exactly as the plan assumed), title (NOT NULL), description (NOT NULL),
--     trigger_event, contract_clause, days_from_event, deadline_date (NOT
--     NULL, no default), served_date, served_to, response_date,
--     response_summary, status (default 'pending'), is_time_barred (default
--     false), linked_to, linked_id, created_by, created_at, updated_at.
--     contract_register's primary key column is `id` (confirmed).
--   - Every NOT-NULL-without-default column is supplied below: contract_id
--     (p_contract_id), notice_no (generated — see below), notice_type
--     ('extension_of_time'), title, description, deadline_date.
--   - contractual_notices has no auto-numbering trigger (unlike
--     delay_register's own set_delay_code() trigger) — notice_no is
--     generated inline below by taking max(trailing integer) + 1 among this
--     contract's existing 'EOT-%' notices, mirroring set_delay_code()'s
--     convention. This is a simple sequential scheme, not race-safe under
--     concurrent inserts for the same contract — acceptable for this
--     low-frequency, manually-triggered action; a unique-constraint retry
--     loop would be the next step if that ever becomes a real concern.
--   - deadline_date has no contract-clause-driven source anywhere in this
--     schema today (no column captures a "notice period in days"). When
--     p_deadline is not supplied, this function defaults it to
--     current_date + 28 — a reasonable literal placeholder, called out
--     explicitly here and in the function body, not a computed contractual
--     figure.
--   - trigger_event is populated from the delay's delay_type
--     (excusable/non_excusable/compensable/non_compensable) as the closest
--     available "what triggered this notice" value; contract_clause and
--     days_from_event are left null (no source column anywhere).

create or replace function public.create_eot_notice_from_delay(
  p_delay_id uuid,
  p_contract_id uuid,
  p_deadline date default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_delay          public.delay_register%rowtype;
  v_contract_project uuid;
  v_seq            int;
  v_notice_no      text;
  v_notice_id      uuid;
  v_description    text;
begin
  select * into v_delay from public.delay_register where id = p_delay_id;
  if v_delay.id is null then
    raise exception 'Delay event % not found', p_delay_id;
  end if;

  select project_id into v_contract_project
  from public.contract_register where id = p_contract_id;

  if v_contract_project is null then
    raise exception 'Contract % not found', p_contract_id;
  end if;

  if v_contract_project <> v_delay.project_id then
    raise exception 'Contract % belongs to a different project than delay event %', p_contract_id, p_delay_id;
  end if;

  select coalesce(max(substring(notice_no from '[0-9]+$')::int), 0) + 1
    into v_seq
  from public.contractual_notices
  where contract_id = p_contract_id and notice_no like 'EOT-%';

  v_notice_no := 'EOT-' || lpad(v_seq::text, 3, '0');

  v_description := 'Extension of Time notice for delay event ' || v_delay.delay_code || ': ' || v_delay.description
    || case when v_delay.cause is not null then E'\nCause: ' || v_delay.cause else '' end
    || case when v_delay.impact_days is not null then E'\nClaimed impact: ' || v_delay.impact_days || ' day(s).' else '' end;

  insert into public.contractual_notices (
    contract_id, notice_no, notice_type, title, description,
    trigger_event, deadline_date, linked_to, linked_id, created_by
  ) values (
    p_contract_id, v_notice_no, 'extension_of_time',
    'Extension of Time — ' || v_delay.delay_code,
    v_description,
    v_delay.delay_type,
    coalesce(p_deadline, current_date + 28),
    'delay_register', p_delay_id, auth.uid()
  )
  returning id into v_notice_id;

  update public.delay_register set eot_notice_id = v_notice_id where id = p_delay_id;

  return v_notice_id;
end;
$$;

grant execute on function public.create_eot_notice_from_delay(uuid, uuid, date) to authenticated;
