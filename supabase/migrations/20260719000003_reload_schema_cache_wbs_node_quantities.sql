-- Force PostgREST schema cache reload so the new wbs_node_quantities.project_id
-- / source_ref columns (added in 20260719000001 / 20260719000002) are visible
-- via the REST API. Same pattern as 20260717000004_reload_schema_cache.sql.
notify pgrst, 'reload schema';
