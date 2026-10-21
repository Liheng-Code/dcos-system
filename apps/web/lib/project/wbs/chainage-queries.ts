// Data access for chainage sections (Phase E): segment nodes under a road / pipeline route.
// Rules: lib/chainage.ts and supabase/migrations/20261021000012_chainage_sections.sql.

import { createClient } from "@/lib/supabase/client";
import type { PlannedSegment } from "@/lib/chainage";

export interface ExistingSection {
  id: string;
  wbs_code: string;
  from: number;
  to: number;
}

/** Chainage sections already under a route, in chainage order. */
// @table wbs_nodes
export async function listRouteSections(routeId: string): Promise<ExistingSection[]> {
  const { data, error } = await createClient()
    .from("wbs_nodes")
    .select("id, wbs_code, chainage_from_m, chainage_to_m")
    .eq("parent_id", routeId)
    .eq("node_type", "segment")
    .order("chainage_from_m");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; wbs_code: string; chainage_from_m: number | null; chainage_to_m: number | null }[])
    .filter((r) => r.chainage_from_m != null && r.chainage_to_m != null)
    .map((r) => ({ id: r.id, wbs_code: r.wbs_code, from: Number(r.chainage_from_m), to: Number(r.chainage_to_m) }));
}

/** Creates the sections under the route; codes already there are skipped. */
export async function addChainageSegments(routeId: string, segments: PlannedSegment[]): Promise<{ created: string[]; skipped: string[] }> {
  const { data, error } = await createClient().rpc("add_chainage_segments", {
    p_route_id: routeId,
    p_segments: segments.map((s) => ({ code: s.code, name: s.name, from: s.from, to: s.to })),
  });
  if (error) throw new Error(error.message);
  return data as { created: string[]; skipped: string[] };
}
