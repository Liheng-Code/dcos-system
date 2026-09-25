// Productivity & Resource-Costing Plan, Phase 3 — "Generate resource loading from norms".
// Thin wrapper over the plan_generate_resource_loading RPC (migrations 20260922000008/9); all the logic
// (idempotent replace of 'norm'-sourced assignments, manual assignments untouched, trade grouping) lives in
// SQL so it runs as one atomic statement rather than a client-side loop of separate writes.

import { createClient } from "@/lib/supabase/client";

export interface GenerationResult {
  resourcesCreated: number;
  resourcesReused: number;
  assignmentsWritten: number;
  assignmentsRemoved: number;
}

export async function generateResourceLoadingFromNorms(projectId: string): Promise<GenerationResult> {
  const { data, error } = await createClient()
    .rpc("plan_generate_resource_loading", { p_project_id: projectId })
    .single();
  if (error) throw new Error(/row-level security/i.test(error.message) ? "You do not have permission to do that (needs planning/resources edit and delete)." : error.message);
  const row = data as Record<string, unknown>;
  return {
    resourcesCreated: Number(row.resources_created ?? 0),
    resourcesReused: Number(row.resources_reused ?? 0),
    assignmentsWritten: Number(row.assignments_written ?? 0),
    assignmentsRemoved: Number(row.assignments_removed ?? 0),
  };
}
