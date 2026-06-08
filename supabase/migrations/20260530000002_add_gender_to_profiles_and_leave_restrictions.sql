-- Add gender column for maternity/paternity leave validation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female'));

-- Set gender_restriction on leave types
UPDATE public.leave_types SET gender_restriction = 'female' WHERE leave_code = 'MATERNITY';
UPDATE public.leave_types SET gender_restriction = 'male'   WHERE leave_code = 'PATERNITY';
