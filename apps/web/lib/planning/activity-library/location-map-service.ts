// Data access for the location map (doc 21, Phase 2). Suggestions are pure (location-map.ts).
// Writes need project membership + planning/schedule edit (RLS on plan_location_map).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedLocation, SplitRule, WbsLevel } from "./location-map";

type Db = SupabaseClient;

/** The project's level nodes with the code of the building node above them. */
export async function listWbsLevels(db: Db, projectId: string): Promise<WbsLevel[]> {
  const { data, error } = await db
    .from("wbs_nodes")
    .select("id, wbs_code, wbs_name, node_type, parent_id")
    .eq("project_id", projectId)
    .in("node_type", ["building", "level"]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; wbs_code: string; wbs_name: string; node_type: string; parent_id: string | null }[];
  const buildingCode = new Map(rows.filter((r) => r.node_type === "building").map((r) => [r.id, r.wbs_code]));
  return rows
    .filter((r) => r.node_type === "level")
    .map((r) => ({ id: r.id, wbs_code: r.wbs_code, wbs_name: r.wbs_name, building_code: r.parent_id ? buildingCode.get(r.parent_id) ?? null : null }));
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
