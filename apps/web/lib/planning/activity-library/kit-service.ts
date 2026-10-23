// Generation kits: data access (Activity Library › Kits). Rules: kit-plan.ts.
// Tables: plan_act_kits / plan_act_kit_items (migration 20261021000022). RLS: can_manage_master_libraries() to write;
// a kit's items are frozen once it leaves draft (create a new version to change them).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Kit, KitItem } from "./kit-plan";
import type { ApplicabilityRule, LibraryStatus } from "./types";
import { allPages } from "./in-chunks";

type Db = SupabaseClient;

const KIT_COLUMNS = "id, code, name, description, status, version, supersedes_id, sectors, building_types, updated_at";

export async function listKits(db: Db): Promise<Kit[]> {
  const { data, error } = await db.from("plan_act_kits").select(KIT_COLUMNS).order("code").order("version", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Kit[]).map((k) => ({ ...k, sectors: k.sectors ?? [], building_types: k.building_types ?? [] }));
}

export async function listKitItems(db: Db, kitId: string): Promise<KitItem[]> {
  const { data, error } = await db.from("plan_act_kit_items").select("id, part, template_code, building_types, sort_order").eq("kit_id", kitId).order("sort_order");
  if (error) throw new Error(error.message);
  return ((data ?? []) as KitItem[]).map((i) => ({ ...i, building_types: i.building_types ?? [] }));
}

export async function createKit(db: Db, input: Pick<Kit, "code" | "name" | "description" | "sectors" | "building_types">): Promise<Kit> {
  const { data, error } = await db.from("plan_act_kits").insert({ ...input, status: "draft", version: 1 }).select(KIT_COLUMNS).single();
  if (error) throw new Error(error.message);
  return data as Kit;
}

/** Header fields; name / description / sectors stay editable on any status (classification, not recipe). */
export async function updateKitHeader(db: Db, id: string, patch: Partial<Pick<Kit, "name" | "description" | "sectors" | "building_types">>): Promise<void> {
  const { error } = await db.from("plan_act_kits").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Replaces a draft kit's items (sort_order follows the given order). */
export async function saveKitItems(db: Db, kitId: string, items: KitItem[]): Promise<void> {
  const { error: de } = await db.from("plan_act_kit_items").delete().eq("kit_id", kitId);
  if (de) throw new Error(de.message);
  if (!items.length) return;
  const { error } = await db.from("plan_act_kit_items").insert(items.map((it, i) => ({
    kit_id: kitId, part: it.part, template_code: it.template_code, building_types: it.building_types, sort_order: (i + 1) * 10,
  })));
  if (error) throw new Error(error.message);
}

export async function setKitStatus(db: Db, id: string, status: LibraryStatus): Promise<void> {
  const { error } = await db.from("plan_act_kits").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Activates an approved kit; the code's previous active version becomes superseded. */
export async function activateKit(db: Db, id: string): Promise<void> {
  const { data: k, error } = await db.from("plan_act_kits").select("code").eq("id", id).single();
  if (error) throw new Error(error.message);
  const { data: active } = await db.from("plan_act_kits").select("id").eq("code", (k as { code: string }).code).eq("status", "active");
  for (const a of (active ?? []) as { id: string }[]) await setKitStatus(db, a.id, "superseded");
  await setKitStatus(db, id, "active");
}

/** New draft version of a kit (copy of its header and items). Returns the new kit. */
export async function createKitVersion(db: Db, id: string): Promise<Kit> {
  const { data: src, error } = await db.from("plan_act_kits").select(KIT_COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  const k = src as Kit;
  const { data: latest } = await db.from("plan_act_kits").select("version").eq("code", k.code).order("version", { ascending: false }).limit(1);
  const next = ((latest?.[0] as { version: number } | undefined)?.version ?? k.version) + 1;
  const { data: created, error: ce } = await db.from("plan_act_kits").insert({
    code: k.code, name: k.name, description: k.description, sectors: k.sectors, building_types: k.building_types,
    status: "draft", version: next, supersedes_id: k.id,
  }).select(KIT_COLUMNS).single();
  if (ce) throw new Error(ce.message);
  await saveKitItems(db, (created as Kit).id, await listKitItems(db, id));
  return created as Kit;
}

export async function deleteKit(db: Db, id: string): Promise<void> {
  const { error } = await db.from("plan_act_kits").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Conditions of every template, by template id (for picking between a part's alternatives on Generate). */
export async function listTemplateConditions(db: Db): Promise<Record<string, ApplicabilityRule[]>> {
  const rows = await allPages<ApplicabilityRule & { target_id: string }>((from, to) => db.from("plan_act_applicability")
    .select("target_id, attribute, operator, values").eq("target_type", "template").order("id").range(from, to));
  const out: Record<string, ApplicabilityRule[]> = {};
  for (const { target_id, ...rule } of rows) (out[target_id] ??= []).push(rule as ApplicabilityRule);
  return out;
}

export interface ScopeTreeRow { id: string; parent_id: string | null; node_type: string | null; wbs_name: string; wbs_code: string | null }

/** Every WBS node of the project (for grouping levels by building / route). */
export async function listScopeTree(db: Db, projectId: string): Promise<ScopeTreeRow[]> {
  return allPages<ScopeTreeRow>((from, to) => db.from("wbs_nodes").select("id, parent_id, node_type, wbs_name, wbs_code")
    .eq("project_id", projectId).order("id").range(from, to));
}
