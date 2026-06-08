-- Add delay_reason free-text field to wbs_tasks.
-- Captured when delay_status is set to 'delayed' or 'blocked'.
ALTER TABLE public.wbs_tasks
  ADD COLUMN IF NOT EXISTS delay_reason TEXT;
