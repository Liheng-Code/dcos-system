// AI assistance - browser side: ask the server route, read stored suggestions, decide on them, and carry out the ONE
// controlled action an accepted suggestion may trigger (a BOQ link), through the same audited service a planner uses.

import type { SupabaseClient } from "@supabase/supabase-js";
import { listBoqCandidates } from "../../boq-mapping-service";
import { evenShare } from "../boq-quantity";
import { linkBoqToItems } from "../boq-quantity-service";
import { listQuantityRules } from "../library-service";
import { loadRun } from "../generation-service";
import { saveRecoveryScenario } from "../recovery-service";
import type { RecoverySettings, Scenario } from "../recovery-engine";
import type { AiRequest, AiResponse } from "./ai-run";
import type { SuggestionDraft } from "./ai-core";

type Db = SupabaseClient;

export interface AiSuggestionRow extends SuggestionDraft {
  id: string;
  run_id: string;
  project_id: string | null;
  status: "pending" | "accepted" | "rejected";
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export async function askAi(req: AiRequest): Promise<AiResponse> {
  const res = await fetch("/api/planning/activity-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  const json = (await res.json().catch(() => null)) as (AiResponse & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? `AI request failed (${res.status})`);
  return json;
}

export async function listSuggestions(db: Db, filter: { targetType?: string; targetId?: string; runId?: string; status?: string; limit?: number }): Promise<AiSuggestionRow[]> {
  let q = db.from("plan_act_ai_suggestions").select("*").order("created_at", { ascending: false }).limit(filter.limit ?? 50);
  if (filter.targetType) q = q.eq("target_type", filter.targetType);
  if (filter.targetId) q = q.eq("target_id", filter.targetId);
  if (filter.runId) q = q.eq("run_id", filter.runId);
  if (filter.status) q = q.eq("status", filter.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, confidence: Number(r.confidence) })) as unknown as AiSuggestionRow[];
}

export async function listSuggestionsFor(db: Db, targetIds: string[]): Promise<AiSuggestionRow[]> {
  const out: AiSuggestionRow[] = [];
  for (let i = 0; i < targetIds.length; i += 150) {
    const { data, error } = await db.from("plan_act_ai_suggestions").select("*").in("target_id", targetIds.slice(i, i + 150)).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    out.push(...(((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, confidence: Number(r.confidence) })) as unknown as AiSuggestionRow[]));
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function decideSuggestion(db: Db, id: string, status: "accepted" | "rejected", note?: string): Promise<void> {
  const { error } = await db.rpc("plan_act_ai_decide", { p_id: id, p_status: status, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

/**
 * Accept a suggestion. A BOQ-link suggestion carries out the link (audited as "ai_accepted", with the model's reason
 * copied into the override log); every other kind is information and only records the decision. The action runs first:
 * if it fails the suggestion stays pending.
 */
export async function acceptSuggestion(db: Db, s: AiSuggestionRow, projectId: string | null): Promise<string> {
  if (s.kind === "quantity_mapping" && s.target_id && projectId) {
    const p = s.payload as { boq_source: "qs_boq" | "tender_boq"; boq_item_id: string; levels: number };
    const { data: row, error } = await db.from("plan_act_generation_items").select("run_id").eq("id", s.target_id).single();
    if (error) throw new Error(error.message);
    const { items } = await loadRun(db, (row as { run_id: string }).run_id);
    const item = items.find((i) => i.id === s.target_id);
    if (!item?.master_id) throw new Error("The generated item no longer exists.");
    const candidate = (await listBoqCandidates(projectId, db as never)).find((c) => c.id === p.boq_item_id && c.source === p.boq_source);
    if (!candidate) throw new Error("The BOQ line is no longer available.");
    const rule = (await listQuantityRules(db, item.master_id))[0];
    if (!rule) throw new Error("The activity has no quantity rule.");
    const spread = p.levels > 1;
    const targets = (spread ? items.filter((i) => i.master_id === item.master_id) : [item]).map((t) => ({ item: t, factor: spread ? evenShare(p.levels) : 1 }));
    const applied = await linkBoqToItems(db, {
      projectId, candidate, metricCode: rule.metric_code, metricUnit: rule.unit, targets, auditSource: "ai_accepted",
      reason: `AI suggestion accepted: ${s.reason}`.slice(0, 480),
    });
    await decideSuggestion(db, s.id, "accepted", `Linked BOQ to ${applied} level(s)`);
    return `BOQ ${candidate.code ?? ""} linked to ${applied} level${applied === 1 ? "" : "s"}`;
  }
  if (s.kind === "recovery" && s.target_id) {
    const p = s.payload as { scenario: Scenario; target_finish: string | null; forecast_finish: string | null; settings: RecoverySettings };
    await saveRecoveryScenario(db, s.target_id, p.scenario, { targetFinish: p.target_finish, forecastFinish: p.forecast_finish, settings: p.settings, aiSuggestionId: s.id });
    await decideSuggestion(db, s.id, "accepted", "Saved as a proposed recovery scenario");
    return "Saved as a proposed recovery scenario (the programme is unchanged)";
  }
  await decideSuggestion(db, s.id, "accepted");
  return "Noted";
}

export interface AiStatus {
  enabled: boolean;
  monthly_cap_usd: number;
  run_token_limit: number;
  model: string | null;
  price_in_per_mtok: number;
  price_out_per_mtok: number;
  spend: number;
}

export async function loadAiStatus(db: Db): Promise<AiStatus> {
  const [{ data: s, error }, { data: spend }] = await Promise.all([
    db.from("plan_act_ai_settings").select("*").eq("id", true).maybeSingle(),
    db.rpc("plan_act_ai_month_spend"),
  ]);
  if (error) throw new Error(error.message);
  const r = (s ?? {}) as Record<string, unknown>;
  return {
    enabled: r.enabled === true, monthly_cap_usd: Number(r.monthly_cap_usd ?? 50), run_token_limit: Number(r.run_token_limit ?? 20000),
    model: (r.model as string | null) ?? null, price_in_per_mtok: Number(r.price_in_per_mtok ?? 2), price_out_per_mtok: Number(r.price_out_per_mtok ?? 10),
    spend: Number(spend ?? 0),
  };
}

export async function saveAiSettings(db: Db, patch: Partial<Omit<AiStatus, "spend">>): Promise<void> {
  const { error } = await db.from("plan_act_ai_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Only Master Libraries managers can change the AI settings." : error.message);
}

export interface AiRunRow {
  id: string; tool: string; model: string | null; status: string; input_tokens: number | null; output_tokens: number | null;
  cost_usd: number | null; error: string | null; started_at: string;
}

export async function listAiRuns(db: Db, limit = 30): Promise<AiRunRow[]> {
  const { data, error } = await db.from("plan_act_ai_runs").select("id, tool, model, status, input_tokens, output_tokens, cost_usd, error, started_at").order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, cost_usd: r.cost_usd == null ? null : Number(r.cost_usd) })) as unknown as AiRunRow[];
}
