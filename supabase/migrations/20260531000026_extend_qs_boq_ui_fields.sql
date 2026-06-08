-- Extend QS BOQ tables with UI-friendly fields for the procurement BOQ listing

ALTER TABLE public.qs_boq_items
  ADD COLUMN IF NOT EXISTS item_no TEXT,
  ADD COLUMN IF NOT EXISTS item_code TEXT;

ALTER TABLE public.qs_boq_sections
  ADD COLUMN IF NOT EXISTS section_code TEXT;

-- Derive default values from existing seq (if any)
UPDATE public.qs_boq_items SET item_no = seq::TEXT WHERE item_no IS NULL;
UPDATE public.qs_boq_sections SET section_code = seq::TEXT WHERE section_code IS NULL;

-- Add indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_qs_boq_items_item_no  ON public.qs_boq_items(project_id, boq_section_id, item_no);
CREATE INDEX IF NOT EXISTS idx_qs_boq_items_item_code ON public.qs_boq_items(project_id, item_code);
CREATE INDEX IF NOT EXISTS idx_qs_boq_sections_code   ON public.qs_boq_sections(project_id, section_code);
