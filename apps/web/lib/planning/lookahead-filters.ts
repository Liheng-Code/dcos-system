/**
 * Look-ahead filters: pure helpers for status bucketing, window overlap,
 * zone (building / level / phase) ancestry, discipline options and URL state.
 * No React, no Supabase.
 */

export type LookaheadStatus = "not_started" | "in_progress" | "late" | "done";

export const LOOKAHEAD_STATUSES: { value: LookaheadStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "late", label: "Late" },
  { value: "done", label: "Done" },
];

export const UNASSIGNED_DISCIPLINE = "__none__";

export interface LookaheadFilters {
  disciplines: string[];
  zones: string[];
  statuses: LookaheadStatus[];
}

export interface LookaheadUrlState extends LookaheadFilters {
  from: string | null;
  to: string | null;
}

export const EMPTY_LOOKAHEAD_FILTERS: LookaheadFilters = {
  disciplines: [],
  zones: [],
  statuses: [],
};

export function hasActiveLookaheadFilters(f: LookaheadFilters): boolean {
  return f.disciplines.length > 0 || f.zones.length > 0 || f.statuses.length > 0;
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

const STATUS_VALUES = new Set<string>(LOOKAHEAD_STATUSES.map((s) => s.value));

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    if (!part) continue;
    const v = safeDecode(part);
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function parseIsoDate(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === raw ? raw : null;
}

/** URL keys: disc, zone, status (comma-separated, values encodeURIComponent'd per item), from, to (YYYY-MM-DD; invalid → null). Unknown status values dropped; duplicates removed. */
export function parseLookaheadParams(sp: { get(key: string): string | null }): LookaheadUrlState {
  return {
    disciplines: parseList(sp.get("disc")),
    zones: parseList(sp.get("zone")),
    statuses: parseList(sp.get("status")).filter((s): s is LookaheadStatus => STATUS_VALUES.has(s)),
    from: parseIsoDate(sp.get("from")),
    to: parseIsoDate(sp.get("to")),
  };
}

/** Returns a NEW URLSearchParams: copies `base` (keeps unrelated keys like `sub`), sets/deletes the 5 keys (empty array/null → delete). */
export function writeLookaheadParams(base: URLSearchParams, state: LookaheadUrlState): URLSearchParams {
  const next = new URLSearchParams(base.toString());
  const setList = (key: string, items: string[]) => {
    if (items.length === 0) next.delete(key);
    else next.set(key, items.map(encodeURIComponent).join(","));
  };
  setList("disc", state.disciplines);
  setList("zone", state.zones);
  setList("status", state.statuses);
  if (state.from) next.set("from", state.from);
  else next.delete("from");
  if (state.to) next.set("to", state.to);
  else next.delete("to");
  return next;
}

// ---------------------------------------------------------------------------
// Task status / window
// ---------------------------------------------------------------------------

interface LookaheadTaskLike {
  id: string;
  wbs_node_id: string | null;
  status: string;
  delay_status: string | null;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  discipline: string | null;
}

const IN_PROGRESS_STATUSES = new Set(["in_progress", "paused", "review", "submitted", "blocked"]);

/** null for cancelled / rejected (never shown). */
export function lookaheadStatus(t: LookaheadTaskLike, dataDate: string): LookaheadStatus | null {
  if (t.status === "cancelled" || t.status === "rejected") return null;
  if (t.status === "completed" || t.status === "closed") return "done";
  if (t.delay_status === "delayed" || (t.end_date && t.end_date < dataDate)) return "late";
  if (t.progress > 0 || IN_PROGRESS_STATUSES.has(t.status)) return "in_progress";
  return "not_started";
}

/** start_date <= to AND (end_date >= from OR end_date null). null start → false. ISO string compare. */
export function overlapsWindow(t: LookaheadTaskLike, from: string, to: string): boolean {
  if (!t.start_date) return false;
  if (t.start_date > to) return false;
  return t.end_date == null || t.end_date >= from;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

interface LookaheadNodeLike {
  id: string;
  parent_id: string | null;
  node_type: string;
  wbs_code: string;
  wbs_name: string;
  sort_order: number | null;
}

export interface LookaheadZoneOption {
  id: string;
  label: string;
  nodeType: string;
  depth: number;
}

const ZONE_TYPES = new Set(["building", "level", "phase"]);

/** Zones = nodes of type building | level | phase. options: in tree order (DFS by sort_order), depth = number of zone ancestors, label = wbs_name (fallback wbs_code). Only zones that have ≥1 task beneath them. zonesByTaskId: every zone ancestor of the task's node (incl. the node itself if a zone). Guard against parent cycles. */
export function buildLookaheadZones(
  nodes: LookaheadNodeLike[],
  tasks: LookaheadTaskLike[],
): { options: LookaheadZoneOption[]; zonesByTaskId: Map<string, Set<string>> } {
  const byId = new Map<string, LookaheadNodeLike>();
  for (const n of nodes) byId.set(n.id, n);

  /** Zone ids from `startId` up through its ancestors (cycle-safe), nearest first. */
  const zoneChain = (startId: string): string[] => {
    const chain: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = startId;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const n = byId.get(cur);
      if (!n) break;
      if (ZONE_TYPES.has(n.node_type)) chain.push(n.id);
      cur = n.parent_id;
    }
    return chain;
  };

  const zonesByTaskId = new Map<string, Set<string>>();
  const usedZones = new Set<string>();
  for (const t of tasks) {
    const set = new Set<string>(t.wbs_node_id ? zoneChain(t.wbs_node_id) : []);
    zonesByTaskId.set(t.id, set);
    for (const z of set) usedZones.add(z);
  }

  const cmp = (a: LookaheadNodeLike, b: LookaheadNodeLike) => {
    const so = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (so !== 0) return so;
    return a.wbs_code < b.wbs_code ? -1 : a.wbs_code > b.wbs_code ? 1 : 0;
  };

  const children = new Map<string, LookaheadNodeLike[]>();
  const roots: LookaheadNodeLike[] = [];
  for (const n of nodes) {
    if (n.parent_id && byId.has(n.parent_id) && n.parent_id !== n.id) {
      const list = children.get(n.parent_id) ?? [];
      list.push(n);
      children.set(n.parent_id, list);
    } else {
      roots.push(n);
    }
  }
  roots.sort(cmp);
  for (const list of children.values()) list.sort(cmp);

  const options: LookaheadZoneOption[] = [];
  const visited = new Set<string>();
  const walk = (start: LookaheadNodeLike) => {
    // iterative DFS, pre-order
    const stack: LookaheadNodeLike[] = [start];
    while (stack.length) {
      const n = stack.pop()!;
      if (visited.has(n.id)) continue;
      visited.add(n.id);
      if (ZONE_TYPES.has(n.node_type) && usedZones.has(n.id)) {
        const ancestors = zoneChain(n.id).length - 1;
        options.push({
          id: n.id,
          label: n.wbs_name || n.wbs_code,
          nodeType: n.node_type,
          depth: Math.max(0, ancestors),
        });
      }
      const kids = children.get(n.id);
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
  };
  for (const r of roots) walk(r);
  // Nodes only reachable through a parent cycle never appear under a root.
  for (const n of [...nodes].sort(cmp)) if (!visited.has(n.id)) walk(n);

  return { options, zonesByTaskId };
}

// ---------------------------------------------------------------------------
// Disciplines
// ---------------------------------------------------------------------------

function disciplineKey(t: LookaheadTaskLike): string {
  const d = t.discipline?.trim();
  return d ? d : UNASSIGNED_DISCIPLINE;
}

/** Distinct disciplines (trimmed; null/empty → UNASSIGNED_DISCIPLINE, label "Unassigned") with counts over the given tasks, sorted by label, Unassigned last. */
export function lookaheadDisciplineOptions(
  tasks: LookaheadTaskLike[],
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    const k = disciplineKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out = [...counts.entries()].map(([value, count]) => ({
    value,
    label: value === UNASSIGNED_DISCIPLINE ? "Unassigned" : value,
    count,
  }));
  out.sort((a, b) => {
    if (a.value === UNASSIGNED_DISCIPLINE) return 1;
    if (b.value === UNASSIGNED_DISCIPLINE) return -1;
    return a.label.localeCompare(b.label);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/**
 * windowTasks = overlap window AND status != null (done included), sorted start_date then task_code.
 * matched = windowTasks filtered by AND across types, OR within a type; done tasks are dropped
 * unless filters.statuses includes "done". windowTasks does not depend on the filters, so it
 * is a stable total for "N of M" and for option counts.
 */
export function applyLookaheadFilters<T extends LookaheadTaskLike>(
  tasks: T[],
  opts: {
    from: string;
    to: string;
    dataDate: string;
    filters: LookaheadFilters;
    zonesByTaskId: Map<string, Set<string>>;
  },
): { windowTasks: T[]; matched: T[] } {
  const { from, to, dataDate, filters, zonesByTaskId } = opts;

  const statusOf = new Map<string, LookaheadStatus>();
  const windowTasks = tasks.filter((t) => {
    if (!overlapsWindow(t, from, to)) return false;
    const s = lookaheadStatus(t, dataDate);
    if (s === null) return false;
    statusOf.set(t.id, s);
    return true;
  });

  windowTasks.sort((a, b) => {
    const sa = a.start_date ?? "";
    const sb = b.start_date ?? "";
    if (sa !== sb) return sa < sb ? -1 : 1;
    const ca = (a as { task_code?: string }).task_code ?? "";
    const cb = (b as { task_code?: string }).task_code ?? "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });

  const matched = windowTasks.filter((t) => {
    if (filters.disciplines.length > 0 && !filters.disciplines.includes(disciplineKey(t))) return false;
    if (filters.zones.length > 0) {
      const zs = zonesByTaskId.get(t.id);
      if (!zs || !filters.zones.some((z) => zs.has(z))) return false;
    }
    const s = statusOf.get(t.id);
    if (filters.statuses.length > 0) {
      if (!s || !filters.statuses.includes(s)) return false;
    } else if (s === "done") {
      return false;
    }
    return true;
  });

  return { windowTasks, matched };
}
