-- Migration: create cost_libraries table
-- Partitioned by sector (PostgreSQL check constraint for simplicity)
CREATE TABLE IF NOT EXISTS public.cost_libraries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sector text NOT NULL CHECK (sector IN ('Residential','Commercial','Industrial','Institutional','Infrastructure')),
    name text NOT NULL,
    description text,
    unit text,
    currency text NOT NULL,
    price numeric NOT NULL,
    effective_date date,
    source text,
    material_type text,
    grade text,
    specifications text,
    activity_code text,
    labor_factor numeric
);

-- Enable Row Level Security
ALTER TABLE public.cost_libraries ENABLE ROW LEVEL SECURITY;

-- Policy: allow read to all authenticated users
CREATE POLICY "allow read" ON public.cost_libraries
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Policy: allow write to qty_surveyor role
CREATE POLICY "allow write" ON public.cost_libraries
    FOR ALL USING (
        auth.uid() IS NOT NULL AND EXISTS (
            SELECT 1 FROM auth.users u WHERE u.id = auth.uid() AND u.role = 'quantity_surveyor'
        )
    );

