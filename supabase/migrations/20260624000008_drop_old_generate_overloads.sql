-- Remove obsolete overloads of the Master Library generation RPC.
-- Keep only the target-node-aware version.

drop function if exists public.generate_wbs_from_master_library_items(uuid, jsonb);
drop function if exists public.generate_wbs_from_master_library_items(uuid, jsonb, text);
