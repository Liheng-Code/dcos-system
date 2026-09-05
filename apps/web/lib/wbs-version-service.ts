// Lightweight WBS "schedule versioning": snapshot the current node tree into the
// existing `wbs_baselines` table and restore one non-destructively.
//
// A restore is an id-keyed reconcile (insert missing / update changed / keep
// extras) — never delete-all-then-reinsert, which would cascade-destroy every
// wbs_task, quantity and cost line hanging off the nodes.
//
// FUTURE: structural diff + branch/merge is out of scope here.

import { createClient } from "@/lib/supabase/client";

const VERSION_KIND = "wbs_builder_version";
const SNAPSHOT_SCHEMA = 1;

const SNAPSHOT_COLS =
  "id, parent_id, node_type, wbs_code, wbs_name, sort_order, status, is_below_ground, is_external_works, full_path, progress_percent";

/** Fields that a restore actually writes back (order matters for topo sorting). */
const RESTORE_FIELDS = [
  "parent_id",
  "node_type",
  "wbs_code",
  "wbs_name",
  "sort_order",
  "status",
  "is_below_ground",
  "is_external_works",
] as const;

export interface WbsVersionSnapshotNode {
  id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
  sort_order: number;
  status: string;
  is_below_ground: boolean | null;
  is_external_works: boolean | null;
  full_path: string | null; // informational — trigger recomputes on restore
  progress_percent: number; // informational only — NOT restored (rollup owns it)
}

export interface WbsVersionSummary {
  id: string;
  baseline_name: string;
  baseline_date: string;
  created_at: string;
  created_by: string | null;
  node_count: number;
}

export interface WbsVersionSnapshot extends WbsVersionSummary {
  nodes: WbsVersionSnapshotNode[];
}

export interface RestoreOptions {
  /** Admin-only: also delete nodes that exist now but aren't in the snapshot. */
  deleteNodesNotInSnapshot?: boolean;
}

export interface RestoreResult {
  inserted: number;
  updated: number;
  deleted: number;
  skippedExtra: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function currentUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function writeAudit(
  projectId: string,
  action: string,
  value: string,
): Promise<void> {
  try {
    const supabase = createClient();
    const userId = await currentUserId();
    await supabase.from("wbs_audit_log").insert({
      project_id: projectId,
      user_id: userId,
      action,
      new_value: value,
    });
  } catch {
    // Audit is best-effort — never block the operation on it.
  }
}

/** Snapshot the project's current WBS into a new `wbs_baselines` row. Returns its id. */
export async function saveWbsVersion(
  projectId: string,
  name: string,
): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("wbs_nodes")
    .select(SNAPSHOT_COLS)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const nodes = (data ?? []) as WbsVersionSnapshotNode[];
  const userId = await currentUserId();
  const trimmed = name.trim() || `WBS as of ${todayISO()}`;

  const snapshot_data = {
    kind: VERSION_KIND,
    schema: SNAPSHOT_SCHEMA,
    project_id: projectId,
    captured_at: new Date().toISOString(),
    captured_by: userId,
    node_count: nodes.length,
    nodes,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("wbs_baselines")
    .insert({
      project_id: projectId,
      baseline_name: trimmed,
      baseline_type: "revised",
      baseline_date: todayISO(),
      is_active: false,
      created_by: userId,
      snapshot_data,
    })
    .select("id")
    .single();
  if (insErr || !inserted) throw insErr ?? new Error("Failed to save version");

  await writeAudit(projectId, "version_saved", trimmed);
  return inserted.id as string;
}

interface BaselineRow {
  id: string;
  baseline_name: string;
  baseline_date: string;
  created_at: string;
  created_by: string | null;
  snapshot_data: Record<string, unknown> | null;
}

function snapshotNodeCount(snap: Record<string, unknown> | null): number {
  if (!snap) return 0;
  if (typeof snap.node_count === "number") return snap.node_count;
  return Array.isArray(snap.nodes) ? snap.nodes.length : 0;
}

function isVersionSnapshot(snap: Record<string, unknown> | null): boolean {
  return !!snap && snap.kind === VERSION_KIND && Array.isArray(snap.nodes);
}

/** All manual WBS Builder versions for a project, newest first. */
export async function listWbsVersions(
  projectId: string,
): Promise<WbsVersionSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wbs_baselines")
    .select("id, baseline_name, baseline_date, created_at, created_by, snapshot_data")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return ((data ?? []) as BaselineRow[])
    .filter((r) => isVersionSnapshot(r.snapshot_data))
    .map((r) => ({
      id: r.id,
      baseline_name: r.baseline_name,
      baseline_date: r.baseline_date,
      created_at: r.created_at,
      created_by: r.created_by,
      node_count: snapshotNodeCount(r.snapshot_data),
    }));
}

export async function getWbsVersion(baselineId: string): Promise<WbsVersionSnapshot> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("wbs_baselines")
    .select("id, baseline_name, baseline_date, created_at, created_by, snapshot_data")
    .eq("id", baselineId)
    .single();
  if (error || !data) throw error ?? new Error("Version not found");

  const row = data as BaselineRow;
  const snap = row.snapshot_data ?? {};
  const nodes = (Array.isArray(snap.nodes) ? snap.nodes : []) as WbsVersionSnapshotNode[];

  return {
    id: row.id,
    baseline_name: row.baseline_name,
    baseline_date: row.baseline_date,
    created_at: row.created_at,
    created_by: row.created_by,
    node_count: snapshotNodeCount(snap),
    nodes,
  };
}

interface CurrentNode {
  id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
  sort_order: number;
  status: string;
  is_below_ground: boolean | null;
  is_external_works: boolean | null;
}

/** Order ids so every node comes after its parent (parents first). */
function topoOrder(
  ids: string[],
  parentOf: (id: string) => string | null,
  exists: (id: string) => boolean,
): string[] {
  const pending = new Set(ids);
  const done = new Set<string>();
  const out: string[] = [];
  let guard = 0;
  while (pending.size && guard++ < ids.length + 5) {
    for (const id of [...pending]) {
      const p = parentOf(id);
      if (!p || !exists(p) || done.has(p) || !pending.has(p)) {
        out.push(id);
        done.add(id);
        pending.delete(id);
      }
    }
  }
  // Anything left (cycle / dangling) — append as-is.
  out.push(...pending);
  return out;
}

/**
 * Restore the project's WBS structure to a saved version, id-keyed and
 * non-destructive by default.
 */
export async function restoreWbsVersion(
  projectId: string,
  baselineId: string,
  opts: RestoreOptions = {},
): Promise<RestoreResult> {
  const supabase = createClient();
  const version = await getWbsVersion(baselineId);

  const { data: currentData, error } = await supabase
    .from("wbs_nodes")
    .select(
      "id, parent_id, node_type, wbs_code, wbs_name, sort_order, status, is_below_ground, is_external_works",
    )
    .eq("project_id", projectId);
  if (error) throw error;

  const current = new Map<string, CurrentNode>(
    ((currentData ?? []) as CurrentNode[]).map((n) => [n.id, n]),
  );
  const snapById = new Map<string, WbsVersionSnapshotNode>(
    version.nodes.map((n) => [n.id, n]),
  );

  const touchedIds: string[] = [];
  let inserted = 0;
  let updated = 0;

  // 1. Insert missing snapshot nodes — parents before children.
  const missingIds = version.nodes.filter((n) => !current.has(n.id)).map((n) => n.id);
  const insertOrder = topoOrder(
    missingIds,
    (id) => snapById.get(id)?.parent_id ?? null,
    (id) => snapById.has(id) || current.has(id),
  );
  for (const id of insertOrder) {
    const n = snapById.get(id)!;
    const { error: insErr } = await supabase.from("wbs_nodes").insert({
      id: n.id,
      project_id: projectId,
      parent_id: n.parent_id,
      node_type: n.node_type,
      wbs_code: n.wbs_code,
      wbs_name: n.wbs_name,
      sort_order: n.sort_order,
      status: n.status,
      is_below_ground: n.is_below_ground ?? false,
      is_external_works: n.is_external_works ?? false,
    });
    if (insErr) throw insErr;
    inserted++;
    touchedIds.push(n.id);
    current.set(n.id, { ...n });
  }

  // 2. Update changed nodes — parents first, retry rows that hit a transient
  //    sibling-code collision (e.g. two siblings swapping codes).
  const asRec = (o: unknown) => o as Record<string, unknown>;

  const changedIds = version.nodes
    .filter((n) => {
      const cur = current.get(n.id);
      if (!cur) return false;
      return RESTORE_FIELDS.some((f) => asRec(cur)[f] !== asRec(n)[f]);
    })
    .map((n) => n.id);

  let queue = topoOrder(
    changedIds,
    (id) => snapById.get(id)?.parent_id ?? null,
    (id) => snapById.has(id) || current.has(id),
  );

  for (let pass = 0; pass < 3 && queue.length; pass++) {
    const retry: string[] = [];
    for (const id of queue) {
      const n = snapById.get(id)!;
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const f of RESTORE_FIELDS) patch[f] = asRec(n)[f];
      const { error: upErr } = await supabase.from("wbs_nodes").update(patch).eq("id", id);
      if (upErr) {
        if (String(upErr.code) === "23505" || /duplicate key/i.test(upErr.message)) {
          retry.push(id);
          continue;
        }
        throw upErr;
      }
      updated++;
      touchedIds.push(id);
    }
    queue = retry;
  }
  if (queue.length) {
    throw new Error(
      `Could not restore ${queue.length} node(s) without a code collision — resolve duplicate WBS codes and retry.`,
    );
  }

  // 3. Extras — nodes present now but absent from the snapshot.
  const extraIds = [...current.keys()].filter((id) => !snapById.has(id));
  let deleted = 0;
  let skippedExtra = extraIds.length;

  if (opts.deleteNodesNotInSnapshot && extraIds.length) {
    // Delete leaves-first so FK cascade order is predictable.
    const childCount = new Map<string, number>();
    for (const id of extraIds) {
      const p = current.get(id)?.parent_id;
      if (p) childCount.set(p, (childCount.get(p) ?? 0) + 1);
    }
    const ordered = [...extraIds].sort(
      (a, b) => (childCount.get(a) ?? 0) - (childCount.get(b) ?? 0),
    );
    for (const id of ordered) {
      const { error: delErr } = await supabase.from("wbs_nodes").delete().eq("id", id);
      if (delErr) throw delErr;
      deleted++;
    }
    skippedExtra = 0;
  }

  // 4. Touch every inserted/updated node so `full_path` rebuilds via the trigger.
  const touchedAt = new Date().toISOString();
  for (const id of [...new Set(touchedIds)]) {
    await supabase.from("wbs_nodes").update({ updated_at: touchedAt }).eq("id", id);
  }

  await writeAudit(projectId, "version_restored", version.baseline_name);
  return { inserted, updated, deleted, skippedExtra };
}
