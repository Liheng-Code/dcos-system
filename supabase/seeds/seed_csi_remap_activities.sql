-- SUPERSEDED by supabase/migrations/20261023123820_core_csi_divisions_fixes.sql
-- The Activity Database remap to CSI MasterFormat 2016 (code mapping, fallback from the old 16 divisions,
-- visible code regeneration, counters) now ships in that migration so /dbpush carries it. It is idempotent
-- and only touches masters whose csi_division_code is null. This file is kept as a no-op for history.
select 1;
