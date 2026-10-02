import { createClient } from "@/lib/supabase/client";
import { assignTaskToProfile, type AssignableTask } from "@/lib/project/tasks/assign-task";
import { dedupe } from "@/lib/request-dedup";

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
  /** Set by plan_generate_resource_loading() on its pooled resources; null on a manually created one. */
  trade: string | null;
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
  /** Present when read through `get_resource_loading` (working-day, hours-aware). */
  resource_type?: ResourceType;
  /** Productive hours in that working day, from the resource's calendar. */
  hours_per_day?: number;
  /** Man-hours that day: total_allocation / 100 × hours_per_day. */
  work_hours?: number;
}

export interface CreateResourceInput {
  name: string;
  resource_type: ResourceType;
  max_units: number;
  cost_per_unit: number | null;
  unit_label: string | null;
  profile_id?: string | null;
}

/**
 * All resources for a project, including inactive ones, ordered by name.
 * Dedupes concurrent calls for the same project (e.g. the Resource Loading
 * page and the Dashboard's Manpower card can both call this around the same
 * time) so only one fetch actually goes out.
 */
export function listResources(projectId: string): Promise<PlanResource[]> {
  return dedupe(`resources:${projectId}`, async () => {
    const { data, error } = await createClient()
      .from("plan_resources")
      .select("*")
      .eq("project_id", projectId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as PlanResource[];
  });
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

/** PostgREST caps a single response (`max_rows`, 1000 by default), so page through the RPC. */
const ALLOCATION_PAGE = 1000;
/** Safety stop: 200 pages = 200k resource-days, far beyond any project. */
const ALLOCATION_MAX_PAGES = 200;

/** How many pages to fire concurrently per batch once we know more are needed. */
const ALLOCATION_CONCURRENCY = 4;

async function fetchAllocationPage(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  page: number,
): Promise<AllocationRow[]> {
  const from = page * ALLOCATION_PAGE;
  const { data, error } = await supabase
    .rpc("get_resource_loading", { p_project_id: projectId })
    .range(from, from + ALLOCATION_PAGE - 1);
  if (error) throw new Error(error.message);
  return (data ?? []) as AllocationRow[];
}

/**
 * Resource loading per (resource, working day), read through `get_resource_loading`
 * (migration 20260922000002): only days that are working per the resource's / project's
 * calendar, with hours. The older `get_resource_allocation` spread assignments over every
 * calendar day, Sundays and holidays included, and is no longer used here.
 *
 * PostgREST caps a single response at ALLOCATION_PAGE rows, so this pages
 * through the RPC — but fires pages CONCURRENTLY in batches rather than one
 * at a time (each page reruns the whole RPC server-side then slices via
 * `.range()`, so N sequential pages used to mean N full sequential round
 * trips). Most projects fit in the first batch (one round trip); only a
 * project whose allocation exceeds ALLOCATION_PAGE * ALLOCATION_CONCURRENCY
 * rows needs a second batch.
 *
 * Also dedupes concurrent calls for the same project — the Resource Loading
 * page and the Dashboard's Manpower card can both call this independently.
 */
export function getResourceAllocation(projectId: string): Promise<AllocationRow[]> {
  return dedupe(`resource-allocation:${projectId}`, () => fetchResourceAllocation(projectId));
}

async function fetchResourceAllocation(projectId: string): Promise<AllocationRow[]> {
  const supabase = createClient();
  const rows: AllocationRow[] = [];
  for (let batchStart = 0; batchStart < ALLOCATION_MAX_PAGES; batchStart += ALLOCATION_CONCURRENCY) {
    const pages = Array.from(
      { length: Math.min(ALLOCATION_CONCURRENCY, ALLOCATION_MAX_PAGES - batchStart) },
      (_, i) => batchStart + i,
    );
    const batches = await Promise.all(pages.map((page) => fetchAllocationPage(supabase, projectId, page)));
    let sawPartialPage = false;
    for (const batch of batches) {
      rows.push(...batch);
      if (batch.length < ALLOCATION_PAGE) sawPartialPage = true;
    }
    // A partial (or empty) page anywhere in this batch means we've reached the
    // end — later pages in the same batch, if any, would just be empty too.
    if (sawPartialPage) break;
  }
  return rows;
}

export interface TypeHistogramPoint {
  work_date: string;
  resource_type: ResourceType;
  /** Sum of total_allocation (%) across every resource of this type on this date. */
  demand: number;
  /** Sum of max_units (%) across every active resource of this type — constant across dates. */
  capacity: number;
}

/**
 * Aggregates per-resource allocation into per-(date, resource_type) demand vs
 * capacity (Completion Plan 1.7) — pure, no I/O, so it is unit-testable on its
 * own and reusable outside the resource-loading page.
 */
export function aggregateByType(
  allocation: AllocationRow[],
  resources: PlanResource[],
): TypeHistogramPoint[] {
  const typeByResource = new Map(resources.map((r) => [r.id, r.resource_type]));
  const capacityByType = new Map<ResourceType, number>();
  for (const r of resources) {
    if (!r.is_active) continue;
    capacityByType.set(r.resource_type, (capacityByType.get(r.resource_type) ?? 0) + r.max_units);
  }

  const demandByKey = new Map<string, number>();
  for (const row of allocation) {
    const type = typeByResource.get(row.resource_id);
    if (!type) continue;
    const key = `${row.work_date}|${type}`;
    demandByKey.set(key, (demandByKey.get(key) ?? 0) + row.total_allocation);
  }

  const points: TypeHistogramPoint[] = [];
  for (const [key, demand] of demandByKey) {
    const sep = key.indexOf("|");
    const work_date = key.slice(0, sep);
    const resource_type = key.slice(sep + 1) as ResourceType;
    points.push({ work_date, resource_type, demand, capacity: capacityByType.get(resource_type) ?? 0 });
  }
  return points.sort((a, b) => a.work_date.localeCompare(b.work_date) || a.resource_type.localeCompare(b.resource_type));
}

// ── manpower required vs available BY TRADE (Phase 3) ───────────────────────
// A trade is the finer grouping plan_generate_resource_loading() assigns its pooled resources
// (plan_resources.trade); a manually created resource has no trade, so it becomes its own
// single-resource "trade" bucket, using its name — informative and never silently dropped.
const DAY_MS = 86_400_000;
function toUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
/** Monday of the week containing `iso`. */
function weekStartOf(iso: string): string {
  const ms = toUtcMs(iso);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  return new Date(ms - ((dow + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

export interface TradeHistogramPoint {
  work_date: string;
  trade: string;
  /** Sum of total_allocation (%) across every resource of this trade on this date — "required". */
  demand: number;
  /** Sum of max_units (%) across every active resource of this trade — "available", constant across dates. */
  capacity: number;
}

/** Same shape/purpose as aggregateByType, grouped by trade instead of resource_type. */
export function aggregateByTrade(allocation: AllocationRow[], resources: PlanResource[]): TradeHistogramPoint[] {
  const tradeByResource = new Map(resources.map((r) => [r.id, r.trade ?? r.name]));
  const capacityByTrade = new Map<string, number>();
  for (const r of resources) {
    if (!r.is_active) continue;
    const trade = r.trade ?? r.name;
    capacityByTrade.set(trade, (capacityByTrade.get(trade) ?? 0) + r.max_units);
  }

  const demandByKey = new Map<string, number>();
  for (const row of allocation) {
    const trade = tradeByResource.get(row.resource_id);
    if (!trade) continue;
    const key = `${row.work_date}|${trade}`;
    demandByKey.set(key, (demandByKey.get(key) ?? 0) + row.total_allocation);
  }

  const points: TradeHistogramPoint[] = [];
  for (const [key, demand] of demandByKey) {
    const sep = key.indexOf("|");
    const work_date = key.slice(0, sep);
    const trade = key.slice(sep + 1);
    points.push({ work_date, trade, demand, capacity: capacityByTrade.get(trade) ?? 0 });
  }
  return points.sort((a, b) => a.work_date.localeCompare(b.work_date) || a.trade.localeCompare(b.trade));
}

export interface TradeShortageWeek {
  trade: string;
  week_start: string;
  /** The worst single day's demand within the week. */
  peak_demand: number;
  capacity: number;
}

/**
 * Buckets the daily by-trade histogram into ISO weeks (Monday start) and flags a week where the
 * trade's peak daily demand exceeds its capacity at any point that week — "a shortage week".
 */
export function flagShortageWeeks(points: TradeHistogramPoint[]): TradeShortageWeek[] {
  const peakByKey = new Map<string, { trade: string; week_start: string; peak: number; capacity: number }>();
  for (const p of points) {
    const week_start = weekStartOf(p.work_date);
    const key = `${p.trade}|${week_start}`;
    const cur = peakByKey.get(key);
    if (!cur) peakByKey.set(key, { trade: p.trade, week_start, peak: p.demand, capacity: p.capacity });
    else cur.peak = Math.max(cur.peak, p.demand);
  }
  return [...peakByKey.values()]
    .filter((w) => w.capacity > 0 && w.peak > w.capacity)
    .map((w) => ({ trade: w.trade, week_start: w.week_start, peak_demand: w.peak, capacity: w.capacity }))
    .sort((a, b) => a.trade.localeCompare(b.trade) || a.week_start.localeCompare(b.week_start));
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
