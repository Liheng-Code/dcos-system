// Planning choices catalogue: data access (plan_act_attributes, migration 20261021000023). Rules: planning-choices.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanningChoice } from "./planning-choices";

export async function listPlanningChoices(db: SupabaseClient): Promise<PlanningChoice[]> {
  const { data, error } = await db.from("plan_act_attributes")
    .select("key, label, description, options, sectors, building_types, defaults, sort_order")
    .eq("is_active", true).order("sort_order");
  if (error) throw new Error(error.message);
  return ((data ?? []) as PlanningChoice[]).map((c) => ({
    ...c, options: c.options ?? [], sectors: c.sectors ?? [], building_types: c.building_types ?? [], defaults: c.defaults ?? {},
  }));
}
