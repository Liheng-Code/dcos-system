-- BIM Viewer Module: model register, element-to-WBS mapping, saved viewpoints
-- Module: BIM-VIEW
-- Note: tenant_id is the company_id from profiles (the tenant entity).
--       RLS uses auth.jwt() ->> 'tenant_id' (injected by custom_access_token_hook).

-- ─── bim_models ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bim_models (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  project_id    uuid NOT NULL REFERENCES public.projects(id),
  model_name    text NOT NULL,
  discipline    text NOT NULL DEFAULT 'FED',
  revision      text NOT NULL DEFAULT 'R0',
  ifc_schema    text NOT NULL DEFAULT 'IFC4',
  file_url      text NOT NULL,
  file_size_mb  numeric NOT NULL DEFAULT 0,
  element_count integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'CURRENT' CHECK (status IN ('CURRENT','SUPERSEDED','ARCHIVED')),
  uploaded_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bim_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bim_models_auth_all" ON public.bim_models
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_bim_models_project ON public.bim_models(project_id);
CREATE INDEX idx_bim_models_tenant  ON public.bim_models(tenant_id);

-- ─── bim_element_wbs_map ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bim_element_wbs_map (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  model_id    uuid NOT NULL REFERENCES public.bim_models(id) ON DELETE CASCADE,
  global_id   text NOT NULL,
  wbs_node_id uuid NOT NULL REFERENCES public.wbs_nodes(id),
  mapped_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_id, global_id)
);

ALTER TABLE public.bim_element_wbs_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bim_element_wbs_map_auth_all" ON public.bim_element_wbs_map
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_bim_wbs_map_model ON public.bim_element_wbs_map(model_id);

-- ─── bim_viewpoints ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bim_viewpoints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  model_id         uuid NOT NULL REFERENCES public.bim_models(id) ON DELETE CASCADE,
  name             text NOT NULL,
  camera_state     jsonb NOT NULL DEFAULT '{}',
  visibility_state jsonb NOT NULL DEFAULT '{}',
  created_by       uuid NOT NULL REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bim_viewpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bim_viewpoints_auth_all" ON public.bim_viewpoints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_bim_viewpoints_model ON public.bim_viewpoints(model_id);

-- ─── bim-models storage bucket ───────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bim-models', 'bim-models', true, 52428800, null)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Authenticated users can view BIM model files
CREATE POLICY "BIM models are viewable by authenticated users"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bim-models');

-- Authenticated users can upload BIM model files
CREATE POLICY "BIM models can be uploaded by authenticated users"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bim-models');

-- Owner can update their own uploads
CREATE POLICY "BIM models can be updated by owner"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bim-models' AND owner = auth.uid());

-- Owner can delete their own uploads
CREATE POLICY "BIM models can be deleted by owner"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bim-models' AND owner = auth.uid());
