ALTER TABLE public.leave_public_holidays
  ADD COLUMN IF NOT EXISTS note TEXT;
