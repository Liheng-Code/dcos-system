// BOQ quantity provider - data access (Phase 3.2). Tables: plan_act_quantity_links (migration 20261006000008) plus the
// project BOQ (qs_boq_items) and tender BOQ (tender_boq_items). Linking is always an explicit planner action.

import type { SupabaseClient } from "@supabase/supabase-js";
import { listBoqCandidates } from "../boq-mapping-service";
import { suggestBoqMatches, type BoqCandidate, type BoqMatchSuggestion } from "../boq-matching";
import { normalizeUnit } from "../work-engine";
import { floorNumber, levelRangeBounds, singularise, unitsCompatible } from "./boq-quantity";
import { boqLinkProvider, liveItems } from "./boq-provider";
import { applyItemQuantity, type ReviewItem } from "./generation-service";

type Db = SupabaseClient;

export interface BoqSuggestionRow extends BoqMatchSuggestion {
  /** other suggestions the planner may want to see even when the ranking is weak */
  weak: boolean;
}

/** Ranked BOQ candidates for a generated activity. Never auto-applies; the planner confirms. */
export async function suggestBoqForItem(
  db: Db, projectId: string,
  item: Pick<ReviewItem, "id" | "master_id" | "master_name" | "node_name">,
  ctx: { metricUnit: string | null },
  search: string,
): Promise<{ suggestions: BoqSuggestionRow[]; candidates: BoqCandidate[] }> {
  const all = await listBoqCandidates(projectId, db);
  const q = search.trim().toLowerCase();
  if (q) {
    const hits = all.filter((c) => c.description.toLowerCase().includes(q) || (c.code ?? "").toLowerCase().includes(q)).slice(0, 25);
    return { suggestions: hits.map((c) => ({ candidate: c, score: 0, reasons: ["text match"], weak: true })), candidates: all };
  }

  // the query is "<activity> <family>" (e.g. "Concrete Casting Slab"): BOQ lines say "slabs", not "concrete casting"
  let family = "";
  if (item.master_id) {
    const { data } = await db.from("plan_act_masters").select("family:plan_act_families(name)").eq("id", item.master_id).maybeSingle();
    // an embedded to-one relation comes back as an object (or a one-element array, depending on the client version)
    const fam = (data as { family?: { name?: string } | { name?: string }[] } | null)?.family;
    family = (Array.isArray(fam) ? fam[0]?.name : fam?.name) ?? "";
  }
  const floor = floorNumber(item.node_name);

  // only lines whose unit can feed the metric; plural-tolerant scoring copy; a "L1-L3" range counts as the level
  const scored = all
    .filter((c) => unitsCompatible(c.unit, ctx.metricUnit))
    .map((c) => {
      const range = levelRangeBounds(c.description);
      const coversLevel = floor != null && range != null && floor >= range[0] && floor <= range[1];
      return { ...c, description: singularise(c.description), level: coversLevel ? `${floor}F` : c.level };
    });
  const byId = new Map(all.map((c) => [c.id, c]));
  const ranked = suggestBoqMatches(
    [{ id: item.id, taskCode: item.id, taskName: singularise(`${item.master_name} ${family}`.trim()), discipline: null, levelLabel: item.node_name, costCode: null, hasQuantity: false }],
    scored, { topN: 8, minScore: 0.12 },
  ).get(item.id) ?? [];
  return {
    suggestions: ranked.map((r) => ({ ...r, candidate: byId.get(r.candidate.id) ?? r.candidate, weak: r.score < 0.3 })),
    candidates: all,
  };
}

export interface LinkRequest {
  projectId: string;
  candidate: BoqCandidate;
  metricCode: string;
  metricUnit: string | null;
  /** items (one per level) that receive a share of this BOQ line */
  targets: { item: ReviewItem; factor: number }[];
  reason: string;
  /** "ai_accepted" when the planner accepted an AI suggestion (recorded in the override log) */
  auditSource?: "planner" | "ai_accepted";
}

/**
 * Confirm a BOQ line for one or more generated activities: write the links (the audit of the mapping), then apply the
 * resulting quantity to each item. Quantity applied = line quantity x factor of the item's node, summed with any other
 * links the node already has.
 */
export async function linkBoqToItems(db: Db, req: LinkRequest): Promise<number> {
  if (!req.reason.trim()) throw new Error("A reason is required");
  if (normalizeUnit(req.candidate.unit) !== normalizeUnit(req.metricUnit) && req.metricUnit) {
    throw new Error(`Unit mismatch: the BOQ line is in ${req.candidate.unit}, the activity needs ${req.metricUnit}`);
  }
  const rows = req.targets
    .filter((t) => t.item.node_id)
    .map((t) => ({
      project_id: req.projectId, wbs_node_id: t.item.node_id!, metric_code: req.metricCode, boq_source: req.candidate.source,
      boq_item_id: req.candidate.id, boq_item_ref: req.candidate.code, boq_description: req.candidate.description,
      boq_unit: req.candidate.unit, boq_quantity_at_link: req.candidate.quantity, factor: t.factor, note: req.reason.trim(),
    }));
  if (!rows.length) return 0;
  const { error } = await db.from("plan_act_quantity_links").upsert(rows, { onConflict: "wbs_node_id,metric_code,boq_source,boq_item_id" });
  if (error) throw new Error(error.message);

  const provider = boqLinkProvider(db, req.projectId);
  let applied = 0;
  for (const t of req.targets) {
    if (!t.item.node_id) continue;
    const v = await provider.get(t.item.node_id, req.metricCode);
    if (!v) continue;
    await applyItemQuantity(db, req.projectId, t.item, {
      quantity: v.value, source: "boq", ref: v.source_ref ?? null, reason: `Linked to ${v.source_ref ?? "BOQ"}: ${req.reason.trim()}`, auditSource: req.auditSource,
    });
    applied++;
  }
  return applied;
}

export async function deleteQuantityLink(db: Db, id: string): Promise<void> {
  const { error } = await db.from("plan_act_quantity_links").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface QuantityLinkView {
  id: string;
  wbs_node_id: string;
  node_name: string;
  metric_code: string;
  boq_source: "qs_boq" | "tender_boq";
  boq_item_ref: string | null;
  boq_description: string | null;
  boq_unit: string | null;
  factor: number;
  quantity_at_link: number | null;
  quantity_now: number | null;
  /** quantity_now x factor */
  contribution: number | null;
  /** the BOQ line has changed since the planner confirmed the link */
  drifted: boolean;
  /** the BOQ line no longer exists or cannot be read */
  missing: boolean;
  note: string | null;
  confirmed_at: string;
}

export async function listQuantityLinks(db: Db, projectId: string): Promise<QuantityLinkView[]> {
  const { data, error } = await db.from("plan_act_quantity_links").select("*").eq("project_id", projectId).order("confirmed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows.length) return [];
  const links = rows.map((r) => ({
    id: r.id as string, boq_source: r.boq_source as "qs_boq" | "tender_boq", boq_item_id: r.boq_item_id as string,
    boq_item_ref: (r.boq_item_ref as string | null) ?? null, boq_unit: (r.boq_unit as string | null) ?? null,
    boq_quantity_at_link: r.boq_quantity_at_link == null ? null : Number(r.boq_quantity_at_link), factor: Number(r.factor),
  }));
  const live = await liveItems(db, links);
  const nodeIds = [...new Set(rows.map((r) => r.wbs_node_id as string))];
  const { data: nodes } = await db.from("wbs_nodes").select("id, wbs_name").in("id", nodeIds);
  const nodeName = new Map(((nodes ?? []) as { id: string; wbs_name: string }[]).map((n) => [n.id, n.wbs_name]));
  return rows.map((r, i) => {
    const l = links[i];
    const cur = live.get(`${l.boq_source}:${l.boq_item_id}`);
    return {
      id: l.id, wbs_node_id: r.wbs_node_id as string, node_name: nodeName.get(r.wbs_node_id as string) ?? "?",
      metric_code: r.metric_code as string, boq_source: l.boq_source, boq_item_ref: l.boq_item_ref,
      boq_description: (r.boq_description as string | null) ?? null, boq_unit: l.boq_unit, factor: l.factor,
      quantity_at_link: l.boq_quantity_at_link, quantity_now: cur ? cur.quantity : null,
      contribution: cur ? Math.round(cur.quantity * l.factor * 1000) / 1000 : null,
      drifted: !!cur && l.boq_quantity_at_link != null && Math.abs(cur.quantity - l.boq_quantity_at_link) > 1e-9,
      missing: !cur, note: (r.note as string | null) ?? null, confirmed_at: r.confirmed_at as string,
    };
  });
}

/** Accept a BOQ revision: re-read the node's linked quantity, refresh the link snapshot and re-apply it to the item. */
export async function resyncItemFromBoq(db: Db, projectId: string, item: ReviewItem, metricCode: string): Promise<void> {
  if (!item.node_id) throw new Error("Item has no WBS node");
  const provider = boqLinkProvider(db, projectId);
  const v = await provider.get(item.node_id, metricCode);
  if (!v) throw new Error("No readable BOQ link for this level any more");
  const links = (await listQuantityLinks(db, projectId)).filter((l) => l.wbs_node_id === item.node_id && l.metric_code === metricCode);
  for (const l of links) {
    if (l.quantity_now != null) {
      const { error } = await db.from("plan_act_quantity_links").update({ boq_quantity_at_link: l.quantity_now }).eq("id", l.id);
      if (error) throw new Error(error.message);
    }
  }
  await applyItemQuantity(db, projectId, item, { quantity: v.value, source: "boq", ref: v.source_ref ?? null, reason: `BOQ revised: ${v.source_ref ?? "BOQ"}` });
}
