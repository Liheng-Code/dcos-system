-- Public holidays table (admin-managed, multi-year)
CREATE TABLE IF NOT EXISTS public.leave_public_holidays (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  DATE NOT NULL,
  holiday_name  TEXT NOT NULL,
  year          INT  NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(holiday_date, holiday_name)
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_year ON public.leave_public_holidays(year);

-- RLS: all authenticated users can read; HR/admin can manage
ALTER TABLE public.leave_public_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_holidays_view"
  ON public.leave_public_holidays FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "public_holidays_manage"
  ON public.leave_public_holidays FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_code IN ('HR_Manager', 'admin'))
  );

-- ── Seed Cambodia 2026 public holidays ───────────────────────────────────────
INSERT INTO public.leave_public_holidays (holiday_date, holiday_name, year) VALUES
  ('2026-01-01', 'International New Year',                    2026),
  ('2026-02-16', 'Victory Day over Genocide',                 2026),
  ('2026-02-17', 'International Labor Day',                   2026),
  ('2026-03-08', 'International Women''s Day',                2026),
  ('2026-04-14', 'Khmer New Year Days',                       2026),
  ('2026-04-15', 'Khmer New Year Days',                       2026),
  ('2026-04-16', 'Khmer New Year Days',                       2026),
  ('2026-05-05', 'Royal Plowing Ceremony',                    2026),
  ('2026-05-14', 'King Norodom Sihamoni''s Birthday',         2026),
  ('2026-06-18', 'Queen Monineath''s Birthday',               2026),
  ('2026-09-24', 'Constitutional Day',                        2026),
  ('2026-10-10', 'Pchum Ben Day',                             2026),
  ('2026-10-11', 'Pchum Ben Day',                             2026),
  ('2026-10-12', 'Pchum Ben Day',                             2026),
  ('2026-10-15', 'Commemoration Day of the King''s Father',   2026),
  ('2026-10-29', 'Coronation Day of King Sihamoni',           2026),
  ('2026-11-09', 'National Independence Day',                 2026),
  ('2026-11-23', 'Water Festival',                            2026),
  ('2026-11-24', 'Water Festival',                            2026),
  ('2026-11-25', 'Water Festival',                            2026),
  ('2026-12-29', 'Peace Day in Cambodia',                     2026)
ON CONFLICT DO NOTHING;
