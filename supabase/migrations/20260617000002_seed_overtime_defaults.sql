-- ============================================================
-- Seed default OT rates (§13) and limits (§16-18)
-- ============================================================

-- Default OT rate multipliers
insert into public.overtime_rates (ot_type, multiplier, effective_date) values
  ('weekday',        1.5, '2026-01-01'),
  ('weekend',        2.0, '2026-01-01'),
  ('public_holiday', 3.0, '2026-01-01'),
  ('night_shift',    2.0, '2026-01-01'),
  ('emergency',      1.5, '2026-01-01'),
  ('project_critical', 2.0, '2026-01-01')
on conflict (ot_type, effective_date) do nothing;

-- Default OT limits
insert into public.overtime_limits (limit_type, max_hours, escalation_required) values
  ('daily',   4,  false),
  ('weekly',  20, false),
  ('monthly', 60, true)
on conflict do nothing;
