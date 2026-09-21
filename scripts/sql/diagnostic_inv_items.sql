-- Diagnostic: check inv_items seed and RLS alignment
-- Run this in Supabase SQL Editor (as postgres, bypasses RLS)

-- 1. How many items exist?
SELECT count(*) as total_items FROM inv_items;

-- 2. What tenant_id do the items have?
SELECT DISTINCT tenant_id FROM inv_items LIMIT 5;

-- 3. What is MCC's company id?
SELECT id, code, name FROM companies WHERE code = 'MCC';

-- 4. What is the current user's company_id (from profiles)?
--    Replace the UUID below with your user id, or just run without the filter
SELECT id, company_id, email FROM profiles WHERE company_id IS NOT NULL LIMIT 5;

-- 5. Does the user's company_id match the items' tenant_id?
SELECT
  p.company_id as user_tenant,
  i.tenant_id as item_tenant,
  (p.company_id = i.tenant_id) as matches
FROM profiles p
CROSS JOIN (SELECT DISTINCT tenant_id FROM inv_items LIMIT 1) i
WHERE p.company_id IS NOT NULL
LIMIT 5;

-- 6. Does the JWT hook exist and is it returning tenant_id?
SELECT proname, proowner FROM pg_proc WHERE proname = 'custom_access_token_hook';
