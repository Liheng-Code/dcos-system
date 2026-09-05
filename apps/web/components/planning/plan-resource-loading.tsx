"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Pencil, Plus, Users, X } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  addAssignment,
  getResourceAllocation,
  listProjectAssignments,
  listResources,
  removeAssignment,
  type AllocationRow,
  type PlanResource,
  type ProjectAssignmentRow,
} from "@/lib/planning/resource-service";
import { PlanResourceDialog } from "./plan-resource-dialog";

interface ResourceTask {
  id: string; task_code: string; task_name: string; owner_name: string | null;
  start_date: string | null; end_date: string | null; progress: number;
  delay_status: string; priority: string;
}

function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  labor: "Labor",
  equipment: "Equipment",
  material: "Material",
  subcontractor: "Subcontractor",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PlanResourceLoading() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [tasks, setTasks] = useState<ResourceTask[]>([]);
  const [resources, setResources] = useState<PlanResource[]>([]);
  const [assignments, setAssignments] = useState<ProjectAssignmentRow[]>([]);
  const [allocation, setAllocation] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogResource, setDialogResource] = useState<PlanResource | null | undefined>(undefined);

  function load() {
    if (!selectedProjectId) {
      // Deferred to a microtask so this reset (used directly as an effect
      // callback below) never calls setState synchronously within the effect body.
      Promise.resolve().then(() => {
        setTasks([]); setResources([]); setAssignments([]); setAllocation([]); setLoading(false);
      });
      return;
    }
    // loading starts true (see useState above); avoid a synchronous setState(true)
    // here so this can be used directly as an effect callback below.
    Promise.all([
      supabase.from("wbs_tasks").select(
        "id, task_code, task_name, owner_name, start_date, end_date, progress, delay_status, priority"
      ).eq("project_id", selectedProjectId).limit(1000),
      listResources(selectedProjectId),
      listProjectAssignments(selectedProjectId),
      getResourceAllocation(selectedProjectId),
    ]).then(([taskRes, resourceRows, assignmentRows, allocationRows]) => {
      if (taskRes.error) throw new Error(taskRes.error.message);
      setTasks((taskRes.data || []) as unknown as ResourceTask[]);
      setResources(resourceRows);
      setAssignments(assignmentRows);
      setAllocation(allocationRows);
    }).catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [supabase, selectedProjectId]);

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const assignedTaskIds = useMemo(() => new Set(assignments.map((a) => a.task_id)), [assignments]);

  const resourceGroups = useMemo(() => {
    const groups = new Map<string, ResourceTask[]>();
    for (const a of assignments) {
      const t = taskById.get(a.task_id);
      if (!t) continue;
      if (!groups.has(a.resource_id)) groups.set(a.resource_id, []);
      groups.get(a.resource_id)!.push(t);
    }
    return groups;
  }, [assignments, taskById]);

  const legacyTasks = useMemo(
    () => tasks.filter((t) => t.owner_name && !assignedTaskIds.has(t.id)),
    [tasks, assignedTaskIds],
  );

  const legacyGroups = useMemo(() => {
    const groups: Record<string, ResourceTask[]> = {};
    for (const t of legacyTasks) {
      const key = t.owner_name || "Unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return groups;
  }, [legacyTasks]);

  const allocationByResource = useMemo(() => {
    const map = new Map<string, Map<string, AllocationRow>>();
    for (const row of allocation) {
      if (!map.has(row.resource_id)) map.set(row.resource_id, new Map());
      map.get(row.resource_id)!.set(row.work_date, row);
    }
    return map;
  }, [allocation]);

  const relevantTasks = useMemo(
    () => tasks.filter((t) => assignedTaskIds.has(t.id) || t.owner_name),
    [tasks, assignedTaskIds],
  );

  const dateRange = useMemo(() => {
    const allDates = relevantTasks.flatMap(t => [t.start_date, t.end_date].filter(Boolean) as string[]);
    if (!allDates.length) return { min: new Date(), max: new Date() };
    return {
      min: new Date(Math.min(...allDates.map(d => new Date(d).getTime()))),
      max: new Date(Math.max(...allDates.map(d => new Date(d).getTime()))),
    };
  }, [relevantTasks]);

  const totalDays = daysBetween(dateRange.min.toISOString().slice(0, 10), dateRange.max.toISOString().slice(0, 10));
  const BAR_W = 16;
  const LABEL_W = 180;
  const chartW = totalDays * BAR_W;

  const activeResourceCount = resources.filter((r) => r.is_active).length;
  const activeResources = resources.filter((r) => r.is_active);

  async function handleAssign(taskId: string, resourceId: string) {
    try {
      await addAssignment(taskId, resourceId, 100);
      toast.success("Resource assigned");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleUnassign(taskId: string, resourceId: string) {
    try {
      await removeAssignment(taskId, resourceId);
      toast.success("Assignment removed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (projectLoading || loading) return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Select a project to view resource loading.</div>;

  function renderDayHeader() {
    return (
      <div className="flex border-b bg-muted/20 text-xs text-muted-foreground">
        <div className="shrink-0 border-r px-2 py-1 font-medium" style={{ width: LABEL_W }}>Task</div>
        <div className="flex" style={{ width: chartW }}>
          {Array.from({ length: Math.min(totalDays, 180) }).map((_, i) => {
            if (i % 7 === 0) {
              const d = new Date(dateRange.min.getTime() + i * 86400000);
              return <div key={i} className="shrink-0 border-r px-1" style={{ width: BAR_W * 7 }}>{d.getDate()}/{d.getMonth() + 1}</div>;
            }
            return null;
          })}
        </div>
      </div>
    );
  }

  function renderTaskBars(resourceTasks: ResourceTask[], assignedResourceId?: string) {
    return resourceTasks.map(t => {
      const s = t.start_date || dateRange.min.toISOString().slice(0, 10);
      const e = t.end_date || dateRange.max.toISOString().slice(0, 10);
      const x = Math.round((new Date(s).getTime() - dateRange.min.getTime()) / 86400000) * BAR_W;
      const w = daysBetween(s, e) * BAR_W;
      const color = t.delay_status === "delayed" ? "bg-red-400" : t.delay_status === "risk" ? "bg-yellow-400" : "bg-blue-400";

      return (
        <div key={t.id} className="flex border-b last:border-0 hover:bg-muted/20">
          <div className="flex shrink-0 items-center gap-1 border-r px-2 py-1.5 text-xs" style={{ width: LABEL_W }}>
            <span className="truncate">
              <span className="font-medium">{t.task_code}</span>
              <span className="text-muted-foreground ml-1">{t.task_name}</span>
            </span>
            {assignedResourceId ? (
              <button
                type="button"
                onClick={() => handleUnassign(t.id, assignedResourceId)}
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove assignment"
                title="Unassign"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              activeResources.length > 0 && (
                <select
                  className="ml-auto shrink-0 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  value=""
                  onChange={(ev) => ev.target.value && handleAssign(t.id, ev.target.value)}
                  aria-label="Assign to resource"
                >
                  <option value="">Assign…</option>
                  {activeResources.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )
            )}
          </div>
          <div className="relative" style={{ width: chartW }}>
            <div className={cn("absolute top-1 h-5 rounded-sm opacity-80", color)} style={{ left: x, width: Math.max(BAR_W, w) }} />
            <div className="absolute top-1 h-5 rounded-sm bg-black/20" style={{ left: x, width: Math.max(BAR_W, w * (t.progress / 100)) }} />
          </div>
        </div>
      );
    });
  }

  function renderAllocationStrip(resourceId: string, maxUnits: number) {
    const byDate = allocationByResource.get(resourceId);
    return (
      <div className="flex border-b">
        <div className="shrink-0 border-r px-2 py-1 text-[10px] font-medium text-muted-foreground" style={{ width: LABEL_W }}>
          Allocation
        </div>
        <div className="relative flex" style={{ width: chartW }}>
          {Array.from({ length: totalDays }).map((_, i) => {
            const d = new Date(dateRange.min.getTime() + i * 86400000);
            const key = d.toISOString().slice(0, 10);
            const row = byDate?.get(key);
            const color = !row || row.total_allocation <= 0
              ? "bg-transparent"
              : row.is_overallocated
                ? "bg-red-500"
                : "bg-emerald-200";
            return (
              <div
                key={i}
                className={cn("h-4 shrink-0 border-r border-background", color)}
                style={{ width: BAR_W }}
                title={row ? `${key}: ${row.total_allocation}% of ${maxUnits}% max${row.is_overallocated ? " — OVER-ALLOCATED" : ""}` : undefined}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-3 gap-4 sm:max-w-2xl">
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{activeResourceCount}</p>
            <p className="text-xs text-muted-foreground">Resources</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{assignedTaskIds.size}</p>
            <p className="text-xs text-muted-foreground">Assigned Tasks</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{legacyTasks.length}</p>
            <p className="text-xs text-muted-foreground">Unassigned (Legacy)</p>
          </CardContent></Card>
        </div>
        <button
          type="button"
          onClick={() => setDialogResource(null)}
          className="ml-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add Resource
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        For team capacity planning across all of a person&apos;s assignments, see the{" "}
        <Link href="/dashboard/department" className="font-medium text-primary hover:underline">
          Team Planner
        </Link>.
      </p>

      {resources.map((resource) => {
        const resourceTasks = resourceGroups.get(resource.id) ?? [];
        return (
          <Card key={resource.id} className={cn(!resource.is_active && "opacity-60")}>
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{resource.name}</span>
                <Badge variant="outline" className="text-xs">{RESOURCE_TYPE_LABEL[resource.resource_type] ?? resource.resource_type}</Badge>
                {resource.profile_id && (
                  <>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-xs text-blue-700">Team Member</Badge>
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600"
                      title={resource.name}
                    >
                      {initials(resource.name)}
                    </span>
                  </>
                )}
                <Badge variant="outline" className="text-xs">{resourceTasks.length} tasks</Badge>
                <Badge variant="outline" className="text-xs">Max {resource.max_units}%</Badge>
                {!resource.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                <button
                  type="button"
                  onClick={() => setDialogResource(resource)}
                  className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Edit resource"
                  title="Edit resource"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>

              {resourceTasks.length === 0 ? (
                <p className="rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  No tasks currently assigned to this resource.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-fit">
                    {renderDayHeader()}
                    {renderAllocationStrip(resource.id, resource.max_units)}
                    {renderTaskBars(resourceTasks, resource.id)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {!resources.length && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No resources created yet. Use &quot;Add Resource&quot; to create your first one.
        </p>
      )}

      <div className="pt-2">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Unassigned (legacy owner field)</h3>
        {Object.keys(legacyGroups).length === 0 ? (
          <p className="rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            No legacy owner-based tasks pending resource assignment.
          </p>
        ) : (
          <div className="space-y-6">
            {Object.entries(legacyGroups).map(([owner, ownerTasks]) => (
              <Card key={owner}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">{owner}</span>
                    <Badge variant="outline" className="text-xs">{ownerTasks.length} tasks</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-fit">
                      {renderDayHeader()}
                      {renderTaskBars(ownerTasks)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {dialogResource !== undefined && (
        <PlanResourceDialog
          projectId={selectedProjectId}
          resource={dialogResource}
          onClose={() => setDialogResource(undefined)}
          onSaved={load}
        />
      )}
    </div>
  );
}
