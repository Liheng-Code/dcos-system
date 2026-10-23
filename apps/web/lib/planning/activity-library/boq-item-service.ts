// Data access for the BOQ item detail dialog (Activity Database): edit a QS work item (dwl_work_items), its image, the manpower /
// equipment consumption per BOQ unit (dwl_work_item_resources) and its links to master activities.
// Migration: 20261023141500_qs_work_item_name_image_audit.sql (name, image_path, history triggers, library-manager policies).
// Library managers write; everyone else reads. Every write checks that a row came back, because RLS filters silently.

import type { SupabaseClient } from "@supabase/supabase-js";
import { allPages } from "./in-chunks";
import { safeTerm } from "./catalogue-rules";
import { divisionOfSection, isValidDivisionCode, isValidSectionCode } from "@/lib/csi-divisions";
import { ACTIVITY_IMAGE_BUCKET, friendlyDbError, type ResourceColumn } from "./activity-database-service";
import { mergeUnits, type WorkItemUsage } from "./boq-item-rules";

type Db = SupabaseClient;
type DbError = { message: string; code?: string } | null;

const NO_PERMISSION = "You do not have permission to change the cost library.";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CURRENT_EXCLUDED = "(superseded,archived)";

function must(error: DbError): void {
  if (error) throw friendlyDbError(error);
}

// ---------------------------------------------------------------- work item

export interface WorkItemDetail {
  id: string; tenant_id: string; code: string; name: string | null; description: string; unit: string;
  csi_division_code: string | null; csi_section_code: string | null; image_path: string | null; is_active: boolean; boq_section: string;
}
const ITEM_COLS = "id, tenant_id, code, name, description, unit, csi_division_code, csi_section_code, image_path, is_active, boq_section";

export async function getWorkItemDetail(db: Db, id: string): Promise<WorkItemDetail | null> {
  const { data, error } = await db.from("dwl_work_items").select(ITEM_COLS).eq("id", id).maybeSingle();
  must(error);
  return (data as WorkItemDetail | null) ?? null;
}

export interface WorkItemPatch {
  name?: string; description?: string; unit?: string; csi_division_code?: string | null; csi_section_code?: string | null; image_path?: string | null; is_active?: boolean;
}

export async function updateWorkItem(db: Db, id: string, patch: WorkItemPatch): Promise<WorkItemDetail> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error("Name is required.");
  if (patch.unit !== undefined && !patch.unit.trim()) throw new Error("Unit is required.");
  const div = patch.csi_division_code?.trim() || null;
  const sec = patch.csi_section_code?.trim() || null;
  if (div && !isValidDivisionCode(div)) throw new Error(`CSI division must be two digits such as 03 or 26 (got "${div}").`);
  if (sec && !isValidSectionCode(sec)) throw new Error(`CSI section must look like 03 30 00 (got "${sec}").`);
  if (sec && div && divisionOfSection(sec) !== div) throw new Error(`CSI section ${sec} does not belong to division ${div}.`);

  const row: Record<string, unknown> = { ...patch };
  if ("csi_division_code" in patch) row.csi_division_code = div;
  if ("csi_section_code" in patch) row.csi_section_code = div ? sec : null;
  for (const k of ["name", "description", "unit"] as const) if (typeof row[k] === "string") row[k] = (row[k] as string).trim();
  const { data, error } = await db.from("dwl_work_items").update(row).eq("id", id).select(ITEM_COLS);
  must(error);
  if (!data?.length) throw new Error(NO_PERMISSION);
  return data[0] as WorkItemDetail;
}

/** Distinct units already used in the cost library (plus `current`), for the Unit select. */
export async function listWorkItemUnits(db: Db, current?: string | null): Promise<string[]> {
  const rows = await allPages<{ unit: string }>((from, to) => db.from("dwl_work_items").select("unit").order("id").range(from, to));
  return mergeUnits(rows.map((r) => r.unit), current);
}

export async function uploadWorkItemImage(db: Db, id: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG, JPG, WebP).");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("The image must be 5 MB or smaller.");
  const cur = await getWorkItemDetail(db, id);
  if (!cur) throw new Error("BOQ item not found");
  const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-60) || "image";
  const path = `work-items/${id}/${Date.now()}-${safe}`;
  const up = await db.storage.from(ACTIVITY_IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw friendlyDbError(up.error);
  try {
    await updateWorkItem(db, id, { image_path: path });
  } catch (e) {
    await db.storage.from(ACTIVITY_IMAGE_BUCKET).remove([path]);
    throw e;
  }
  if (cur.image_path && cur.image_path !== path) await db.storage.from(ACTIVITY_IMAGE_BUCKET).remove([cur.image_path]);
  return path;
}

// ---------------------------------------------------------------- activities (master links)

export interface WorkItemActivity {
  linkId: string;
  master: { id: string; visible_code: string | null; code: string; name: string; status: string; csi_division_code: string | null };
  durationDaysPerUnit: number | null;
  sharePct: number;
}

/** Current masters that link this work item, with the link's duration and percentage. */
export async function listWorkItemActivities(db: Db, workItemId: string): Promise<WorkItemActivity[]> {
  const { data, error } = await db.from("plan_act_master_work_items")
    .select("id, duration_days_per_unit, share_pct, sort_order, plan_act_masters!inner(id, visible_code, code, name, status, csi_division_code)")
    .eq("work_item_id", workItemId).not("plan_act_masters.status", "in", CURRENT_EXCLUDED).order("created_at");
  must(error);
  type Row = { id: string; duration_days_per_unit: number | null; share_pct: number; plan_act_masters: WorkItemActivity["master"] };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    linkId: r.id, master: r.plan_act_masters,
    durationDaysPerUnit: r.duration_days_per_unit === null ? null : Number(r.duration_days_per_unit), sharePct: Number(r.share_pct),
  }));
  return rows.sort((a, b) => (a.master.visible_code ?? "~").localeCompare(b.master.visible_code ?? "~") || a.master.code.localeCompare(b.master.code));
}

/** Draft masters (the only ones the database lets a BOQ be linked to) matching `q`. */
export async function searchDraftMasters(db: Db, q: string, limit = 30): Promise<WorkItemActivity["master"][]> {
  const s = safeTerm(q);
  let qb = db.from("plan_act_masters").select("id, visible_code, code, name, status, csi_division_code").eq("status", "draft");
  if (s) qb = qb.or(`name.ilike.%${s}%,code.ilike.%${s}%,visible_code.ilike.%${s}%`);
  const { data, error } = await qb.order("visible_code", { nullsFirst: false }).order("code").limit(limit);
  must(error);
  return (data ?? []) as WorkItemActivity["master"][];
}

// ---------------------------------------------------------------- manpower / equipment per BOQ unit

export interface ConsumptionGrid { columns: ResourceColumn[]; values: Record<string, number> }

export async function listConsumption(db: Db, workItemId: string): Promise<ConsumptionGrid> {
  const { data, error } = await db.from("dwl_work_item_resources")
    .select("resource_id, consumption, sort_order, dwl_resources!inner(id, description, category, unit)")
    .eq("work_item_id", workItemId).in("dwl_resources.category", ["labor", "equipment"]).order("sort_order");
  must(error);
  type Row = { resource_id: string; consumption: number | string; dwl_resources: { description: string; category: string; unit: string } };
  const values: Record<string, number> = {};
  const columns: ResourceColumn[] = [];
  for (const r of (data ?? []) as unknown as Row[]) {
    values[r.resource_id] = Number(r.consumption);
    columns.push({ resourceId: r.resource_id, name: r.dwl_resources.description, kind: r.dwl_resources.category === "equipment" ? "E" : "M", unit: r.dwl_resources.unit });
  }
  columns.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "M" ? -1 : 1));
  return { columns, values };
}

/** Active labour or equipment resources for the + Manpower / + Equipment pickers. */
export async function searchConsumptionResources(db: Db, q: string, kind: "M" | "E", limit = 30): Promise<ResourceColumn[]> {
  const s = safeTerm(q);
  let qb = db.from("dwl_resources").select("id, code, description, unit").eq("is_active", true).eq("category", kind === "M" ? "labor" : "equipment");
  if (s) qb = qb.or(`code.ilike.%${s}%,description.ilike.%${s}%`);
  const { data, error } = await qb.order("description").limit(limit);
  must(error);
  return ((data ?? []) as { id: string; description: string; unit: string }[]).map((r) => ({ resourceId: r.id, name: r.description, kind, unit: r.unit }));
}

/** Sets consumption per BOQ unit (must be > 0); creates the row when the resource is new for this item. */
export async function setConsumption(db: Db, item: { id: string; tenant_id: string }, resourceId: string, value: number, note: string): Promise<void> {
  if (!(value > 0)) throw new Error("Consumption must be greater than 0.");
  const existing = await db.from("dwl_work_item_resources").update({ consumption: value }).eq("work_item_id", item.id).eq("resource_id", resourceId).select("id");
  must(existing.error);
  if (existing.data?.length) return;
  const { data: last } = await db.from("dwl_work_item_resources").select("sort_order").eq("work_item_id", item.id).order("sort_order", { ascending: false }).limit(1);
  const next = ((last?.[0] as { sort_order: number } | undefined)?.sort_order ?? 0) + 10;
  const ins = await db.from("dwl_work_item_resources").insert({
    tenant_id: item.tenant_id, work_item_id: item.id, resource_id: resourceId, consumption: value, waste_pct: 0, basis_note: note, sort_order: next,
  }).select("id");
  must(ins.error);
  if (!ins.data?.length) throw new Error(NO_PERMISSION);
}

export async function removeConsumption(db: Db, workItemId: string, resourceId: string): Promise<void> {
  const { data, error } = await db.from("dwl_work_item_resources").delete().eq("work_item_id", workItemId).eq("resource_id", resourceId).select("id");
  must(error);
  if (!data?.length) throw new Error(NO_PERMISSION);
}

// ---------------------------------------------------------------- usage, create, delete

type CountResult = PromiseLike<{ count: number | null; error: DbError }>;
async function n(q: CountResult): Promise<number> {
  const res = await q;
  must(res.error);
  return res.count ?? 0;
}
const head = (db: Db, table: string) => db.from(table).select("id", { count: "exact", head: true });

/** Where a work item is used. Everything except `activityLinks` blocks a hard delete. */
export async function workItemUsage(db: Db, id: string): Promise<WorkItemUsage> {
  const [assemblyItems, tenderBoqItems, tenderAlternates, qsBoqItems, activityLinks] = await Promise.all([
    n(head(db, "dwl_assembly_items").eq("work_item_id", id)),
    n(head(db, "tender_boq_items").or(`dwl_work_item_id.eq.${id},unit_rate_id.eq.${id}`)),
    n(head(db, "tender_boq_item_alternates").eq("dwl_work_item_id", id)),
    n(head(db, "qs_boq_items").eq("dwl_work_item_id", id)),
    n(head(db, "plan_act_master_work_items").eq("work_item_id", id)),
  ]);
  return { assemblyItems, tenderBoqItems, tenderAlternates, qsBoqItems, activityLinks };
}

export interface NewWorkItem { code: string; name: string; unit: string; csi_division_code: string | null; divisionName?: string }

/** New cost-library item for the caller's tenant (same insert shape as the QS work item form). */
export async function createWorkItem(db: Db, input: NewWorkItem): Promise<string> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code) throw new Error("Code is required.");
  if (!name) throw new Error("Name is required.");
  if (!input.unit.trim()) throw new Error("Unit is required.");
  const { data: auth } = await db.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("You are not signed in.");
  const { data: prof, error: pErr } = await db.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  must(pErr);
  const tenantId = (prof as { company_id: string | null } | null)?.company_id;
  if (!tenantId) throw new Error("No tenant assigned to your profile, cannot create a BOQ item.");
  const { data, error } = await db.from("dwl_work_items").insert({
    tenant_id: tenantId, code, name, description: name, unit: input.unit.trim(), boq_section: input.divisionName?.trim() || "General",
    csi_division_code: input.csi_division_code || null, created_by: userId,
  }).select("id");
  if (error) {
    if (error.code === "23505" || /duplicate key/i.test(error.message)) throw new Error("A BOQ item with this code already exists.");
    throw friendlyDbError(error);
  }
  if (!data?.length) throw new Error(NO_PERMISSION);
  return (data[0] as { id: string }).id;
}

/** "deactivate" hides the item (is_active = false). "delete" removes it and its activity links; refused while any other record uses it. */
export async function deleteOrDeactivateWorkItem(db: Db, id: string, mode: "delete" | "deactivate"): Promise<void> {
  if (mode === "deactivate") {
    await updateWorkItem(db, id, { is_active: false });
    return;
  }
  const item = await getWorkItemDetail(db, id);
  if (!item) throw new Error("BOQ item not found");
  const u = await workItemUsage(db, id);
  if (u.assemblyItems + u.tenderBoqItems + u.tenderAlternates + u.qsBoqItems > 0) throw new Error("This BOQ item is used by other records and cannot be deleted. Deactivate it instead.");
  const { data, error } = await db.from("dwl_work_items").delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") throw new Error("This BOQ item is used by other records and cannot be deleted. Deactivate it instead.");
    throw friendlyDbError(error);
  }
  if (!data?.length) throw new Error(NO_PERMISSION);
  if (item.image_path) await db.storage.from(ACTIVITY_IMAGE_BUCKET).remove([item.image_path]);
}
