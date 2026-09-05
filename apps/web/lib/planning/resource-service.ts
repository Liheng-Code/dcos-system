import { createClient } from "@/lib/supabase/client";
import { assignTaskToProfile, type AssignableTask } from "@/lib/tasks/assign-task";

export type ResourceType = "labor" | "equipment" | "material" | "subcontractor";

export interface PlanResource {
  id: string;
  project_id: string;
  name: string;
  resource_type: ResourceType;
  max_units: number;
  cost_per_unit: number | null;
  unit_label: string | null;
  calendar_id: string | null;
  is_active: boolean;
  profile_id: string | null;
  created_at: string;
}

export interface Assignment {
  id: string;
  task_id: string;
  resource_id: string;
  allocation_percent: number;
  created_at: string;
  resource_name: string;
  resource_type: ResourceType;
}

export interface AllocationRow {
  resource_id: string;
  resource_name: string;
  work_date: string;
  total_allocation: number;
  max_units: number;
  is_overallocated: boolean;
}

export interface CreateResourceInput {
  name: string;
  resource_type: ResourceType;
  max_units: number;
  cost_per_unit: number | null;
  unit_label: string | null;
  profile_id?: string | null;
}

/** All resources for a project, including inactive ones, ordered by name. */
export async function listResources(projectId: string): Promise<PlanResource[]> {
  const { data, error } = await createClient()
    .from("plan_resources")
    .select("*")
    .eq("project_id", projectId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as PlanResource[];
}

export async function createResource(projectId: string, input: CreateResourceInput): Promise<void> {
  const { error } = await createClient().from("plan_resources").insert({
    project_id: projectId,
    name: input.name,
    resource_type: input.resource_type,
    max_units: input.max_units,
    cost_per_unit: input.cost_per_unit,
    unit_label: input.unit_label,
    profile_id: input.profile_id ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Finds the resource representing a real profile on a project, creating one if none exists yet. */
export async function findOrCreateResourceForProfile(
  projectId: string,
  profileId: string,
  profileName: string,
): Promise<PlanResource> {
  const supabase = createClient();
  const { data: existing, error: findError } = await supabase
    .from("plan_resources")
    .select("*")
    .eq("project_id", projectId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (existing) return existing as PlanResource;

  const { data: created, error: insertError } = await supabase
    .from("plan_resources")
    .insert({
      project_id: projectId,
      name: profileName,
      resource_type: "labor",
      max_units: 100,
      profile_id: profileId,
    })
    .select()
    .single();
  if (insertError) throw new Error(insertError.message);
  return created as PlanResource;
}

export async function updateResource(id: string, patch: Partial<CreateResourceInput>): Promise<void> {
  const { error } = await createClient().from("plan_resources").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Soft delete/reactivate — never hard-delete a resource, it may have historical assignments. */
export async function setResourceActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await createClient()
    .from("plan_resources")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listAssignmentsForTask(taskId: string): Promise<Assignment[]> {
  const { data, error } = await createClient()
    .from("plan_task_assignments")
    .select("id, task_id, resource_id, allocation_percent, created_at, plan_resources(name, resource_type)")
    .eq("task_id", taskId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const res = r.plan_resources as unknown as { name: string; resource_type: ResourceType } | null;
    return {
      id: r.id as string,
      task_id: r.task_id as string,
      resource_id: r.resource_id as string,
      allocation_percent: r.allocation_percent as number,
      created_at: r.created_at as string,
      resource_name: res?.name ?? "Unknown",
      resource_type: res?.resource_type ?? "labor",
    };
  });
}

/** Upsert on the (task_id, resource_id) unique constraint. */
export async function addAssignment(
  taskId: string,
  resourceId: string,
  allocationPercent: number,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("plan_task_assignments")
    .upsert(
      { task_id: taskId, resource_id: resourceId, allocation_percent: allocationPercent },
      { onConflict: "task_id,resource_id" },
    );
  if (error) throw new Error(error.message);

  // Best-effort sync into the real Tasks-module assignment path when this resource
  // represents an actual profile — failure here must not fail the resource assignment.
  try {
    const { data: resource } = await supabase
      .from("plan_resources")
      .select("profile_id")
      .eq("id", resourceId)
      .single();
    if (!resource?.profile_id) return;

    const { data: task } = await supabase
      .from("wbs_tasks")
      .select("id, project_id, wbs_node_id, owner_id, owner_name, start_date, end_date")
      .eq("id", taskId)
      .single();
    if (!task) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("id", resource.profile_id)
      .single();
    if (!profile) return;

    const { data: { user } } = await supabase.auth.getUser();
    let actorName: string | null = null;
    if (user) {
      const { data: actorProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      actorName = actorProfile?.full_name ?? null;
    }

    await assignTaskToProfile(supabase, task as AssignableTask, profile, { id: user?.id ?? null, name: actorName });
  } catch (err) {
    console.warn("Failed to sync resource assignment to wbs_tasks:", err instanceof Error ? err.message : err);
  }
}

export async function removeAssignment(taskId: string, resourceId: string): Promise<void> {
  const { error } = await createClient()
    .from("plan_task_assignments")
    .delete()
    .eq("task_id", taskId)
    .eq("resource_id", resourceId);
  if (error) throw new Error(error.message);
}

export async function getResourceAllocation(projectId: string): Promise<AllocationRow[]> {
  const { data, error } = await createClient().rpc("get_resource_allocation", {
    p_project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AllocationRow[];
}

export interface ProjectAssignmentRow {
  task_id: string;
  resource_id: string;
  allocation_percent: number;
  resource_name: string;
  resource_type: ResourceType;
}

/** All assignments for a project's tasks, joined to the resource for display. */
export async function listProjectAssignments(projectId: string): Promise<ProjectAssignmentRow[]> {
  const { data, error } = await createClient()
    .from("plan_task_assignments")
    .select("task_id, resource_id, allocation_percent, plan_resources!inner(name, resource_type, project_id)")
    .eq("plan_resources.project_id", projectId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const res = r.plan_resources as unknown as { name: string; resource_type: ResourceType };
    return {
      task_id: r.task_id as string,
      resource_id: r.resource_id as string,
      allocation_percent: r.allocation_percent as number,
      resource_name: res.name,
      resource_type: res.resource_type,
    };
  });
}
