// Data access for the Activity Database "Details" chips: Shop Drawings, Materials, Coordination (and their libraries).
// Migration: 20261023125542_planning_activity_chip_libraries.sql. Reads are open to every authenticated user; every write is
// enforced by RLS (can_manage_master_libraries()). Links are catalogue knowledge: editable at any master status.

import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages, inChunks } from "./in-chunks";
import { safeTerm } from "./catalogue-rules";
import { countBy, materialDisplayName, sortByDivision, type ChipKind, type TcType } from "./activity-chips-rules";

type Db = SupabaseClient;
type DbError = { message: string; code?: string } | null;

export type { ChipKind };

export interface Chip { linkId: string; id: string; code: string; name: string; unit?: string; tcType?: TcType }
export interface MasterChips { shopDrawings: Chip[]; materials: Chip[]; coordination: Chip[]; methodStatements: Chip[]; tcItems: Chip[] }

export interface MethodStatement {
  id: string; code: string; name: string; csi_division_code: string | null; description: string | null; reference_doc: string | null; is_active: boolean; sort_order: number;
}
export interface TcItem {
  id: string; code: string; name: string; csi_division_code: string | null; tc_type: TcType; standard_ref: string | null; acceptance_criteria: string | null;
  is_active: boolean; sort_order: number;
}
const MS_COLS = "id, code, name, csi_division_code, description, reference_doc, is_active, sort_order";
const TC_COLS = "id, code, name, csi_division_code, tc_type, standard_ref, acceptance_criteria, is_active, sort_order";

export interface ShopDrawingType {
  id: string; code: string; name: string; csi_division_code: string | null; description: string | null; is_active: boolean; sort_order: number;
}
export interface CoordinationItem {
  id: string; code: string; name: string; discipline: string | null; description: string | null; is_active: boolean; sort_order: number;
}
export interface MaterialOption { id: string; code: string; name: string; unit: string }
export interface MaterialListRow extends MaterialOption { usedBy: number }
export type WithUsage<T> = T & { usedBy: number };

export type UsingActivity = { id: string; visible_code: string | null; code: string; name: string };

const CURRENT_EXCLUDED = "(superseded,archived)";

const LINK: Record<ChipKind, { table: string; ref: string }> = {
  shop_drawing: { table: "plan_act_master_shop_drawings", ref: "shop_drawing_type_id" },
  material: { table: "plan_act_master_materials", ref: "resource_id" },
  coordination: { table: "plan_act_master_coordination", ref: "coordination_item_id" },
  method_statement: { table: "plan_act_master_method_statements", ref: "method_statement_id" },
  tc: { table: "plan_act_master_tc_items", ref: "tc_item_id" },
};

function fail(error: NonNullable<DbError>): Error {
  const m = error.message;
  if (error.code === "23505" || /duplicate key/i.test(m)) {
    if (/master_id/i.test(m)) return new Error("That item is already linked to this activity.");
    return new Error("A record with the same code already exists.");
  }
  if (/row-level security/i.test(m)) return new Error("You do not have permission to change the activity library.");
  return new Error(m);
}
function must(error: DbError): void {
  if (error) throw fail(error);
}

// ---------------------------------------------------------------- chips of one activity

export async function getMasterChips(db: Db, masterId: string): Promise<MasterChips> {
  const { data, error } = await db.rpc("plan_act_master_chips", { p_master_id: masterId });
  must(error);
  type Raw = { link_id: string; id: string; code: string; name: string; unit?: string; tc_type?: TcType };
  const r = (data ?? {}) as { shop_drawings?: Raw[]; materials?: Raw[]; coordination?: Raw[]; method_statements?: Raw[]; tc_items?: Raw[] };
  const map = (rows: Raw[] | undefined): Chip[] =>
    (rows ?? []).map((x) => ({ linkId: x.link_id, id: x.id, code: x.code, name: x.name, unit: x.unit, tcType: x.tc_type }));
  return {
    shopDrawings: map(r.shop_drawings), materials: map(r.materials), coordination: map(r.coordination),
    methodStatements: map(r.method_statements), tcItems: map(r.tc_items),
  };
}

async function addChip(db: Db, kind: ChipKind, masterId: string, refId: string): Promise<string> {
  const { table, ref } = LINK[kind];
  const { data: last } = await db.from(table).select("sort_order").eq("master_id", masterId).order("sort_order", { ascending: false }).limit(1);
  const next = ((last?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 10;
  const { data, error } = await db.from(table).insert({ master_id: masterId, [ref]: refId, sort_order: next }).select("id");
  must(error);
  if (!data?.length) throw new Error("You do not have permission to change the activity library.");
  return (data[0] as { id: string }).id;
}
export const addShopDrawing = (db: Db, masterId: string, shopDrawingTypeId: string) => addChip(db, "shop_drawing", masterId, shopDrawingTypeId);
export const addMaterial = (db: Db, masterId: string, resourceId: string) => addChip(db, "material", masterId, resourceId);
export const addCoordination = (db: Db, masterId: string, coordinationItemId: string) => addChip(db, "coordination", masterId, coordinationItemId);
export const addMethodStatement = (db: Db, masterId: string, methodStatementId: string) => addChip(db, "method_statement", masterId, methodStatementId);
export const addTcItem = (db: Db, masterId: string, tcItemId: string) => addChip(db, "tc", masterId, tcItemId);

export async function removeChip(db: Db, kind: ChipKind, linkId: string): Promise<void> {
  const { data, error } = await db.from(LINK[kind].table).delete().eq("id", linkId).select("id");
  must(error);
  if (!data?.length) throw new Error("You do not have permission to change the activity library.");
}

/** Copies the three link sets from one master to another (duplicate and new version). */
export async function copyMasterChips(db: Db, fromId: string, toId: string): Promise<number> {
  let copied = 0;
  for (const kind of Object.keys(LINK) as ChipKind[]) {
    const { table, ref } = LINK[kind];
    const { data, error } = await db.from(table).select(`${ref}, sort_order`).eq("master_id", fromId);
    must(error);
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ master_id: toId, [ref]: r[ref], sort_order: r.sort_order }));
    if (!rows.length) continue;
    const ins = await db.from(table).insert(rows);
    must(ins.error);
    copied += rows.length;
  }
  return copied;
}

// ---------------------------------------------------------------- pickers

export async function searchShopDrawingTypes(db: Db, q: string, divisionCode?: string | null, limit = 40): Promise<ShopDrawingType[]> {
  const s = safeTerm(q);
  let qb = db.from("plan_act_shop_drawing_types").select("id, code, name, csi_division_code, description, is_active, sort_order").eq("is_active", true);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  const { data, error } = await qb.order("code").limit(200);
  must(error);
  return sortByDivision((data ?? []) as ShopDrawingType[], divisionCode ?? null).slice(0, limit);
}

export async function searchMethodStatements(db: Db, q: string, divisionCode?: string | null, limit = 40): Promise<MethodStatement[]> {
  const s = safeTerm(q);
  let qb = db.from("plan_act_method_statements").select(MS_COLS).eq("is_active", true);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  const { data, error } = await qb.order("code").limit(200);
  must(error);
  return sortByDivision((data ?? []) as MethodStatement[], divisionCode ?? null).slice(0, limit);
}

export async function searchTcItems(db: Db, q: string, divisionCode?: string | null, limit = 40): Promise<TcItem[]> {
  const s = safeTerm(q);
  let qb = db.from("plan_act_tc_items").select(TC_COLS).eq("is_active", true);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  const { data, error } = await qb.order("code").limit(200);
  must(error);
  return sortByDivision((data ?? []) as TcItem[], divisionCode ?? null).slice(0, limit);
}

export async function searchCoordinationItems(db: Db, q: string, limit = 40): Promise<CoordinationItem[]> {
  const s = safeTerm(q);
  let qb = db.from("plan_act_coordination_items").select("id, code, name, discipline, description, is_active, sort_order").eq("is_active", true);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  const { data, error } = await qb.order("sort_order").order("code").limit(limit);
  must(error);
  return (data ?? []) as CoordinationItem[];
}

type ResourceRow = { id: string; code: string; description: string; unit: string };

async function withMaterialNames(db: Db, rows: ResourceRow[]): Promise<MaterialOption[]> {
  const attrs = await inChunks<{ resource_id: string; material_name: string | null }>(rows.map((r) => r.id), (p) =>
    db.from("dwl_material_attributes").select("resource_id, material_name").in("resource_id", p));
  const nameById = new Map(attrs.map((a) => [a.resource_id, a.material_name]));
  return rows.map((r) => ({ id: r.id, code: r.code, unit: r.unit, name: materialDisplayName(nameById.get(r.id), r.description) }));
}

/** Active QS materials (dwl_resources category 'material') whose code or description contains `q`. */
export async function searchMaterials(db: Db, q: string, limit = 40): Promise<MaterialOption[]> {
  const s = safeTerm(q);
  let qb = db.from("dwl_resources").select("id, code, description, unit").eq("category", "material").eq("is_active", true);
  if (s) qb = qb.or(`code.ilike.%${s}%,description.ilike.%${s}%`);
  const { data, error } = await qb.order("description").limit(limit);
  must(error);
  return withMaterialNames(db, (data ?? []) as ResourceRow[]);
}

// ---------------------------------------------------------------- usage

/** Number of current activities per referenced id (superseded / archived masters do not count). */
async function usageCounts(db: Db, kind: ChipKind, ids: string[]): Promise<Map<string, number>> {
  const { table, ref } = LINK[kind];
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 150) {
    const part = ids.slice(i, i + 150);
    const rows = await allPages<Record<string, string>>((from, to) =>
      db.from(table).select(`${ref}, plan_act_masters!inner(status)`).in(ref, part)
        .not("plan_act_masters.status", "in", CURRENT_EXCLUDED).order("id").range(from, to) as never);
    for (const [k, n] of countBy(rows, (r) => r[ref])) out.set(k, (out.get(k) ?? 0) + n);
  }
  return out;
}

/** Current activities linked to a library item (shop drawing type, material resource or coordination item). */
export async function listActivitiesUsingChip(db: Db, kind: ChipKind, refId: string): Promise<UsingActivity[]> {
  const { table, ref } = LINK[kind];
  const { data, error } = await db.from(table).select("master_id").eq(ref, refId);
  must(error);
  const ids = ((data ?? []) as { master_id: string }[]).map((r) => r.master_id);
  const rows = await inChunks<UsingActivity>(ids, (p) =>
    db.from("plan_act_masters").select("id, visible_code, code, name").in("id", p).not("status", "in", CURRENT_EXCLUDED));
  return rows.sort((a, b) => (a.visible_code ?? "~").localeCompare(b.visible_code ?? "~") || a.code.localeCompare(b.code));
}

/** Material tab: QS materials with the number of activities that use each (read-only). */
export async function listMaterialsLibrary(db: Db, opts: { q?: string; limit?: number } = {}): Promise<MaterialListRow[]> {
  const mats = await searchMaterials(db, opts.q ?? "", opts.limit ?? 300);
  const used = await usageCounts(db, "material", mats.map((m) => m.id));
  return mats.map((m) => ({ ...m, usedBy: used.get(m.id) ?? 0 }));
}

// ---------------------------------------------------------------- libraries (shop drawing types, coordination items)

export interface ShopDrawingInput { id?: string; code: string; name: string; csi_division_code: string | null; description: string | null; sort_order: number }
export interface CoordinationInput { id?: string; code: string; name: string; discipline: string | null; description: string | null; sort_order: number }

function clean<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === "string" ? (v.trim() === "" && k !== "name" && k !== "code" ? null : v.trim()) : v;
  return out as T;
}

export async function listShopDrawingTypes(db: Db, opts: { q?: string } = {}): Promise<WithUsage<ShopDrawingType>[]> {
  const s = safeTerm(opts.q ?? "");
  let qb = db.from("plan_act_shop_drawing_types").select("id, code, name, csi_division_code, description, is_active, sort_order");
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  const { data, error } = await qb.order("code").limit(1000);
  must(error);
  const rows = (data ?? []) as ShopDrawingType[];
  const used = await usageCounts(db, "shop_drawing", rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, usedBy: used.get(r.id) ?? 0 }));
}

export async function listCoordinationItems(db: Db, opts: { q?: string } = {}): Promise<WithUsage<CoordinationItem>[]> {
  const s = safeTerm(opts.q ?? "");
  let qb = db.from("plan_act_coordination_items").select("id, code, name, discipline, description, is_active, sort_order");
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%,discipline.ilike.%${s}%`);
  const { data, error } = await qb.order("sort_order").order("code").limit(1000);
  must(error);
  const rows = (data ?? []) as CoordinationItem[];
  const used = await usageCounts(db, "coordination", rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, usedBy: used.get(r.id) ?? 0 }));
}

async function upsert(db: Db, table: string, input: { id?: string } & Record<string, unknown>): Promise<void> {
  const { id, ...rest } = input;
  const row = clean(rest);
  const res = id ? await db.from(table).update(row).eq("id", id).select("id") : await db.from(table).insert(row).select("id");
  must(res.error);
  if (!res.data?.length) throw new Error("You do not have permission to change the activity library.");
}
export const upsertShopDrawingType = (db: Db, input: ShopDrawingInput) => upsert(db, "plan_act_shop_drawing_types", { ...input });
export const upsertCoordinationItem = (db: Db, input: CoordinationInput) => upsert(db, "plan_act_coordination_items", { ...input });

async function setActive(db: Db, table: string, id: string, active: boolean): Promise<void> {
  const { data, error } = await db.from(table).update({ is_active: active }).eq("id", id).select("id");
  must(error);
  if (!data?.length) throw new Error("You do not have permission to change the activity library.");
}
export const setShopDrawingTypeActive = (db: Db, id: string, active: boolean) => setActive(db, "plan_act_shop_drawing_types", id, active);
export const setCoordinationItemActive = (db: Db, id: string, active: boolean) => setActive(db, "plan_act_coordination_items", id, active);

// ---------------------------------------------------------------- method statements and T&C libraries

export interface MethodStatementInput { id?: string; code: string; name: string; csi_division_code: string | null; description: string | null; reference_doc: string | null; sort_order: number }
export interface TcItemInput {
  id?: string; code: string; name: string; csi_division_code: string | null; tc_type: TcType; standard_ref: string | null; acceptance_criteria: string | null; sort_order: number;
}

export async function listMethodStatements(db: Db, opts: { q?: string } = {}): Promise<WithUsage<MethodStatement>[]> {
  const s = safeTerm(opts.q ?? "");
  let qb = db.from("plan_act_method_statements").select(MS_COLS);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%`);
  const { data, error } = await qb.order("code").limit(1000);
  must(error);
  const rows = (data ?? []) as MethodStatement[];
  const used = await usageCounts(db, "method_statement", rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, usedBy: used.get(r.id) ?? 0 }));
}

export async function listTcItems(db: Db, opts: { q?: string; type?: TcType | "all" } = {}): Promise<WithUsage<TcItem>[]> {
  const s = safeTerm(opts.q ?? "");
  let qb = db.from("plan_act_tc_items").select(TC_COLS);
  if (opts.type && opts.type !== "all") qb = qb.eq("tc_type", opts.type);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%,standard_ref.ilike.%${s}%`);
  const { data, error } = await qb.order("code").limit(1000);
  must(error);
  const rows = (data ?? []) as TcItem[];
  const used = await usageCounts(db, "tc", rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, usedBy: used.get(r.id) ?? 0 }));
}

export const upsertMethodStatement = (db: Db, input: MethodStatementInput) => upsert(db, "plan_act_method_statements", { ...input });
export const upsertTcItem = (db: Db, input: TcItemInput) => upsert(db, "plan_act_tc_items", { ...input });
export const setMethodStatementActive = (db: Db, id: string, active: boolean) => setActive(db, "plan_act_method_statements", id, active);
export const setTcItemActive = (db: Db, id: string, active: boolean) => setActive(db, "plan_act_tc_items", id, active);
