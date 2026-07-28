-- IPC Client Submission (submodule 06): registers a Document Control entry
-- when a claim is submitted to the client. Reuses the existing 'PC' (Payment
-- Certificate) document_type — a progress claim submission IS a payment
-- certificate package in construction terminology — rather than inserting a
-- redundant new document type.

ALTER TABLE public.qs_progress_claims
  ADD COLUMN IF NOT EXISTS submission_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qs_progress_claims_submission_document_id_key'
  ) THEN
    ALTER TABLE public.qs_progress_claims
      ADD CONSTRAINT qs_progress_claims_submission_document_id_key UNIQUE (submission_document_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qs_progress_claims_submission_doc ON public.qs_progress_claims(submission_document_id);
