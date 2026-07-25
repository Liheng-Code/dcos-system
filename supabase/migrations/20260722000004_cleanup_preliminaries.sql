-- Cleanup: Delete Direct Works Resources items from preliminaries (non-Z codes)
-- Only Z-prefix codes belong in tender_preliminaries_items

DELETE FROM public.tender_preliminaries_items
WHERE code NOT LIKE 'Z%';
