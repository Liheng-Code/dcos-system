-- HR "Needs attention" inbox support (docs/04-Business-Modules/04-18-HR/04-18-0-HR-Auto-Match-Design.md §7)
--   attendance_daily.review_note   why HR accepted a flagged day as it is
--   leave_requests.payroll_followup_handled_at   when HR dealt with leave that changed after payroll
--   telegram_link_requests         Telegram users the bot could not match to exactly one employee by phone;
--                                  HR links or dismisses them from the inbox
-- Safe to re-run.

alter table public.attendance_daily add column if not exists review_note text;
alter table public.leave_requests add column if not exists payroll_followup_handled_at timestamptz;

create table if not exists public.telegram_link_requests (
  id                     uuid primary key default gen_random_uuid(),
  telegram_user_id       bigint not null,
  chat_id                bigint not null,
  telegram_name          text,
  telegram_username      text,
  phone                  text,
  -- no_match | multiple_match | already_linked (the matched employee has another Telegram account)
  reason                 text not null check (reason in ('no_match', 'multiple_match', 'already_linked')),
  candidate_employee_ids uuid[] not null default '{}',
  status                 text not null default 'pending' check (status in ('pending', 'linked', 'dismissed')),
  linked_employee_id     uuid references public.profiles(id) on delete set null,
  resolved_by            uuid references public.profiles(id) on delete set null,
  resolved_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- One open request per Telegram account: asking again refreshes it instead of piling up.
create unique index if not exists telegram_link_requests_pending_uq
  on public.telegram_link_requests (telegram_user_id) where status = 'pending';

drop trigger if exists trg_telegram_link_requests_updated_at on public.telegram_link_requests;
create trigger trg_telegram_link_requests_updated_at
  before update on public.telegram_link_requests
  for each row execute function public.hr_set_updated_at();

alter table public.telegram_link_requests enable row level security;
drop policy if exists telegram_link_requests_hr on public.telegram_link_requests;
create policy telegram_link_requests_hr on public.telegram_link_requests
  for all to authenticated
  using ((select public.is_hr())) with check ((select public.is_hr()));
-- The bot writes with the service role (bypasses RLS).
