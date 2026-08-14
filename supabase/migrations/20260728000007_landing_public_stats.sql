-- Public landing-page stat strip. `projects`/`contract_register` RLS is
-- scoped to `authenticated` only (no anon/public policy), which is correct —
-- row-level client/contract data must not be visible pre-login. Rather than
-- widening table RLS, expose a single SECURITY DEFINER function that returns
-- pre-aggregated counts only, and grant EXECUTE to anon so the unauthenticated
-- landing page can render real numbers without any row-level access.

CREATE OR REPLACE FUNCTION public.get_landing_stats()
RETURNS TABLE (project_count integer, total_contract_value numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(contract_value), 0)
  FROM public.projects;
$$;

REVOKE ALL ON FUNCTION public.get_landing_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_landing_stats() TO anon, authenticated;
