// Data access for the project S-curve (doc 33): the read-only RPC project_scurve. Pure logic: project-scurve.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectScurveData } from "./project-scurve";

export async function getProjectScurve(db: SupabaseClient, projectId: string, period: "week" | "month" = "month"): Promise<ProjectScurveData> {
  const { data, error } = await db.rpc("project_scurve", { p_project_id: projectId, p_period: period });
  if (error) throw new Error(error.message);
  return data as ProjectScurveData;
}
