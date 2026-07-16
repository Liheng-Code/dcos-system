-- Add client_name and contractor_name to tender_register
-- Used by Cover/Tender Summary print output

ALTER TABLE public.tender_register
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS contractor_name text;
