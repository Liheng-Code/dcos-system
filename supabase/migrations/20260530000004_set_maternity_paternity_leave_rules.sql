-- Set Maternity Leave rules: female only, max 90 days per request
UPDATE public.leave_types SET
  gender_restriction   = 'female',
  max_days_per_request = 90,
  half_day_allowed     = FALSE,
  skip_team_capacity   = TRUE
WHERE leave_code = 'MATERNITY';

-- Set Paternity Leave rules: male only, max 7 days per request
UPDATE public.leave_types SET
  gender_restriction   = 'male',
  max_days_per_request = 7,
  half_day_allowed     = FALSE,
  skip_team_capacity   = TRUE
WHERE leave_code = 'PATERNITY';
