-- Migration: 20261027150240_qs_qto_item_display.sql
-- Purpose: Quantity Take-off — how an item's measurements are drawn on the sheet (colour and fill
--          opacity chosen in the viewer's "New Area / New Linear…" panel). Display only; not part of
--          the published quantity. Additive.

alter table public.qto_items
  add column if not exists display_color   text,
  add column if not exists display_opacity numeric(3,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qto_items_display_color_check') then
    alter table public.qto_items add constraint qto_items_display_color_check
      check (display_color is null or display_color ~ '^#[0-9a-fA-F]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qto_items_display_opacity_check') then
    alter table public.qto_items add constraint qto_items_display_opacity_check
      check (display_opacity is null or (display_opacity >= 0 and display_opacity <= 1));
  end if;
end $$;
