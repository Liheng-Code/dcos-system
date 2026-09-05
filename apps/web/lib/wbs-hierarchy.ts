// Pure hierarchy math for WBS nodes + the one shared async that persists a
// re-parent / reorder against `wbs_nodes`.
//
// Extracted from components/wbs/wbs-management-page.tsx so the WBS Builder grid
// and the (legacy) management page share exactly one implementation. Generalised
// to any row shape carrying id / parent_id / wbs_code / sort_order.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCodeCollision } from "@/lib/wbs-code";

export interface HierNode {
  id: string;
  parent_id: string | null;
  wbs_code: string;
  sort_order: number;
}

export interface WbsHierarchyMove {
  parentId: string | null;
  sortOrder: number;
  /** Set only when re-parenting forces the moved node's own code to change. */
  wbsCode?: string;
  reorderedSiblings: Array<{ id: string; sortOrder: number }>;
}

const ARBORIST_ROOT = "__REACT_ARBORIST_INTERNAL_ROOT__";

/** Monotonic sort_order allocator — Date.now() repeats within a fast loop. */
export function makeSortAllocator(): () => number {
  let last = 0;
  return () => (last = Math.max(Date.now(), last + 1));
}

/**
 * Normalise a react-arborist parent id to a real `wbs_nodes.parent_id`:
 *  - the arborist internal-root sentinel → null,
 *  - the synthetic project row (`project:<uuid>` / `node:project:<uuid>`) → null
 *    (its children are the real top-level nodes).
 */
export function normalizeArboristParentId(parentId: string | null): string | null {
  if (!parentId || parentId === ARBORIST_ROOT) return null;
  if (parentId.startsWith("project:") || parentId.startsWith("node:project:")) return null;
  return parentId;
}

export function getOrderedSiblings<T extends HierNode>(
  nodes: T[],
  parentId: string | null,
): T[] {
  const key = parentId ?? null;
  return nodes
    .filter((n) => (n.parent_id ?? null) === key)
    .sort((a, b) => {
      const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (bySort !== 0) return bySort;
      const byCode = a.wbs_code.localeCompare(b.wbs_code);
      return byCode !== 0 ? byCode : a.id.localeCompare(b.id);
    });
}

/** New sort_order for each node = index * 10 (leaves gaps for cheap inserts). */
export function reindexNodes(nodes: HierNode[]): Array<{ id: string; sortOrder: number }> {
  return nodes.map((n, i) => ({ id: n.id, sortOrder: i * 10 }));
}

export function getDescendantIds<T extends HierNode>(nodes: T[], id: string): string[] {
  const children = getOrderedSiblings(nodes, id);
  return children.flatMap((c) => [c.id, ...getDescendantIds(nodes, c.id)]);
}

function dedupe(
  updates: Array<{ id: string; sortOrder: number }>,
): Array<{ id: string; sortOrder: number }> {
  const byId = new Map<string, { id: string; sortOrder: number }>();
  for (const u of updates) byId.set(u.id, u);
  return [...byId.values()];
}

/**
 * Compute a re-parent/reorder move for `id` under `rawParentId` at visual
 * `index`, or null when the move is illegal (onto self / own descendant).
 * Re-indexes both the source and target sibling lists, and regenerates the
 * moved node's `wbs_code` when the new parent already has that code.
 */
export function getDragDropMove<T extends HierNode>(
  nodes: T[],
  id: string,
  rawParentId: string | null,
  index: number,
): WbsHierarchyMove | null {
  const selected = nodes.find((n) => n.id === id);
  if (!selected) return null;

  const nextParentId = normalizeArboristParentId(rawParentId);
  if (
    nextParentId === id ||
    (nextParentId && getDescendantIds(nodes, id).includes(nextParentId))
  ) {
    return null;
  }

  const parentChanged = (selected.parent_id ?? null) !== nextParentId;

  // react-arborist reports `index` against the parent's children list *before*
  // the dragged node is removed, so a reorder that moves a node DOWN within its
  // current parent counts that node's own vacated slot and lands one row too
  // low. Drop that slot from the count for same-parent downward moves.
  let dropIndex = index;
  if (!parentChanged) {
    const originalIndex = getOrderedSiblings(nodes, selected.parent_id ?? null).findIndex(
      (n) => n.id === id,
    );
    if (originalIndex !== -1 && originalIndex < index) dropIndex = index - 1;
  }

  const sourceUpdates = reindexNodes(
    getOrderedSiblings(nodes, selected.parent_id ?? null).filter((n) => n.id !== id),
  );

  const targetSiblings = getOrderedSiblings(nodes, nextParentId).filter((n) => n.id !== id);
  const at = Math.max(0, Math.min(dropIndex, targetSiblings.length));
  const nextOrder = [...targetSiblings.slice(0, at), selected, ...targetSiblings.slice(at)];
  const targetUpdates = reindexNodes(nextOrder);

  const selfUpdate = targetUpdates.find((n) => n.id === id);
  if (!selfUpdate) return null;

  let wbsCode: string | undefined;
  if (parentChanged) {
    const taken = new Set(targetSiblings.map((n) => n.wbs_code));
    const resolved = resolveCodeCollision(selected.wbs_code, taken);
    if (resolved !== selected.wbs_code) wbsCode = resolved;
  }

  return {
    parentId: nextParentId,
    sortOrder: selfUpdate.sortOrder,
    wbsCode,
    reorderedSiblings: dedupe([...sourceUpdates, ...targetUpdates]),
  };
}

/**
 * sort_order that keeps a new sibling in `wbs_code` order among its existing
 * siblings, instead of defaulting to 0 (which pushes it to the top).
 * Ported verbatim from wbs-node-edit-sheet.tsx.
 */
export function computeInsertSortOrder(
  siblings: Array<{ wbs_code: string; sort_order: number }>,
  newCode: string,
): number {
  if (siblings.length === 0) return 0;

  const byCode = [...siblings].sort((a, b) => a.wbs_code.localeCompare(b.wbs_code));
  let insertIndex = byCode.findIndex((s) => s.wbs_code.localeCompare(newCode) > 0);
  if (insertIndex === -1) insertIndex = byCode.length;

  const before = insertIndex > 0 ? byCode[insertIndex - 1] : null;
  const after = insertIndex < byCode.length ? byCode[insertIndex] : null;
  if (!before && !after) return 0;

  const sortValues = siblings.map((s) => s.sort_order ?? 0);
  if (!before) return Math.min(...sortValues) - 10;
  if (!after) return Math.max(...sortValues) + 10;

  const b = before.sort_order ?? 0;
  const a = after.sort_order ?? 0;
  if (a === b) return b;
  return Math.floor((b + a) / 2);
}

/**
 * Persist a `WbsHierarchyMove`, in as few round-trips as possible:
 *  1. UPDATE {parent_id, sort_order, (wbs_code)} on the moved node PLUS one
 *     {sort_order} UPDATE per sibling whose position actually changed — all
 *     fired together (`Promise.all`).
 *  2. Then a single bulk UPDATE {updated_at} across every descendant id, which
 *     re-fires the BEFORE trigger so their `full_path` rebuilds under the new
 *     ancestry — one statement, not one per row.
 * Throws on the first Supabase error. Caller does its own optimistic update.
 */
export async function persistHierarchyMove<T extends HierNode>(
  supabase: SupabaseClient,
  allNodes: T[],
  nodeId: string,
  move: WbsHierarchyMove,
): Promise<void> {
  const touchedAt = new Date().toISOString();

  const movePatch: Record<string, unknown> = {
    parent_id: move.parentId,
    sort_order: move.sortOrder,
    updated_at: touchedAt,
  };
  if (move.wbsCode) movePatch.wbs_code = move.wbsCode;

  const currentSort = new Map(allNodes.map((n) => [n.id, n.sort_order]));
  const siblingWrites = move.reorderedSiblings
    .filter((s) => s.id !== nodeId && currentSort.get(s.id) !== s.sortOrder)
    .map((s) =>
      supabase.from("wbs_nodes").update({ sort_order: s.sortOrder }).eq("id", s.id),
    );

  const results = await Promise.all([
    supabase.from("wbs_nodes").update(movePatch).eq("id", nodeId),
    ...siblingWrites,
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;

  // Descendants keep their parent_id — only the moved node re-parents — so this
  // set is the same before and after the move. One `.in()` update re-triggers
  // full_path for all of them; must run AFTER the moved node's parent_id lands.
  const descIds = getDescendantIds(allNodes, nodeId);
  if (descIds.length) {
    const { error } = await supabase
      .from("wbs_nodes")
      .update({ updated_at: touchedAt })
      .in("id", descIds);
    if (error) throw error;
  }
}
