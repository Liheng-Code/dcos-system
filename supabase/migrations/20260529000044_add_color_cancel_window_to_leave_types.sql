-- Add color and cancel_window_days to leave_types
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS color              TEXT NOT NULL DEFAULT 'blue',
  ADD COLUMN IF NOT EXISTS cancel_window_days INT  NOT NULL DEFAULT 0;

-- Set default colors for seeded leave types
UPDATE public.leave_types SET color = 'blue'    WHERE leave_code = 'ANNUAL';
UPDATE public.leave_types SET color = 'red'     WHERE leave_code = 'SICK';
UPDATE public.leave_types SET color = 'purple'  WHERE leave_code = 'MATERNITY';
UPDATE public.leave_types SET color = 'indigo'  WHERE leave_code = 'PATERNITY';
UPDATE public.leave_types SET color = 'amber'   WHERE leave_code = 'EMERGENCY';
UPDATE public.leave_types SET color = 'teal'    WHERE leave_code = 'COMPENSATION';
UPDATE public.leave_types SET color = 'gray'    WHERE leave_code = 'UNPAID';
UPDATE public.leave_types SET color = 'green'   WHERE leave_code = 'BUSINESS';
