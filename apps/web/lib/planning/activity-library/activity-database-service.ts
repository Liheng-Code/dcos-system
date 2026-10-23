// Data access for the Activity Database (doc 23): CSI divisions (core library, lib/csi-divisions.ts), catalogue fields on plan_act_masters,
// master <-> BOQ (dwl_work_items) links with manpower / equipment hrs per unit, image upload, duplicate / delete.
// Migration: 20261023091500_planning_activity_database.sql. Reads are open to every authenticated user; writes are
// enforced by RLS (can_manage_master_libraries()) and the frozen guards, whose messages are translated here.
// Every .in() goes through inChunks (PostgREST URL limit).

import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages, inChunks } from "./in-chunks";
import { listLogicRules } from "./library-service";
import type { LibraryStatus, Relation } from "./types";
import type { ActivityType } from "./activity-database-import";
import { pickLatestPerCode, safeTerm } from "./catalogue-rules";
import { copyMasterChips } from "./activity-chips-service";
import { divisionOfSection, isValidDivisionCode, isValidSectionCode, listCsiDivisions, type CsiDivision } from "@/lib/csi-divisions";

export { canArchive, safeTerm } from "./catalogue-rules";

type Db = SupabaseClient;
type DbError = { message: string; code?: string } | null;

export const ACTIVITY_IMAGE_BUCKET = "activity-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Translates trigger / RLS / constraint errors into messages a planner can act on. */
export function friendlyDbError(error: { message: string; code?: string }): Error {
  const m = error.message;
  if (/immutable|create a new version/i.test(m) && !/frozen/i.test(m)) {
    return new Error("This activity is approved or active, so its name, unit, type and duration limits are locked. Create a new version to change them.");
  }
  if (/frozen/i.test(m)) {
    return new Error("This activity is not a draft, so its BOQ links and logic are locked. Create a new version to change them.");
  }
  if (error.code === "23505" || /duplicate key/i.test(m)) {
    if (/visible_code/i.test(m)) return new Error("That visible code is already used by another activity.");
    if (/master_work_items/i.test(m)) return new Error("That BOQ item is already linked to this activity.");
    return new Error("A record with the same code already exists.");
  }
  if (/row-level security/i.test(m)) return new Error("You do not have permission to change the activity library.");
  if (/duration_pct_chk/i.test(m)) return new Error("Duration % must be between 0 and 100 and min must not exceed max.");
  return new Error(m);
}

function must(error: DbError): void {
  if (error) throw friendlyDbError(error);
}

const CURRENT_EXCLUDED = "(superseded,archived)"; // "current" master = status not in this list (same as plan_act_bank_search)

// ---------------------------------------------------------------- types

/** A CSI MasterFormat 2016 division (csi_divisions); `code` is the key everywhere. */
export type Division = CsiDivision;
export interface CsiSectionRef { code: string; name: string }
export interface DivisionWithCounts extends Division { activityCount: number; workItemCount: number }

export interface MasterRow {
  id: string;
  visible_code: string | null;
  code: string;
  name: string;
  description: string | null;
  default_unit: string | null;
  status: LibraryStatus;
  version: number;
  csi_division_code: string | null;
  csi_section_code: string | null;
  trade: string | null;
  activity_type: ActivityType | null;
  min_duration_pct: number | null;
  max_duration_pct: number | null;
  /** Default workers per crew (BOQ-driven programme: duration = man-hours / (crew x hours per day)). */
  crew_size: number | null;
  /** Working hours per day for the crew; defaults to 8. */
  hours_per_day: number | null;
  image_path: string | null;
  domain_id: string;
  category_id: string;
  family_id: string;
  discipline: string | null;
  work_type: string | null;
}
export interface MasterListRow extends MasterRow { workItemCount: number }

export interface MasterDetail {
  master: MasterRow;
  division: Division | null;
  section: CsiSectionRef | null;
  workItemCount: number;
  /** Name, unit, description, type and duration % can only change while the master is a draft. */
  versionedFieldsEditable: boolean;
}

export interface MasterDetailsPatch {
  // versioned (draft only)
  name?: string;
  description?: string | null;
  default_unit?: string | null;
  activity_type?: ActivityType | null;
  min_duration_pct?: number | null;
  max_duration_pct?: number | null;
  // catalogue (any status)
  /** CSI division code, two digits, e.g. "26". Changing it re-issues the visible code (D26-nnn) unless the code already fits. */
  csi_division_code?: string | null;
  /** CSI section code, e.g. "26 05 00"; must belong to the division. */
  csi_section_code?: string | null;
  visible_code?: string | null;
  trade?: string | null;
  /** Whole number > 0, or null. Editable on any status. */
  crew_size?: number | null;
  /** More than 0 and at most 24, or null. Editable on any status. */
  hours_per_day?: number | null;
  image_path?: string | null;
}
const VERSIONED_KEYS: (keyof MasterDetailsPatch)[] = ["name", "description", "default_unit", "activity_type", "min_duration_pct", "max_duration_pct"];

export interface WorkItemRef { id: string; code: string; name?: string | null; description: string; unit: string }
export interface MasterWorkItemLink {
  linkId: string;
  workItem: WorkItemRef;
  durationDaysPerUnit: number | null;
  sharePct: number;
  /** resourceId -> hours (or units) per unit of the work item. */
  resources: Record<string, number>;
}
export interface ResourceColumn { resourceId: string; name: string; kind: "M" | "E"; unit: string }
export interface MasterWorkItemGrid { links: MasterWorkItemLink[]; columns: ResourceColumn[] }

export interface BankSearchResult {
  activities: { id: string; visible_code: string | null; code: string; name: string; default_unit: string | null; csi_division_code: string | null; csi_section_code: string | null }[];
  workItems: WorkItemRef[];
}

export interface WorkItemListRow extends WorkItemRef { boqSection?: string; usedBy: number }
export interface Page<T> { items: T[]; total: number }

export interface ResourceListRow { id: string; code: string; name: string; kind: "labor" | "equipment"; unit: string; workItemCount: number }

export interface LogicNeighbour {
  ruleId: string;
  master: { id: string; visible_code: string | null; code: string; name: string };
  relation: Relation;
  lagDays: number;
  isOptional: boolean;
  note: string | null;
}
export interface MasterLogic { predecessors: LogicNeighbour[]; successors: LogicNeighbour[] }

export type DeleteMasterResult = { deleted: true } | { deleted: false; reason: string };

export interface DuplicateResult {
  master: MasterRow;
  copied: { links: number; logic: number; requirements: number; methods: number; quantityRules: number; applicability: number };
  /** Logic rules that could not be copied because the counterpart activity is not a draft. */
  skippedLogic: number;
}

const MASTER_COLS =
  "id, visible_code, code, name, description, default_unit, status, version, csi_division_code, csi_section_code, trade, activity_type, min_duration_pct, max_duration_pct, crew_size, hours_per_day, image_path, domain_id, category_id, family_id, discipline, work_type";

function toMasterRow(r: Record<string, unknown>): MasterRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...(r as unknown as MasterRow),
    min_duration_pct: n(r.min_duration_pct), max_duration_pct: n(r.max_duration_pct), crew_size: n(r.crew_size), hours_per_day: n(r.hours_per_day),
  };
}


// ---------------------------------------------------------------- divisions

/** Every CSI division (active and inactive, with group_name and is_active) with its activity and BOQ item counts. */
export async function listDivisionsWithCounts(db: Db): Promise<DivisionWithCounts[]> {
  const [divisions, c] = await Promise.all([listCsiDivisions(db), db.rpc("plan_act_csi_division_counts")]);
  must(c.error);
  const counts = new Map<string, { a: number; w: number }>();
  for (const r of (c.data ?? []) as { division_code: string; activity_count: number | string; work_item_count: number | string }[]) {
    counts.set(r.division_code, { a: Number(r.activity_count), w: Number(r.work_item_count) });
  }
  return divisions.map((x) => ({ ...x, activityCount: counts.get(x.code)?.a ?? 0, workItemCount: counts.get(x.code)?.w ?? 0 }));
}

// ---------------------------------------------------------------- masters

async function linkCounts(db: Db, masterIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < masterIds.length; i += 150) {
    const part = masterIds.slice(i, i + 150);
    const rows = await allPages<{ master_id: string }>((from, to) =>
      db.from("plan_act_master_work_items").select("master_id").in("master_id", part).order("id").range(from, to));
    for (const r of rows) map.set(r.master_id, (map.get(r.master_id) ?? 0) + 1);
  }
  return map;
}

/** Current masters (not superseded / archived) of a CSI division, or of every division when null, ordered by visible code. */
export async function listMastersForDivision(db: Db, divisionCode: string | null): Promise<MasterListRow[]> {
  const all = await allPages<Record<string, unknown>>((from, to) => {
    let qb = db.from("plan_act_masters").select(MASTER_COLS).not("status", "in", CURRENT_EXCLUDED);
    if (divisionCode) qb = qb.eq("csi_division_code", divisionCode);
    return qb.order("visible_code", { nullsFirst: false }).order("code").order("version", { ascending: false }).order("id").range(from, to);
  });
  // one row per activity: the latest non-superseded version (see pickLatestPerCode)
  const rows = pickLatestPerCode(all as (Record<string, unknown> & { code: string; version: number })[]);
  const counts = await linkCounts(db, rows.map((r) => r.id as string));
  return rows.map((r) => ({ ...toMasterRow(r), workItemCount: counts.get(r.id as string) ?? 0 }));
}

export async function getMasterDetail(db: Db, id: string): Promise<MasterDetail | null> {
  const { data, error } = await db.from("plan_act_masters").select(MASTER_COLS).eq("id", id).maybeSingle();
  must(error);
  if (!data) return null;
  const master = toMasterRow(data as Record<string, unknown>);
  const [div, sec, cnt] = await Promise.all([
    master.csi_division_code ? db.from("csi_divisions").select("code, name, group_name, sort_order, is_active").eq("code", master.csi_division_code).maybeSingle() : Promise.resolve({ data: null, error: null }),
    master.csi_section_code ? db.from("csi_sections").select("code, name").eq("code", master.csi_section_code).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from("plan_act_master_work_items").select("id", { count: "exact", head: true }).eq("master_id", id),
  ]);
  must(div.error);
  must(sec.error);
  must(cnt.error);
  return { master, division: (div.data as Division | null) ?? null, section: (sec.data as CsiSectionRef | null) ?? null, workItemCount: cnt.count ?? 0, versionedFieldsEditable: master.status === "draft" };
}

export async function updateMasterDetails(db: Db, id: string, patch: MasterDetailsPatch): Promise<MasterRow> {
  const current = await getMasterDetail(db, id);
  if (!current) throw new Error("Activity not found");
  const m = current.master;

  const touched = VERSIONED_KEYS.filter((k) => k in patch && (patch[k] ?? null) !== (m[k as keyof MasterRow] ?? null));
  if (m.status !== "draft" && touched.length) {
    throw new Error(
      `This activity is ${m.status}, so ${touched.join(", ").replace(/_/g, " ")} cannot be changed. Create a new version, or edit only the CSI division / section, visible code, trade and image.`,
    );
  }
  const min = "min_duration_pct" in patch ? patch.min_duration_pct ?? null : m.min_duration_pct;
  const max = "max_duration_pct" in patch ? patch.max_duration_pct ?? null : m.max_duration_pct;
  if (min !== null && max !== null && min > max) throw new Error("Min duration % must not exceed max duration %.");
  if (patch.name !== undefined && !patch.name.trim()) throw new Error("Name is required.");
  if (patch.crew_size != null && !(Number.isInteger(patch.crew_size) && patch.crew_size > 0)) throw new Error("Crew size must be a whole number greater than 0.");
  if (patch.hours_per_day != null && !(patch.hours_per_day > 0 && patch.hours_per_day <= 24)) throw new Error("Hours per day must be more than 0 and at most 24.");

  // CSI division / section: format, and the section must belong to the division it will end up with
  const divPatch = "csi_division_code" in patch ? (patch.csi_division_code?.trim() || null) : undefined;
  const secPatch = "csi_section_code" in patch ? (patch.csi_section_code?.trim() || null) : undefined;
  if (divPatch && !isValidDivisionCode(divPatch)) throw new Error(`CSI division must be two digits such as 03 or 26 (got "${divPatch}").`);
  if (secPatch && !isValidSectionCode(secPatch)) throw new Error(`CSI section must look like 03 30 00 (got "${secPatch}").`);
  if (secPatch) {
    const finalDivision = divPatch !== undefined ? divPatch : m.csi_division_code;
    if (finalDivision && divisionOfSection(secPatch) !== finalDivision) throw new Error(`CSI section ${secPatch} does not belong to division ${finalDivision}.`);
  }

  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    clean[k] = typeof v === "string" ? (v.trim() === "" && k !== "name" ? null : v.trim()) : v;
  }
  if (!Object.keys(clean).length) return m;

  const { data, error } = await db.from("plan_act_masters").update(clean).eq("id", id).select(MASTER_COLS);
  must(error);
  if (!data?.length) throw new Error("You do not have permission to change the activity library.");
  return toMasterRow(data[0] as Record<string, unknown>);
}

// ---------------------------------------------------------------- BOQ links with M/E hrs per unit

export async function listWorkItemsForMaster(db: Db, masterId: string): Promise<MasterWorkItemGrid> {
  const { data, error } = await db.from("plan_act_master_work_items")
    .select("id, work_item_id, duration_days_per_unit, share_pct, sort_order").eq("master_id", masterId).order("sort_order").order("created_at");
  must(error);
  const links = (data ?? []) as { id: string; work_item_id: string; duration_days_per_unit: number | null; share_pct: number }[];
  if (!links.length) return { links: [], columns: [] };
  const ids = links.map((l) => l.work_item_id);

  const [items, res] = await Promise.all([
    inChunks<WorkItemRef>(ids, (p) => db.from("dwl_work_items").select("id, code, name, description, unit").in("id", p)),
    inChunks<{ work_item_id: string; resource_id: string; consumption: number | string; dwl_resources: { id: string; code: string; description: string; category: string; unit: string } | null }>(
      ids,
      (p) => db.from("dwl_work_item_resources").select("work_item_id, resource_id, consumption, dwl_resources!inner(id, code, description, category, unit)")
        .in("work_item_id", p).in("dwl_resources.category", ["labor", "equipment"]) as never,
    ),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const colMap = new Map<string, ResourceColumn>();
  const byItem = new Map<string, Record<string, number>>();
  for (const r of res) {
    if (!r.dwl_resources) continue;
    const kind = r.dwl_resources.category === "equipment" ? "E" : "M";
    if (!colMap.has(r.resource_id)) colMap.set(r.resource_id, { resourceId: r.resource_id, name: r.dwl_resources.description, kind, unit: r.dwl_resources.unit });
    const rec = byItem.get(r.work_item_id) ?? {};
    rec[r.resource_id] = Number(r.consumption);
    byItem.set(r.work_item_id, rec);
  }
  const columns = [...colMap.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "M" ? -1 : 1));
  return {
    columns,
    links: links.flatMap((l) => {
      const wi = itemById.get(l.work_item_id);
      if (!wi) return [];
      return [{
        linkId: l.id, workItem: wi, durationDaysPerUnit: l.duration_days_per_unit === null ? null : Number(l.duration_days_per_unit),
        sharePct: Number(l.share_pct), resources: byItem.get(l.work_item_id) ?? {},
      }];
    }),
  };
}

export async function addWorkItemLink(
  db: Db, masterId: string, workItemId: string, opts: { durationDaysPerUnit?: number | null; sharePct?: number } = {},
): Promise<string> {
  const { data: last } = await db.from("plan_act_master_work_items").select("sort_order").eq("master_id", masterId).order("sort_order", { ascending: false }).limit(1);
  const next = ((last?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 1;
  const { data, error } = await db.from("plan_act_master_work_items").insert({
    master_id: masterId, work_item_id: workItemId, duration_days_per_unit: opts.durationDaysPerUnit ?? null, share_pct: opts.sharePct ?? 100, sort_order: next,
  }).select("id").single();
  must(error);
  return (data as { id: string }).id;
}

export async function updateWorkItemLink(
  db: Db, linkId: string, patch: { durationDaysPerUnit?: number | null; sharePct?: number; sortOrder?: number },
): Promise<void> {
  if (patch.sharePct !== undefined && !(patch.sharePct > 0 && patch.sharePct <= 100)) throw new Error("% must be greater than 0 and at most 100.");
  if (patch.durationDaysPerUnit != null && patch.durationDaysPerUnit < 0) throw new Error("Days per unit must not be negative.");
  const row: Record<string, unknown> = {};
  if (patch.durationDaysPerUnit !== undefined) row.duration_days_per_unit = patch.durationDaysPerUnit;
  if (patch.sharePct !== undefined) row.share_pct = patch.sharePct;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (!Object.keys(row).length) return;
  const { data, error } = await db.from("plan_act_master_work_items").update(row).eq("id", linkId).select("id");
  must(error);
  if (!data?.length) throw new Error("You do not have permission to change the activity library.");
}

export async function removeWorkItemLink(db: Db, linkId: string): Promise<void> {
  const { data, error } = await db.from("plan_act_master_work_items").delete().eq("id", linkId).select("id");
  must(error);
  if (!data?.length) throw new Error("You do not have permission to change the activity library.");
}

// ---------------------------------------------------------------- work items / resources / search

/** Work items for a picker: active items whose code or description contains `q`. */
export async function searchWorkItems(db: Db, q: string, limit = 30): Promise<WorkItemRef[]> {
  const s = safeTerm(q);
  let qb = db.from("dwl_work_items").select("id, code, name, description, unit").eq("is_active", true);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%,description.ilike.%${s}%`);
  const { data, error } = await qb.order("code").limit(limit);
  must(error);
  return (data ?? []) as WorkItemRef[];
}

async function usedByCounts(db: Db, workItemIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < workItemIds.length; i += 150) {
    const part = workItemIds.slice(i, i + 150);
    // only current masters count (same rule as the division counts)
    const rows = await allPages<{ work_item_id: string }>((from, to) =>
      db.from("plan_act_master_work_items").select("work_item_id, plan_act_masters!inner(status)").in("work_item_id", part)
        .not("plan_act_masters.status", "in", CURRENT_EXCLUDED).order("id").range(from, to) as never);
    for (const r of rows) map.set(r.work_item_id, (map.get(r.work_item_id) ?? 0) + 1);
  }
  return map;
}

/**
 * Work items of a CSI division: those whose own csi_division_code matches, plus those linked to the current
 * activities of the division (union, each once). null lists the whole cost library.
 */
export async function listWorkItemsForDivision(db: Db, divisionCode: string | null, opts: { limit: number; offset: number }): Promise<Page<WorkItemListRow>> {
  const { limit, offset } = opts;
  if (!divisionCode) return listWorkItemsLibrary(db, { limit, offset });
  const masters = await allPages<{ id: string }>((from, to) =>
    db.from("plan_act_masters").select("id").eq("csi_division_code", divisionCode).not("status", "in", CURRENT_EXCLUDED).order("id").range(from, to));
  const links: { work_item_id: string }[] = [];
  for (let i = 0; i < masters.length; i += 150) {
    const part = masters.slice(i, i + 150).map((m) => m.id);
    links.push(...(await allPages<{ work_item_id: string }>((from, to) =>
      db.from("plan_act_master_work_items").select("work_item_id").in("master_id", part).order("id").range(from, to))));
  }
  const uses = new Map<string, number>();
  for (const l of links) uses.set(l.work_item_id, (uses.get(l.work_item_id) ?? 0) + 1);
  const ids = [...uses.keys()];
  const [linked, own] = await Promise.all([
    inChunks<WorkItemRef>(ids, (p) => db.from("dwl_work_items").select("id, code, name, description, unit").eq("is_active", true).in("id", p)),
    allPages<WorkItemRef>((from, to) =>
      db.from("dwl_work_items").select("id, code, name, description, unit").eq("csi_division_code", divisionCode).eq("is_active", true).order("id").range(from, to)),
  ]);
  const items = [...new Map([...linked, ...own].map((i) => [i.id, i])).values()].sort((a, b) => a.code.localeCompare(b.code));
  return { total: items.length, items: items.slice(offset, offset + limit).map((i) => ({ ...i, usedBy: uses.get(i.id) ?? 0 })) };
}

/** BOQ tab: the cost library's work items with the number of activities that use each. */
export async function listWorkItemsLibrary(db: Db, opts: { q?: string; limit: number; offset: number }): Promise<Page<WorkItemListRow>> {
  const s = safeTerm(opts.q ?? "");
  let qb = db.from("dwl_work_items").select("id, code, name, description, unit, boq_section", { count: "exact" }).eq("is_active", true);
  if (s) qb = qb.or(`code.ilike.%${s}%,name.ilike.%${s}%,description.ilike.%${s}%`);
  const { data, error, count } = await qb.order("code").order("id").range(opts.offset, opts.offset + opts.limit - 1);
  must(error);
  const rows = (data ?? []) as (WorkItemRef & { boq_section: string })[];
  const used = await usedByCounts(db, rows.map((r) => r.id));
  return {
    total: count ?? rows.length,
    items: rows.map((r) => ({ id: r.id, code: r.code, name: r.name, description: r.description, unit: r.unit, boqSection: r.boq_section, usedBy: used.get(r.id) ?? 0 })),
  };
}

/** Current activities that link a work item (for the BOQ tab drill-down). */
export async function listActivitiesUsingWorkItem(db: Db, workItemId: string): Promise<Pick<MasterRow, "id" | "visible_code" | "code" | "name">[]> {
  const { data, error } = await db.from("plan_act_master_work_items").select("master_id").eq("work_item_id", workItemId);
  must(error);
  const ids = ((data ?? []) as { master_id: string }[]).map((r) => r.master_id);
  const rows = await inChunks<Pick<MasterRow, "id" | "visible_code" | "code" | "name">>(ids, (p) =>
    db.from("plan_act_masters").select("id, visible_code, code, name").in("id", p).not("status", "in", CURRENT_EXCLUDED));
  return rows.sort((a, b) => (a.visible_code ?? "~").localeCompare(b.visible_code ?? "~") || a.code.localeCompare(b.code));
}

/** Resource tab: labour and equipment from the cost library with the number of work items that use each. */
export async function listResourcesLibrary(db: Db, opts: { q?: string; kind?: "labor" | "equipment" | "all"; limit?: number } = {}): Promise<ResourceListRow[]> {
  const kinds = !opts.kind || opts.kind === "all" ? ["labor", "equipment"] : [opts.kind];
  const s = safeTerm(opts.q ?? "");
  let qb = db.from("dwl_resources").select("id, code, description, category, unit").eq("is_active", true).in("category", kinds);
  if (s) qb = qb.or(`code.ilike.%${s}%,description.ilike.%${s}%`);
  const { data, error } = await qb.order("description").limit(opts.limit ?? 500);
  must(error);
  const res = (data ?? []) as { id: string; code: string; description: string; category: "labor" | "equipment"; unit: string }[];
  const counts = new Map<string, number>();
  for (let i = 0; i < res.length; i += 150) {
    const part = res.slice(i, i + 150).map((r) => r.id);
    const rows = await allPages<{ resource_id: string }>((from, to) =>
      db.from("dwl_work_item_resources").select("resource_id").in("resource_id", part).order("id").range(from, to));
    for (const r of rows) counts.set(r.resource_id, (counts.get(r.resource_id) ?? 0) + 1);
  }
  return res.map((r) => ({ id: r.id, code: r.code, name: r.description, kind: r.category, unit: r.unit, workItemCount: counts.get(r.id) ?? 0 }));
}

export async function searchBank(db: Db, q: string, divisionCode: string | null): Promise<BankSearchResult> {
  // named argument p_division_code selects the text overload (the uuid overload is deprecated)
  const { data, error } = await db.rpc("plan_act_bank_search", { q, p_division_code: divisionCode });
  must(error);
  const r = (data ?? {}) as { activities?: BankSearchResult["activities"]; work_items?: WorkItemRef[] };
  // the RPC does not return the work item name: add it so lists can show it instead of the long description
  const workItems = r.work_items ?? [];
  const names = await inChunks<{ id: string; name: string | null }>(workItems.map((w) => w.id), (p) => db.from("dwl_work_items").select("id, name").in("id", p));
  const nameById = new Map(names.map((n) => [n.id, n.name]));
  return { activities: r.activities ?? [], workItems: workItems.map((w) => ({ ...w, name: nameById.get(w.id) ?? null })) };
}

// ---------------------------------------------------------------- logic (predecessors / successors)

export async function listLogicForMaster(db: Db, masterId: string): Promise<MasterLogic> {
  const rules = await listLogicRules(db, masterId);
  const otherIds = [...new Set(rules.map((r) => (r.successor_master_id === masterId ? r.predecessor_master_id : r.successor_master_id)))];
  const masters = await inChunks<LogicNeighbour["master"]>(otherIds, (p) => db.from("plan_act_masters").select("id, visible_code, code, name").in("id", p));
  const byId = new Map(masters.map((m) => [m.id, m]));
  const out: MasterLogic = { predecessors: [], successors: [] };
  for (const r of rules) {
    const isPred = r.successor_master_id === masterId; // this master is the successor, so the counterpart is a predecessor
    const other = byId.get(isPred ? r.predecessor_master_id : r.successor_master_id);
    if (!other) continue;
    const n: LogicNeighbour = { ruleId: r.id, master: other, relation: r.relation, lagDays: Number(r.lag_days), isOptional: r.is_optional, note: r.note };
    (isPred ? out.predecessors : out.successors).push(n);
  }
  const byCode = (a: LogicNeighbour, b: LogicNeighbour) => (a.master.visible_code ?? a.master.code).localeCompare(b.master.visible_code ?? b.master.code);
  out.predecessors.sort(byCode);
  out.successors.sort(byCode);
  return out;
}

// ---------------------------------------------------------------- duplicate / delete

function strip<T extends Record<string, unknown>>(rows: T[]): Record<string, unknown>[] {
  return rows.map((r) => { const { id: _i, created_at: _c, updated_at: _u, ...rest } = r; void _i; void _c; void _u; return rest; });
}

async function uniqueCopyCode(db: Db, code: string): Promise<string> {
  const { data, error } = await db.from("plan_act_masters").select("code").like("code", `${code}-COPY%`);
  must(error);
  const used = new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  if (!used.has(`${code}-COPY`)) return `${code}-COPY`;
  for (let n = 2; ; n++) if (!used.has(`${code}-COPY${n}`)) return `${code}-COPY${n}`;
}

/**
 * New draft root master (version 1) from any master: same CSI division / section / trade / type / duration %, a new unique code
 * and a visible code assigned by the database. Copies BOQ links, requirements, methods, quantity rules, applicability
 * and the logic rules where this master is predecessor or successor (same counterpart).
 */
export async function duplicateMaster(db: Db, id: string): Promise<DuplicateResult> {
  const { data: srcRow, error: srcErr } = await db.from("plan_act_masters").select("*").eq("id", id).maybeSingle();
  must(srcErr);
  if (!srcRow) throw new Error("Activity not found");
  const src = srcRow as Record<string, unknown> & MasterRow & { owner: string | null; source: string | null };

  const code = await uniqueCopyCode(db, src.code);
  const { data: created, error } = await db.from("plan_act_masters").insert({
    code, name: `${src.name} (copy)`, description: src.description, domain_id: src.domain_id, category_id: src.category_id, family_id: src.family_id,
    discipline: src.discipline, work_type: src.work_type, default_unit: src.default_unit, owner: src.owner, source: src.source,
    sectors: src.sectors, building_types: src.building_types, duration_basis: src.duration_basis,
    default_work_group: src.default_work_group, default_step_template_id: src.default_step_template_id,
    csi_division_code: src.csi_division_code, csi_section_code: src.csi_section_code, trade: src.trade, activity_type: src.activity_type,
    min_duration_pct: src.min_duration_pct, max_duration_pct: src.max_duration_pct,
    crew_size: src.crew_size, hours_per_day: src.hours_per_day, image_path: null,
    applicable_project_types: src.applicable_project_types, effective_date: src.effective_date,
    visible_code: null, status: "draft", version: 1,
  }).select(MASTER_COLS).single();
  must(error);
  const master = toMasterRow(created as Record<string, unknown>);
  let copiedImage: string | null = null;
  try {
    return await copyChildren();
  } catch (e) {
    // do not leave a half-built copy behind (children cascade with the master)
    await db.from("plan_act_masters").delete().eq("id", master.id);
    if (copiedImage) await db.storage.from(ACTIVITY_IMAGE_BUCKET).remove([copiedImage]);
    throw e;
  }

  async function copyChildren(): Promise<DuplicateResult> {
  // The image is copied to its own object so deleting or replacing either activity's image never affects the other.
  if (src.image_path) {
    const newPath = `${master.id}/${Date.now()}-${src.image_path.split("/").pop() ?? "image"}`;
    const cp = await db.storage.from(ACTIVITY_IMAGE_BUCKET).copy(src.image_path, newPath);
    if (!cp.error) {
      copiedImage = newPath;
      const up = await db.from("plan_act_masters").update({ image_path: newPath }).eq("id", master.id);
      if (up.error) throw friendlyDbError(up.error);
      master.image_path = newPath;
    }
  }

  const [methods, qrules, reqs, appl, links, logicOut, logicIn] = await Promise.all([
    db.from("plan_act_methods").select("*").eq("master_id", id),
    db.from("plan_act_quantity_rules").select("*").eq("master_id", id),
    db.from("plan_act_requirements").select("*").eq("master_id", id),
    db.from("plan_act_applicability").select("*").eq("target_type", "master").eq("target_id", id),
    db.from("plan_act_master_work_items").select("*").eq("master_id", id),
    db.from("plan_act_logic_rules").select("*").eq("predecessor_master_id", id),
    db.from("plan_act_logic_rules").select("*").eq("successor_master_id", id),
  ]);
  for (const r of [methods, qrules, reqs, appl, links, logicOut, logicIn]) must(r.error);
  const rows = (r: { data: unknown }) => strip((r.data ?? []) as Record<string, unknown>[]);
  const ins = async (table: string, list: Record<string, unknown>[]) => {
    if (!list.length) return 0;
    const { error: e } = await db.from(table).insert(list);
    must(e);
    return list.length;
  };

  const copied = {
    methods: await ins("plan_act_methods", rows(methods).map((r) => ({ ...r, master_id: master.id }))),
    quantityRules: await ins("plan_act_quantity_rules", rows(qrules).map((r) => ({ ...r, master_id: master.id }))),
    requirements: await ins("plan_act_requirements", rows(reqs).map((r) => ({ ...r, master_id: master.id }))),
    applicability: await ins("plan_act_applicability", rows(appl).map((r) => ({ ...r, target_id: master.id }))),
    links: await ins("plan_act_master_work_items", rows(links).map((r) => ({ ...r, master_id: master.id }))),
    logic: 0,
  };
  await copyMasterChips(db, id, master.id);
  // Logic is owned by the successor: a rule whose successor is not a draft is frozen, so insert one by one and count the misses.
  let skippedLogic = 0;
  const logic: Record<string, unknown>[] = [
    ...rows(logicOut).map((r) => ({ ...r, predecessor_master_id: master.id })),
    ...rows(logicIn).map((r) => ({ ...r, successor_master_id: master.id })),
  ];
  for (const r of logic) {
    const { error: e } = await db.from("plan_act_logic_rules").insert(r);
    if (e) skippedLogic++;
    else copied.logic++;
  }
  return { master, copied, skippedLogic };
  }
}

/** Removes a storage object only when no master (any version) still points at it; versions share image paths. */
async function removeImageIfUnreferenced(db: Db, path: string | null): Promise<void> {
  if (!path) return;
  const { count, error } = await db.from("plan_act_masters").select("id", { count: "exact", head: true }).eq("image_path", path);
  if (error || (count ?? 0) > 0) return;
  await db.storage.from(ACTIVITY_IMAGE_BUCKET).remove([path]);
}

async function countRefs(db: Db, table: string, column: string, id: string): Promise<number> {
  const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq(column, id);
  must(error);
  return count ?? 0;
}

/**
 * Hard delete, only for a draft that no template, generation run, productivity norm, WBS task, QS WBS template or newer version uses.
 * Otherwise returns the reason; the caller can retire the activity with setMasterStatus(db, id, "archived") instead.
 */
export async function deleteMaster(db: Db, id: string): Promise<DeleteMasterResult> {
  const { data, error } = await db.from("plan_act_masters").select("id, status, code, image_path").eq("id", id).maybeSingle();
  must(error);
  if (!data) return { deleted: false, reason: "Activity not found." };
  const m = data as { status: string; code: string; image_path: string | null };
  if (m.status !== "draft") return { deleted: false, reason: `Only a draft can be deleted (this one is ${m.status}). Retire it instead.` };

  const refs: [string, string, string][] = [
    ["plan_act_template_items", "master_id", "templates"],
    ["plan_act_generation_items", "master_id", "generation runs"],
    ["plan_productivity_norms", "activity_master_id", "productivity norms"],
    ["wbs_tasks", "activity_master_id", "WBS tasks"],
    ["qs_wbs_template_items", "planning_activity_master_id", "QS WBS templates"],
    ["plan_act_masters", "supersedes_id", "a newer version"],
  ];
  const used: string[] = [];
  for (const [table, col, label] of refs) {
    const n = await countRefs(db, table, col, id);
    if (n > 0) used.push(`${label} (${n})`);
  }
  if (used.length) return { deleted: false, reason: `Used by ${used.join(", ")}. Retire it instead of deleting.` };

  const del = await db.from("plan_act_masters").delete().eq("id", id).select("id");
  if (del.error) return { deleted: false, reason: friendlyDbError(del.error).message };
  if (!del.data?.length) return { deleted: false, reason: "You do not have permission to delete activities." };
  await removeImageIfUnreferenced(db, m.image_path);
  return { deleted: true };
}

// ---------------------------------------------------------------- image

export async function uploadMasterImage(db: Db, id: string, file: File | Blob & { name?: string }): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG, WebP).");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("The image must be 5 MB or smaller.");
  const { data: cur, error: curErr } = await db.from("plan_act_masters").select("image_path").eq("id", id).maybeSingle();
  must(curErr);
  if (!cur) throw new Error("Activity not found");
  const rawName = (file as { name?: string }).name ?? "image";
  const safe = rawName.replace(/[^\w.-]+/g, "_").slice(-60) || "image";
  const path = `${id}/${Date.now()}-${safe}`;
  const up = await db.storage.from(ACTIVITY_IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw friendlyDbError(up.error);
  const { data, error } = await db.from("plan_act_masters").update({ image_path: path }).eq("id", id).select("id");
  if (error || !data?.length) {
    await db.storage.from(ACTIVITY_IMAGE_BUCKET).remove([path]);
    if (error) throw friendlyDbError(error);
    throw new Error("You do not have permission to change the activity library.");
  }
  const old = (cur as { image_path: string | null }).image_path;
  if (old && old !== path) await removeImageIfUnreferenced(db, old);
  return path;
}

/** Signed URL for a private-bucket image, or null when there is none. */
export async function getMasterImageUrl(db: Db, path: string | null, expiresInSeconds = 3600): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await db.storage.from(ACTIVITY_IMAGE_BUCKET).createSignedUrl(path, expiresInSeconds);
  return error ? null : data.signedUrl;
}
