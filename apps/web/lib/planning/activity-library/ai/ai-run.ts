// AI assistance (Phase 3.5) - server-side orchestration. Dependency-injected (clients and the model call are passed in), so the
// whole path can be exercised with a scripted model. Order of every call:
//   1. read the context through the CALLER's client (row-level security decides what may be sent),
//   2. build a shortlist / findings deterministically; if there is nothing to ask, stop here (no model call, no cost),
//   3. check the gate (switch, key, monthly cap, size), 4. call the model, 5. validate everything it returned against
//   what it was given, 6. record the run (tokens, cost) and store only the validated suggestions.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import {
  buildConflictContext, buildExplainContext, buildMatchContext, buildProductivityContext, buildQuantityContext, checkGate,
  conflictSchema, conflictSuggestions, costUsd, DEFAULT_MODEL, detectRunConflicts, estimateTokens, explainSchema, explainSuggestion, buildRecoveryContext, recoverySchema, recoverySuggestion,
  matchSchema, matchSuggestions, productivitySchema, productivitySuggestion, PROMPT_VERSION, quantitySchema, quantitySuggestion,
  shortlistMasters, SYSTEM_PROMPT, type AiSettings, type AiTool, type BoqOption, type MasterOption, type SuggestionDraft,
} from "./ai-core";
import { levelRangeHint } from "../boq-quantity";
import { suggestBoqForItem } from "../boq-quantity-service";
import { loadRun } from "../generation-service";
import { proposeFromHistory } from "../productivity-learning";
import { standardHistoryStats } from "../productivity-learning-service";
import { runRecovery, type TargetSpec } from "../recovery-service";

type Db = SupabaseClient;

export interface ModelCallArgs { model: string; system: string; user: string; schema: ZodType; maxTokens: number }
export interface ModelResult { parsed: unknown | null; input_tokens: number; output_tokens: number; refused: boolean; truncated: boolean }
export type ModelCall = (args: ModelCallArgs) => Promise<ModelResult>;

export interface AiDeps {
  /** service role: writes runs and suggestions, reads the month's spend */
  admin: Db;
  /** the caller's own client: everything the model is shown is read through it */
  user: Db;
  userId: string;
  keyConfigured: boolean;
  model: ModelCall;
  defaultModel?: string;
}

export type AiRequest =
  | { tool: "find_activity_master"; query: string }
  | { tool: "suggest_quantity_mapping"; runId: string; itemId: string }
  | { tool: "suggest_productivity"; standardId: string }
  | { tool: "detect_schedule_conflict"; runId: string }
  | { tool: "explain_generation"; runId: string }
  | { tool: "suggest_recovery_plan"; projectId: string; target: TargetSpec };

export interface StoredSuggestion extends SuggestionDraft { id: string; status: string }

export interface AiResponse {
  runId: string | null;
  status: "ok" | "empty" | "blocked" | "refused" | "error";
  message?: string;
  suggestions: StoredSuggestion[];
}

interface Prepared {
  projectId: string | null;
  summary: Record<string, unknown>;
  /** present when there is nothing to ask the model */
  empty?: string;
  user?: string;
  schema?: ZodType;
  maxTokens?: number;
  build?: (parsed: never) => SuggestionDraft[];
}

const embedName = (v: unknown): string => {
  const o = Array.isArray(v) ? v[0] : v;
  return (o as { name?: string } | null | undefined)?.name ?? "";
};

async function prepare(db: Db, req: AiRequest): Promise<Prepared> {
  switch (req.tool) {
    case "find_activity_master": {
      const q = req.query.trim();
      if (q.length < 3) return { projectId: null, summary: { query_length: q.length }, empty: "Type at least three characters." };
      const { data, error } = await db.from("plan_act_masters").select("id, code, name, default_unit, work_type, family:plan_act_families(name)").eq("status", "active");
      if (error) throw new Error(error.message);
      const masters: MasterOption[] = ((data ?? []) as Record<string, unknown>[]).map((m) => ({
        id: m.id as string, code: m.code as string, name: m.name as string, family: embedName(m.family),
        work_type: (m.work_type as string | null) ?? null, unit: (m.default_unit as string | null) ?? null,
      }));
      const shortlist = shortlistMasters(q, masters);
      if (shortlist.length === 0) return { projectId: null, summary: { query: q.slice(0, 80), shortlist: 0 }, empty: "No activity in the library shares a keyword with this text." };
      return {
        projectId: null, summary: { query: q.slice(0, 80), shortlist: shortlist.map((s) => s.id) },
        user: buildMatchContext(q, shortlist), schema: matchSchema, build: ((o: never) => matchSuggestions(o, shortlist, q)) as never,
      };
    }

    case "suggest_quantity_mapping": {
      const { data: row, error } = await db.from("plan_act_generation_items").select("id, run_id, project_id, node_id, master_id, quantity_source").eq("id", req.itemId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Generation item not found.");
      const it = row as { id: string; run_id: string; project_id: string; node_id: string | null; master_id: string | null };
      if (!it.master_id || !it.node_id) return { projectId: it.project_id, summary: { item: it.id }, empty: "This item has no activity or level." };

      const [{ data: master }, { data: node }, { data: rules }, { count }] = await Promise.all([
        db.from("plan_act_masters").select("name, family:plan_act_families(name)").eq("id", it.master_id).maybeSingle(),
        db.from("wbs_nodes").select("wbs_name").eq("id", it.node_id).maybeSingle(),
        db.from("plan_act_quantity_rules").select("metric_code, unit").eq("master_id", it.master_id).limit(1),
        db.from("plan_act_generation_items").select("id", { count: "exact", head: true }).eq("run_id", it.run_id).eq("master_id", it.master_id),
      ]);
      const rule = (rules ?? [])[0] as { metric_code: string; unit: string | null } | undefined;
      if (!rule) return { projectId: it.project_id, summary: { item: it.id }, empty: "This activity has no quantity rule, so a BOQ line cannot feed it." };
      const m = master as { name: string; family: unknown } | null;
      const activity = m?.name ?? "";
      const level = (node as { wbs_name: string } | null)?.wbs_name ?? "";
      const { suggestions } = await suggestBoqForItem(db, it.project_id, { id: it.id, master_id: it.master_id, master_name: activity, node_name: level }, { metricUnit: rule.unit }, "");
      const options: BoqOption[] = suggestions.slice(0, 8).map((s) => ({
        id: s.candidate.id, source: s.candidate.source, code: s.candidate.code, description: s.candidate.description,
        unit: s.candidate.unit, quantity: s.candidate.quantity, score: Math.round(s.score * 100) / 100,
      }));
      if (options.length === 0) return { projectId: it.project_id, summary: { item: it.id, options: 0 }, empty: "No BOQ line looks like this activity." };
      const facts = { itemId: it.id, activity, family: embedName(m?.family), level, metric: rule.metric_code, metricUnit: rule.unit, runLevels: count ?? 1 };
      return {
        projectId: it.project_id, summary: { item: it.id, options: options.map((o) => o.id) },
        user: buildQuantityContext(facts, options), schema: quantitySchema, build: ((o: never) => quantitySuggestion(o, options, facts, levelRangeHint)) as never,
      };
    }

    case "suggest_productivity": {
      const { data: n, error } = await db.from("plan_productivity_norms").select("id, code, name, unit, status, version, labour_constant_hr_per_unit, output_per_day").eq("id", req.standardId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!n) throw new Error("Productivity standard not found.");
      const std = n as { id: string; code: string; name: string; unit: string; status: string; version: number | null; labour_constant_hr_per_unit: number; output_per_day: number | null };
      const stats = await standardHistoryStats(db, std.id);
      if (stats.totalLogs === 0) return { projectId: null, summary: { standard: std.id, logs: 0 }, empty: "There are no site logs for this standard yet, so there is nothing to explain." };
      const proposal = proposeFromHistory({ labour_constant_hr_per_unit: Number(std.labour_constant_hr_per_unit), output_per_day: std.output_per_day == null ? null : Number(std.output_per_day), version: std.version ?? 1 }, stats);
      const facts: Record<string, string | number | null> = {
        standard: `${std.code} (${std.status}, version ${std.version ?? 1})`, unit: std.unit,
        current_man_hours_per_unit: Number(std.labour_constant_hr_per_unit), current_output_per_day: std.output_per_day == null ? null : Number(std.output_per_day),
        logs_total: stats.totalLogs, logs_usable: stats.usable, logs_kept: stats.kept, distinct_days: stats.days, distinct_places: stats.places,
        median_productivity_index: stats.medianPi, index_range: stats.minPi != null ? `${stats.minPi} to ${stats.maxPi}` : null, spread: stats.spread,
        outliers_excluded: stats.outliers.length, period: stats.from ? `${stats.from} to ${stats.to}` : null,
        proposal_man_hours_per_unit: proposal?.labour_constant_hr_per_unit ?? null, proposal_output_per_day: proposal?.output_per_day ?? null,
        proposal_change_percent: proposal ? Math.round(proposal.changeFraction * 1000) / 10 : null, proposal_flagged_large: proposal?.flaggedLarge ? "yes" : "no",
      };
      const user = buildProductivityContext(facts, stats.sufficient ? [] : stats.shortfall.map((s) => `evidence too thin: ${s}`));
      return {
        projectId: null, summary: { standard: std.id, logs: stats.totalLogs, sufficient: stats.sufficient },
        user, schema: productivitySchema, build: ((o: never) => productivitySuggestion(o, user, std.id, std.code)) as never,
      };
    }

    case "detect_schedule_conflict": {
      const { run, items } = await loadRun(db, req.runId);
      const { data: r } = await db.from("plan_act_generation_runs").select("project_id").eq("id", run.id).maybeSingle();
      const projectId = (r as { project_id: string } | null)?.project_id ?? null;
      const findings = detectRunConflicts(items.map((i) => ({
        id: i.id, master_code: i.master_code, master_name: i.master_name, node_name: i.node_name, confidence: i.confidence,
        reasons: i.reasons, duration_days: i.duration_days, quantity: i.quantity,
      })));
      if (findings.length === 0) return { projectId, summary: { run: run.id, findings: 0 }, empty: "The checks found nothing to flag in this run." };
      const user = buildConflictContext(items.length, findings);
      return {
        projectId, summary: { run: run.id, findings: findings.map((f) => f.id) },
        user, schema: conflictSchema, build: ((o: never) => conflictSuggestions(o, findings, user, run.id)) as never,
      };
    }

    case "suggest_recovery_plan": {
      const rec = await runRecovery(db, req.projectId, req.target);
      const a = rec.analysis;
      if (!a.ok) return { projectId: req.projectId, summary: { project: req.projectId }, empty: "The programme has circular links, so no recovery can be calculated." };
      if (!a.liveFinish || !rec.targetFinish) return { projectId: req.projectId, summary: { project: req.projectId }, empty: "The programme has no dates or no target to recover to." };
      if (a.gapWd <= 0) return { projectId: req.projectId, summary: { project: req.projectId, gap: a.gapWd }, empty: "The forecast already meets the target: nothing to recover." };
      if (a.scenarios.length === 0) return { projectId: req.projectId, summary: { project: req.projectId, gap: a.gapWd }, empty: "No lever the engine can measure shortens the programme (check the critical path by hand)." };
      const delayed = new Set(rec.delays.flatMap((d) => d.taskIds));
      const delayFacts = {
        open: rec.delays.length, totalImpactDays: Math.round(rec.delays.reduce((n, d) => n + d.impactDays, 0) * 100) / 100,
        causes: [...new Set(rec.delays.map((d) => d.cause).filter((c): c is string => !!c))].slice(0, 5).map((c) => c.slice(0, 80)),
      };
      const kinds = (s: (typeof a.scenarios)[number]) => [...new Set(s.levers.map((l) => l.kind))].join(", ");
      const user = buildRecoveryContext(
        { liveFinish: a.liveFinish, targetFinish: rec.targetFinish, gapWd: a.gapWd, criticalCount: a.criticalCount },
        a.scenarios.map((s) => ({ key: s.key, name: s.name, levers: s.levers.length, kinds: kinds(s), finish: s.finish, recoveredWd: s.recoveredWd, remainingGapWd: s.remainingGapWd, meetsTarget: s.meetsTarget, risk: s.risk, resourceNote: s.resourceNote, touchesDelayed: s.levers.filter((l) => delayed.has(l.taskId)).length })),
        delayFacts,
      );
      const options = a.scenarios.map((s) => ({ key: s.key, name: s.name, payload: { scenario: s, target_finish: rec.targetFinish, forecast_finish: a.liveFinish, settings: rec.settings } as Record<string, unknown> }));
      return {
        projectId: req.projectId, summary: { project: req.projectId, gap: a.gapWd, scenarios: a.scenarios.map((s) => s.key) },
        user, schema: recoverySchema, maxTokens: 1500, build: ((o: never) => recoverySuggestion(o, options, user, req.projectId)) as never,
      };
    }

    case "explain_generation": {
      const { run, items } = await loadRun(db, req.runId);
      const { data: r } = await db.from("plan_act_generation_runs").select("project_id, project_attributes, quantity_priority").eq("id", run.id).maybeSingle();
      const row = r as { project_id: string; project_attributes: Record<string, unknown> | null; quantity_priority: string[] | null } | null;
      const count = (f: (i: (typeof items)[number]) => string | null) => {
        const m = new Map<string, number>();
        for (const i of items) { const k = f(i); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
        return [...m.entries()].map(([k, v]) => `${k} ${v}`).join(", ") || "none";
      };
      const reasonCounts = new Map<string, number>();
      for (const i of items) for (const x of i.reasons) reasonCounts.set(x, (reasonCounts.get(x) ?? 0) + 1);
      const scenario = row?.project_attributes?._scenario as { productivityPct?: number; linkLevels?: boolean; methodByMaster?: Record<string, string> } | undefined;
      const facts: Record<string, string | number | null> = {
        run: run.run_no, template_version: run.template_version, engine: run.engine_version,
        activities: run.total_count, high_confidence: run.high_count, review: run.review_count, low_confidence: run.low_count,
        levels: new Set(items.map((i) => i.node_name)).size,
        reasons: [...reasonCounts.entries()].map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ") || "none",
        quantity_sources: count((i) => i.quantity_source), quantity_priority: (row?.quantity_priority ?? []).join(" > ") || null,
        activities_without_duration: items.filter((i) => i.duration_days == null).length,
        total_task_days: Math.round(items.reduce((a, i) => a + (i.duration_days ?? 0), 0) * 100) / 100,
        what_if_scenario: scenario ? `productivity ${scenario.productivityPct ?? 100} percent, ${Object.keys(scenario.methodByMaster ?? {}).length} method change(s), level linking ${scenario.linkLevels === false ? "off" : "on"}` : "none",
      };
      const user = buildExplainContext(facts);
      return {
        projectId: row?.project_id ?? null, summary: { run: run.id }, user, schema: explainSchema,
        build: ((o: never) => explainSuggestion(o, user, run.id, run.run_no)) as never,
      };
    }
  }
}

async function loadSettings(db: Db): Promise<AiSettings> {
  const { data, error } = await db.from("plan_act_ai_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  const s = (data ?? {}) as Partial<Record<keyof AiSettings, unknown>>;
  return {
    enabled: s.enabled === true, monthly_cap_usd: Number(s.monthly_cap_usd ?? 50), run_token_limit: Number(s.run_token_limit ?? 20000),
    model: (s.model as string | null) ?? null, price_in_per_mtok: Number(s.price_in_per_mtok ?? 2), price_out_per_mtok: Number(s.price_out_per_mtok ?? 10),
  };
}

async function record(deps: AiDeps, row: {
  projectId: string | null; tool: AiTool; model: string | null; status: AiResponse["status"]; input?: number; output?: number; cost?: number;
  error?: string; summary: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await deps.admin.from("plan_act_ai_runs").insert({
    project_id: row.projectId, tool: row.tool, model: row.model, prompt_version: PROMPT_VERSION, status: row.status,
    input_tokens: row.input ?? null, output_tokens: row.output ?? null, cost_usd: row.cost ?? null, error: row.error ?? null,
    request_summary: row.summary, requested_by: deps.userId, finished_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function runAiTool(deps: AiDeps, req: AiRequest): Promise<AiResponse> {
  const settings = await loadSettings(deps.user);
  const model = settings.model || deps.defaultModel || DEFAULT_MODEL;

  // Cheap refusals first: switched off, no key. Nothing is read or sent.
  const early = checkGate(settings, { keyConfigured: deps.keyConfigured, monthSpend: 0, promptTokens: 0 });
  if (!early.ok && (!settings.enabled || !deps.keyConfigured)) return { runId: null, status: "blocked", message: early.reason, suggestions: [] };

  let prepared: Prepared;
  try {
    prepared = await prepare(deps.user, req);
  } catch (e) {
    return { runId: null, status: "error", message: e instanceof Error ? e.message : "Could not read the data", suggestions: [] };
  }

  if (prepared.empty) {
    const id = await record(deps, { projectId: prepared.projectId, tool: req.tool, model: null, status: "empty", summary: prepared.summary });
    return { runId: id, status: "empty", message: prepared.empty, suggestions: [] };
  }

  const { data: spend } = await deps.admin.rpc("plan_act_ai_month_spend");
  const gate = checkGate(settings, { keyConfigured: deps.keyConfigured, monthSpend: Number(spend ?? 0), promptTokens: estimateTokens(SYSTEM_PROMPT + (prepared.user ?? "")) });
  if (!gate.ok) {
    const id = await record(deps, { projectId: prepared.projectId, tool: req.tool, model, status: "blocked", error: gate.reason, summary: prepared.summary });
    return { runId: id, status: "blocked", message: gate.reason, suggestions: [] };
  }

  let result: ModelResult;
  try {
    result = await deps.model({ model, system: SYSTEM_PROMPT, user: prepared.user!, schema: prepared.schema!, maxTokens: prepared.maxTokens ?? 1500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "The AI service failed";
    const id = await record(deps, { projectId: prepared.projectId, tool: req.tool, model, status: "error", error: msg.slice(0, 500), summary: prepared.summary });
    return { runId: id, status: "error", message: msg, suggestions: [] };
  }

  const cost = costUsd(result.input_tokens, result.output_tokens, settings);
  if (result.refused || result.truncated || result.parsed == null) {
    const why = result.refused ? "The model declined to answer." : result.truncated ? "The answer was cut off." : "The answer could not be read.";
    const id = await record(deps, { projectId: prepared.projectId, tool: req.tool, model, status: result.refused ? "refused" : "error", input: result.input_tokens, output: result.output_tokens, cost, error: why, summary: prepared.summary });
    return { runId: id, status: result.refused ? "refused" : "error", message: why, suggestions: [] };
  }

  const drafts = prepared.build!(result.parsed as never);
  const runId = await record(deps, { projectId: prepared.projectId, tool: req.tool, model, status: "ok", input: result.input_tokens, output: result.output_tokens, cost, summary: { ...prepared.summary, suggestions: drafts.length } });
  if (drafts.length === 0) return { runId, status: "ok", message: "The model's answer did not pass the checks, so nothing is suggested.", suggestions: [] };

  const { data: stored, error } = await deps.admin.from("plan_act_ai_suggestions").insert(
    drafts.map((d) => ({ ...d, run_id: runId, project_id: prepared.projectId })),
  ).select("*");
  if (error) throw new Error(error.message);
  return { runId, status: "ok", suggestions: (stored ?? []) as StoredSuggestion[] };
}
