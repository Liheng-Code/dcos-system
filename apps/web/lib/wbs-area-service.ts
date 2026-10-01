// WBS node area data: gross floor area (GFA) per WBS node and the project's
// site area. Core, because the WBS screens own this data; Quantity Surveying
// reads the same tables for its cost-per-m2 figures.

import { createClient } from "@/lib/supabase/client";

export interface WbsNodeGfa {
  wbsNodeId: string;
  value: number;
  unit: string;
  source: string | null;
  updatedAt: string;
}

// §11: GFA entered per level node, source = drawing revision reference.
export async function getWbsNodeGfa(wbsNodeId: string): Promise<WbsNodeGfa | null> {
  const supabase = createClient();

  // First try the ideal query
  let { data, error } = await supabase
    .from("wbs_node_quantities")
    .select("*")
    .eq("wbs_node_id", wbsNodeId)
    .eq("metric_code", "GFA")
    .maybeSingle();

  // Fallback: try without metric_code filter (production table may lack it)
  if (error) {
    const retry = await supabase
      .from("wbs_node_quantities")
      .select("*")
      .eq("wbs_node_id", wbsNodeId)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  // Fallback: try plain select with just wbs_node_id
  if (error) {
    const retry2 = await supabase
      .from("wbs_node_quantities")
      .select("*")
      .eq("wbs_node_id", wbsNodeId);
    data = retry2.data?.[0] ?? null;
    error = retry2.error;
  }

  if (error) return null;
  if (!data) return null;
  return {
    wbsNodeId: data.wbs_node_id,
    value: Number(data.value ?? 0),
    unit: data.unit ?? "m2",
    source: data.source ?? null,
    updatedAt: data.updated_at ?? data.created_at ?? new Date().toISOString(),
  };
}

// §3 Non-Negotiable Rule 3: editing an existing value requires a reason, logged
// via qs_audit_log (trigger already attached to wbs_node_quantities). First
// entry needs no reason — nothing to revise yet.
export async function upsertWbsNodeGfa(payload: {
  wbsNodeId: string;
  value: number;
  source: string;
  revisionReason?: string;
}): Promise<void> {
  const supabase = createClient();

  // Check if a row already exists
  let existingId: string | null = null;
  const { data: existingRow } = await supabase
    .from("wbs_node_quantities")
    .select("id")
    .eq("wbs_node_id", payload.wbsNodeId)
    .maybeSingle();
  if (existingRow) existingId = existingRow.id;

  if (existingId) {
    const { error } = await supabase
      .from("wbs_node_quantities")
      .update({
        value: payload.value,
        source: payload.source,
        revision_reason: payload.revisionReason ?? null,
      })
      .eq("id", existingId);
    if (error) throw new Error(error.message);
  } else {
    // Try minimal insert first
    const { error } = await supabase
      .from("wbs_node_quantities")
      .insert({
        wbs_node_id: payload.wbsNodeId,
        metric_code: "GFA",
        value: payload.value,
        source: payload.source,
      });

    // If metric_code column doesn't exist, try without it
    if (error && error.message.includes("metric_code")) {
      const retry = await supabase
        .from("wbs_node_quantities")
        .insert({
          wbs_node_id: payload.wbsNodeId,
          value: payload.value,
          source: payload.source,
        });
      if (retry.error) throw new Error(retry.error.message);
      return;
    }

    if (error) throw new Error(error.message);
  }
}

// ── WBS Builder grid GFA helpers ──────────────────────────────────────────
// Lightweight read/write for the GFA column in the WBS Builder grid. These
// reuse the same wbs_node_quantities store as the QS per-level GFA above, but
// let it be entered on Level and Zone nodes and skip the mandatory
// drawing-reference (source defaults to 'manual entry'). The QS Cost-per-m²
// roll-up (getProjectGfaSummary) sums GFA on node_type = 'level', so a Level
// GFA entered here also feeds the cost benchmarks — enter a drawing reference
// via the QS screen where that governance matters.

/** One query for every GFA value in a project — powers the grid's roll-up. */
export async function getProjectGfaMap(projectId: string): Promise<Map<string, number>> {
  const { data, error } = await createClient()
    .from("wbs_node_quantities")
    .select("value, wbs_node_id, wbs_nodes!inner(project_id)")
    .eq("metric_code", "GFA")
    .eq("wbs_nodes.project_id", projectId);
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const row of (data ?? []) as { wbs_node_id: string; value: number | string }[]) {
    map.set(row.wbs_node_id, Number(row.value ?? 0));
  }
  return map;
}

/** Upsert a GFA value from a grid cell — no revision-reason prompt. */
export async function setWbsNodeGfaValue(wbsNodeId: string, value: number): Promise<void> {
  if (!Number.isFinite(value) || value < 0) throw new Error("GFA must be a number ≥ 0");
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("wbs_node_quantities")
    .select("id")
    .eq("wbs_node_id", wbsNodeId)
    .eq("metric_code", "GFA")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("wbs_node_quantities")
      .update({ value })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("wbs_node_quantities").insert({
    wbs_node_id: wbsNodeId,
    metric_code: "GFA",
    value,
    unit: "m2",
    source: "manual entry",
  });
  if (error) throw new Error(error.message);
}

/** Remove a node's GFA row (grid cell cleared). */
export async function clearWbsNodeGfa(wbsNodeId: string): Promise<void> {
  const { error } = await createClient()
    .from("wbs_node_quantities")
    .delete()
    .eq("wbs_node_id", wbsNodeId)
    .eq("metric_code", "GFA");
  if (error) throw new Error(error.message);
}

// §4: Site Area entered once per project, independent of the WBS GFA rollup.
export async function getProjectSiteArea(projectId: string): Promise<{ siteArea: number | null; siteAreaSource: string | null }> {
  const { data, error } = await createClient()
    .from("projects")
    .select("site_area, site_area_source")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);
  return {
    siteArea: data?.site_area != null ? Number(data.site_area) : null,
    siteAreaSource: data?.site_area_source ?? null,
  };
}

export async function updateProjectSiteArea(payload: {
  projectId: string;
  siteArea: number;
  siteAreaSource: string;
}): Promise<void> {
  const { error } = await createClient()
    .from("projects")
    .update({ site_area: payload.siteArea, site_area_source: payload.siteAreaSource })
    .eq("id", payload.projectId);
  if (error) throw new Error(error.message);
}
