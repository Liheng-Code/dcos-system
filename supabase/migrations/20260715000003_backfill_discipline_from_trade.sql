-- =====================================================================================
-- Populate discipline on company_rate_library based on trade
-- Structural : Concrete, Rebar, Formwork, Piling, Steel, Aggregates, Fill
-- Architecture: Doors & Windows, Ceiling, Flooring, Masonry, Painting, Plaster,
--               Plastering, Roofing, Tiling, Waterproofing, Miscellaneous
-- MEP: Electrical, Plumbing, Fire Protection, HVAC
-- Labor & Plant: left as-is (cross-discipline)
-- =====================================================================================

UPDATE public.company_rate_library
SET discipline = CASE
  WHEN trade IN ('Concrete','Rebar','Formwork','Piling','Steel','Aggregates','Fill')
    THEN 'Structural'
  WHEN trade IN ('Doors & Windows','Ceiling','Flooring','Masonry','Painting',
                 'Plaster','Plastering','Roofing','Tiling','Waterproofing','Miscellaneous')
    THEN 'Architecture'
  WHEN trade IN ('Electrical','Plumbing','Fire Protection','HVAC')
    THEN 'MEP'
  ELSE discipline  -- Labor, Plant, etc. stay null
END
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'
  AND discipline IS NULL;

-- Verify
SELECT discipline, COUNT(*) as cnt
FROM company_rate_library
WHERE tenant_id = '00000000-0000-0000-0000-000000000000'
GROUP BY discipline
ORDER BY discipline;
