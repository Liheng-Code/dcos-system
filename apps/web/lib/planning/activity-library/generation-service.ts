// Schedule Generation: loads library + project inputs, runs the pure planner, commits atomically, and records
// planner review/overrides. Tables: plan_act_generation_* / plan_act_overrides / plan_act_node_quantities
// (migrations 20261006000004-5). Project Activities are wbs_tasks rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateApplicability, type ApplicabilityResult, type ProjectAttributes } from "./applicability";
import { calculateDuration } from "./productivity-engine";
import { resolveQuantity, type QuantityProvider, type ResolvedQuantity } from "./quantity-resolver";
import { GENERATION_ENGINE_VERSION, planGeneration, type MasterContext, type PlannerInput, type PlannerResult, type TargetNode } from "./generation-planner";
import { listMethodsForMasters, listProductivityStandards, listQuantityRules, loadTemplateDetail } from "./library-service";
import type { Confidence, ExceptionReason } from "./confidence";
import type { QuantityProviderKey } from "./types";
import { boqLinkProvider } from "./boq-provider";
import { bimProvider } from "./bim-quantity-service";
import { applyVariant, runScenario, type ScenarioOutcome, type ScenarioVariant } from "./scenario-compare";
import { getProjectStartDate, loadProjectCalendar } from "../project-schedule";
import { todayISO } from "../work-calendar";

type Db = SupabaseClient;

export interface LevelNode extends TargetNode {
  level_type: string | null;
  sort_order: number;
}

/** Level type from the stored value, else inferred from the level name (many projects leave level_type empty). */
export function inferLevelType(n: { level_type: string | null; wbs_name: string }): string | null {
  if (n.level_type) return n.level_type;
  const name = n.wbs_name.trim().toLowerCase();
  if (/^(ug|underground|basement|b\d)/.test(name)) return "basement";
  if (/^(ground|gf\b|g\b)/.test(name)) return "ground";
  if (/^(rf|roof|tf|top|penthouse)/.test(name)) return "roof";
  if (/^\d+\s*(f|st|nd|rd|th)/.test(name) || /^(level|floor|l)\s*\d+/.test(name)) return "typical";
  return null;
}

/** Physical order: basements, ground, mezzanine, numbered floors ascending, then roof/top. */
function levelRank(name: string): number {
  const n = name.trim().toLowerCase();
  const num = Number((n.match(/\d+/) ?? [])[0]);
  if (/^(ug|underground|basement|b\d)/.test(n)) return -100 + (Number.isFinite(num) ? -num : 0);
  if (/^(ground|gf\b|g\b)/.test(n)) return 0;
  if (/mezz/.test(n)) return 0.5;
  if (/^(rf|roof)/.test(n)) return 1000;
  if (/^(tf|top|penthouse)/.test(n)) return 1001;
  return Number.isFinite(num) ? num : 500;
}

export async function listLevelNodes(db: Db, projectId: string): Promise<LevelNode[]> {
  const { data, error } = await db
    .from("wbs_nodes").select("id, wbs_code, wbs_name, level_type, sort_order")
    .eq("project_id", projectId).eq("node_type", "level");
  if (error) throw new Error(error.message);
  return ((data ?? []) as LevelNode[]).sort((a, b) => levelRank(a.wbs_name) - levelRank(b.wbs_name) || a.sort_order - b.sort_order);
}

/** Metrics the "calculated" provider can derive from existing WBS data (wbs_node_quantities). Approximations are stated on the rule. */
const CALCULATED_METRICS: Record<string, string> = { slab_area: "GFA" };
const normaliseUnit = (u: string | null) => (u && /^m2$/i.test(u) ? "m²" : u && /^m3$/i.test(u) ? "m³" : u);

function calculatedQuantityProvider(db: Db): QuantityProvider {
  return { key: "calculated", get: async (nodeId, metric) => {
    const base = CALCULATED_METRICS[metric];
    if (!base) return null;
    const { data, error } = await db.from("wbs_node_quantities").select("value, unit").eq("wbs_node_id", nodeId).eq("metric_code", base).eq("is_current", true).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { value: Number((data as { value: number }).value), unit: normaliseUnit((data as { unit: string | null }).unit), source_ref: base } : null;
  } };
}

/** DB-backed quantity provider: plan_act_node_quantities filtered by source. */
function nodeQuantityProvider(db: Db, projectId: string, key: QuantityProviderKey): QuantityProvider {
  const cache = new Map<string, Promise<Map<string, { value: number; unit: string | null }>>>();
  const load = (nodeId: string) => {
    if (!cache.has(nodeId)) {
      cache.set(nodeId, (async () => {
        const { data, error } = await db
          .from("plan_act_node_quantities").select("metric_code, value, unit")
          .eq("project_id", projectId).eq("wbs_node_id", nodeId).eq("source", key);
        if (error) throw new Error(error.message);
        return new Map(((data ?? []) as { metric_code: string; value: number; unit: string | null }[]).map((r) => [r.metric_code, { value: Number(r.value), unit: r.unit }]));
      })());
    }
    return cache.get(nodeId)!;
  };
  return { key, get: async (nodeId, metric) => {
    const hit = (await load(nodeId)).get(metric);
    return hit ? { value: hit.value, unit: hit.unit } : null;
  } };
}

/** First provider that has a value wins (confirmed BOQ links, then imported BOQ rows). */
function firstOf(key: QuantityProviderKey, list: QuantityProvider[]): QuantityProvider {
  return { key, get: async (nodeId, metric) => { for (const p of list) { const v = await p.get(nodeId, metric); if (v) return v; } return null; } };
}

export interface GenerationRequest {
  projectId: string;
  templateId: string;
  nodeIds: string[];
  attributes: ProjectAttributes;
  priority?: QuantityProviderKey[];
  /** false = ignore the template's level-to-level link. */
  linkLevels?: boolean;
  /** What-if variant to apply (method per activity, productivity %, level linking). Recorded on the run. */
  variant?: ScenarioVariant;
}

export interface GenerationPreview {
  request: GenerationRequest;
  input: PlannerInput;
  result: PlannerResult;
  applicability: ApplicabilityResult;
  nodes: LevelNode[];
}

export async function previewGeneration(db: Db, req: GenerationRequest): Promise<GenerationPreview> {
  const detail = await loadTemplateDetail(db, req.templateId);
  const allNodes = await listLevelNodes(db, req.projectId);
  const nodes = allNodes.filter((n) => req.nodeIds.includes(n.id));
  const masterIds = [...new Set(detail.items.map((i) => i.master_id))];

  const [{ data: masterRows, error: me }, methods] = await Promise.all([
    db.from("plan_act_masters").select("id, code, name, default_unit, discipline, version").in("id", masterIds),
    listMethodsForMasters(db, masterIds),
  ]);
  if (me) throw new Error(me.message);

  const contexts: Record<string, MasterContext> = {};
  const rules = new Map<string, Awaited<ReturnType<typeof listQuantityRules>>[number]>();
  for (const m of (masterRows ?? []) as MasterContext["master"][]) {
    const [standards, qrules] = await Promise.all([listProductivityStandards(db, m.id), listQuantityRules(db, m.id)]);
    if (qrules[0]) rules.set(m.id, qrules[0]);
    contexts[m.id] = { master: m, methods: methods.filter((x) => x.master_id === m.id), standards, quantityRule: qrules[0] ?? null };
  }

  const priorityDefault: QuantityProviderKey[] = req.priority ?? ["bim", "boq", "manual", "calculated"];
  const providers = priorityDefault.map((k) =>
    k === "calculated" ? calculatedQuantityProvider(db)
    : k === "boq" ? firstOf("boq", [boqLinkProvider(db, req.projectId), nodeQuantityProvider(db, req.projectId, "boq")])
    : k === "bim" ? firstOf("bim", [bimProvider(db, req.projectId), nodeQuantityProvider(db, req.projectId, "bim")])
    : nodeQuantityProvider(db, req.projectId, k));
  const quantities: Record<string, ResolvedQuantity> = {};
  for (const node of nodes) {
    for (const mid of masterIds) {
      const rule = rules.get(mid);
      if (!rule) continue;
      quantities[`${node.id}|${mid}`] = await resolveQuantity(
        { ...rule, provider_priority: req.priority ?? rule.provider_priority }, node.id, providers,
      );
    }
  }

  const { data: existing, error: ee } = await db.from("wbs_tasks").select("task_code").eq("project_id", req.projectId);
  if (ee) throw new Error(ee.message);

  const applicability = evaluateApplicability(detail.applicability, req.attributes);
  const { data: last } = await db.from("wbs_tasks").select("sort_order").eq("project_id", req.projectId).order("sort_order", { ascending: false }).limit(1);

  const input: PlannerInput = {
    template: { id: detail.template.id, version: detail.template.version },
    items: detail.items, dependencies: detail.dependencies, nodes, contexts, quantities,
    existingTaskCodes: new Set(((existing ?? []) as { task_code: string }[]).map((r) => r.task_code)),
    templateApplicable: applicability.applicable,
    interLevel: detail.template.inter_level_from_seq != null && detail.template.inter_level_to_seq != null && req.linkLevels !== false
      ? { from_seq: detail.template.inter_level_from_seq, to_seq: detail.template.inter_level_to_seq, relation: detail.template.inter_level_relation, lag_days: Number(detail.template.inter_level_lag_days) }
      : null,
    newId: () => crypto.randomUUID(),
    sortBase: Number((last?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0),
  };
  // a chosen what-if variant is applied here with real ids, so committing it is an ordinary run
  const effective = req.variant ? applyVariant(input, req.variant, () => crypto.randomUUID()) : input;
  return { request: req, input: effective, result: planGeneration(effective), applicability, nodes };
}

/** Atomic commit through plan_act_commit_generation. Returns the new run id. */
export async function commitGeneration(db: Db, p: GenerationPreview): Promise<string> {
  const { result, request, input } = p;
  const { data, error } = await db.rpc("plan_act_commit_generation", {
    p_payload: {
      project_id: request.projectId,
      template_id: input.template.id,
      template_version: input.template.version,
      scope_node_ids: p.nodes.map((n) => n.id),
      engine_version: GENERATION_ENGINE_VERSION,
      quantity_priority: request.priority ?? ["bim", "boq", "manual", "calculated"],
      project_attributes: request.variant ? { ...request.attributes, _scenario: request.variant } : request.attributes,
      library_snapshot: result.snapshot,
      total_count: result.counts.total, high_count: result.counts.high, review_count: result.counts.review,
      low_count: result.counts.low, warning_count: result.counts.warnings,
      tasks: result.tasks, items: result.items,
    },
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── Review ────────────────────────────────────────────────────────────────

export interface RunRow {
  id: string; run_no: string; template_id: string; template_version: number; engine_version: string;
  total_count: number; high_count: number; review_count: number; low_count: number; warning_count: number;
  created_at: string; created_by: string | null;
}

export async function listRuns(db: Db, projectId: string): Promise<RunRow[]> {
  const { data, error } = await db.from("plan_act_generation_runs").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as RunRow[];
}

export interface ReviewItem {
  id: string; task_id: string | null; node_id: string | null; master_id: string | null;
  confidence: Confidence; reasons: ExceptionReason[]; quantity: number | null; unit: string | null; quantity_source: string | null; quantity_ref: string | null;
  adjusted_rate: number | null; duration_days: number | null; review_status: "pending" | "accepted" | "rejected";
  /** parallel crews the duration is calculated with */
  crews: number;
  master_code: string; master_name: string; node_name: string; method_name: string | null;
}

export async function loadRun(db: Db, runId: string): Promise<{ run: RunRow; items: ReviewItem[] }> {
  const { data: run, error } = await db.from("plan_act_generation_runs").select("*").eq("id", runId).single();
  if (error) throw new Error(error.message);
  const { data: rows, error: e2 } = await db.from("plan_act_generation_items").select("*").eq("run_id", runId);
  if (e2) throw new Error(e2.message);
  const items = (rows ?? []) as Record<string, unknown>[];
  const ids = (k: string) => [...new Set(items.map((i) => i[k] as string | null).filter((x): x is string => !!x))];
  const taskIds = ids("task_id");
  const [m, n, me, tk] = await Promise.all([
    ids("master_id").length ? db.from("plan_act_masters").select("id, code, name").in("id", ids("master_id")) : { data: [] },
    ids("node_id").length ? db.from("wbs_nodes").select("id, wbs_name, sort_order").in("id", ids("node_id")) : { data: [] },
    ids("method_id").length ? db.from("plan_act_methods").select("id, name").in("id", ids("method_id")) : { data: [] },
    taskIds.length ? db.from("wbs_tasks").select("id, sort_order").in("id", taskIds) : { data: [] },
  ]);
  const order = new Map(((tk.data ?? []) as { id: string; sort_order: number }[]).map((x) => [x.id, Number(x.sort_order)]));
  const mm = new Map(((m.data ?? []) as { id: string; code: string; name: string }[]).map((x) => [x.id, x]));
  const nn = new Map(((n.data ?? []) as { id: string; wbs_name: string; sort_order: number }[]).map((x) => [x.id, x]));
  const mt = new Map(((me.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const out: ReviewItem[] = items.map((i) => ({
    id: i.id as string, task_id: i.task_id as string | null, node_id: i.node_id as string | null, master_id: i.master_id as string | null,
    confidence: i.confidence as Confidence, reasons: (i.reasons ?? []) as ExceptionReason[],
    quantity: i.quantity == null ? null : Number(i.quantity), unit: i.unit as string | null, quantity_source: i.quantity_source as string | null, quantity_ref: (i.quantity_ref as string | null) ?? null,
    adjusted_rate: i.adjusted_rate == null ? null : Number(i.adjusted_rate),
    crews: Number(i.crews) > 0 ? Number(i.crews) : 1,
    duration_days: i.duration_days == null ? null : Number(i.duration_days), review_status: i.review_status as ReviewItem["review_status"],
    master_code: mm.get(i.master_id as string)?.code ?? "?", master_name: mm.get(i.master_id as string)?.name ?? "?",
    node_name: nn.get(i.node_id as string)?.wbs_name ?? "?", method_name: mt.get(i.method_id as string) ?? null,
  }));
  // template order: tasks of a run are created level by level in recipe order
  out.sort((a, b) => (order.get(a.task_id ?? "") ?? 0) - (order.get(b.task_id ?? "") ?? 0));
  return { run: run as RunRow, items: out };
}

export async function setItemReview(db: Db, itemIds: string[], status: "accepted" | "rejected" | "pending"): Promise<void> {
  if (!itemIds.length) return;
  const { error } = await db.from("plan_act_generation_items").update({ review_status: status, reviewed_at: new Date().toISOString() }).in("id", itemIds);
  if (error) throw new Error(error.message);
}

export async function acceptHighConfidence(db: Db, runId: string): Promise<number> {
  const { data, error } = await db.from("plan_act_generation_items").update({ review_status: "accepted", reviewed_at: new Date().toISOString() })
    .eq("run_id", runId).eq("confidence", "high").eq("review_status", "pending").select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length;
}

const BLOCKING: ExceptionReason[] = ["missing_quantity", "no_productivity", "logic_conflict", "no_applicable_template"];

export type OverrideField = "duration_days" | "quantity";

/**
 * Planner override with a mandatory reason. Duration edits change the task directly; quantity edits are stored as
 * a manual node quantity and the duration is recalculated from the item's adjusted rate. Every change is appended
 * to plan_act_overrides; nothing is overwritten silently.
 */
export async function overrideItem(
  db: Db, projectId: string, item: ReviewItem, field: OverrideField, newValue: number, reason: string, metricCode: string | null,
): Promise<void> {
  if (!reason.trim()) throw new Error("A reason is required for every override");
  if (!item.task_id) throw new Error("This item has no task");
  const audit: { field: string; old: string | null; next: string }[] = [];
  let quantity = item.quantity;
  let duration = item.duration_days;
  let raw: number | null = null;

  if (field === "quantity") {
    if (!metricCode) throw new Error("No quantity rule defines the metric for this activity");
    if (!item.node_id) throw new Error("Item has no WBS node");
    const { error } = await db.from("plan_act_node_quantities").upsert({
      project_id: projectId, wbs_node_id: item.node_id, metric_code: metricCode, value: newValue, unit: item.unit,
      source: "manual", note: `Override: ${reason.trim()}`,
    }, { onConflict: "wbs_node_id,metric_code,source" });
    if (error) throw new Error(error.message);
    audit.push({ field: "quantity", old: quantity == null ? null : String(quantity), next: String(newValue) });
    quantity = newValue;
    if (item.adjusted_rate != null) {
      const d = calculateDuration(newValue, item.adjusted_rate * (item.crews || 1));
      if (d) { raw = d.raw_days; if (d.days !== duration) audit.push({ field: "duration_days", old: duration == null ? null : String(duration), next: String(d.days) }); duration = d.days; }
    }
  } else {
    audit.push({ field: "duration_days", old: duration == null ? null : String(duration), next: String(newValue) });
    duration = newValue;
  }

  const { error: te } = await db.from("wbs_tasks").update({ duration_days: duration }).eq("id", item.task_id);
  if (te) throw new Error(te.message);

  let reasons = item.reasons.filter((r) => !(r === "missing_quantity" && quantity != null) && !(r === "no_productivity" && duration != null));
  if (!reasons.includes("planner_override")) reasons = [...reasons, "planner_override"];
  const confidence: Confidence = reasons.some((r) => BLOCKING.includes(r)) ? "low" : "review";
  const { error: ie } = await db.from("plan_act_generation_items").update({
    quantity, duration_days: duration, raw_days: raw, reasons, confidence, quantity_source: field === "quantity" ? "manual" : item.quantity_source,
    review_status: "pending",
  }).eq("id", item.id);
  if (ie) throw new Error(ie.message);
  const { error: oe } = await db.from("plan_act_overrides").insert(
    audit.map((a) => ({ project_id: projectId, item_id: item.id, task_id: item.task_id, field: a.field, old_value: a.old, new_value: a.next, reason: reason.trim(), source: "planner" })),
  );
  if (oe) throw new Error(oe.message);
}

export interface OverrideRow { id: string; task_id: string | null; field: string; old_value: string | null; new_value: string | null; reason: string; source: string; changed_at: string }

export async function listOverrides(db: Db, projectId: string, itemIds: string[]): Promise<OverrideRow[]> {
  if (!itemIds.length) return [];
  const { data, error } = await db.from("plan_act_overrides").select("*").eq("project_id", projectId).in("item_id", itemIds).order("changed_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as OverrideRow[];
}


export interface RunResourceResult {
  equipmentResources: number;
  equipmentAssignments: number;
  labourAssignments: number;
}

/**
 * Assign resources for a run: equipment/subcontract lines of the productivity standards (source 'library'), then
 * the existing norm-based labour generator for the whole project (needs scheduled dates to size crews).
 */
export async function assignRunResources(db: Db, runId: string, projectId: string): Promise<RunResourceResult> {
  const { data, error } = await db.rpc("plan_act_generate_resources", { p_run_id: runId }).single();
  if (error) throw new Error(error.message);
  const row = data as { resources_created: number; assignments_written: number };
  // task dates may have changed since commit (Schedule): refresh the crew/hours/cost calculation first
  const { error: re } = await db.rpc("recompute_task_work", { p_project_id: projectId });
  if (re) throw new Error(re.message);
  const { error: le, data: ld } = await db.rpc("plan_generate_resource_loading", { p_project_id: projectId }).single();
  if (le) throw new Error(le.message);
  return {
    equipmentResources: Number(row.resources_created ?? 0),
    equipmentAssignments: Number(row.assignments_written ?? 0),
    labourAssignments: Number((ld as { assignments_written?: number } | null)?.assignments_written ?? 0),
  };
}

/** Run several variants over one loaded set of inputs and lay each out with the CPM engine. Writes nothing. */
export async function compareScenarios(
  db: Db, req: GenerationRequest, variants: ScenarioVariant[],
): Promise<{ outcomes: ScenarioOutcome[]; start: string; preview: GenerationPreview }> {
  const preview = await previewGeneration(db, { ...req, variant: undefined });
  const [cal, projectStart] = await Promise.all([loadProjectCalendar(req.projectId), getProjectStartDate(req.projectId)]);
  const start = projectStart ?? todayISO();
  const nodes = preview.nodes.map((n) => ({ id: n.id, wbs_name: n.wbs_name }));
  const outcomes = variants.map((v, i) => runScenario(preview.input, v, nodes, cal, start, `s${i}_`));
  return { outcomes, start, preview };
}

/**
 * Apply a quantity that did NOT come from a free override (e.g. a confirmed BOQ link): recalculate the duration from the
 * item's adjusted rate, update the task and the review item, and append audit rows. Confidence is recomputed from the
 * remaining reasons; no "planner override" flag is added because the mapping itself is the recorded decision.
 */
export async function applyItemQuantity(
  db: Db, projectId: string, item: ReviewItem,
  q: { quantity: number; source: "boq" | "bim"; ref: string | null; reason: string; auditSource?: "planner" | "ai_accepted" },
): Promise<void> {
  if (!item.task_id) throw new Error("This item has no task");
  const audit: { field: string; old: string | null; next: string }[] = [
    { field: "quantity", old: item.quantity == null ? null : String(item.quantity), next: String(q.quantity) },
  ];
  let duration = item.duration_days;
  let raw: number | null = null;
  if (item.adjusted_rate != null) {
    const d = calculateDuration(q.quantity, item.adjusted_rate * (item.crews || 1));
    if (d) {
      raw = d.raw_days;
      if (d.days !== duration) audit.push({ field: "duration_days", old: duration == null ? null : String(duration), next: String(d.days) });
      duration = d.days;
    }
  }
  const { error: te } = await db.from("wbs_tasks").update({ duration_days: duration }).eq("id", item.task_id);
  if (te) throw new Error(te.message);
  const reasons = item.reasons.filter((r) => !(r === "missing_quantity") && !(r === "no_productivity" && duration != null));
  // once a duration exists the standard behind it counts again: a draft one must still be flagged
  const { data: row } = await db.from("plan_act_generation_items").select("norm_id").eq("id", item.id).maybeSingle();
  const normId = (row as { norm_id: string | null } | null)?.norm_id ?? null;
  if (normId && !reasons.includes("draft_productivity")) {
    const { data: norm } = await db.from("plan_productivity_norms").select("status").eq("id", normId).maybeSingle();
    if (norm && (norm as { status: string }).status !== "approved") reasons.push("draft_productivity");
  }
  const confidence: Confidence = reasons.length === 0 ? "high" : reasons.some((r) => BLOCKING.includes(r)) ? "low" : "review";
  const { error: ie } = await db.from("plan_act_generation_items").update({
    quantity: q.quantity, duration_days: duration, raw_days: raw, quantity_source: q.source, quantity_ref: q.ref,
    reasons, confidence, review_status: "pending",
  }).eq("id", item.id);
  if (ie) throw new Error(ie.message);
  const { error: oe } = await db.from("plan_act_overrides").insert(
    audit.map((a) => ({ project_id: projectId, item_id: item.id, task_id: item.task_id, field: a.field, old_value: a.old, new_value: a.next, reason: q.reason, source: q.auditSource ?? "planner" })),
  );
  if (oe) throw new Error(oe.message);
}
