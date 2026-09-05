import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared connect / disconnect logic for linking a stakeholder company to a project.
 * Used by the Stakeholders Directory cards, the Bulk HR Assign dialog, and the
 * project-side <ProjectStakeholdersTab>. Writes only to existing tables — no schema changes.
 */

export interface AssignableStakeholder {
  id: string;
  stakeholder_type?: string | null;
}

/**
 * Link a stakeholder to a project. Idempotent — `project_stakeholders` has a
 * unique(project_id, stakeholder_id) constraint, so a repeat call is a no-op.
 */
export async function connectStakeholder(
  supabase: SupabaseClient,
  projectId: string,
  stakeholder: AssignableStakeholder,
) {
  return supabase.from("project_stakeholders").upsert(
    {
      project_id: projectId,
      stakeholder_id: stakeholder.id,
      role_in_project: stakeholder.stakeholder_type ?? null,
    },
    { onConflict: "project_id,stakeholder_id", ignoreDuplicates: true },
  );
}

/**
 * Unlink a stakeholder from a project and clean up dependent rows.
 * The manual cascade is required: project_stakeholder_teams / project_stakeholder_mappings
 * reference projects/stakeholders directly, not the project_stakeholders junction row.
 */
export async function disconnectStakeholder(
  supabase: SupabaseClient,
  projectId: string,
  stakeholderId: string,
) {
  const { data: teams } = await supabase
    .from("project_stakeholder_teams")
    .select("id")
    .eq("project_id", projectId)
    .eq("stakeholder_id", stakeholderId);

  if (teams && teams.length > 0) {
    await supabase
      .from("project_team_members")
      .delete()
      .in("project_stakeholder_team_id", teams.map((t: { id: string }) => t.id));
    await supabase
      .from("project_stakeholder_teams")
      .delete()
      .eq("project_id", projectId)
      .eq("stakeholder_id", stakeholderId);
  }

  await supabase
    .from("project_stakeholder_mappings")
    .delete()
    .eq("project_id", projectId)
    .eq("stakeholder_id", stakeholderId);

  return supabase
    .from("project_stakeholders")
    .delete()
    .eq("project_id", projectId)
    .eq("stakeholder_id", stakeholderId);
}
