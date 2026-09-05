import { type SupabaseClient } from "@supabase/supabase-js";
import {
  getUserPermissions,
  hasPermission,
  type UserPermissions,
} from "@/lib/permissions";

export interface DepartmentRef {
  id: string;
  department_code: string;
  department_name: string;
  parent_id: string | null;
}

export interface TaskViewer {
  userId: string;
  fullName: string;
  /** Executing department of the viewer (null = no department assigned). */
  departmentId: string | null;
  departmentName: string | null;
  /** True when the viewer is the head of their department. */
  isDeptHead: boolean;
  /** Own department plus every child department (managed recursively). */
  managedDepartmentIds: string[];
  permissions: UserPermissions;
}

export const TASKS_MODULE = "task_management";

export async function resolveViewer(
  supabase: SupabaseClient,
): Promise<TaskViewer | null> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return null;

  const [profileRes, headsRes, perms] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, department_id")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("departments").select("id, parent_id").eq("department_head", userId),
    getUserPermissions(supabase, userId, TASKS_MODULE),
  ]);

  if (!profileRes.data) return null;

  const ownDepartmentId =
    (profileRes.data.department_id as string | null) ?? null;

  const headedDepartments = (headsRes.data ?? []) as Pick<DepartmentRef, "id" | "parent_id">[];
  const isDeptHead = headedDepartments.length > 0;

  // Departments under management: every department where the user is head,
  // expanded with child departments so a parent head sees subordinate teams.
  const managed = new Set<string>();
  for (const dept of headedDepartments) managed.add(dept.id);
  if (ownDepartmentId && !isDeptHead) managed.add(ownDepartmentId);

  if (managed.size > 0) {
    const allRes = await supabase.from("departments").select("id, parent_id");
    if (allRes.data) {
      const byParent = new Map<string | null, string[]>();
      for (const d of allRes.data as Pick<DepartmentRef, "id" | "parent_id">[]) {
        const list = byParent.get(d.parent_id) ?? [];
        list.push(d.id);
        byParent.set(d.parent_id, list);
      }
      let frontier = [...managed];
      while (frontier.length > 0) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const child of byParent.get(id) ?? []) {
            if (!managed.has(child)) {
              managed.add(child);
              next.push(child);
            }
          }
        }
        frontier = next;
      }
    }
  }

  let departmentName: string | null = null;
  if (ownDepartmentId) {
    const nameRes = await supabase
      .from("departments")
      .select("department_name")
      .eq("id", ownDepartmentId)
      .maybeSingle();
    departmentName = (nameRes.data?.department_name as string | undefined) ?? null;
  }

  return {
    userId,
    fullName: (profileRes.data.full_name as string) ?? "",
    departmentId: ownDepartmentId,
    departmentName,
    isDeptHead,
    managedDepartmentIds: [...managed],
    permissions: perms,
  };
}

export function canViewDepartmentTasks(
  viewer: TaskViewer | null,
): viewer is TaskViewer {
  return (
    !!viewer &&
    hasPermission(viewer.permissions.permissions, TASKS_MODULE, "view_department", "view") &&
    (viewer.isDeptHead || viewer.managedDepartmentIds.length > 0 || !!viewer.departmentId)
  );
}

export function canPlanTeam(viewer: TaskViewer | null): boolean {
  return (
    !!viewer &&
    hasPermission(viewer.permissions.permissions, TASKS_MODULE, "plan_team", "edit")
  );
}

export function canAcceptCrossRequests(viewer: TaskViewer | null): boolean {
  return (
    !!viewer &&
    hasPermission(viewer.permissions.permissions, TASKS_MODULE, "accept_cross_request", "approve")
  );
}

export function isActiveTask(task: { status: string }): boolean {
  return !["closed", "cancelled", "completed", "rejected"].includes(task.status);
}

export function isMyTask(task: { owner_id: string | null; assignee_id: string | null }, userId: string): boolean {
  return task.owner_id === userId || task.assignee_id === userId;
}
