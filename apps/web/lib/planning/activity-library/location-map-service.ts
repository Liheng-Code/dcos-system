// Data access for the location map (doc 21, Phase 2). Suggestions are pure (location-map.ts).
// Writes need project membership + planning/schedule edit (RLS on plan_location_map).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedLocation, SplitRule, WbsLevel } from "./location-map";

type Db = SupabaseClient;

/**
 * The project's level nodes with the code of the building above them, and its chainage sections with the
 * code of their route (the node above) and their chainage range.
 */
export async function listWbsLevels(db: Db, projectId: string): Promise<WbsLevel[]> {
  const [nodesRes, mapRes] = await Promise.all([
    db
      .from("wbs_nodes")
      .select("id, wbs_code, wbs_name, node_type, parent_id, chainage_from_m, chainage_to_m, is_below_ground, is_external_works")
      .eq("project_id", projectId),
    db.from("plan_location_map").select("building_code, wbs_node_id").eq("project_id", projectId).eq("status", "confirmed").not("wbs_node_id", "is", null),
  ]);
  if (nodesRes.error) throw new Error(nodesRes.error.message);
  if (mapRes.error) throw new Error(mapRes.error.message);
  const rows = (nodesRes.data ?? []) as {
    id: string; wbs_code: string; wbs_name: string; node_type: string; parent_id: string | null;
    chainage_from_m: number | null; chainage_to_m: number | null; is_below_ground: boolean | null; is_external_works: boolean | null;
  }[];
  // Projects whose floors are task groups (no level nodes): a node confirmed in the location map counts as a
  // floor, with the map row's building code. Below-ground and external nodes stay out, so a building-wide
  // ("All") line spreads over the above-ground floors only; they keep their own direct mappings.
  const mappedBuilding = new Map(
    ((mapRes.data ?? []) as { building_code: string; wbs_node_id: string }[]).map((m) => [m.wbs_node_id, m.building_code || null]),
  );
  const codeById = new Map(rows.map((r) => [r.id, r.wbs_code]));
  const typeById = new Map(rows.map((r) => [r.id, r.node_type]));
  return rows
    .filter((r) =>
      r.node_type === "level" || r.node_type === "segment" ||
      (mappedBuilding.has(r.id) && !r.is_below_ground && !r.is_external_works))
    .map((r) => ({
      id: r.id, wbs_code: r.wbs_code, wbs_name: r.wbs_name,
      building_code: r.node_type === "level" || r.node_type === "segment"
        ? (r.parent_id && (r.node_type === "segment" || typeById.get(r.parent_id) === "building") ? codeById.get(r.parent_id) ?? null : null)
        : mappedBuilding.get(r.id) ?? null,
      chainage_from: r.chainage_from_m != null ? Number(r.chainage_from_m) : null,
      chainage_to: r.chainage_to_m != null ? Number(r.chainage_to_m) : null,
    }));
}

/** Current GFA per level node (wbs_node_quantities, metric GFA), for the "gfa" split of project-wide lines. */
export async function listLevelGfa(db: Db, projectId: string): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("wbs_node_quantities")
    .select("wbs_node_id, metric_code, value")
    .eq("project_id", projectId)
    .eq("is_current", true)
    .ilike("metric_code", "gfa");
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as { wbs_node_id: string; value: number }[]).map((r) => [r.wbs_node_id, Number(r.value) || 0]));
}

export async function listSavedLocations(db: Db, projectId: string): Promise<SavedLocation[]> {
  const { data, error } = await db
    .from("plan_location_map")
    .select("building_code, qs_level_label, wbs_node_id, status, split_rule")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedLocation[];
}

export interface LocationDecision {
  building_code: string;
  qs_level_label: string;
  wbs_node_id: string | null;
  status: "confirmed" | "ignored";
  split_rule: SplitRule;
}

/** Saves decisions (insert or replace per building + level label). */
export async function saveLocations(db: Db, projectId: string, decisions: LocationDecision[]): Promise<void> {
  if (decisions.length === 0) return;
  const rows = decisions.map((d) => ({
    project_id: projectId,
    building_code: d.building_code ?? "",
    qs_level_label: d.qs_level_label,
    wbs_node_id: d.status === "ignored" ? null : d.wbs_node_id,
    status: d.status,
    split_rule: d.wbs_node_id ? "none" : d.split_rule,
    confirmed_at: new Date().toISOString(),
  }));
  const { error } = await db.from("plan_location_map").upsert(rows, { onConflict: "project_id,building_code,qs_level_label" });
  if (error) throw new Error(error.message);
}

/** Forgets a decision, so the location goes back to a suggestion. */
export async function clearLocation(db: Db, projectId: string, buildingCode: string, label: string): Promise<void> {
  const { error } = await db
    .from("plan_location_map")
    .delete()
    .eq("project_id", projectId)
    .eq("building_code", buildingCode ?? "")
    .eq("qs_level_label", label);
  if (error) throw new Error(error.message);
}
