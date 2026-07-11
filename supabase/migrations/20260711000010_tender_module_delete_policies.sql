-- The original tender_management / tender_cost_estimation migrations (20260531000054/055)
-- enabled RLS on these tables but only added select/insert/update policies, never delete.
-- With RLS on and no permissive delete policy, a `.delete()` call matches zero rows and
-- returns no error — so the UI's delete "succeeds" and the row silently reappears on refresh.
-- This adds the missing delete policies, matching the permissive `using (true)` convention
-- already used for every other operation/table in this schema.

create policy "Authenticated users can delete tenders"
  on public.tender_register for delete to authenticated using (true);

create policy "Auth users can delete unit rates"
  on public.unit_rate_library for delete to authenticated using (true);

create policy "Auth users can delete tender BOQ"
  on public.tender_boq_items for delete to authenticated using (true);

create policy "Auth users can delete sub quotes"
  on public.tender_sub_quotes for delete to authenticated using (true);

create policy "Auth users can delete risk items"
  on public.tender_risk_items for delete to authenticated using (true);

create policy "Auth users can delete bid summaries"
  on public.tender_bid_summaries for delete to authenticated using (true);
