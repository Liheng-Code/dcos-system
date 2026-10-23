// Schedule Generation: loads library + project inputs, runs the pure planner, commits atomically, and records
// planner review/overrides. Tables: plan_act_generation_* / plan_act_overrides / plan_act_node_quantities
// (migrations 20261006000004-5). Project Activities are wbs_tasks rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateApplicability, type ApplicabilityResult, type ProjectAttributes } from "./applicability";
import { calculateDuration } from "./productivity-engine";
import { attachDefaultStepTemplates, type AttachStepsResult } from "../step-template-bulk-service";
import { resolveQuantity, type QuantityProvider, type ResolvedQuantity } from "./quantity-resolver";
import { GENERATION_ENGINE_VERSION, planGeneration, type GeneratedItem, type GeneratedTask, type MasterContext, type PlannerInput, type PlannerResult, type TargetNode } from "./generation-planner";
import { generateBlockers, type Kit } from "./kit-plan";
import { listMethodsForMasters, listProductivityStandards, listQuantityRules, loadTemplateDetail } from "./library-service";
import type { Confidence, ExceptionReason } from "./confidence";
import type { QuantityProviderKey } from "./types";
import { boqLinkProvider } from "./boq-provider";
import { allPages, eachChunk, inChunks } from "./in-chunks";
import { bimProvider } from "./bim-quantity-service";
import { applyVariant, runScenario, type ScenarioOutcome, type ScenarioVariant } from "./scenario-compare";
import { getProjectStartDate, loadProjectCalendar } from "../project-schedule";
import { todayISO } from "../work-calendar";

type Db = SupabaseClient;

export interface LevelNode extends TargetNode {
  level_type: string | null;
  sort_order: number;
  /** "level", or "segment" for a chainage section of a road / pipeline route */
  node_type?: string;
  chainage_from_m?: number | null;
  chainage_to_m?: number | null;
}

/**
 * Level type from the stored value, else inferred from the level name (many projects leave level_type empty).
 * Chainage sections are "segment" (templates with applies_to 'segment').
 */
export function inferLevelType(n: { level_type: string | null; wbs_name: string; node_type?: string | null }): string | null {
  if (n.node_type === "segment") return "segment";
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

/**
 * Levels bottom to top, then chainage sections in chainage order (the order inter-level links follow).
 * includeSite adds the project's External Works node(s) last as part "site" (level_type "site"): the top-most
 * nodes flagged wbs_nodes.is_external_works, which WBS templates set on their External Works package.
 */
export async function listLevelNodes(db: Db, projectId: string, opts: { includeSite?: boolean } = {}): Promise<LevelNode[]> {
  const cols = "id, wbs_code, wbs_name, level_type, sort_order, node_type, chainage_from_m, chainage_to_m";
  const [{ data, error }, site] = await Promise.all([
    db.from("wbs_nodes").select(cols).eq("project_id", projectId).in("node_type", ["level", "segment"]),
    opts.includeSite
      ? db.from("wbs_nodes").select(`${cols}, parent_id`).eq("project_id", projectId).eq("is_external_works", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) throw new Error(error.message);
  if (site.error) throw new Error(site.error.message);
  const rows = (data ?? []) as LevelNode[];
  const levels = rows.filter((n) => n.node_type !== "segment")
    .sort((a, b) => levelRank(a.wbs_name) - levelRank(b.wbs_name) || a.sort_order - b.sort_order);
  const sections = rows.filter((n) => n.node_type === "segment")
    .sort((a, b) => (Number(a.chainage_from_m) || 0) - (Number(b.chainage_from_m) || 0) || a.sort_order - b.sort_order);
  return [...levels, ...sections, ...siteTargets((site.data ?? []) as (LevelNode & { parent_id: string | null })[])];
}

/** Top-most External Works nodes (a flagged node whose parent is not flagged), as part "site". */
export function siteTargets(flagged: (LevelNode & { parent_id: string | null })[]): LevelNode[] {
  const ids = new Set(flagged.map((n) => n.id));
  return flagged
    .filter((n) => !n.parent_id || !ids.has(n.parent_id))
    .sort((a, b) => a.sort_order - b.sort_order || (a.wbs_code ?? "").localeCompare(b.wbs_code ?? ""))
    .map((n) => {
      const { parent_id, ...rest } = n;
      void parent_id;
      return { ...rest, level_type: "site" };
    });
}

/** Adds an "External Works" node at the project root (for projects whose WBS has none) and returns its id. */
export async function createSiteNode(db: Db, projectId: string): Promise<string> {
  const { data: roots, error: re } = await db.from("wbs_nodes").select("wbs_code, sort_order").eq("project_id", projectId).is("parent_id", null);
  if (re) throw new Error(re.message);
  const used = new Set(((roots ?? []) as { wbs_code: string }[]).map((r) => r.wbs_code));
  const code = ["EXT", "EXT-1", "EXT-2", "EXT-3"].find((c) => !used.has(c)) ?? `EXT-${Date.now() % 10000}`;
  const sort = Math.max(0, ...((roots ?? []) as { sort_order: number }[]).map((r) => Number(r.sort_order) || 0)) + 10;
  const { data, error } = await db.from("wbs_nodes").insert({
    project_id: projectId, parent_id: null, wbs_code: code, wbs_name: "External Works", node_type: "area",
    is_external_works: true, sort_order: sort,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

/** Metrics the "calculated" provider can derive from existing WBS data (wbs_node_quantities). Approximations are stated on the rule. */
const CALCULATED_METRICS: Record<string, string> = {
  slab_area: "GFA",
  // ground-floor footprint metrics (residential seed): slab on grade and anti-termite treatment ≈ ground floor GFA
  sog_area: "GFA",
  termite_area: "GFA",
  // industrial seed: superflat slab area ≈ ground floor GFA
  industrial_floor_area: "GFA",
};
const normaliseUnit = (u: string | null) => (u && /^m2$/i.test(u) ? "m²" : u && /^m3$/i.test(u) ? "m³" : u);

/** Length metrics of linear works: fall back to the chainage section's length (Phase E). */
const SECTION_LENGTH_METRICS = new Set(["trench_length", "pipe_bedding_length", "pipe_length", "duct_bank_length", "cable_length_mv_lv", "fibre_length"]);

function calculatedQuantityProvider(db: Db): QuantityProvider {
  return { key: "calculated", get: async (nodeId, metric) => {
    if (SECTION_LENGTH_METRICS.has(metric)) {
      const { data, error } = await db.from("wbs_nodes").select("chainage_from_m, chainage_to_m").eq("id", nodeId).maybeSingle();
      if (error) throw new Error(error.message);
      const r = data as { chainage_from_m: number | null; chainage_to_m: number | null } | null;
      if (r?.chainage_from_m == null || r.chainage_to_m == null) return null;
      return { value: Number(r.chainage_to_m) - Number(r.chainage_from_m), unit: "m", source_ref: "chainage section length" };
    }
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

interface ExistingTask { task_code: string; wbs_node_id: string | null; activity_master_id: string | null }

/** Maps a WBS node to the target node (level / section / site) it sits on or under; null = none. Memoised. */
export function targetResolver(targetIds: string[], tree: { id: string; parent_id: string | null }[]): (nodeId: string) => string | null {
  const targets = new Set(targetIds);
  const parent = new Map(tree.map((n) => [n.id, n.parent_id]));
  const targetOf = new Map<string, string | null>();
  return (id: string): string | null => {
    if (targetOf.has(id)) return targetOf.get(id)!;
    const seen: string[] = [];
    let cur: string | null = id;
    let found: string | null = null;
    while (cur && !targetOf.has(cur) && seen.length <= tree.length) {
      seen.push(cur);
      if (targets.has(cur)) { found = cur; break; }
      cur = parent.get(cur) ?? null;
    }
    if (!found && cur && targetOf.has(cur)) found = targetOf.get(cur)!;
    for (const s of seen) targetOf.set(s, found);
    return found;
  };
}

/** Activities on each target node (or in a package under it). */
export function activityCounts(targetIds: string[], tree: { id: string; parent_id: string | null }[], tasks: { wbs_node_id: string | null }[]): Record<string, number> {
  const resolve = targetResolver(targetIds, tree);
  const out: Record<string, number> = Object.fromEntries(targetIds.map((id) => [id, 0]));
  for (const t of tasks) {
    const target = t.wbs_node_id ? resolve(t.wbs_node_id) : null;
    if (target) out[target] += 1;
  }
  return out;
}

/**
 * Activities Generate already created on each target node: what a top-up run leaves alone. Activities from WBS
 * templates or typed by hand do not count (the master check in the planner still keeps them from being doubled).
 */
export async function loadActivityCounts(db: Db, projectId: string, targetIds: string[], tree: { id: string; parent_id: string | null }[]): Promise<Record<string, number>> {
  const tasks = await allPages<{ wbs_node_id: string | null }>((from, to) => db.from("wbs_tasks").select("wbs_node_id")
    .eq("project_id", projectId).not("generation_run_id", "is", null).order("id").range(from, to));
  return activityCounts(targetIds, tree, tasks);
}

/**
 * `${targetNodeId}|${masterCode}` for every activity linked to a master that sits on a target node or anywhere
 * under it (WBS templates put activities in packages below the level). Codes, not ids: another version of the
 * same master is the same activity.
 */
export function existingMasterKeys(
  targetIds: string[],
  tree: { id: string; parent_id: string | null }[],
  tasks: Pick<ExistingTask, "wbs_node_id" | "activity_master_id">[],
  codeById: Map<string, string>,
): Set<string> {
  const resolve = targetResolver(targetIds, tree);
  const out = new Set<string>();
  for (const t of tasks) {
    const code = t.activity_master_id ? codeById.get(t.activity_master_id) : undefined;
    if (!code || !t.wbs_node_id) continue;
    const target = resolve(t.wbs_node_id);
    if (target) out.add(`${target}|${code}`);
  }
  return out;
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
  /** status of the template: a draft can be previewed but not generated (Planning Manager approves it first) */
  templateStatus: string;
  templateCode: string;
}

/** Templates Generate offers: approved and active ones generate, drafts are preview-only. */
export const GENERATE_STATUSES = ["active", "approved", "draft"] as const;
export const canGenerateFrom = (status: string) => status === "active" || status === "approved";

/** What a preview needs to know about the project, loaded once per preview (a kit preview runs several templates). */
interface ProjectState {
  allNodes: LevelNode[];
  existingRows: ExistingTask[];
  tree: { id: string; parent_id: string | null }[];
  codeById: Map<string, string>;
  sortBase: number;
}

async function loadProjectState(db: Db, projectId: string): Promise<ProjectState> {
  const [allNodes, existingRows, tree, last] = await Promise.all([
    listLevelNodes(db, projectId, { includeSite: true }),
    allPages<ExistingTask>((from, to) => db.from("wbs_tasks").select("task_code, wbs_node_id, activity_master_id").eq("project_id", projectId).order("id").range(from, to)),
    allPages<{ id: string; parent_id: string | null }>((from, to) => db.from("wbs_nodes").select("id, parent_id").eq("project_id", projectId).order("id").range(from, to)),
    db.from("wbs_tasks").select("sort_order").eq("project_id", projectId).order("sort_order", { ascending: false }).limit(1),
  ]);
  const linkedMasterIds = [...new Set(existingRows.map((r) => r.activity_master_id).filter((x): x is string => !!x))];
  const masterCodes = await inChunks<{ id: string; code: string }>(linkedMasterIds, (part) => db.from("plan_act_masters").select("id, code").in("id", part));
  return {
    allNodes, existingRows, tree, codeById: new Map(masterCodes.map((m) => [m.id, m.code])),
    sortBase: Number((last.data?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0),
  };
}

/** Activities planned earlier in the same kit preview: treated as existing so a later template does not repeat them. */
interface PlannedSoFar { codes: Set<string>; masters: Set<string>; sortBase: number }

export async function previewGeneration(db: Db, req: GenerationRequest): Promise<GenerationPreview> {
  return buildPreview(db, req, await loadProjectState(db, req.projectId));
}

async function buildPreview(db: Db, req: GenerationRequest, state: ProjectState, sofar?: PlannedSoFar): Promise<GenerationPreview> {
  const detail = await loadTemplateDetail(db, req.templateId);
  const allNodes = state.allNodes;
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

  const existingMasters = existingMasterKeys(nodes.map((n) => n.id), state.tree, state.existingRows, state.codeById);
  for (const k of sofar?.masters ?? []) existingMasters.add(k);

  const applicability = evaluateApplicability(detail.applicability, req.attributes);

  const input: PlannerInput = {
    template: { id: detail.template.id, version: detail.template.version },
    items: detail.items, dependencies: detail.dependencies, nodes, contexts, quantities,
    existingTaskCodes: new Set([...state.existingRows.map((r) => r.task_code), ...(sofar?.codes ?? [])]),
    existingMasters,
    templateApplicable: applicability.applicable,
    interLevel: detail.template.inter_level_from_seq != null && detail.template.inter_level_to_seq != null && req.linkLevels !== false
      ? { from_seq: detail.template.inter_level_from_seq, to_seq: detail.template.inter_level_to_seq, relation: detail.template.inter_level_relation, lag_days: Number(detail.template.inter_level_lag_days) }
      : null,
    newId: () => crypto.randomUUID(),
    sortBase: sofar?.sortBase ?? state.sortBase,
  };
  // a chosen what-if variant is applied here with real ids, so committing it is an ordinary run
  const effective = req.variant ? applyVariant(input, req.variant, () => crypto.randomUUID()) : input;
  return { request: req, input: effective, result: planGeneration(effective), applicability, nodes, templateStatus: detail.template.status, templateCode: detail.template.code };
}

// ── Kit generation (one run per building, Generate plan G3) ────────────────

export interface KitGenerationRequest {
  projectId: string;
  /** the kit the assignments came from (recorded on the run); null = templates picked by hand */
  kit: Pick<Kit, "id" | "code" | "version" | "status"> | null;
  /** template ids per target node, in the order they are applied */
  assignments: Record<string, string[]>;
  attributes: ProjectAttributes;
  linkLevels?: boolean;
  priority?: QuantityProviderKey[];
}

export interface KitPreview {
  request: KitGenerationRequest;
  /** one preview per template, in application order (bottom part first) */
  groups: GenerationPreview[];
  nodes: LevelNode[];
  tasks: GeneratedTask[];
  items: (GeneratedItem & { template_id: string })[];
  skipped: PlannerResult["skipped"];
  counts: PlannerResult["counts"];
  /** why Generate is off (draft kit / templates); empty = it can generate */
  blockers: string[];
}

/**
 * Previews a whole scope with one or more templates per node. Templates run one after another in the order
 * of the first node they apply to; what an earlier template planned counts as existing for the next, so two
 * templates on one node never create the same master twice.
 */
export async function previewKitGeneration(db: Db, req: KitGenerationRequest): Promise<KitPreview> {
  const state = await loadProjectState(db, req.projectId);
  const position = new Map(state.allNodes.map((n, i) => [n.id, i]));
  const byTemplate = new Map<string, { first: number; rank: number; nodeIds: string[] }>();
  for (const [nodeId, templateIds] of Object.entries(req.assignments)) {
    const pos = position.get(nodeId);
    if (pos == null) continue;
    templateIds.forEach((tid, rank) => {
      const g = byTemplate.get(tid) ?? { first: pos, rank, nodeIds: [] };
      g.first = Math.min(g.first, pos);
      g.nodeIds.push(nodeId);
      byTemplate.set(tid, g);
    });
  }
  const order = [...byTemplate.entries()].sort((a, b) => a[1].first - b[1].first || a[1].rank - b[1].rank);

  const sofar: PlannedSoFar = { codes: new Set(), masters: new Set(), sortBase: state.sortBase };
  const groups: GenerationPreview[] = [];
  for (const [templateId, g] of order) {
    const nodeIds = [...g.nodeIds].sort((a, b) => position.get(a)! - position.get(b)!);
    const p = await buildPreview(db, {
      projectId: req.projectId, templateId, nodeIds, attributes: req.attributes, linkLevels: req.linkLevels, priority: req.priority,
    }, state, sofar);
    groups.push(p);
    for (const t of p.result.tasks) {
      sofar.codes.add(t.task_code);
      const code = p.input.contexts[t.activity_master_id]?.master.code;
      if (code) sofar.masters.add(`${t.wbs_node_id}|${code}`);
      sofar.sortBase = Math.max(sofar.sortBase, t.sort_order);
    }
  }

  const tasks = groups.flatMap((g) => g.result.tasks);
  const items = groups.flatMap((g) => g.result.items.map((it) => ({ ...it, template_id: g.input.template.id })));
  const skipped = groups.flatMap((g) => g.result.skipped);
  const count = (c: Confidence) => items.filter((i) => i.confidence === c).length;
  const scope = new Set(Object.keys(req.assignments));
  return {
    request: req, groups, nodes: state.allNodes.filter((n) => scope.has(n.id)), tasks, items, skipped,
    counts: { total: items.length, high: count("high"), review: count("review"), low: count("low"), warnings: skipped.length },
    blockers: generateBlockers(req.kit, groups.map((g) => ({ code: g.templateCode, status: g.templateStatus }))),
  };
}

/** Commits a kit preview as one run, then attaches default step templates (as commitGeneration does). */
export async function commitKitGeneration(db: Db, p: KitPreview): Promise<CommitResult> {
  if (p.blockers.length) throw new Error(`Cannot generate yet: ${p.blockers.join("; ")}. Drafts can be previewed; a Planning Manager approves them first.`);
  if (!p.tasks.length) throw new Error("Nothing to generate");
  const first = p.groups[0];
  const snapshot = {
    kit: p.request.kit ? { id: p.request.kit.id, code: p.request.kit.code, version: p.request.kit.version } : null,
    templates: p.groups.map((g) => ({ id: g.input.template.id, version: g.input.template.version })),
    masters: Object.assign({}, ...p.groups.map((g) => g.result.snapshot.masters)),
    norms: Object.assign({}, ...p.groups.map((g) => g.result.snapshot.norms)),
  };
  const single = p.groups.length === 1 && !p.request.kit;
  const { data, error } = await db.rpc("plan_act_commit_generation", {
    p_payload: {
      project_id: p.request.projectId,
      template_id: single ? first.input.template.id : null,
      template_version: single ? first.input.template.version : null,
      kit_id: p.request.kit?.id ?? null,
      kit_version: p.request.kit?.version ?? null,
      scope_node_ids: p.nodes.map((n) => n.id),
      engine_version: GENERATION_ENGINE_VERSION,
      quantity_priority: p.request.priority ?? ["bim", "boq", "manual", "calculated"],
      project_attributes: p.request.attributes,
      library_snapshot: snapshot,
      total_count: p.counts.total, high_count: p.counts.high, review_count: p.counts.review,
      low_count: p.counts.low, warning_count: p.counts.warnings,
      tasks: p.tasks, items: p.items,
    },
  });
  if (error) throw new Error(error.message);
  const runId = data as string;
  try {
    const steps = await attachDefaultStepTemplates(db, p.request.projectId, p.tasks.map((t) => t.id));
    return { runId, steps, stepsError: null };
  } catch (e) {
    return { runId, steps: null, stepsError: e instanceof Error ? e.message : String(e) };
  }
}

/** Atomic commit through plan_act_commit_generation. Returns the new run id. */
export interface CommitResult {
  runId: string;
  /** default Activity Step Templates attached to the new activities; null when attaching failed */
  steps: AttachStepsResult | null;
  stepsError: string | null;
}

/**
 * Commits a previewed run (one transaction), then gives each new activity its master's default Activity Step
 * Template spread over the calculated duration. Steps are a second step on purpose: if they fail, the generated
 * schedule stays and the planner is told (steps can be added later with Step Templates > Apply to Activities).
 */
export async function commitGeneration(db: Db, p: GenerationPreview): Promise<CommitResult> {
  if (!canGenerateFrom(p.templateStatus)) throw new Error("This template is a draft: it can be previewed, but a Planning Manager must approve it before activities are generated from it.");
  const runId = await commitRun(db, p);
  try {
    const steps = await attachDefaultStepTemplates(db, p.request.projectId, p.result.tasks.map((t) => t.id));
    return { runId, steps, stepsError: null };
  } catch (e) {
    return { runId, steps: null, stepsError: e instanceof Error ? e.message : String(e) };
  }
}

async function commitRun(db: Db, p: GenerationPreview): Promise<string> {
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
  id: string; run_no: string; template_id: string | null; template_version: number | null; engine_version: string;
  /** set when the run applied a kit (one run per building); its code is in library_snapshot.kit */
  kit_id?: string | null; kit_version?: number | null;
  library_snapshot?: { kit?: { code: string; version: number } | null } | null;
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
  /** template the activity came from (kit runs mix templates) */
  template_code: string | null;
}

export async function loadRun(db: Db, runId: string): Promise<{ run: RunRow; items: ReviewItem[] }> {
  const { data: run, error } = await db.from("plan_act_generation_runs").select("*").eq("id", runId).single();
  if (error) throw new Error(error.message);
  const { data: rows, error: e2 } = await db.from("plan_act_generation_items").select("*").eq("run_id", runId);
  if (e2) throw new Error(e2.message);
  const items = (rows ?? []) as Record<string, unknown>[];
  const ids = (k: string) => [...new Set(items.map((i) => i[k] as string | null).filter((x): x is string => !!x))];
  const taskIds = ids("task_id");
  const [m, n, me, tk, tp] = await Promise.all([
    inChunks<{ id: string; code: string; name: string }>(ids("master_id"), (part) => db.from("plan_act_masters").select("id, code, name").in("id", part)),
    inChunks<{ id: string; wbs_name: string; sort_order: number }>(ids("node_id"), (part) => db.from("wbs_nodes").select("id, wbs_name, sort_order").in("id", part)),
    inChunks<{ id: string; name: string }>(ids("method_id"), (part) => db.from("plan_act_methods").select("id, name").in("id", part)),
    inChunks<{ id: string; sort_order: number }>(taskIds, (part) => db.from("wbs_tasks").select("id, sort_order").in("id", part)),
    inChunks<{ id: string; code: string }>(ids("template_id"), (part) => db.from("plan_act_templates").select("id, code").in("id", part)),
  ]);
  const tc = new Map(tp.map((x) => [x.id, x.code]));
  const order = new Map(tk.map((x) => [x.id, Number(x.sort_order)]));
  const mm = new Map(m.map((x) => [x.id, x]));
  const nn = new Map(n.map((x) => [x.id, x]));
  const mt = new Map(me.map((x) => [x.id, x.name]));
  const out: ReviewItem[] = items.map((i) => ({
    id: i.id as string, task_id: i.task_id as string | null, node_id: i.node_id as string | null, master_id: i.master_id as string | null,
    confidence: i.confidence as Confidence, reasons: (i.reasons ?? []) as ExceptionReason[],
    quantity: i.quantity == null ? null : Number(i.quantity), unit: i.unit as string | null, quantity_source: i.quantity_source as string | null, quantity_ref: (i.quantity_ref as string | null) ?? null,
    adjusted_rate: i.adjusted_rate == null ? null : Number(i.adjusted_rate),
    crews: Number(i.crews) > 0 ? Number(i.crews) : 1,
    duration_days: i.duration_days == null ? null : Number(i.duration_days), review_status: i.review_status as ReviewItem["review_status"],
    master_code: mm.get(i.master_id as string)?.code ?? "?", master_name: mm.get(i.master_id as string)?.name ?? "?",
    node_name: nn.get(i.node_id as string)?.wbs_name ?? "?", method_name: mt.get(i.method_id as string) ?? null,
    template_code: tc.get(i.template_id as string) ?? null,
  }));
  // template order: tasks of a run are created level by level in recipe order
  out.sort((a, b) => (order.get(a.task_id ?? "") ?? 0) - (order.get(b.task_id ?? "") ?? 0));
  return { run: run as RunRow, items: out };
}

export async function setItemReview(db: Db, itemIds: string[], status: "accepted" | "rejected" | "pending"): Promise<void> {
  const reviewed_at = new Date().toISOString();
  await eachChunk(itemIds, (part) => db.from("plan_act_generation_items").update({ review_status: status, reviewed_at }).in("id", part));
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
  const rows = await inChunks<OverrideRow>(itemIds, (part) => db.from("plan_act_overrides").select("*").eq("project_id", projectId).in("item_id", part));
  return rows.sort((a, b) => b.changed_at.localeCompare(a.changed_at));
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
