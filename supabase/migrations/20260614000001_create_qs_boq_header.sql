-- Create qs_boq header table for multi-BOQ support per project
-- Each project can have multiple BOQs (e.g. one per work package/phase)

CREATE TABLE IF NOT EXISTS public.qs_boq (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_number    TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  boq_type      TEXT NOT NULL DEFAULT 'main_works'
                CHECK (boq_type IN ('preliminary','main_works','variation','provisional_sum','supplement')),
  version       INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','active','locked','superseded')),
  currency_code TEXT NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(14,6) DEFAULT 1,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qs_boq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qs_boq_auth" ON public.qs_boq
  TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_qs_boq_project ON public.qs_boq(project_id);
CREATE INDEX idx_qs_boq_status   ON public.qs_boq(project_id, status);

-- Add boq_id to qs_boq_sections to link sections to a specific BOQ
ALTER TABLE public.qs_boq_sections
  ADD COLUMN IF NOT EXISTS boq_id UUID REFERENCES public.qs_boq(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_qs_boq_sections_boq ON public.qs_boq_sections(boq_id);

-- Migrate existing data: create a default BOQ per project that has sections
-- and link existing orphan sections to it
DO $$
DECLARE
  proj RECORD;
  new_boq_id UUID;
BEGIN
  FOR proj IN
    SELECT DISTINCT project_id
    FROM public.qs_boq_sections
    WHERE boq_id IS NULL
  LOOP
    INSERT INTO public.qs_boq (
      project_id,
      boq_number,
      title,
      boq_type,
      status,
      created_at,
      updated_at
    ) VALUES (
      proj.project_id,
      'BOQ-001',
      'Main Bill of Quantities',
      'main_works',
      'active',
      now(),
      now()
    )
    RETURNING id INTO new_boq_id;

    UPDATE public.qs_boq_sections
    SET boq_id = new_boq_id
    WHERE project_id = proj.project_id AND boq_id IS NULL;
  END LOOP;
END $$;
