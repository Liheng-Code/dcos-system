"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { clearWbsNodeGfa, getProjectGfaMap, setWbsNodeGfaValue } from "@/lib/qs-service";
import { isAutoCode, nextWbsCode, resolveCodeCollision } from "@/lib/wbs-code";
import {
  computeInsertSortOrder,
  getDescendantIds,
  getDragDropMove,
  getOrderedSiblings,
  persistHierarchyMove,
  type WbsHierarchyMove,
} from "@/lib/wbs-hierarchy";
import {
  buildWbsTree,
  flattenRows,
  GFA_EDITABLE_TYPES,
  NODE_COLS,
  PROJECT_NODE_TYPE,
  STATUS_OPTIONS,
  type BuilderProject,
  type WbsBuilderField,
  type WbsBuilderNode,
  type WbsBuilderRow,
} from "./wbs-builder-types";

const MAX_CODE_ATTEMPTS = 5;

function isDuplicateCodeError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    String(err.code) === "23505" ||
    /wbs_nodes_sibling_unique/i.test(err.message ?? "") ||
    /duplicate key/i.test(err.message ?? "")
  );
}

function stripRowId(rowId: string | null): string | null {
  if (!rowId) return null;
  return rowId.startsWith("node:") ? rowId.slice(5) : rowId;
}

export interface WbsBuilderActions {
  /** Returns the new node's id, or null on failure. */
  createRow: (
    name: string,
    afterRowId: string | null,
    nodeType?: string,
  ) => Promise<string | null>;
  updateNodeField: (nodeId: string, field: WbsBuilderField, raw: string) => Promise<void>;
  deleteRow: (nodeId: string) => Promise<void>;
  /** Reorder the row one step up / down among its siblings. */
  moveRowUp: (rowId: string) => Promise<void>;
  moveRowDown: (rowId: string) => Promise<void>;
  indentRow: (rowId: string) => Promise<void>;
  outdentRow: (rowId: string) => Promise<void>;
  /** GFA cell — Building / Zone / Room only. Empty value clears the row. */
  setGfa: (nodeId: string, value: number) => Promise<void>;
  clearGfa: (nodeId: string) => Promise<void>;
  /** Lock / unlock a subtree (admin / project manager only). */
  toggleLock: (nodeId: string, locked: boolean) => Promise<void>;
}

export interface NodeGfa {
  /** What the cell shows: own value, else the roll-up, else null. */
  display: number | null;
  /** Manually-entered value on this node (a wbs_node_quantities row), if any. */
  own: number | null;
  /** Sum of descendant GFA (nearest set value per branch), if any. */
  rollup: number | null;
  /** own and rollup both exist and differ — show a "≠ rollup" hint. */
  mismatch: boolean;
  /** node_type is one of GFA_EDITABLE_TYPES. */
  editable: boolean;
}

export interface NodeLock {
  /** This node or an ancestor is locked. */
  locked: boolean;
  /** This node itself carries is_locked. */
  self: boolean;
  /** Nearest locked ancestor id (when locked && !self). */
  byAncestorId: string | null;
}

export interface UseWbsBuilderData {
  loading: boolean;
  nodes: WbsBuilderNode[];
  tree: WbsBuilderRow[];
  flatRows: WbsBuilderRow[];
  rowNumberById: Map<string, number>;
  nodeCount: number;
  getNodeById: (id: string) => WbsBuilderNode | null;
  nextCodePreview: (nodeType: string, parentId: string | null) => string;
  gfaFor: (nodeId: string) => NodeGfa;
  lockFor: (nodeId: string) => NodeLock;
  reload: () => Promise<void>;
  actions: WbsBuilderActions;
}

const NO_GFA: NodeGfa = {
  display: null,
  own: null,
  rollup: null,
  mismatch: false,
  editable: false,
};
const NO_LOCK: NodeLock = { locked: false, self: false, byAncestorId: null };

export function useWbsBuilderData(
  projectId: string,
  project?: BuilderProject | null,
  isManager = false,
): UseWbsBuilderData {
  const supabase = useMemo(() => createClient(), []);
  const [nodes, setNodes] = useState<WbsBuilderNode[]>([]);
  const [gfaMap, setGfaMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const nodesRef = useRef(nodes);
  const gfaMapRef = useRef(gfaMap);
  const projectIdRef = useRef(projectId);
  const isManagerRef = useRef(isManager);
  // Serialises indent / outdent so a rapid second click computes its move from
  // the previous one's committed result, not a mid-flight parent_id.
  const moveQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    nodesRef.current = nodes;
  });
  useEffect(() => {
    gfaMapRef.current = gfaMap;
  });
  useEffect(() => {
    isManagerRef.current = isManager;
  }, [isManager]);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const fetchAll = useCallback(async () => {
    const [nodesRes, gfa] = await Promise.all([
      supabase
        .from("wbs_nodes")
        .select(NODE_COLS)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true, nullsFirst: false }),
      getProjectGfaMap(projectId).catch(() => new Map<string, number>()),
    ]);
    if (nodesRes.error) {
      toast.error("Failed to load WBS: " + nodesRes.error.message);
      return;
    }
    if (projectIdRef.current !== projectId) return;
    setNodes((nodesRes.data ?? []) as unknown as WbsBuilderNode[]);
    setGfaMap(gfa);
  }, [supabase, projectId]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setNodes([]);
      setGfaMap(new Map());
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    setLoading(true);
    fetchAll().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, fetchAll]);

  const reload = useCallback(async () => {
    if (projectIdRef.current !== projectId) return;
    await fetchAll();
  }, [fetchAll, projectId]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  // `selectedProject` from context is a fresh object every render — key the memo
  // on its primitive fields so `tree` (and thus the arborist data) stays stable.
  const projectKey = project
    ? `${project.id}|${project.project_code}|${project.project_name}|${project.project_status}|${project.progress_percentage}`
    : "";
  const stableProject = useMemo<BuilderProject | null>(
    () => project ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectKey],
  );

  const tree = useMemo(() => buildWbsTree(nodes, stableProject), [nodes, stableProject]);
  const flatRows = useMemo(() => flattenRows(tree), [tree]);
  const rowNumberById = useMemo(() => {
    // Number real nodes 1..N; the synthetic project row is not numbered.
    const m = new Map<string, number>();
    let n = 0;
    for (const r of flatRows) {
      if (r.node.node_type === PROJECT_NODE_TYPE) continue;
      m.set(r.id, ++n);
    }
    return m;
  }, [flatRows]);

  const getNodeById = useCallback(
    (id: string) => nodesRef.current.find((n) => n.id === id) ?? null,
    [],
  );

  // --- GFA: own value + recursive roll-up (nearest set value per branch) -----
  const gfaByNode = useMemo(() => {
    const childrenByParent = new Map<string, WbsBuilderNode[]>();
    for (const n of nodes) {
      if (!n.parent_id) continue;
      const list = childrenByParent.get(n.parent_id) ?? [];
      list.push(n);
      childrenByParent.set(n.parent_id, list);
    }
    const rollupCache = new Map<string, number | null>();
    const rollup = (id: string): number | null => {
      const cached = rollupCache.get(id);
      if (cached !== undefined) return cached;
      rollupCache.set(id, null); // guard against a malformed cycle
      let sum = 0;
      let any = false;
      for (const child of childrenByParent.get(id) ?? []) {
        const eff = gfaMap.get(child.id) ?? rollup(child.id);
        if (eff != null) {
          sum += eff;
          any = true;
        }
      }
      const val = any ? sum : null;
      rollupCache.set(id, val);
      return val;
    };

    const out = new Map<string, NodeGfa>();
    for (const n of nodes) {
      const own = gfaMap.get(n.id) ?? null;
      const ru = rollup(n.id);
      out.set(n.id, {
        display: own ?? ru,
        own,
        rollup: ru,
        mismatch: own != null && ru != null && Math.abs(own - ru) > 0.01,
        editable: GFA_EDITABLE_TYPES.has(n.node_type),
      });
    }
    return out;
  }, [nodes, gfaMap]);

  // --- Effective lock: this node or any ancestor carrying is_locked ---------
  const lockByNode = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const cache = new Map<string, NodeLock>();
    const resolve = (id: string): NodeLock => {
      const hit = cache.get(id);
      if (hit) return hit;
      cache.set(id, NO_LOCK); // cycle guard
      const n = byId.get(id);
      let v: NodeLock = NO_LOCK;
      if (n?.is_locked) {
        v = { locked: true, self: true, byAncestorId: null };
      } else if (n?.parent_id) {
        const parent = resolve(n.parent_id);
        if (parent.locked) {
          v = {
            locked: true,
            self: false,
            byAncestorId: parent.self ? n.parent_id : parent.byAncestorId,
          };
        }
      }
      cache.set(id, v);
      return v;
    };
    const out = new Map<string, NodeLock>();
    for (const n of nodes) out.set(n.id, resolve(n.id));
    return out;
  }, [nodes]);

  const lockByNodeRef = useRef(lockByNode);
  useEffect(() => {
    lockByNodeRef.current = lockByNode;
  });

  const gfaFor = useCallback(
    (nodeId: string): NodeGfa => gfaByNode.get(nodeId) ?? NO_GFA,
    [gfaByNode],
  );
  const lockFor = useCallback(
    (nodeId: string): NodeLock => lockByNode.get(nodeId) ?? NO_LOCK,
    [lockByNode],
  );

  /** True when a structural / GFA edit to this node must be blocked in the UI. */
  const isBlockedByLock = useCallback((nodeId: string): boolean => {
    if (isManagerRef.current) return false;
    return lockByNodeRef.current.get(nodeId)?.locked ?? false;
  }, []);

  const lockToast = () =>
    toast.error("This WBS node is locked (Planning backbone) — unlock it first");

  const inMemorySiblings = useCallback(
    (parentId: string | null, excludeId?: string) =>
      nodesRef.current.filter(
        (n) => (n.parent_id ?? null) === (parentId ?? null) && n.id !== excludeId,
      ),
    [],
  );

  const fetchSiblingCodes = useCallback(
    async (parentId: string | null, excludeId?: string): Promise<Set<string>> => {
      let q = supabase
        .from("wbs_nodes")
        .select("id, wbs_code")
        .eq("project_id", projectId);
      q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
      const { data } = await q;
      const taken = new Set<string>();
      for (const row of (data ?? []) as { id: string; wbs_code: string }[]) {
        if (row.id !== excludeId) taken.add(row.wbs_code);
      }
      return taken;
    },
    [supabase, projectId],
  );

  const nextCodePreview = useCallback(
    (nodeType: string, parentId: string | null) =>
      nextWbsCode(nodeType, inMemorySiblings(parentId)),
    [inMemorySiblings],
  );

  const touchSubtree = useCallback(
    async (nodeId: string) => {
      const at = new Date().toISOString();
      const ids = [nodeId, ...getDescendantIds(nodesRef.current, nodeId)];
      for (const id of ids) {
        await supabase.from("wbs_nodes").update({ updated_at: at }).eq("id", id);
      }
    },
    [supabase],
  );

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------
  const createRow = useCallback(
    async (
      name: string,
      afterRowId: string | null,
      nodeTypeOverride?: string,
    ): Promise<string | null> => {
      const trimmed = name.trim();
      if (!trimmed || !projectId) return null;

      const selId = stripRowId(afterRowId);
      const selected = selId ? nodesRef.current.find((n) => n.id === selId) : null;
      const parentId = selected?.parent_id ?? null;
      const nodeType = nodeTypeOverride || selected?.node_type || "building";

      const siblings = inMemorySiblings(parentId);
      let code = nextWbsCode(nodeType, siblings);
      const sortOrder = computeInsertSortOrder(
        siblings.map((s) => ({ wbs_code: s.wbs_code, sort_order: s.sort_order })),
        code,
      );

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const res = await supabase
          .from("wbs_nodes")
          .insert({
            project_id: projectId,
            parent_id: parentId,
            node_type: nodeType,
            wbs_code: code,
            wbs_name: trimmed,
            status: "active",
            sort_order: sortOrder + attempt,
          })
          .select(NODE_COLS)
          .single();

        if (!res.error && res.data) {
          // Optimistic append. The inserted row already carries its own
          // trigger-computed full_path; ancestor progress_percent rollup is
          // cosmetic and refreshes on the next move / Refresh / panel open —
          // so we don't reload here, keeping rapid entry snappy.
          const row = res.data as unknown as WbsBuilderNode;
          setNodes((p) => [...p, row]);
          return row.id;
        }
        if (res.error && isDuplicateCodeError(res.error)) {
          const taken = await fetchSiblingCodes(parentId);
          code = resolveCodeCollision(nextWbsCode(nodeType, [...taken].map((c) => ({ wbs_code: c }))), taken);
          continue;
        }
        toast.error("Failed to add row: " + res.error?.message);
        return null;
      }
      toast.error("Could not allocate a unique WBS code");
      return null;
    },
    [supabase, projectId, inMemorySiblings, fetchSiblingCodes],
  );

  // ---------------------------------------------------------------------------
  // Update one field (optimistic + snapshot rollback)
  // ---------------------------------------------------------------------------
  const updateNodeField = useCallback(
    async (nodeId: string, field: WbsBuilderField, raw: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      if (isBlockedByLock(nodeId)) {
        lockToast();
        return;
      }

      const patch: Partial<WbsBuilderNode> = {};
      let regenNote: string | null = null;
      let heavy = false; // wbs_code / node_type change → full_path + rollup refetch

      switch (field) {
        case "wbs_name": {
          const v = raw.trim();
          if (!v || v === node.wbs_name) return;
          patch.wbs_name = v;
          break;
        }
        case "status": {
          if (!STATUS_OPTIONS.includes(raw) || raw === node.status) return;
          patch.status = raw;
          break;
        }
        case "discipline":
        case "area_label":
        case "cost_code": {
          const v = raw.trim();
          if (v === (node[field] ?? "")) return;
          patch[field] = v || null;
          break;
        }
        case "node_type": {
          if (raw === node.node_type) return;
          patch.node_type = raw;
          heavy = true;
          if (isAutoCode(node.wbs_code, node.node_type)) {
            const sibs = inMemorySiblings(node.parent_id, nodeId);
            const taken = new Set(sibs.map((s) => s.wbs_code));
            const newCode = resolveCodeCollision(nextWbsCode(raw, sibs), taken);
            if (newCode !== node.wbs_code) {
              patch.wbs_code = newCode;
              regenNote = newCode;
            }
          }
          break;
        }
        case "wbs_code": {
          const v = raw.trim().toUpperCase();
          if (!v || v === node.wbs_code) return;
          const clash = inMemorySiblings(node.parent_id, nodeId).some(
            (s) => s.wbs_code.toLowerCase() === v.toLowerCase(),
          );
          if (clash) {
            toast.error(`Code "${v}" is already used at this level`);
            return;
          }
          patch.wbs_code = v;
          heavy = true;
          break;
        }
      }

      const snapshot = node;
      setNodes((p) => p.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));

      const { error } = await supabase.from("wbs_nodes").update(patch).eq("id", nodeId);
      if (error) {
        setNodes((p) => p.map((n) => (n.id === nodeId ? snapshot : n)));
        toast.error("Failed to save: " + error.message);
        return;
      }

      if (regenNote) toast.message(`Code updated to ${regenNote}`);
      if (heavy) {
        await touchSubtree(nodeId);
        await reload();
      }
    },
    [supabase, inMemorySiblings, touchSubtree, reload, isBlockedByLock],
  );

  // ---------------------------------------------------------------------------
  // Delete (whole subtree via DB cascade)
  // ---------------------------------------------------------------------------
  const deleteRow = useCallback(
    async (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      if (isBlockedByLock(nodeId)) {
        lockToast();
        return;
      }

      const descIds = getDescendantIds(nodesRef.current, nodeId);
      const tail = descIds.length
        ? ` and its ${descIds.length} descendant node${descIds.length > 1 ? "s" : ""}`
        : "";
      const msg =
        `Delete "${node.wbs_name}"${tail}?\n\n` +
        `Tasks, quantities and cost lines under ${descIds.length ? "them" : "it"} are also removed. This cannot be undone.`;
      if (!confirm(msg)) return;

      const res = await supabase
        .from("wbs_nodes")
        .delete()
        .eq("id", nodeId)
        .select("id")
        .maybeSingle();
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      if (!res.data) {
        toast.error("Only an admin can delete WBS nodes");
        return;
      }

      const subtree = new Set([nodeId, ...descIds]);
      setNodes((p) => p.filter((n) => !subtree.has(n.id)));
      toast.success("Deleted");
      void reload();
    },
    [supabase, reload, isBlockedByLock],
  );

  // Run `fn` after any in-flight indent/outdent settles — keeps rapid clicks
  // correct without a visible freeze.
  const enqueueMove = useCallback((fn: () => Promise<void>): Promise<void> => {
    const run = moveQueueRef.current.then(fn, fn);
    moveQueueRef.current = run.catch(() => {});
    return run;
  }, []);

  // ---------------------------------------------------------------------------
  // Hierarchy moves (indent / outdent) — optimistic, like the reorder buttons.
  // The tree updates instantly from `nodes`; `full_path` is fixed server-side
  // by the trigger and is not shown in the grid, so no reload is needed.
  // ---------------------------------------------------------------------------
  const runMove = useCallback(
    async (nodeId: string, move: WbsHierarchyMove) => {
      const snapshot = nodesRef.current;
      const sibSort = new Map(move.reorderedSiblings.map((s) => [s.id, s.sortOrder]));
      const next = snapshot.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            parent_id: move.parentId,
            sort_order: move.sortOrder,
            wbs_code: move.wbsCode ?? n.wbs_code,
          };
        }
        const so = sibSort.get(n.id);
        return so !== undefined && so !== n.sort_order ? { ...n, sort_order: so } : n;
      });
      setNodes(next);
      nodesRef.current = next;

      try {
        await persistHierarchyMove(supabase, snapshot, nodeId, move);
      } catch (e) {
        setNodes(snapshot);
        nodesRef.current = snapshot;
        toast.error(e instanceof Error ? e.message : "Unable to update WBS hierarchy");
      }
    },
    [supabase],
  );

  // Reorder within the current parent — one step up / down. Re-parenting is
  // handled by indentRow / outdentRow; there is no drag-and-drop.
  //
  // Fast path: only two rows swap places, so this renumbers the level and
  // writes just the rows whose sort_order actually changed (two, normally),
  // all in parallel, with an optimistic local update and NO project reload.
  // It never sets `movingNode`, so the buttons stay live for rapid clicks.
  const moveWithinSiblings = useCallback(
    async (rowId: string, dir: -1 | 1) => {
      const nodeId = stripRowId(rowId);
      const node = nodeId ? nodesRef.current.find((n) => n.id === nodeId) : null;
      if (!nodeId || !node) return;
      if (isBlockedByLock(nodeId)) {
        lockToast();
        return;
      }
      const siblings = getOrderedSiblings(nodesRef.current, node.parent_id ?? null);
      const from = siblings.findIndex((s) => s.id === nodeId);
      const to = from + dir;
      if (from === -1 || to < 0 || to >= siblings.length) {
        toast.message(dir < 0 ? "Already first in its group" : "Already last in its group");
        return;
      }

      const reordered = [...siblings];
      [reordered[from], reordered[to]] = [reordered[to], reordered[from]];

      // Renumber 0,10,20… and keep only the rows that genuinely move. A level
      // already on clean spacing yields exactly two; a legacy scrambled level
      // yields more and self-heals.
      const changed = reordered
        .map((n, i) => ({ id: n.id, sort_order: i * 10 }))
        .filter((c, i) => reordered[i].sort_order !== c.sort_order);
      if (changed.length === 0) return;

      const snapshot = nodesRef.current;
      const changedById = new Map(changed.map((c) => [c.id, c.sort_order]));
      const next = snapshot.map((n) =>
        changedById.has(n.id) ? { ...n, sort_order: changedById.get(n.id)! } : n,
      );
      setNodes(next);
      nodesRef.current = next; // so a rapid follow-up click reads fresh order

      const results = await Promise.all(
        changed.map((c) =>
          supabase.from("wbs_nodes").update({ sort_order: c.sort_order }).eq("id", c.id),
        ),
      );
      if (results.some((r) => r.error)) {
        setNodes(snapshot);
        nodesRef.current = snapshot;
        toast.error("Failed to reorder — refreshed to the last saved order");
      }
    },
    [supabase, isBlockedByLock],
  );

  const moveRowUp = useCallback(
    (rowId: string) => moveWithinSiblings(rowId, -1),
    [moveWithinSiblings],
  );
  const moveRowDown = useCallback(
    (rowId: string) => moveWithinSiblings(rowId, 1),
    [moveWithinSiblings],
  );

  const indentRow = useCallback(
    (rowId: string) =>
      enqueueMove(async () => {
        const nodeId = stripRowId(rowId);
        const node = nodeId ? nodesRef.current.find((n) => n.id === nodeId) : null;
        if (!nodeId || !node) return;
        if (isBlockedByLock(nodeId)) {
          lockToast();
          return;
        }
        const siblings = getOrderedSiblings(nodesRef.current, node.parent_id ?? null);
        const pos = siblings.findIndex((s) => s.id === nodeId);
        if (pos <= 0) {
          toast.message("No node above to nest under");
          return;
        }
        const move = getDragDropMove(
          nodesRef.current,
          nodeId,
          siblings[pos - 1].id,
          Number.MAX_SAFE_INTEGER,
        );
        if (!move) return;
        await runMove(nodeId, move);
      }),
    [enqueueMove, runMove, isBlockedByLock],
  );

  const outdentRow = useCallback(
    (rowId: string) =>
      enqueueMove(async () => {
        const nodeId = stripRowId(rowId);
        const node = nodeId ? nodesRef.current.find((n) => n.id === nodeId) : null;
        if (!nodeId || !node) return;
        if (isBlockedByLock(nodeId)) {
          lockToast();
          return;
        }
        if (!node.parent_id) {
          toast.message("Already at the top level");
          return;
        }
        const parent = nodesRef.current.find((n) => n.id === node.parent_id);
        if (!parent) return;
        // Land directly after the former parent in the grandparent's list —
        // MS-Project behaviour — not appended at the end.
        const grandParentId = parent.parent_id ?? null;
        const grandSiblings = getOrderedSiblings(nodesRef.current, grandParentId);
        const parentPos = grandSiblings.findIndex((s) => s.id === parent.id);
        const targetIndex = parentPos === -1 ? grandSiblings.length : parentPos + 1;
        const move = getDragDropMove(nodesRef.current, nodeId, grandParentId, targetIndex);
        if (!move) return;
        await runMove(nodeId, move);
      }),
    [enqueueMove, runMove, isBlockedByLock],
  );

  // ---------------------------------------------------------------------------
  // GFA cell (reuses wbs_node_quantities via qs-service)
  // ---------------------------------------------------------------------------
  const setGfa = useCallback(
    async (nodeId: string, value: number) => {
      if (isBlockedByLock(nodeId)) {
        lockToast();
        return;
      }
      const prev = gfaMapRef.current.get(nodeId);
      setGfaMap((p) => new Map(p).set(nodeId, value));
      try {
        await setWbsNodeGfaValue(nodeId, value);
      } catch (e) {
        setGfaMap((p) => {
          const m = new Map(p);
          if (prev == null) m.delete(nodeId);
          else m.set(nodeId, prev);
          return m;
        });
        toast.error(e instanceof Error ? e.message : "Failed to save GFA");
      }
    },
    [isBlockedByLock],
  );

  const clearGfa = useCallback(
    async (nodeId: string) => {
      if (isBlockedByLock(nodeId)) {
        lockToast();
        return;
      }
      const prev = gfaMapRef.current.get(nodeId);
      if (prev == null) return;
      setGfaMap((p) => {
        const m = new Map(p);
        m.delete(nodeId);
        return m;
      });
      try {
        await clearWbsNodeGfa(nodeId);
      } catch (e) {
        setGfaMap((p) => new Map(p).set(nodeId, prev));
        toast.error(e instanceof Error ? e.message : "Failed to clear GFA");
      }
    },
    [isBlockedByLock],
  );

  // ---------------------------------------------------------------------------
  // Lock / unlock a subtree (admin / project manager only)
  // ---------------------------------------------------------------------------
  const toggleLock = useCallback(
    async (nodeId: string, locked: boolean) => {
      if (!isManagerRef.current) {
        toast.error("Only an admin or project manager can lock or unlock a WBS node");
        return;
      }
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const { data: userRes } = await supabase.auth.getUser();
      const patch = locked
        ? {
            is_locked: true,
            locked_at: new Date().toISOString(),
            locked_by: userRes.user?.id ?? null,
          }
        : { is_locked: false, locked_at: null, locked_by: null };

      setNodes((p) => p.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
      const { error } = await supabase.from("wbs_nodes").update(patch).eq("id", nodeId);
      if (error) {
        setNodes((p) => p.map((n) => (n.id === nodeId ? node : n)));
        toast.error(
          /lock|check_violation|project manager/i.test(error.message)
            ? "Only an admin or project manager can lock or unlock a WBS node"
            : "Failed to update lock: " + error.message,
        );
        return;
      }
      toast.success(locked ? "WBS subtree locked" : "WBS subtree unlocked");
    },
    [supabase],
  );

  const actions = useMemo<WbsBuilderActions>(
    () => ({
      createRow,
      updateNodeField,
      deleteRow,
      moveRowUp,
      moveRowDown,
      indentRow,
      outdentRow,
      setGfa,
      clearGfa,
      toggleLock,
    }),
    [
      createRow,
      updateNodeField,
      deleteRow,
      moveRowUp,
      moveRowDown,
      indentRow,
      outdentRow,
      setGfa,
      clearGfa,
      toggleLock,
    ],
  );

  return {
    loading,
    nodes,
    tree,
    flatRows,
    rowNumberById,
    nodeCount: nodes.length,
    getNodeById,
    nextCodePreview,
    gfaFor,
    lockFor,
    reload,
    actions,
  };
}
