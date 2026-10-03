// WBS Templates: a reusable full project WBS (nodes + activities) that is COPIED into a project.
// Pure logic (no database). Data access: lib/project/wbs/wbs-template-queries.ts.
// Schema / copy rules: supabase/migrations/20261003000004_wbs_templates.sql.
//
// A template has fixed `sections` (Design, Procurement, ...) and per-floor `floor_blocks`, one per
// level type. When applied, every level of every building gets the block for its level type
// (fallback: typical). Keys are dotted chains of wbs_codes, the same keys import_master_wbs uses.

import { z } from "zod";
import { inferLevelType, type LevelItem, type LevelType } from "@/lib/level-library";

export const FLOOR_BLOCK_TYPES = ["basement", "ground", "typical", "roof"] as const;
export type FloorBlockType = (typeof FLOOR_BLOCK_TYPES)[number];

export const FLOOR_BLOCK_LABELS: Record<FloorBlockType, string> = {
  basement: "Basement floors",
  ground: "Ground floor",
  typical: "Typical floors",
  roof: "Roof",
};

const predSchema = z.object({
  key: z.string(),
  /** sections = a fixed-section task; same = same floor; prev_floor = the floor below. */
  scope: z.enum(["sections", "same", "prev_floor"]),
  type: z.enum(["fs", "ss", "ff", "sf"]).default("fs"),
  lag: z.number().default(0),
});

const nodeSchema = z.object({
  key: z.string().min(1),
  parent_key: z.string(),
  node_type: z.string().min(1),
  wbs_code: z.string().min(1),
  wbs_name: z.string().min(1),
  discipline: z.string().nullable().default(null),
  cost_code: z.string().nullable().default(null),
  is_external_works: z.boolean().default(false),
  schedule_level: z.number().nullable().default(null),
  sort_order: z.number().default(0),
});

const taskSchema = z.object({
  key: z.string().min(1),
  node_key: z.string(),
  task_name: z.string().min(1),
  task_type: z.string().default("activity"),
  activity_type: z.string().default("normal"),
  is_milestone: z.boolean().default(false),
  discipline: z.string().nullable().default(null),
  cost_code: z.string().nullable().default(null),
  duration_days: z.number().nullable().default(null),
  description: z.string().nullable().default(null),
  schedule_level: z.number().nullable().default(null),
  sort_order: z.number().default(0),
  predecessors: z.array(predSchema).default([]),
});

const partSchema = z.object({ nodes: z.array(nodeSchema), tasks: z.array(taskSchema) });

export const wbsTemplateDocSchema = z.object({
  schema: z.literal(1),
  sections: partSchema,
  /** Key of the section node buildings are created under; null = project root. */
  building_anchor_key: z.string().nullable(),
  floor_blocks: z.object({
    basement: partSchema.optional(),
    ground: partSchema.optional(),
    typical: partSchema.optional(),
    roof: partSchema.optional(),
  }),
});

export type TplPred = z.infer<typeof predSchema>;
export type TplNode = z.infer<typeof nodeSchema>;
export type TplTask = z.infer<typeof taskSchema>;
export type TplPart = z.infer<typeof partSchema>;
export type WbsTemplateDoc = z.infer<typeof wbsTemplateDocSchema>;

export const emptyPart = (): TplPart => ({ nodes: [], tasks: [] });
export const emptyWbsTemplateDoc = (): WbsTemplateDoc => ({
  schema: 1, sections: emptyPart(), building_anchor_key: null, floor_blocks: {},
});

/** Parses stored content; invalid or empty content yields an empty document. */
export function parseWbsTemplateDoc(content: unknown): WbsTemplateDoc {
  const r = wbsTemplateDocSchema.safeParse(content);
  return r.success ? r.data : emptyWbsTemplateDoc();
}

export const joinKey = (a: string | null | undefined, b: string | null | undefined) =>
  a ? (b ? `${a}.${b}` : a) : (b ?? "");

/** Which block a level gets: its own type's block, else the typical block. */
export function floorBlockTypeFor(levelType: LevelType): FloorBlockType {
  if (levelType === "basement" || levelType === "ground" || levelType === "roof") return levelType;
  return "typical";
}

export function blockForLevel(doc: WbsTemplateDoc, levelType: LevelType): TplPart | null {
  return doc.floor_blocks[floorBlockTypeFor(levelType)] ?? doc.floor_blocks.typical ?? null;
}

export function templateStats(doc: WbsTemplateDoc) {
  const blocks = FLOOR_BLOCK_TYPES.filter((t) => doc.floor_blocks[t]).map((t) => ({
    type: t,
    nodes: doc.floor_blocks[t]!.nodes.length,
    tasks: doc.floor_blocks[t]!.tasks.length,
  }));
  return { sectionNodes: doc.sections.nodes.length, sectionTasks: doc.sections.tasks.length, blocks };
}

// ── Expansion: template → import_master_wbs payload ─────────────────────────

export interface ApplyLevel extends LevelItem {
  /** Already a level under this building: not re-created and its attributes are not changed. */
  existing?: boolean;
  source_level_template_id?: string | null;
}

export interface ApplyBuilding {
  code: string;
  name: string;
  /** Key of the node the building sits under; undefined = the template's anchor. */
  parentKey?: string | null;
  existing?: boolean;
  levels: ApplyLevel[];
}

export interface ImportNode {
  key: string; parent_key: string; node_type: string; wbs_code: string; outline_code: string; wbs_name: string;
  discipline: string | null; area_label: string | null; cost_code: string | null;
  is_below_ground: boolean; is_external_works: boolean; schedule_level: number | null; sort_order: number;
}

export interface ImportTask {
  ord: number; node_key: string; task_code: string; outline_code: string; task_name: string;
  task_type: string; activity_type: string; is_milestone: boolean; discipline: string | null;
  area_label: string | null; cost_code: string | null; start_date: null; end_date: null;
  duration_days: number | null; owner_name: null; description: string | null; dependency_text: null;
  schedule_level: number | null; sort_order: number; predecessors: { code: string; type: string; lag: number }[];
}

export interface LevelAttrs {
  key: string; level_type: LevelType; floor_height_m: number | null; typical_gfa_m2: number | null;
  source_level_template_id: string | null;
}

export interface ExpandedTemplate {
  payload: { nodes: ImportNode[]; tasks: ImportTask[] };
  levels: LevelAttrs[];
}

function toImportNode(n: TplNode, key: string, parentKey: string, extra: Partial<ImportNode> = {}): ImportNode {
  return {
    key, parent_key: parentKey, node_type: n.node_type, wbs_code: n.wbs_code, outline_code: key,
    wbs_name: n.wbs_name, discipline: n.discipline, area_label: null, cost_code: n.cost_code,
    is_below_ground: false, is_external_works: n.is_external_works, schedule_level: n.schedule_level,
    sort_order: n.sort_order, ...extra,
  };
}

/**
 * Expands a template for the given buildings into one import_master_wbs payload (merge mode skips
 * anything already in the project) plus the attributes for the level nodes it creates.
 */
export function expandWbsTemplate(doc: WbsTemplateDoc, buildings: ApplyBuilding[]): ExpandedTemplate {
  const nodes: ImportNode[] = [];
  const tasks: ImportTask[] = [];
  const levels: LevelAttrs[] = [];
  let ord = 0;

  const seenBuildings = new Set<string>();
  for (const b of buildings) {
    const code = b.code.trim().toUpperCase();
    if (!code) throw new Error("Every building needs a code.");
    if (seenBuildings.has(code)) throw new Error(`Building ${code} is listed twice.`);
    seenBuildings.add(code);
    const levelCodes = new Set<string>();
    for (const l of b.levels) {
      const lc = l.level_code.trim().toUpperCase();
      if (!lc) throw new Error(`Building ${code}: every level needs a code.`);
      if (levelCodes.has(lc)) throw new Error(`Building ${code}: level ${lc} is listed twice.`);
      levelCodes.add(lc);
    }
  }

  for (const n of doc.sections.nodes) nodes.push(toImportNode(n, n.key, n.parent_key));
  for (const t of doc.sections.tasks) {
    tasks.push(toImportTask(t, t.key, t.node_key, null, ++ord, (p) => (p.scope === "sections" ? p.key : null)));
  }

  buildings.forEach((b, bi) => {
    const bCode = b.code.trim().toUpperCase();
    const parentKey = b.parentKey === undefined ? (doc.building_anchor_key ?? "") : (b.parentKey ?? "");
    const bKey = joinKey(parentKey, bCode);
    if (!b.existing) {
      nodes.push({
        key: bKey, parent_key: parentKey, node_type: "building", wbs_code: bCode, outline_code: bKey,
        wbs_name: b.name.trim() || bCode, discipline: null, area_label: null, cost_code: null,
        is_below_ground: false, is_external_works: false, schedule_level: 2, sort_order: 100 + bi,
      });
    }

    let prevLevelKey: string | null = null;
    b.levels.forEach((l, li) => {
      const lCode = l.level_code.trim().toUpperCase();
      const lKey = joinKey(bKey, lCode);
      if (!l.existing) {
        nodes.push({
          key: lKey, parent_key: bKey, node_type: "level", wbs_code: lCode, outline_code: lKey,
          wbs_name: l.level_name.trim() || lCode, discipline: null, area_label: lCode, cost_code: null,
          is_below_ground: l.level_type === "basement", is_external_works: false, schedule_level: 3,
          sort_order: li + 1,
        });
        levels.push({
          key: lKey, level_type: l.level_type, floor_height_m: l.floor_height_m,
          typical_gfa_m2: l.typical_gfa_m2, source_level_template_id: l.source_level_template_id ?? null,
        });
      }

      const block = blockForLevel(doc, l.level_type);
      if (block) {
        for (const n of block.nodes) {
          nodes.push(toImportNode(n, joinKey(lKey, n.key), joinKey(lKey, n.parent_key), { area_label: lCode }));
        }
        const prev = prevLevelKey;
        for (const t of block.tasks) {
          tasks.push(toImportTask(t, joinKey(lKey, t.key), joinKey(lKey, t.node_key), lCode, ++ord, (p) => {
            if (p.scope === "sections") return p.key;
            if (p.scope === "same") return joinKey(lKey, p.key);
            return prev ? joinKey(prev, p.key) : null;
          }));
        }
      }
      prevLevelKey = lKey;
    });
  });

  return { payload: { nodes, tasks }, levels };
}

function toImportTask(
  t: TplTask, code: string, nodeKey: string, area: string | null, ord: number,
  resolve: (p: TplPred) => string | null,
): ImportTask {
  const predecessors = t.predecessors
    .map((p) => ({ code: resolve(p), type: p.type, lag: p.lag }))
    .filter((p): p is { code: string; type: TplPred["type"]; lag: number } => !!p.code);
  return {
    ord, node_key: nodeKey, task_code: code, outline_code: code, task_name: t.task_name,
    task_type: t.task_type, activity_type: t.activity_type, is_milestone: t.is_milestone,
    discipline: t.discipline, area_label: area, cost_code: t.cost_code, start_date: null, end_date: null,
    duration_days: t.duration_days, owner_name: null, description: t.description, dependency_text: null,
    schedule_level: t.schedule_level, sort_order: t.sort_order, predecessors,
  };
}

// ── Project WBS → template ──────────────────────────────────────────────────

export interface SrcNode {
  id: string; parent_id: string | null; node_type: string; wbs_code: string; wbs_name: string;
  discipline?: string | null; cost_code?: string | null; is_external_works?: boolean | null;
  schedule_level?: number | null; sort_order?: number | null;
}

export interface SrcTask {
  id: string; wbs_node_id: string | null; task_code?: string | null; task_name: string;
  task_type?: string | null; activity_type?: string | null; is_milestone?: boolean | null;
  discipline?: string | null; cost_code?: string | null; duration_days?: number | null;
  description?: string | null; schedule_level?: number | null; sort_order?: number | null;
  dependency_task_ids?: string[] | null; dependency_types?: string[] | null; dependency_lag_days?: number[] | null;
}

export interface ToTemplateOptions {
  /** The node whose children are the floors (it becomes "a building"); null = no floor blocks. */
  containerId: string | null;
  /** Floor node chosen as the source of each block. Other floors are treated as repeats. */
  blocks: Partial<Record<FloorBlockType, string>>;
}

export interface ToTemplateResult {
  doc: WbsTemplateDoc;
  droppedFloors: number;
  droppedTasks: number;
  droppedLinks: number;
}

const bySort = <T extends { sort_order?: number | null }>(a: T, b: T) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

/** Dotted code chain for every node (the key import_master_wbs uses). */
export function nodeKeys(nodes: Pick<SrcNode, "id" | "parent_id" | "wbs_code">[]): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const keys = new Map<string, string>();
  const keyOf = (id: string, guard = 0): string => {
    const hit = keys.get(id);
    if (hit !== undefined) return hit;
    const n = byId.get(id);
    if (!n || guard > 64) return "";
    const k = n.parent_id && byId.has(n.parent_id) ? joinKey(keyOf(n.parent_id, guard + 1), n.wbs_code) : n.wbs_code;
    keys.set(id, k);
    return k;
  };
  for (const n of nodes) keyOf(n.id);
  return keys;
}

export function projectWbsToTemplate(src: { nodes: SrcNode[]; tasks: SrcTask[] }, opts: ToTemplateOptions): ToTemplateResult {
  const keys = nodeKeys(src.nodes);
  const children = new Map<string, SrcNode[]>();
  for (const n of src.nodes) {
    if (!n.parent_id) continue;
    const list = children.get(n.parent_id) ?? [];
    list.push(n);
    children.set(n.parent_id, list);
  }
  const container = opts.containerId ? src.nodes.find((n) => n.id === opts.containerId) ?? null : null;
  const floors = container ? [...(children.get(container.id) ?? [])].sort(bySort) : [];

  // Which part each node belongs to: "S" (sections), a floor id, or "X" (excluded).
  const part = new Map<string, string>();
  const mark = (id: string, value: string) => {
    part.set(id, value);
    for (const c of children.get(id) ?? []) mark(c.id, value);
  };
  for (const n of src.nodes) part.set(n.id, "S");
  if (container) {
    mark(container.id, "X");
    for (const f of floors) mark(f.id, f.id);
  }
  const floorKey = new Map(floors.map((f) => [f.id, keys.get(f.id) ?? ""]));
  const rel = (fullKey: string, base: string) => (fullKey === base ? "" : fullKey.slice(base.length + 1));

  // Task keys: node key + running number within the node (computed for every task, so links to
  // repeated floors can be expressed relative to that floor).
  const tasksByNode = new Map<string, SrcTask[]>();
  for (const t of src.tasks) {
    if (!t.wbs_node_id) continue;
    const list = tasksByNode.get(t.wbs_node_id) ?? [];
    list.push(t);
    tasksByNode.set(t.wbs_node_id, list);
  }
  const taskInfo = new Map<string, { part: string; key: string }>();
  for (const [nodeId, list] of tasksByNode) {
    const p = part.get(nodeId);
    if (!p) continue;
    const nodeKey = keys.get(nodeId) ?? "";
    const base = p === "S" || p === "X" ? null : floorKey.get(p) ?? "";
    [...list].sort((a, b) => bySort(a, b) || (a.task_code ?? "").localeCompare(b.task_code ?? "")).forEach((t, i) => {
      const seq = String(i + 1).padStart(2, "0");
      const nk = base === null ? nodeKey : rel(nodeKey, base);
      taskInfo.set(t.id, { part: p, key: joinKey(nk, seq) });
    });
  }

  const blockFloorIds = new Set(Object.values(opts.blocks).filter(Boolean) as string[]);
  const floorIndex = new Map(floors.map((f, i) => [f.id, i]));
  let droppedTasks = 0;
  let droppedLinks = 0;

  const toNode = (n: SrcNode, key: string, parentKey: string): TplNode => ({
    key, parent_key: parentKey, node_type: n.node_type, wbs_code: n.wbs_code, wbs_name: n.wbs_name,
    discipline: n.discipline ?? null, cost_code: n.cost_code ?? null, is_external_works: !!n.is_external_works,
    schedule_level: n.schedule_level ?? null, sort_order: n.sort_order ?? 0,
  });

  const toTask = (t: SrcTask, key: string, nodeKey: string, ownPart: string): TplTask => {
    const ids = t.dependency_task_ids ?? [];
    const predecessors: TplPred[] = [];
    ids.forEach((pid, i) => {
      const target = taskInfo.get(pid);
      const type = (["fs", "ss", "ff", "sf"].includes(t.dependency_types?.[i] ?? "") ? t.dependency_types![i] : "fs") as TplPred["type"];
      const lag = Number(t.dependency_lag_days?.[i] ?? 0) || 0;
      if (!target) { droppedLinks++; return; }
      if (target.part === "S") { predecessors.push({ key: target.key, scope: "sections", type, lag }); return; }
      if (ownPart !== "S" && target.part === ownPart) { predecessors.push({ key: target.key, scope: "same", type, lag }); return; }
      if (ownPart !== "S" && target.part !== "X" && floorIndex.get(target.part) === (floorIndex.get(ownPart) ?? -1) - 1) {
        predecessors.push({ key: target.key, scope: "prev_floor", type, lag });
        return;
      }
      droppedLinks++;
    });
    return {
      key, node_key: nodeKey, task_name: t.task_name, task_type: t.task_type ?? "activity",
      activity_type: t.activity_type ?? "normal", is_milestone: !!t.is_milestone, discipline: t.discipline ?? null,
      cost_code: t.cost_code ?? null, duration_days: t.duration_days != null ? Number(t.duration_days) : null,
      description: t.description ?? null, schedule_level: t.schedule_level ?? null, sort_order: t.sort_order ?? 0,
      predecessors,
    };
  };

  const doc = emptyWbsTemplateDoc();
  const parentKeyOf = (n: SrcNode) => (n.parent_id ? keys.get(n.parent_id) ?? "" : "");
  for (const n of [...src.nodes].sort(bySort)) {
    if (part.get(n.id) === "S") doc.sections.nodes.push(toNode(n, keys.get(n.id) ?? n.wbs_code, parentKeyOf(n)));
  }
  doc.building_anchor_key = container?.parent_id ? keys.get(container.parent_id) ?? null : null;

  for (const type of FLOOR_BLOCK_TYPES) {
    const floorId = opts.blocks[type];
    if (!floorId || floorKey.get(floorId) === undefined) continue;
    const base = floorKey.get(floorId)!;
    const block = emptyPart();
    for (const n of [...src.nodes].sort(bySort)) {
      if (part.get(n.id) !== floorId || n.id === floorId) continue;
      block.nodes.push(toNode(n, rel(keys.get(n.id) ?? "", base), n.parent_id === floorId ? "" : rel(parentKeyOf(n), base)));
    }
    doc.floor_blocks[type] = block;
  }

  for (const t of src.tasks) {
    const info = t.wbs_node_id ? taskInfo.get(t.id) : undefined;
    if (!info) { droppedTasks++; continue; }
    const nodeKeyFull = keys.get(t.wbs_node_id!) ?? "";
    if (info.part === "S") {
      doc.sections.tasks.push(toTask(t, info.key, nodeKeyFull, "S"));
    } else if (info.part !== "X" && blockFloorIds.has(info.part)) {
      for (const type of FLOOR_BLOCK_TYPES) {
        if (opts.blocks[type] !== info.part) continue;
        const nk = rel(nodeKeyFull, floorKey.get(info.part)!);
        doc.floor_blocks[type]!.tasks.push(toTask(t, info.key, nk, info.part));
      }
    } else {
      droppedTasks++;
    }
  }
  for (const p of [doc.sections, ...FLOOR_BLOCK_TYPES.map((t) => doc.floor_blocks[t]).filter(Boolean) as TplPart[]]) {
    p.nodes.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
    p.tasks.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }

  const droppedFloors = floors.filter((f) => !blockFloorIds.has(f.id)).length;
  return { doc, droppedFloors, droppedTasks, droppedLinks };
}

// ── Suggestions for the "pick floors" step ─────────────────────────────────

const LEVEL_TOKEN = /^(B\d+|LG|UG|GF|G\d*|M\d*|MZ|\d+F|L\d+|F\d+|PH\d*|RF|R\d*|RT|TF|ROOF)$/;

/** Level type of a floor-like node from its name/code ("B1 – BASEMENT", "GF", "1F", "RF – ROOF"), or null. */
export function floorTypeOf(n: Pick<SrcNode, "wbs_name" | "wbs_code" | "node_type">): LevelType | null {
  const name = n.wbs_name.toUpperCase();
  const token = name.split(/[\s–\-/:]+/)[0] ?? "";
  if (n.node_type === "level") return inferLevelType(token || n.wbs_code);
  if (/BASEMENT|UNDERGROUND/.test(name)) return "basement";
  if (/\bROOF\b/.test(name)) return "roof";
  if (/\bGROUND\b/.test(name)) return "ground";
  return LEVEL_TOKEN.test(token) ? inferLevelType(token) : null;
}

/** The node that looks most like a building (most floor-like children; at least 3). */
export function suggestContainer(nodes: SrcNode[]): string | null {
  const kids = new Map<string, SrcNode[]>();
  for (const n of nodes) if (n.parent_id) kids.set(n.parent_id, [...(kids.get(n.parent_id) ?? []), n]);
  let best: { id: string; score: number } | null = null;
  for (const [id, list] of kids) {
    const floorLike = list.filter((c) => floorTypeOf(c) !== null).length;
    if (floorLike < 3 || floorLike / list.length < 0.6) continue;
    if (!best || floorLike > best.score) best = { id, score: floorLike };
  }
  return best?.id ?? null;
}

/** First floor of each type becomes that block's source. */
export function suggestBlocks(floors: SrcNode[]): Partial<Record<FloorBlockType, string>> {
  const blocks: Partial<Record<FloorBlockType, string>> = {};
  for (const f of [...floors].sort(bySort)) {
    const t = floorTypeOf(f);
    if (!t) continue;
    const bt = floorBlockTypeFor(t);
    if (!blocks[bt]) blocks[bt] = f.id;
  }
  return blocks;
}

// ── Editing (admin template editor) ─────────────────────────────────────────
// Codes are never renamed (keys stay stable); names, types and activity fields are edited in place.

export type TemplatePartId = "sections" | FloorBlockType;

export function getPart(doc: WbsTemplateDoc, id: TemplatePartId): TplPart | undefined {
  return id === "sections" ? doc.sections : doc.floor_blocks[id];
}

function withPart(doc: WbsTemplateDoc, id: TemplatePartId, part: TplPart): WbsTemplateDoc {
  return id === "sections" ? { ...doc, sections: part } : { ...doc, floor_blocks: { ...doc.floor_blocks, [id]: part } };
}

const nextCode = (taken: string[]) => {
  let n = 1;
  const set = new Set(taken);
  while (set.has(String(n).padStart(2, "0"))) n++;
  return String(n).padStart(2, "0");
};

/** Adds a node under parentKey ("" = top of the part) with the next free 2-digit code. */
export function addTemplateNode(doc: WbsTemplateDoc, id: TemplatePartId, parentKey: string, name: string, nodeType = "task_group"): { doc: WbsTemplateDoc; key: string } {
  const part = getPart(doc, id) ?? emptyPart();
  const siblings = part.nodes.filter((n) => n.parent_key === parentKey);
  const code = nextCode(siblings.map((n) => n.wbs_code));
  const key = joinKey(parentKey, code);
  const node: TplNode = {
    key, parent_key: parentKey, node_type: nodeType, wbs_code: code, wbs_name: name, discipline: null,
    cost_code: null, is_external_works: false, schedule_level: null,
    sort_order: siblings.reduce((m, n) => Math.max(m, n.sort_order), 0) + 10,
  };
  return { doc: withPart(doc, id, { ...part, nodes: [...part.nodes, node] }), key };
}

const isUnder = (key: string, root: string) => key === root || key.startsWith(`${root}.`);

/** Removes a node, its sub-nodes and their activities, and every link to those activities. */
export function removeTemplateNode(doc: WbsTemplateDoc, id: TemplatePartId, key: string): WbsTemplateDoc {
  const part = getPart(doc, id);
  if (!part) return doc;
  const gone = new Set(part.tasks.filter((t) => isUnder(t.node_key, key)).map((t) => t.key));
  const next = withPart(doc, id, {
    nodes: part.nodes.filter((n) => !isUnder(n.key, key)),
    tasks: part.tasks.filter((t) => !gone.has(t.key)),
  });
  if (id === "sections" && key === doc.building_anchor_key) next.building_anchor_key = null;
  return dropLinks(next, id, gone);
}

/** Removes activities and every link to them. */
export function removeTemplateTask(doc: WbsTemplateDoc, id: TemplatePartId, key: string): WbsTemplateDoc {
  const part = getPart(doc, id);
  if (!part) return doc;
  return dropLinks(withPart(doc, id, { ...part, tasks: part.tasks.filter((t) => t.key !== key) }), id, new Set([key]));
}

function dropLinks(doc: WbsTemplateDoc, id: TemplatePartId, gone: Set<string>): WbsTemplateDoc {
  if (gone.size === 0) return doc;
  const clean = (p: TplPart, inPart: TemplatePartId): TplPart => ({
    ...p,
    tasks: p.tasks.map((t) => ({
      ...t,
      predecessors: t.predecessors.filter((pr) => {
        if (id === "sections") return !(pr.scope === "sections" && gone.has(pr.key));
        // A block activity is linked as "same" from its own block and "prev_floor" from any block.
        if (pr.scope === "same" && inPart === id) return !gone.has(pr.key);
        if (pr.scope === "prev_floor") return !gone.has(pr.key);
        return true;
      }),
    })),
  });
  const floor_blocks = { ...doc.floor_blocks };
  for (const t of FLOOR_BLOCK_TYPES) if (floor_blocks[t]) floor_blocks[t] = clean(floor_blocks[t]!, t);
  return { ...doc, sections: clean(doc.sections, "sections"), floor_blocks };
}

/** Moves a node up or down among its siblings. */
export function moveTemplateNode(doc: WbsTemplateDoc, id: TemplatePartId, key: string, dir: -1 | 1): WbsTemplateDoc {
  const part = getPart(doc, id);
  const node = part?.nodes.find((n) => n.key === key);
  if (!part || !node) return doc;
  const siblings = part.nodes.filter((n) => n.parent_key === node.parent_key).sort((a, b) => a.sort_order - b.sort_order);
  const i = siblings.findIndex((n) => n.key === key);
  const other = siblings[i + dir];
  if (!other) return doc;
  const swap = new Map([[node.key, other.sort_order], [other.key, node.sort_order === other.sort_order ? other.sort_order + dir : node.sort_order]]);
  return withPart(doc, id, { ...part, nodes: part.nodes.map((n) => (swap.has(n.key) ? { ...n, sort_order: swap.get(n.key)! } : n)) });
}

/** Adds an activity to a node ("" = directly on the floor, blocks only). */
export function addTemplateTask(doc: WbsTemplateDoc, id: TemplatePartId, nodeKey: string, name: string): WbsTemplateDoc {
  const part = getPart(doc, id) ?? emptyPart();
  const own = part.tasks.filter((t) => t.node_key === nodeKey);
  const code = nextCode(own.map((t) => t.key.slice(nodeKey ? nodeKey.length + 1 : 0)));
  const task: TplTask = {
    key: joinKey(nodeKey, code), node_key: nodeKey, task_name: name, task_type: "activity", activity_type: "normal",
    is_milestone: false, discipline: null, cost_code: null, duration_days: 1, description: null, schedule_level: null,
    sort_order: own.reduce((m, t) => Math.max(m, t.sort_order), 0) + 10, predecessors: [],
  };
  return withPart(doc, id, { ...part, tasks: [...part.tasks, task] });
}

export function updateTemplateNode(doc: WbsTemplateDoc, id: TemplatePartId, key: string, patch: Partial<Pick<TplNode, "wbs_name" | "node_type" | "discipline" | "cost_code">>): WbsTemplateDoc {
  const part = getPart(doc, id);
  if (!part) return doc;
  return withPart(doc, id, { ...part, nodes: part.nodes.map((n) => (n.key === key ? { ...n, ...patch } : n)) });
}

export function updateTemplateTask(doc: WbsTemplateDoc, id: TemplatePartId, key: string, patch: Partial<Omit<TplTask, "key" | "node_key">>): WbsTemplateDoc {
  const part = getPart(doc, id);
  if (!part) return doc;
  return withPart(doc, id, { ...part, tasks: part.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) });
}

/** Removes a whole floor block and links into it from other blocks. */
export function removeFloorBlock(doc: WbsTemplateDoc, type: FloorBlockType): WbsTemplateDoc {
  const block = doc.floor_blocks[type];
  const floor_blocks = { ...doc.floor_blocks };
  delete floor_blocks[type];
  return block ? dropLinks({ ...doc, floor_blocks }, type, new Set()) : doc;
}

// ── Selection (Apply dialog: tick / untick packages and activities) ─────────
// Stored as what is EXCLUDED, normalised so no excluded key sits under another excluded node.

export interface PartSelection {
  nodes: Set<string>;
  tasks: Set<string>;
}
export type TemplateSelection = Partial<Record<TemplatePartId, PartSelection>>;
export type CheckState = "on" | "off" | "partial";

export const emptyPartSelection = (): PartSelection => ({ nodes: new Set(), tasks: new Set() });

const under = (key: string, root: string) => root === "" || key === root || key.startsWith(`${root}.`);
const strictlyUnder = (key: string, root: string) => key !== root && (root === "" || key.startsWith(`${root}.`));

function excludedAncestor(sel: PartSelection, key: string): string | null {
  for (const n of sel.nodes) if (under(key, n)) return n;
  return null;
}

/** Node state: off (it or a parent is unticked), partial (something below is unticked), on. */
export function nodeCheckState(sel: PartSelection, key: string): CheckState {
  if (excludedAncestor(sel, key) !== null) return "off";
  for (const n of sel.nodes) if (strictlyUnder(n, key)) return "partial";
  for (const t of sel.tasks) if (strictlyUnder(t, key)) return "partial";
  return "on";
}

export function taskIncluded(sel: PartSelection, task: Pick<TplTask, "key" | "node_key">): boolean {
  return !sel.tasks.has(task.key) && (task.node_key === "" || excludedAncestor(sel, task.node_key) === null);
}

/** Ticks or unticks a package (with everything under it). Ticking under an unticked package re-ticks only this path. */
export function toggleNodeSelection(part: TplPart, sel: PartSelection, key: string, on: boolean): PartSelection {
  const nodes = new Set(sel.nodes);
  const tasks = new Set(sel.tasks);
  if (!on) {
    for (const n of [...nodes]) if (under(n, key)) nodes.delete(n);
    for (const t of [...tasks]) if (strictlyUnder(t, key)) tasks.delete(t);
    nodes.add(key);
    return { nodes, tasks };
  }
  const anc = excludedAncestor(sel, key);
  if (anc === null) {
    for (const n of [...nodes]) if (under(n, key)) nodes.delete(n);
    for (const t of [...tasks]) if (strictlyUnder(t, key)) tasks.delete(t);
    return { nodes, tasks };
  }
  // Re-tick the excluded ancestor, then untick everything beside the path down to `key`.
  nodes.delete(anc);
  let cur = anc;
  while (cur !== key) {
    const next = part.nodes.find((n) => n.parent_key === cur && under(key, n.key));
    if (!next) break;
    for (const s of part.nodes) if (s.parent_key === cur && s.key !== next.key) nodes.add(s.key);
    for (const t of part.tasks) if (t.node_key === cur) tasks.add(t.key);
    cur = next.key;
  }
  return { nodes, tasks };
}

/** Ticks or unticks one activity (ticking one under an unticked package re-ticks only that activity). */
export function toggleTaskSelection(part: TplPart, sel: PartSelection, task: Pick<TplTask, "key" | "node_key">, on: boolean): PartSelection {
  if (!on) return { nodes: new Set(sel.nodes), tasks: new Set([...sel.tasks, task.key]) };
  let next = sel;
  if (task.node_key !== "" && excludedAncestor(sel, task.node_key) !== null) {
    next = toggleNodeSelection(part, sel, task.node_key, true);
    for (const t of part.tasks) if (t.node_key === task.node_key && t.key !== task.key) next.tasks.add(t.key);
  }
  const tasks = new Set(next.tasks);
  tasks.delete(task.key);
  return { nodes: new Set(next.nodes), tasks };
}

/** The template minus everything unticked; links to unticked activities are dropped and counted. */
export function applyTemplateSelection(doc: WbsTemplateDoc, selection: TemplateSelection): { doc: WbsTemplateDoc; droppedLinks: number } {
  const linkCount = (d: WbsTemplateDoc) => [d.sections, ...FLOOR_BLOCK_TYPES.map((t) => d.floor_blocks[t])]
    .reduce((s, p) => s + (p?.tasks.reduce((n, t) => n + t.predecessors.length, 0) ?? 0), 0);
  let out = doc;
  let removedOwnLinks = 0;
  for (const id of ["sections", ...FLOOR_BLOCK_TYPES] as TemplatePartId[]) {
    const sel = selection[id];
    const part = getPart(doc, id);
    if (!sel || !part) continue;
    for (const t of part.tasks) if (!taskIncluded(sel, t)) removedOwnLinks += t.predecessors.length;
    for (const key of sel.nodes) {
      const anchor = out.building_anchor_key;
      out = removeTemplateNode(out, id, key);
      // Buildings would hang off a removed node: fall back to the project root.
      if (id === "sections" && anchor && under(anchor, key)) out = { ...out, building_anchor_key: null };
    }
    for (const key of sel.tasks) out = removeTemplateTask(out, id, key);
  }
  return { doc: out, droppedLinks: Math.max(0, linkCount(doc) - removedOwnLinks - linkCount(out)) };
}
