-- Add 'phase' node type to WBS hierarchy
-- Phase sits above Building as an optional temporal grouping level
-- (Design Phase, Construction Phase, Commissioning Phase, etc.)

ALTER TABLE public.wbs_nodes
  DROP CONSTRAINT IF EXISTS wbs_nodes_node_type_check;

ALTER TABLE public.wbs_nodes
  ADD CONSTRAINT wbs_nodes_node_type_check
  CHECK (node_type IN (
    'phase',
    'building',
    'level',
    'zone',
    'room',
    'element',
    'discipline',
    'task_group'
  ));
