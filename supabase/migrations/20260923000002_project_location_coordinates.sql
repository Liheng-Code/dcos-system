-- Migration: 20260923000002_project_location_coordinates.sql
-- Purpose: Support map-picked project locations during Post-Contract project
--          creation. projects.location keeps the human-readable address; the two
--          new columns store the coordinates chosen from the map picker
--          (components/ui/location-picker.tsx).

alter table public.projects
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision;