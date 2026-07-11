-- 1. Add company_id to profiles so naming/document modules can resolve the issuer company
--    Nullable: existing users may not be associated with a company yet

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- 2. Create 'documents' storage bucket (was never created via migration)
--    document-edit-sheet.tsx uploads to storage.from("documents").upload("documents/{project_id}/{uuid}.ext")

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', false, 104857600, null)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users can view documents
CREATE POLICY "Documents are viewable by authenticated users"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');

-- Authenticated users can upload documents
CREATE POLICY "Documents can be uploaded by authenticated users"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');

-- Owner can update their own documents
CREATE POLICY "Documents can be updated by owner"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid());

-- Owner can delete their own documents
CREATE POLICY "Documents can be deleted by owner"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid());
