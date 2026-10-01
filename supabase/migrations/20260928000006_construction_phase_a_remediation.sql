-- Migration: 20260928000006_construction_phase_a_remediation.sql
-- Construction Module Phase A: Scoping remediation, storage bucket, and photo metadata
-- 1. Extend site_progress_photos with wbs_task_id, daily_report_id, storage_path, file metadata
-- 2. Create 'site-progress-photos' storage bucket with policies
-- 3. Add profiles foreign key constraint on site_daily_reports.created_by
-- 4. Audit & guarantee indexes on inspection_requests and ncrs

-- ── 1. Extend site_progress_photos ──────────────────────────────────────────
ALTER TABLE public.site_progress_photos
  ADD COLUMN IF NOT EXISTS wbs_task_id UUID REFERENCES public.wbs_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS daily_report_id UUID REFERENCES public.site_daily_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_site_progress_photos_task ON public.site_progress_photos(wbs_task_id) WHERE wbs_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_progress_photos_report ON public.site_progress_photos(daily_report_id) WHERE daily_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_progress_photos_taken ON public.site_progress_photos(project_id, taken_at DESC);

-- Trigger for updated_at on site_progress_photos
DROP TRIGGER IF EXISTS trg_site_progress_photos_updated_at ON public.site_progress_photos;
CREATE TRIGGER trg_site_progress_photos_updated_at
  BEFORE UPDATE ON public.site_progress_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Create Storage Bucket for Site Photos ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-progress-photos',
  'site-progress-photos',
  true,
  20971520, -- 20MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage object policies for site-progress-photos
DO $$ BEGIN
  CREATE POLICY "Public can view site progress photos"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'site-progress-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload site progress photos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'site-progress-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can update site progress photos"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'site-progress-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete site progress photos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'site-progress-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Profiles foreign key on site_daily_reports ───────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_site_daily_reports_created_by_profile'
  ) THEN
    ALTER TABLE public.site_daily_reports
      ADD CONSTRAINT fk_site_daily_reports_created_by_profile
      FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4. Indexes on inspection_requests and ncrs ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inspection_requests_proj_date
  ON public.inspection_requests(project_id, request_date DESC);

CREATE INDEX IF NOT EXISTS idx_inspection_requests_wbs_task
  ON public.inspection_requests(wbs_task_id) WHERE wbs_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ncrs_proj_date
  ON public.ncrs(project_id, created_at DESC);

-- Ensure RLS on inspection_requests and ncrs allows authenticated
ALTER TABLE public.inspection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncrs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "auth_inspection_requests"
    ON public.inspection_requests
    TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "auth_ncrs"
    ON public.ncrs
    TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
