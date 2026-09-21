-- Migration: 20260917000001_companies_date_format.sql
-- Purpose: Add company-wide default date display format setting.
-- Depends on: companies (20260527000006)

alter table public.companies add column if not exists date_format text not null default 'MMM_D_YYYY';

comment on column public.companies.date_format is
  'Company-wide default for how dates are DISPLAYED (not edited) across the app — one of the ids in apps/web/lib/date-format.ts DATE_FORMAT_PRESETS. Individual users may override this via their own user_ui_preferences row (preference_key = ''date_display_format'').';
