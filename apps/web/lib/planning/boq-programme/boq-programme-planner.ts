// Pure BOQ-driven programme planner (doc 24, phase 2). No I/O. Turns approved BOQ lines into a preview of tasks:
//   line --(location map: allocateLine)--> level node(s) --(work item links, share %)--> master activity
// One task per (master x level node). Per line part: quantity, amount and man-hours accumulate on that task, and every
// contribution is kept as a traceability row.
//
// Duration:   labour hours / (crew x hours per day), rounded up, at least 1 working day.
//             No labour hours: ceil(sum of quantity x days-per-unit of the links). Neither: 1 day (confidence low).
//             Clamped to [min %, max %] of the project duration when all three are known.
// Hours:      per resource = quantity part x per-unit consumption; hr / hour count as is, day counts x hours per day;
//             other units are not time (warning labour_not_time for labour) and add nothing.
// Value:      each line's amount is split over its contributions in whole cents (largest remainder), so the task budgets
//             always add up to the amount the line drives.
// Existing:   a task of the same master that sits on (or under) the node is updated; started tasks (progress > 0) and
//             tasks under a locked node are never changed.
// Logic:      for NEW tasks only: master logic rules inside one node, and floor-to-floor finish-to-start between the same
//             master on consecutive floors (nearest earlier floor that has the master). Loops are refused with wouldCycle.

import { allocateLine, type SavedLocation, type WbsLevel } from "../activity-library/location-map";
import { wouldCycle, type DepType, type EngineDep } from "../schedule-engine";

// ---------------------------------------------------------------- input

export type LineSource = "tender" | "contract";

export interface PlannerLine {
  id: string;
  source: LineSource;
  qty: number;
  amount: number;
  workItemId: string | null;
  building: string | null;
  level: string | null;
  itemCode: string;
  description: string;
  unit?: string | null;
}

export interface LinkFact { masterId: string; sharePct: number; daysPerUnit: number | null }

export interface ResourceFact {
  resourceId: string;
  name: string;
  kind: "labor" | "equipment";
  unit: string | null;
  /** hours (or days) per unit of the BOQ item */
  perUnit: number;
}

export interface MasterFact {
  code: string;
  visibleCode: string | null;
  name: string;
  csiDivision: string | null;
  unit: string | null;
  crewSize: number | null;
  hoursPerDay: number | null;
  minPct: number | null;
  maxPct: number | null;
}

export interface ExistingTask {
  id: string;
  nodeId: string;
  /** Nearest ancestor (or the node itself) that is a location node. */
  floorNodeId: string | null;
  masterId: string | null;
  name: string;
  progress: number;
  /** Has actual dates / a start stamp even though progress is 0 (the commit treats it as started too). */
  started?: boolean;
  locked: boolean;
  sortOrder: number;
  durationDays?: number | null;
  budgetCost?: number | null;
}

export interface LogicRuleFact { predMasterId: string; succMasterId: string; relation: DepType | string; lagDays: number }

export interface PlannerInput {
  lines: readonly PlannerLine[];
  locations: readonly SavedLocation[];
  levels: readonly WbsLevel[];
  gfaByNode: ReadonlyMap<string, number>;
  linksByWorkItem: ReadonlyMap<string, readonly LinkFact[]>;
  resourcesByWorkItem: ReadonlyMap<string, readonly ResourceFact[]>;
  masters: ReadonlyMap<string, MasterFact>;
  existingTasks: readonly ExistingTask[];
  /** Ids of tasks that currently hold plan_task_boq_lines rows. */
  existingBoqTaskIds?: readonly string[];
  logicRules: readonly LogicRuleFact[];
  /** Location node ids in building order, basements first, roof last. */
  floorOrder: readonly string[];
  /** Building code of each location node; floor-to-floor logic only chains floors of the same building. */
  nodeBuilding?: ReadonlyMap<string, string | null>;
  /** Nodes that are effectively locked (the node or an ancestor). Empty for a WBS manager, who may edit locked nodes. */
  lockedNodes?: ReadonlySet<string>;
  projectDurationDays?: number | null;
  /** Workers per crew when the master has none. Default 4. */
  defaultCrew?: number;
}

// ---------------------------------------------------------------- output

export type PlanAction = "create" | "update" | "skip_started" | "skip_locked";
export type Confidence = "high" | "review" | "low";
export type DurationBasis = "labour" | "days_per_unit" | "none";

export type WarningCode = "line_unmapped" | "item_unlinked" | "no_labour" | "labour_not_time" | "line_unlocated" | "no_crew" | "clamped" | "equipment_not_time";

export interface PlanWarning { code: WarningCode; lineId?: string; taskKey?: string; message: string }

export interface PlannedBoqLine {
  lineId: string;
  source: LineSource;
  /** Part of the line this task takes, in percent (location share x link share). */
  sharePct: number;
  quantity: number;
  amount: number;
}

export interface PlannedResourceHours { resourceId: string; name: string; kind: "labor" | "equipment"; hours: number }

export interface PlannedPredecessor { key: string | null; taskId: string | null; type: DepType; lagDays: number }

export interface PlannedTask {
  /** masterId|nodeId */
  key: string;
  masterId: string;
  masterCode: string;
  visibleCode: string | null;
  nodeId: string;
  name: string;
  unit: string | null;
  quantity: number;
  budget: number;
  durationDays: number;
  basis: DurationBasis;
  labourHours: number;
  crewSize: number;
  hoursPerDay: number;
  clamped: boolean;
  confidence: Confidence;
  action: PlanAction;
  existingTaskId: string | null;
  /** Other existing tasks of the same master on the same node (not touched). */
  alsoMapped: string[];
  /** update only: duration and budget already equal. */
  unchanged: boolean;
  boqLines: PlannedBoqLine[];
  resourceHours: PlannedResourceHours[];
  /** NEW tasks only. */
  predecessors: PlannedPredecessor[];
  warnings: WarningCode[];
}

export interface PlanTotals {
  linesTotal: number;
  linesUsed: number;
  valueTotal: number;
  /** Sum of the amounts the tasks carry; equals the sum of all boqLines amounts. */
  valueDriven: number;
  /** Amounts on tasks that are skipped (started / locked), so valueDriven + valueSkipped is what the lines carry. */
  valueSkipped: number;
  /** Labour + equipment hours on skipped tasks. */
  hoursSkipped: number;
  laborHours: number;
  equipmentHours: number;
  hoursByResource: PlannedResourceHours[];
  counts: { create: number; update: number; unchanged: number; skip_started: number; skip_locked: number; clear: number };
}

export interface BoqProgrammePreview {
  tasks: PlannedTask[];
  /** Existing tasks that hold BOQ links but receive nothing now (never started or locked ones). */
  clear: string[];
  warnings: PlanWarning[];
  totals: PlanTotals;
}

// ---------------------------------------------------------------- helpers

const DEFAULT_CREW = 4;
const DEFAULT_HOURS_PER_DAY = 8;
const HOUR_UNITS = new Set(["hr", "hrs", "hour", "hours", "h", "mh", "man-hour", "man-hours", "manhour", "manhours", "man hour", "man hours"]);
const DAY_UNITS = new Set(["day", "days", "manday", "man-day", "md"]);
const WEEK_UNITS = new Set(["week", "weeks", "wk"]);
const MONTH_UNITS = new Set(["month", "months", "mth", "mo"]);

/** Hours for one unit of consumption, or null when the unit is not a time unit. */
export function hoursPerConsumptionUnit(unit: string | null | undefined, hoursPerDay: number): number | null {
  const u = (unit ?? "").trim().toLowerCase();
  if (HOUR_UNITS.has(u)) return 1;
  if (DAY_UNITS.has(u)) return hoursPerDay;
  if (WEEK_UNITS.has(u)) return hoursPerDay * 6; // Mon-Sat week
  if (MONTH_UNITS.has(u)) return hoursPerDay * 26; // 26 working days
  return null;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
/** Whole cents, decimal-safe against 1.005-style representation errors. */
const toCents = (n: number) => Math.round((n + Number.EPSILON) * 100);
const round2 = (n: number) => toCents(n) / 100;

/** Splits `totalCents` over the weights with the largest-remainder method (sums exactly). */
function splitCents(totalCents: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (sum <= 0 || totalCents === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalCents * w) / sum);
  const out = raw.map(Math.floor);
  let left = totalCents - out.reduce((s, v) => s + v, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k].i]++;
  return out;
}

interface Contribution {
  line: PlannerLine;
  link: LinkFact;
  nodeId: string;
  /** share of the line this contribution takes (0..1) */
  frac: number;
  amountCents: number;
}

interface Acc {
  key: string;
  masterId: string;
  nodeId: string;
  contributions: Contribution[];
  quantity: number;
  /** resourceId -> hours */
  hours: Map<string, { name: string; kind: "labor" | "equipment"; hours: number }>;
  daysTotal: number;
  notTimeLabour: boolean;
  notTimeEquipment: boolean;
}

const isStarted = (t: Pick<ExistingTask, "progress" | "started">): boolean => t.progress > 0 || !!t.started;

const asDepType = (r: string): DepType => (["fs", "ss", "ff", "sf"].includes(r.toLowerCase()) ? (r.toLowerCase() as DepType) : "fs");

// ---------------------------------------------------------------- planner

export function planBoqProgramme(input: PlannerInput): BoqProgrammePreview {
  const warnings: PlanWarning[] = [];
  const defaultCrew = input.defaultCrew ?? DEFAULT_CREW;
  const levels = [...input.levels];
  const locations = [...input.locations];
  const accs = new Map<string, Acc>();
  const usedLines = new Set<string>();
  const nodeRank = new Map(input.floorOrder.map((id, i) => [id, i]));

  // 1. lines -> contributions per (master x node)
  const planned: { line: PlannerLine; link: LinkFact; nodeId: string; frac: number }[][] = [];
  for (const line of input.lines) {
    if (!line.workItemId) {
      warnings.push({ code: "line_unmapped", lineId: line.id, message: `${line.itemCode}: not mapped to a BOQ item` });
      continue;
    }
    const links = (input.linksByWorkItem.get(line.workItemId) ?? []).filter((l) => l.sharePct > 0 && input.masters.has(l.masterId));
    if (!links.length) {
      warnings.push({ code: "item_unlinked", lineId: line.id, message: `${line.itemCode}: its BOQ item is not linked to an activity` });
      continue;
    }
    const shares = allocateLine({ building_code: line.building, level: line.level }, locations, levels, new Map(input.gfaByNode));
    if (!shares.length) {
      warnings.push({ code: "line_unlocated", lineId: line.id, message: `${line.itemCode}: ${line.building ?? ""} / ${line.level ?? ""} is not on the location map` });
      continue;
    }
    const parts: { line: PlannerLine; link: LinkFact; nodeId: string; frac: number }[] = [];
    for (const s of shares) for (const link of links) parts.push({ line, link, nodeId: s.wbs_node_id, frac: s.share * (link.sharePct / 100) });
    planned.push(parts);
  }

  for (const parts of planned) {
    const line = parts[0].line;
    usedLines.add(line.id);
    const F = parts.reduce((s, p) => s + p.frac, 0);
    const totalCents = Math.round((line.amount * Math.min(1, F) + Number.EPSILON) * 100);
    const cents = splitCents(totalCents, parts.map((p) => p.frac));
    parts.forEach((p, i) => {
      const key = `${p.link.masterId}|${p.nodeId}`;
      let acc = accs.get(key);
      if (!acc) {
        acc = { key, masterId: p.link.masterId, nodeId: p.nodeId, contributions: [], quantity: 0, hours: new Map(), daysTotal: 0, notTimeLabour: false, notTimeEquipment: false };
        accs.set(key, acc);
      }
      const master = input.masters.get(p.link.masterId)!;
      const qtyPart = line.qty * p.frac;
      acc.contributions.push({ line, link: p.link, nodeId: p.nodeId, frac: p.frac, amountCents: cents[i] });
      acc.quantity += qtyPart;
      if (p.link.daysPerUnit != null) acc.daysTotal += qtyPart * p.link.daysPerUnit;
      const hpd = master.hoursPerDay ?? DEFAULT_HOURS_PER_DAY;
      for (const r of input.resourcesByWorkItem.get(line.workItemId!) ?? []) {
        const factor = hoursPerConsumptionUnit(r.unit, hpd);
        if (factor === null) { if (r.kind === "labor") acc.notTimeLabour = true; else acc.notTimeEquipment = true; continue; }
        const cur = acc.hours.get(r.resourceId) ?? { name: r.name, kind: r.kind, hours: 0 };
        cur.hours += qtyPart * r.perUnit * factor;
        acc.hours.set(r.resourceId, cur);
      }
    });
  }

  // 2. existing task matching
  const existingByMaster = new Map<string, ExistingTask[]>();
  for (const t of input.existingTasks) if (t.masterId) existingByMaster.set(t.masterId, [...(existingByMaster.get(t.masterId) ?? []), t]);
  const touched = new Set<string>();

  const tasks: PlannedTask[] = [];
  for (const acc of accs.values()) {
    const master = input.masters.get(acc.masterId)!;
    const hpd = master.hoursPerDay ?? DEFAULT_HOURS_PER_DAY;
    const crewKnown = master.crewSize != null && master.crewSize > 0;
    const crew = crewKnown ? (master.crewSize as number) : defaultCrew;
    const taskWarnings: WarningCode[] = [];
    const warn = (code: WarningCode, message: string) => { taskWarnings.push(code); warnings.push({ code, taskKey: acc.key, message }); };

    const labourHours = [...acc.hours.values()].filter((h) => h.kind === "labor").reduce((s, h) => s + h.hours, 0);
    let basis: DurationBasis;
    let duration: number;
    if (labourHours > 0) {
      basis = "labour";
      duration = Math.max(1, Math.ceil(round4(labourHours / (crew * hpd))));
      if (!crewKnown) warn("no_crew", `${master.name}: no crew size on the activity, ${defaultCrew} used`);
    } else if (acc.daysTotal > 0) {
      basis = "days_per_unit";
      duration = Math.max(1, Math.ceil(round4(acc.daysTotal)));
      warn("no_labour", `${master.name}: no time-based labour hours, duration from days per unit`);
    } else {
      basis = "none";
      duration = 1;
      warn("no_labour", `${master.name}: no labour hours and no days per unit, 1 day assumed`);
    }
    if (acc.notTimeLabour) warn("labour_not_time", `${master.name}: some labour is not in hours, days, weeks or months and was left out`);
    if (acc.notTimeEquipment) warn("equipment_not_time", `${master.name}: some equipment is not in hours, days, weeks or months and was left out`);

    let clamped = false;
    const P = input.projectDurationDays;
    if (P && master.minPct != null && master.maxPct != null) {
      const lo = Math.max(1, Math.ceil((master.minPct / 100) * P));
      const hi = Math.max(lo, Math.floor((master.maxPct / 100) * P));
      const c = Math.min(hi, Math.max(lo, duration));
      if (c !== duration) { clamped = true; duration = c; warn("clamped", `${master.name}: duration limited to ${duration} days by its min/max % of the project`); }
    }

    const budgetCents = acc.contributions.reduce((s, c) => s + c.amountCents, 0);
    const budget = budgetCents / 100;
    const confidence: Confidence = basis === "none" ? "low" : basis === "labour" && crewKnown ? "high" : "review";

    // existing match: same master, on the node or under it
    const candidates = (existingByMaster.get(acc.masterId) ?? [])
      .filter((t) => t.floorNodeId === acc.nodeId || t.nodeId === acc.nodeId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const match = candidates[0] ?? null;
    let action: PlanAction = "create";
    if (!match && input.lockedNodes?.has(acc.nodeId)) action = "skip_locked";
    if (match) {
      touched.add(match.id);
      action = match.locked ? "skip_locked" : isStarted(match) ? "skip_started" : "update";
    }
    const unchanged = !!match && action === "update" && match.durationDays === duration && match.budgetCost != null && Math.abs(Number(match.budgetCost) - budget) < 0.005;

    const resourceHours: PlannedResourceHours[] = [...acc.hours.entries()]
      .map(([resourceId, h]) => ({ resourceId, name: h.name, kind: h.kind, hours: round4(h.hours) }))
      .filter((h) => h.hours > 0)
      .sort((a, b) => a.name.localeCompare(b.name));

    tasks.push({
      key: acc.key, masterId: acc.masterId, masterCode: master.code, visibleCode: master.visibleCode, nodeId: acc.nodeId,
      name: master.name, unit: master.unit ?? acc.contributions.find((c) => c.line.unit)?.line.unit ?? null,
      quantity: round4(acc.quantity), budget, durationDays: duration, basis, labourHours: round4(labourHours), crewSize: crew, hoursPerDay: hpd,
      clamped, confidence, action, existingTaskId: match?.id ?? null, alsoMapped: candidates.slice(1).map((t) => t.id), unchanged,
      boqLines: acc.contributions.map((c) => ({
        lineId: c.line.id, source: c.line.source, sharePct: round4(c.frac * 100), quantity: round4(c.line.qty * c.frac), amount: c.amountCents / 100,
      })),
      resourceHours, predecessors: [], warnings: taskWarnings,
    });
  }

  tasks.sort((a, b) =>
    (nodeRank.get(a.nodeId) ?? 9999) - (nodeRank.get(b.nodeId) ?? 9999) || a.nodeId.localeCompare(b.nodeId) || a.masterCode.localeCompare(b.masterCode));

  addLogic(tasks, input);

  // 3. clear: tasks with BOQ links that receive nothing now (never started / locked ones)
  const byId = new Map(input.existingTasks.map((t) => [t.id, t]));
  const clear = (input.existingBoqTaskIds ?? []).filter((id) => {
    if (touched.has(id)) return false;
    const t = byId.get(id);
    return !t || (!t.locked && !isStarted(t));
  });

  // 4. totals: value and hours count the tasks that will be written (create + update); skipped ones are reported apart
  const written = tasks.filter((t) => t.action === "create" || t.action === "update");
  const skipped = tasks.filter((t) => t.action === "skip_started" || t.action === "skip_locked");
  const hoursByRes = new Map<string, PlannedResourceHours>();
  for (const t of written) for (const h of t.resourceHours) {
    const cur = hoursByRes.get(h.resourceId) ?? { ...h, hours: 0 };
    cur.hours = round4(cur.hours + h.hours);
    hoursByRes.set(h.resourceId, cur);
  }
  const hoursByResource = [...hoursByRes.values()].sort((a, b) => b.hours - a.hours);
  const counts = { create: 0, update: 0, unchanged: 0, skip_started: 0, skip_locked: 0, clear: clear.length };
  for (const t of tasks) { counts[t.action]++; if (t.unchanged) counts.unchanged++; }
  const centsOf = (list: PlannedTask[]) => list.reduce((s, t) => s + t.boqLines.reduce((x, l) => x + toCents(l.amount), 0), 0);
  const hoursOf = (list: PlannedTask[]) => round4(list.reduce((s, t) => s + t.resourceHours.reduce((x, h) => x + h.hours, 0), 0));

  return {
    tasks, clear, warnings,
    totals: {
      linesTotal: input.lines.length,
      linesUsed: usedLines.size,
      valueTotal: round2(input.lines.reduce((s, l) => s + l.amount, 0)),
      valueDriven: centsOf(written) / 100,
      valueSkipped: centsOf(skipped) / 100,
      hoursSkipped: hoursOf(skipped),
      laborHours: round4(hoursByResource.filter((h) => h.kind === "labor").reduce((s, h) => s + h.hours, 0)),
      equipmentHours: round4(hoursByResource.filter((h) => h.kind === "equipment").reduce((s, h) => s + h.hours, 0)),
      hoursByResource,
      counts,
    },
  };
}

// ---------------------------------------------------------------- logic for new tasks

function addLogic(tasks: PlannedTask[], input: PlannerInput): void {
  const deps = new Map<string, EngineDep[]>();
  const has = (succKey: string, predKey: string) => (deps.get(succKey) ?? []).some((d) => d.predId === predKey);

  const link = (pred: PlannedTask, succ: PlannedTask, type: DepType, lagDays: number): void => {
    if (succ.action !== "create" || pred.key === succ.key || has(succ.key, pred.key)) return;
    if (pred.action === "skip_locked" && !pred.existingTaskId) return; // a locked new task is not written, nothing to point at
    if (wouldCycle(pred.key, succ.key, deps)) return;
    deps.set(succ.key, [...(deps.get(succ.key) ?? []), { predId: pred.key, type, lag: lagDays }]);
    succ.predecessors.push({
      key: pred.existingTaskId ? null : pred.key,
      taskId: pred.existingTaskId,
      type, lagDays,
    });
  };

  // master logic inside one node
  const byNode = new Map<string, PlannedTask[]>();
  for (const t of tasks) byNode.set(t.nodeId, [...(byNode.get(t.nodeId) ?? []), t]);
  for (const list of byNode.values()) {
    const byMaster = new Map(list.map((t) => [t.masterId, t]));
    for (const rule of input.logicRules) {
      const pred = byMaster.get(rule.predMasterId);
      const succ = byMaster.get(rule.succMasterId);
      if (pred && succ) link(pred, succ, asDepType(String(rule.relation)), Number(rule.lagDays) || 0);
    }
  }

  // same master on consecutive floors: finish-to-start from the nearest earlier floor that has it
  const rank = new Map(input.floorOrder.map((id, i) => [id, i]));
  const byMasterFloors = new Map<string, PlannedTask[]>();
  for (const t of tasks) {
    if (!rank.has(t.nodeId)) continue;
    // chains never cross buildings
    const k = `${t.masterId}|${(input.nodeBuilding?.get(t.nodeId) ?? "").toUpperCase()}`;
    byMasterFloors.set(k, [...(byMasterFloors.get(k) ?? []), t]);
  }
  for (const list of byMasterFloors.values()) {
    list.sort((a, b) => (rank.get(a.nodeId) as number) - (rank.get(b.nodeId) as number));
    for (let i = 1; i < list.length; i++) link(list[i - 1], list[i], "fs", 0);
  }
}
