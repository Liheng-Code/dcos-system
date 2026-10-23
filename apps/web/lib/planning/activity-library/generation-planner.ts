// Schedule Generation planner: pure and deterministic. Takes the template recipe, the target WBS nodes and
// pre-resolved library/quantity inputs; returns the tasks, audit items and exception counts to commit.
// No database access here: lib/planning/activity-library/generation-service.ts loads inputs and commits the result.

import { adjustedProductivity, baseOutputPerDay, calculateDuration } from "./productivity-engine";
import { assessConfidence, type Confidence, type ExceptionReason } from "./confidence";
import type { ResolvedQuantity } from "./quantity-resolver";
import type {
  ActMaster, Relation, ActMethod, ActProductivityStandard, ActQuantityRule, ActTemplate, ActTemplateDependency, ActTemplateItem,
} from "./types";

export const GENERATION_ENGINE_VERSION = "1.0.0";

export interface TargetNode {
  id: string;
  wbs_code: string | null;
  wbs_name: string;
}

export interface MasterContext {
  master: Pick<ActMaster, "id" | "code" | "name" | "default_unit" | "discipline" | "version">;
  methods: ActMethod[];
  standards: ActProductivityStandard[];
  quantityRule: Pick<ActQuantityRule, "unit"> | null;
}

export interface PlannerInput {
  template: Pick<ActTemplate, "id" | "version">;
  items: ActTemplateItem[];
  dependencies: ActTemplateDependency[];
  nodes: TargetNode[];
  contexts: Record<string, MasterContext>; // by master id
  /** quantity per `${nodeId}|${masterId}`; absent = not resolved */
  quantities: Record<string, ResolvedQuantity>;
  existingTaskCodes: Set<string>;
  /**
   * `${nodeId}|${masterCode}` of activities the target node (or a package under it) already has from that
   * activity master, whatever their task code, e.g. from a WBS template. Those are skipped, not duplicated.
   */
  existingMasters?: Set<string>;
  templateApplicable: boolean;
  /** Link between consecutive levels: item `from_seq` of level N drives item `to_seq` of level N+1. */
  interLevel?: { from_seq: number; to_seq: number; relation: Relation; lag_days: number } | null;
  newId: () => string;
  /** sort_order of the first generated task; nodes/items are laid out after it */
  sortBase?: number;
}

export interface GeneratedTask {
  id: string;
  wbs_node_id: string;
  task_code: string;
  task_name: string;
  is_milestone: boolean;
  discipline: string | null;
  duration_days: number | null;
  sort_order: number;
  schedule_level: number | null;
  dependency_task_ids: string[];
  dependency_types: string[];
  dependency_lag_days: number[];
  activity_master_id: string;
  activity_method_id: string | null;
  confidence: Confidence;
}

export interface GeneratedItem {
  task_id: string;
  node_id: string;
  template_item_id: string;
  master_id: string;
  method_id: string | null;
  norm_id: string | null;
  confidence: Confidence;
  reasons: ExceptionReason[];
  quantity: number | null;
  unit: string | null;
  quantity_source: string | null;
  quantity_ref: string | null;
  base_rate: number | null;
  adjusted_rate: number | null;
  raw_days: number | null;
  duration_days: number | null;
  /** parallel crews the duration was calculated with (template item default) */
  crews: number;
}

export interface PlannerResult {
  tasks: GeneratedTask[];
  items: GeneratedItem[];
  /** reason "master" = the node already has an activity from this master under another code */
  skipped: { node_id: string; task_code: string; reason?: "master" }[];
  counts: { total: number; high: number; review: number; low: number; warnings: number };
  snapshot: {
    template: { id: string; version: number };
    masters: Record<string, { code: string; version: number }>;
    norms: Record<string, { code: string; version: number; status: string }>;
  };
}

/** Crews a template item plans with: its own figure when valid, else one crew. */
export function itemCrews(ti: Pick<ActTemplateItem, "crews">): number {
  const c = Number(ti.crews);
  return Number.isFinite(c) && c > 0 ? c : 1;
}

function pickStandard(ctx: MasterContext, methodId: string | null, normId: string | null): ActProductivityStandard | null {
  if (normId) return ctx.standards.find((s) => s.id === normId) ?? null;
  const pool = methodId ? ctx.standards.filter((s) => s.method_id === methodId) : ctx.standards.filter((s) => !s.method_id);
  const rank = (s: ActProductivityStandard) => (s.status === "approved" ? 0 : s.status === "draft" ? 1 : 2);
  // approved before draft; among equals the newest version (a calibrated v2 replaces v1 once approved)
  return [...pool].sort((a, b) => rank(a) - rank(b) || b.version - a.version)[0] ?? null;
}

export function planGeneration(input: PlannerInput): PlannerResult {
  const tasks: GeneratedTask[] = [];
  const items: GeneratedItem[] = [];
  const skipped: PlannerResult["skipped"] = [];
  const usedCodes = new Set(input.existingTaskCodes);
  const snapshot: PlannerResult["snapshot"] = { template: { id: input.template.id, version: input.template.version }, masters: {}, norms: {} };
  const templateItems = [...input.items].sort((a, b) => a.seq - b.seq);
  let order = input.sortBase ?? 0;
  let previousLevel: Map<number, GeneratedTask> | null = null;

  for (const node of input.nodes) {
    const taskByItem = new Map<string, GeneratedTask>();
    const taskBySeq = new Map<number, GeneratedTask>();
    const nodeCode = node.wbs_code || node.id.slice(0, 6);

    for (const ti of templateItems) {
      const ctx = input.contexts[ti.master_id];
      if (!ctx) continue; // master vanished: nothing sensible to generate
      snapshot.masters[ctx.master.id] = { code: ctx.master.code, version: ctx.master.version };

      let code = `${ctx.master.code}@${nodeCode}`;
      if (!input.existingTaskCodes.has(code) && input.existingMasters?.has(`${node.id}|${ctx.master.code}`)) {
        skipped.push({ node_id: node.id, task_code: code, reason: "master" });
        continue;
      }
      if (usedCodes.has(code)) {
        if (input.existingTaskCodes.has(code)) { skipped.push({ node_id: node.id, task_code: code }); continue; }
        let n = 2;
        while (usedCodes.has(`${code}#${n}`)) n++;
        code = `${code}#${n}`;
      }
      usedCodes.add(code);

      const defaultMethod = ctx.methods.find((m) => m.is_default) ?? null;
      const methodId = ti.method_id ?? defaultMethod?.id ?? null;
      const standard = pickStandard(ctx, methodId, ti.norm_id);
      if (standard) snapshot.norms[standard.id] = { code: standard.code, version: standard.version, status: standard.status };

      const qty = input.quantities[`${node.id}|${ti.master_id}`] ?? null;
      const quantityRequired = ctx.quantityRule != null;
      const hasQuantity = !quantityRequired || (qty?.quantity != null);

      let base: number | null = null;
      let adjusted: number | null = null;
      if (standard) {
        const crew = standard.resources.filter((r) => r.kind === "labor" && r.allocation_rule === "per_crew").reduce((a, r) => a + r.workers_per_crew, 0);
        base = baseOutputPerDay({
          output_per_day: standard.output_per_day, labour_constant_hr_per_unit: standard.labour_constant_hr_per_unit,
          crew_workers: crew, hours_per_day: standard.hours_per_day_basis, efficiency_pct: standard.efficiency_pct,
        });
        if (base != null) adjusted = adjustedProductivity(base, standard.factors).adjusted;
      }

      let duration: number | null = null;
      let rawDays: number | null = null;
      const crews = itemCrews(ti);
      if (ti.duration_days_override != null) {
        duration = ti.duration_days_override;
      } else if (qty?.quantity != null && adjusted != null) {
        // parallel crews share the quantity: the activity's output per day is the crew output x crews
        const d = calculateDuration(qty.quantity, adjusted * crews);
        if (d) { duration = d.days; rawDays = d.raw_days; }
      }

      const incoming = input.dependencies.filter((d) => d.successor_item_id === ti.id);
      const isFirst = ti.seq === templateItems[0]?.seq;
      const assessment = assessConfidence({
        hasQuantity,
        unitMismatch: qty?.issues.includes("unit_mismatch"),
        hasMethod: ctx.methods.length === 0 || methodId != null,
        hasProductivity: duration != null,
        productivityApproved: ti.duration_days_override != null || standard?.status === "approved",
        predecessorsResolved: isFirst || incoming.length > 0,
        templateApplicable: input.templateApplicable,
      });

      const task: GeneratedTask = {
        id: input.newId(), wbs_node_id: node.id, task_code: code, task_name: ctx.master.name,
        is_milestone: ti.is_milestone, discipline: ctx.master.discipline, duration_days: duration,
        sort_order: ++order, schedule_level: null,
        dependency_task_ids: [], dependency_types: [], dependency_lag_days: [],
        activity_master_id: ctx.master.id, activity_method_id: methodId, confidence: assessment.confidence,
      };
      tasks.push(task);
      taskByItem.set(ti.id, task);
      taskBySeq.set(ti.seq, task);
      items.push({
        task_id: task.id, node_id: node.id, template_item_id: ti.id, master_id: ti.master_id, method_id: methodId,
        norm_id: standard?.id ?? null, confidence: assessment.confidence, reasons: assessment.reasons,
        quantity: qty?.quantity ?? null, unit: qty?.unit ?? ctx.master.default_unit, quantity_source: qty?.provider ?? null, quantity_ref: qty?.source_ref ?? null,
        base_rate: base, adjusted_rate: adjusted, raw_days: rawDays, duration_days: duration, crews,
      });
    }

    // links inside this node (template standard logic stamped onto the generated tasks)
    for (const dep of input.dependencies) {
      const succ = taskByItem.get(dep.successor_item_id);
      const pred = taskByItem.get(dep.predecessor_item_id);
      if (!succ || !pred) continue;
      succ.dependency_task_ids.push(pred.id);
      succ.dependency_types.push(dep.relation);
      succ.dependency_lag_days.push(dep.lag_days);
    }

    // level N+1 follows level N when the template says so (only between tasks generated in this run)
    const il = input.interLevel;
    if (il && previousLevel) {
      const from = previousLevel.get(il.from_seq);
      const to = taskBySeq.get(il.to_seq);
      if (from && to && from.id !== to.id) {
        to.dependency_task_ids.push(from.id);
        to.dependency_types.push(il.relation);
        to.dependency_lag_days.push(il.lag_days);
      }
    }
    previousLevel = taskBySeq;
  }

  const count = (c: Confidence) => items.filter((i) => i.confidence === c).length;
  return {
    tasks, items, skipped, snapshot,
    counts: { total: items.length, high: count("high"), review: count("review"), low: count("low"), warnings: skipped.length },
  };
}
