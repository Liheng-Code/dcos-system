// Data access for the Planning <-> QS bridge (doc 21). Matching is pure (qs-bridge.ts).
// Reads are open to every authenticated user; rule writes are enforced by RLS (can_manage_master_libraries()).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BridgeBoqLine, BridgeRule } from "./qs-bridge";

type Db = SupabaseClient;
const PAGE = 1000;

const RULE_COLS =
  "id, role, metric_code, metric_unit, unit_factor, match_discipline, match_section, match_sub_section, match_sub_element, match_unit, note, is_active, sort_order";

export async function listBridgeRules(db: Db): Promise<BridgeRule[]> {
  const { data, error } = await db.from("plan_act_qs_bridge").select(RULE_COLS).order("sort_order").order("metric_code");
  if (error) throw new Error(error.message);
  return ((data ?? []) as BridgeRule[]).map((r) => ({ ...r, unit_factor: Number(r.unit_factor) }));
}

export type BridgeRuleDraft = Omit<BridgeRule, "id"> & { id?: string };

const blankToNull = (s: string | null | undefined) => (s == null || s.trim() === "" ? null : s.trim());

export async function saveBridgeRule(db: Db, r: BridgeRuleDraft): Promise<void> {
  const payload = {
    role: r.role,
    metric_code: r.role === "excluded" ? null : blankToNull(r.metric_code),
    metric_unit: r.role === "excluded" ? null : blankToNull(r.metric_unit),
    unit_factor: r.unit_factor,
    match_discipline: blankToNull(r.match_discipline),
    match_section: blankToNull(r.match_section),
    match_sub_section: blankToNull(r.match_sub_section),
    match_sub_element: blankToNull(r.match_sub_element),
    match_unit: blankToNull(r.match_unit),
    note: blankToNull(r.note),
    is_active: r.is_active,
    sort_order: r.sort_order,
  };
  const { error } = r.id
    ? await db.from("plan_act_qs_bridge").update(payload).eq("id", r.id)
    : await db.from("plan_act_qs_bridge").insert(payload);
  if (error) throw new Error(error.message);
}

export async function deleteBridgeRule(db: Db, id: string): Promise<void> {
  const { error } = await db.from("plan_act_qs_bridge").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** metric code -> Activity Master codes whose quantity rule reads it (current, non-archived masters). */
export async function loadMastersByMetric(db: Db): Promise<Map<string, string[]>> {
  const { data, error } = await db
    .from("plan_act_quantity_rules")
    .select("metric_code, plan_act_masters!inner(code, status)")
    .in("plan_act_masters.status", ["draft", "under_review", "approved", "active"]);
  if (error) throw new Error(error.message);
  const out = new Map<string, string[]>();
  for (const r of (data ?? []) as unknown as { metric_code: string; plan_act_masters: { code: string } | { code: string }[] }[]) {
    const m = Array.isArray(r.plan_act_masters) ? r.plan_act_masters[0] : r.plan_act_masters;
    if (!m) continue;
    const list = out.get(r.metric_code) ?? [];
    if (!list.includes(m.code)) list.push(m.code);
    out.set(r.metric_code, list);
  }
  return out;
}

/** Tender BOQ lines of the project's tenders, with their Element Library classification and location. */
export async function listProjectBoqLines(db: Db, projectId: string): Promise<BridgeBoqLine[]> {
  const { data: tenders, error: tErr } = await db.from("tender_register").select("id").eq("project_id", projectId);
  if (tErr) throw new Error(tErr.message);
  const ids = (tenders ?? []).map((t) => t.id as string);
  if (ids.length === 0) return [];
  const out: BridgeBoqLine[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await db
      .from("tender_boq_items")
      .select("id, item_code, description, discipline, section, sub_section, sub_element, unit, quantity, level, building_code")
      .in("tender_id", ids)
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      out.push({
        id: r.id as string,
        discipline: (r.discipline as string | null) ?? null,
        section: (r.section as string | null) ?? null,
        sub_section: (r.sub_section as string | null) ?? null,
        sub_element: (r.sub_element as string | null) ?? null,
        unit: (r.unit as string | null) ?? null,
        quantity: Number(r.quantity) || 0,
        level: (r.level as string | null) ?? null,
        building_code: (r.building_code as string | null) ?? null,
        item_code: (r.item_code as string | null) ?? null,
        description: (r.description as string | null) ?? null,
      });
    }
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

/** True when the signed-in user may edit company libraries (the same check RLS applies). */
export async function canManageLibraries(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc("can_manage_master_libraries");
  return !error && data === true;
}
