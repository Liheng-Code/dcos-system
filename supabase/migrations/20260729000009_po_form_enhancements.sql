-- PO Module Enhancements — match paper "Project Purchase Order" form
-- Adds: header vendor/date/VAT fields on procurement_pos, and section-header +
-- materials/brand/country + labor/materials rate split on procurement_po_items.

ALTER TABLE public.procurement_pos
  ADD COLUMN IF NOT EXISTS po_date                 date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS vendor_address           text,
  ADD COLUMN IF NOT EXISTS vendor_contact_person    text,
  ADD COLUMN IF NOT EXISTS vendor_contact_no        text,
  ADD COLUMN IF NOT EXISTS advance_payment_terms    text,
  ADD COLUMN IF NOT EXISTS other_payment_terms      text,
  ADD COLUMN IF NOT EXISTS vat_rate                 numeric NOT NULL DEFAULT 10;

ALTER TABLE public.procurement_po_items
  ADD COLUMN IF NOT EXISTS item_type           text NOT NULL DEFAULT 'line' CHECK (item_type IN ('section', 'line')),
  ADD COLUMN IF NOT EXISTS materials_code      text,
  ADD COLUMN IF NOT EXISTS brand               text,
  ADD COLUMN IF NOT EXISTS country             text,
  ADD COLUMN IF NOT EXISTS unit_rate_labor      numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_rate_materials  numeric NOT NULL DEFAULT 0;

-- Relax constraints so a 'section' header row can carry no unit/qty/price.
ALTER TABLE public.procurement_po_items ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE public.procurement_po_items ALTER COLUMN unit_price SET DEFAULT 0;
ALTER TABLE public.procurement_po_items ALTER COLUMN total_price SET DEFAULT 0;

ALTER TABLE public.procurement_po_items DROP CONSTRAINT IF EXISTS procurement_po_items_quantity_ordered_check;
ALTER TABLE public.procurement_po_items
  ADD CONSTRAINT procurement_po_items_quantity_ordered_check
  CHECK (item_type = 'section' OR quantity_ordered > 0);
