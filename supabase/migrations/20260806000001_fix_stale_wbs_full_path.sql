-- Recompute stale wbs_nodes.full_path so WBS pickers (Task / Document
-- WBS Location dropdowns) display the same hierarchy codes shown in the
-- WBS tree.
--
-- full_path is normally maintained by trg_wbs_nodes_full_path on
-- insert/update, but historical rows can hold values from an earlier
-- wbs_code state (e.g. "BA / 00.UG-copy" while wbs_code is "01.GF").
-- Touching every row rebuilds the path from the current hierarchy.

update public.wbs_nodes
   set full_path = public.build_wbs_full_path(id);
