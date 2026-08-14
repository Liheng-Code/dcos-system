-- PR Module Enhancements
-- Adds: company_code to projects, preparation_date & ship_to to procurement_prs

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS company_code text;

ALTER TABLE public.procurement_prs
  ADD COLUMN IF NOT EXISTS preparation_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS ship_to text;
