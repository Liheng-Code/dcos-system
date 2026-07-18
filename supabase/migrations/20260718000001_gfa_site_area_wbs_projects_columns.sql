-- Migration: 20260718000001_gfa_site_area_wbs_projects_columns.sql
-- Purpose: Add GFA / Site Area foundation columns per DCOS-QS-GDL-001 V1.1
--          (docs/03-Business-Modules/12-Quantity-Surveying/04-GFA-Site-Area-Cost-per-m2-Design.md §2.1, §2.2)
-- Depends on: wbs_nodes (20260527000009_create_wbs_nodes.sql), projects (20260527000008_create_projects.sql)

-- ── §2.1 wbs_nodes: new flags ──────────────────────────────────────────────
-- Both are plain flags, default false — zero migration risk to existing rows.
alter table public.wbs_nodes
  add column if not exists is_below_ground   boolean not null default false,
  add column if not exists is_external_works boolean not null default false;

comment on column public.wbs_nodes.is_below_ground is
  'Flags a level node as a basement level. Drives the above/below GFA split and the mandatory split-vs-blended reporting (DCOS-QS-GDL-001 §7).';
comment on column public.wbs_nodes.is_external_works is
  'Flags a node (typically a zone/discipline node) as the root of the external-works scope. This node and every descendant is classified as External Works — divided by Site Area, never GFA (DCOS-QS-GDL-001 §4, §8). Confirmed design decision (design doc §10.3): a single node-level flag is sufficient, no per-BOQ-item override needed.';

-- ── §2.2 projects: Site Area (entered once per project, independent of WBS rollup) ──
alter table public.projects
  add column if not exists site_area        numeric(14,2),
  add column if not exists site_area_source text;

comment on column public.projects.site_area is
  'Legal land area from title deed / survey plan (m²), per DCOS-QS-GDL-001 §4. Confirmed design decision (design doc §10.1): stored on projects rather than a synthetic project-level WBS node.';
comment on column public.projects.site_area_source is
  'Reference to the title deed / survey plan / contract works-area boundary drawing backing projects.site_area (DCOS-QS-GDL-001 §4).';
