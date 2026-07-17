-- Force PostgREST schema cache reload so tender_price_list becomes visible via API
notify pgrst, 'reload schema';
