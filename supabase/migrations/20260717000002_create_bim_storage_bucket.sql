-- BIM Viewer: Create 'bim-models' storage bucket for IFC file uploads
-- This migration is idempotent — safe to run multiple times.

-- Create the bucket (50 MB limit, public for direct URL access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bim-models', 'bim-models', true, 52428800, null)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Authenticated users can view BIM model files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'BIM models are viewable by authenticated users'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "BIM models are viewable by authenticated users"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'bim-models');
  END IF;
END $$;

-- Authenticated users can upload BIM model files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'BIM models can be uploaded by authenticated users'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "BIM models can be uploaded by authenticated users"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'bim-models');
  END IF;
END $$;

-- Owner can update their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'BIM models can be updated by owner'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "BIM models can be updated by owner"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'bim-models' AND owner = auth.uid());
  END IF;
END $$;

-- Owner can delete their own uploads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'BIM models can be deleted by owner'
      AND tablename = 'objects'
  ) THEN
    CREATE POLICY "BIM models can be deleted by owner"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'bim-models' AND owner = auth.uid());
  END IF;
END $$;
