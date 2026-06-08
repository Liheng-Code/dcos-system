-- Delay Register table for tracking project delay events (SOP-PLN-001 §23-24)

CREATE TABLE IF NOT EXISTS public.delay_register (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id        uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  wbs_task_id       uuid        REFERENCES public.wbs_tasks(id) ON DELETE SET NULL,
  delay_code        text        NOT NULL,
  description       text        NOT NULL,
  delay_type        text        NOT NULL
    CHECK (delay_type IN ('excusable', 'non_excusable', 'compensable', 'non_compensable')),
  cause             text,
  responsible_party text,
  start_date        date,
  finish_date       date,
  impact_days       int
    GENERATED ALWAYS AS (
      CASE WHEN finish_date IS NOT NULL AND start_date IS NOT NULL
        THEN finish_date - start_date
        ELSE NULL
      END
    ) STORED,
  status            text        NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'disputed')),
  notes             text,
  created_by        uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delay_register_project ON public.delay_register(project_id);
CREATE INDEX IF NOT EXISTS idx_delay_register_task    ON public.delay_register(wbs_task_id);

ALTER TABLE public.delay_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delay_register_auth_all" ON public.delay_register
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Auto-generate delay_code per project: DLY-001, DLY-002 ...
CREATE OR REPLACE FUNCTION public.set_delay_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_seq int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(delay_code FROM 5)::int), 0) + 1
    INTO v_seq
    FROM public.delay_register
   WHERE project_id = NEW.project_id;
  NEW.delay_code := 'DLY-' || LPAD(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_delay_code
  BEFORE INSERT ON public.delay_register
  FOR EACH ROW
  WHEN (NEW.delay_code IS NULL OR NEW.delay_code = '')
  EXECUTE FUNCTION public.set_delay_code();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_delay_register_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delay_register_updated_at
  BEFORE UPDATE ON public.delay_register
  FOR EACH ROW
  EXECUTE FUNCTION public.set_delay_register_updated_at();
