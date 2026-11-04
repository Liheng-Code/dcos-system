// Saved what-if comparisons of Generate (doc 35 F1): a named variant (method per activity, productivity %, level link)
// with the metrics it gave against the reference when it was saved. Loading one puts the variant back into the
// comparison, where it is measured again on today's data.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScenarioMetrics, ScenarioVariant } from "./scenario-compare";

type Db = SupabaseClient;

/** The headline figures kept with a saved what-if (the per-level detail is recalculated when it is loaded). */
export type WhatIfMetrics = Pick<ScenarioMetrics, "activities" | "taskDays" | "spanDays" | "finish" | "criticalCount" | "unsized">;

export interface SavedWhatIf {
  id: string;
  name: string;
  template_id: string | null;
  node_ids: string[];
  variant: ScenarioVariant;
  metrics: WhatIfMetrics;
  reference_metrics: WhatIfMetrics;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export const headline = (m: ScenarioMetrics): WhatIfMetrics => ({
  activities: m.activities, taskDays: m.taskDays, spanDays: m.spanDays, finish: m.finish, criticalCount: m.criticalCount, unsized: m.unsized,
});

/** Saved what-ifs of the project for one template (all templates when templateId is null), newest first. */
export async function listWhatIfs(db: Db, projectId: string, templateId: string | null): Promise<SavedWhatIf[]> {
  let q = db.from("plan_whatif_scenarios").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (templateId) q = q.eq("template_id", templateId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedWhatIf[];
}

export async function saveWhatIf(
  db: Db,
  w: { projectId: string; templateId: string | null; nodeIds: string[]; name: string; variant: ScenarioVariant; metrics: ScenarioMetrics; reference: ScenarioMetrics; note?: string },
): Promise<void> {
  const { data: auth } = await db.auth.getUser();
  const { error } = await db.from("plan_whatif_scenarios").insert({
    project_id: w.projectId, template_id: w.templateId, node_ids: w.nodeIds, name: w.name.trim() || "What-if",
    variant: w.variant, metrics: headline(w.metrics), reference_metrics: headline(w.reference), note: w.note?.trim() || null,
    created_by: auth.user?.id ?? null,
  });
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Saving a what-if needs Schedule edit permission." : error.message);
}

export async function deleteWhatIf(db: Db, id: string): Promise<void> {
  const { error } = await db.from("plan_whatif_scenarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** A stored variant made safe to use (rows are written by other users). */
export function cleanVariant(raw: unknown): ScenarioVariant {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const m = r.methodByMaster && typeof r.methodByMaster === "object" ? (r.methodByMaster as Record<string, unknown>) : {};
  const pct = Number(r.productivityPct);
  return {
    methodByMaster: Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "string")) as Record<string, string>,
    productivityPct: Number.isFinite(pct) && pct >= 10 && pct <= 300 ? pct : 100,
    linkLevels: r.linkLevels !== false,
  };
}
