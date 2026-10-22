-- Starter plans. Module bundles are not decided yet (owner decision 4): these
-- are placeholders to edit under Plans & Catalogue, not a commercial decision.
insert into public.plans
  (code, display_name, license_type_default, default_duration_months, modules, features,
   limit_users, limit_viewers, limit_projects, grace_days, readonly_days, support_tier, sort_order)
values
  ('TRIAL', 'Trial', 'trial', 1,
   array['planning', 'qs', 'procurement', 'document_control', 'construction'],
   array['ai_planning', 'ai_qs'], 10, 10, 2, 0, 7, 'standard', 10),
  ('STANDARD', 'Standard', 'subscription', 12,
   array['planning', 'qs', 'document_control'],
   array[]::text[], 20, 20, 5, 14, 30, 'standard', 20),
  ('PRO', 'Professional', 'subscription', 12,
   array['planning', 'qs', 'procurement', 'inventory', 'document_control', 'construction', 'reporting'],
   array['ai_planning', 'ai_qs', 'advanced_reports'], 50, 30, 20, 14, 30, 'premium', 30),
  ('ENT', 'Enterprise', 'enterprise', 12,
   array['planning', 'qs', 'procurement', 'inventory', 'document_control', 'construction', 'hse', 'qaqc', 'account', 'hr', 'design', 'reporting'],
   array['ai_planning', 'ai_qs', 'advanced_reports'], null, null, null, 30, 60, 'premium', 40)
on conflict (code) do nothing;
