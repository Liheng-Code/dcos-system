// Data access for the Activity Library (tables plan_act_*, migrations 20261006000001-3).
// Reads are open to every authenticated user; writes are enforced by RLS (can_manage_master_libraries()).
// Lifecycle rules live in database triggers; this module only issues the requests.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inChunks } from "./in-chunks";
import { copyMasterChips } from "./activity-chips-service";
import type {
  ActCategory, ActDomain, ActFamily, ActLogicRule, ActMaster, ActMethod, ActQuantityRule,
  ActRequirement, ActTemplate, ActTemplateDependency, ActTemplateItem, ActProductivityStandard,
  ApplicabilityRule, LibraryStatus, ProductivityFactor, ActResourceLine,
} from "./types";

type Db = SupabaseClient;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? ([] as unknown)) as T;
}

export interface LibraryTree {
  domains: ActDomain[];
  categories: ActCategory[];
  families: ActFamily[];
}

export async function loadLibraryTree(db: Db): Promise<LibraryTree> {
  const [d, c, f] = await Promise.all([
    db.from("plan_act_domains").select("*").order("sort_order"),
    db.from("plan_act_categories").select("*").order("sort_order"),
    db.from("plan_act_families").select("*").order("sort_order"),
  ]);
  return { domains: unwrap<ActDomain[]>(d), categories: unwrap<ActCategory[]>(c), families: unwrap<ActFamily[]>(f) };
}

/** All masters; the UI shows the newest version of each code by default. */
export async function listMasters(db: Db): Promise<ActMaster[]> {
  return unwrap<ActMaster[]>(await db.from("plan_act_masters").select("*").order("code").order("version", { ascending: false }));
}

export async function getMaster(db: Db, id: string): Promise<ActMaster | null> {
  const { data, error } = await db.from("plan_act_masters").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as ActMaster | null;
}

export type MasterInput = Pick<ActMaster,
  "code" | "name" | "description" | "domain_id" | "category_id" | "family_id" | "discipline" | "work_type" | "default_unit" | "owner" | "source">;

export async function createMaster(db: Db, input: MasterInput): Promise<ActMaster> {
  const { data, error } = await db.from("plan_act_masters").insert({ ...input, status: "draft", version: 1 }).select("*").single();
  if (error) throw new Error(error.message);
  return data as ActMaster;
}

export async function updateMaster(db: Db, id: string, patch: Partial<MasterInput>): Promise<void> {
  const { error } = await db.from("plan_act_masters").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setMasterStatus(db: Db, id: string, status: LibraryStatus): Promise<void> {
  const { error } = await db.from("plan_act_masters").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Draft copy (version + 1) of an approved/active master with its methods, quantity rules, requirements,
 * applicability and standard logic. Productivity standards stay linked to the previous version until the
 * planner re-links them. Activating the new version supersedes the old one (see activateMaster).
 */
export async function createNewVersion(db: Db, id: string): Promise<ActMaster> {
  const src = await getMaster(db, id);
  if (!src) throw new Error("Activity master not found");
  const { data: latest } = await db.from("plan_act_masters").select("version").eq("code", src.code).order("version", { ascending: false }).limit(1);
  const next = ((latest?.[0] as { version: number } | undefined)?.version ?? src.version) + 1;

  const srcCat = src as unknown as {
    csi_division_code?: string | null; csi_section_code?: string | null; trade?: string | null; activity_type?: string | null;
    min_duration_pct?: number | null; max_duration_pct?: number | null; image_path?: string | null;
  };
  const { data: created, error } = await db.from("plan_act_masters").insert({
    code: src.code, name: src.name, description: src.description, domain_id: src.domain_id, category_id: src.category_id,
    family_id: src.family_id, discipline: src.discipline, work_type: src.work_type, default_unit: src.default_unit,
    owner: src.owner, source: src.source, sectors: src.sectors, building_types: src.building_types,
    // Activity Database catalogue fields (visible_code is inherited from the predecessor by trigger)
    csi_division_code: srcCat.csi_division_code ?? null, csi_section_code: srcCat.csi_section_code ?? null, trade: srcCat.trade ?? null, activity_type: srcCat.activity_type ?? null,
    min_duration_pct: srcCat.min_duration_pct ?? null, max_duration_pct: srcCat.max_duration_pct ?? null, image_path: srcCat.image_path ?? null,
    status: "draft", version: next, supersedes_id: src.id,
  }).select("*").single();
  if (error) throw new Error(error.message);
  const nm = created as ActMaster;

  const [methods, qrules, reqs, appl, logicOut, logicIn, wiLinks] = await Promise.all([
    db.from("plan_act_master_work_items").select("*").eq("master_id", id),
    db.from("plan_act_methods").select("*").eq("master_id", id),
    db.from("plan_act_quantity_rules").select("*").eq("master_id", id),
    db.from("plan_act_requirements").select("*").eq("master_id", id),
    db.from("plan_act_applicability").select("*").eq("target_type", "master").eq("target_id", id),
    db.from("plan_act_logic_rules").select("*").eq("predecessor_master_id", id),
    db.from("plan_act_logic_rules").select("*").eq("successor_master_id", id),
  ]);
  const strip = <T extends Record<string, unknown>>(rows: T[]) => rows.map((r) => { const { id: _i, created_at: _c, updated_at: _u, ...rest } = r; void _i; void _c; void _u; return rest; });
  const ins = async (table: string, rows: Record<string, unknown>[]) => {
    if (!rows.length) return;
    const { error: e } = await db.from(table).insert(rows);
    if (e) throw new Error(e.message);
  };
  await ins("plan_act_master_work_items", strip(unwrap<Record<string, unknown>[]>(wiLinks)).map((r) => ({ ...r, master_id: nm.id })));
  await ins("plan_act_methods", strip(unwrap<Record<string, unknown>[]>(methods)).map((r) => ({ ...r, master_id: nm.id })));
  await ins("plan_act_quantity_rules", strip(unwrap<Record<string, unknown>[]>(qrules)).map((r) => ({ ...r, master_id: nm.id })));
  await ins("plan_act_requirements", strip(unwrap<Record<string, unknown>[]>(reqs)).map((r) => ({ ...r, master_id: nm.id })));
  await ins("plan_act_applicability", strip(unwrap<Record<string, unknown>[]>(appl)).map((r) => ({ ...r, target_id: nm.id })));
  await ins("plan_act_logic_rules", strip(unwrap<Record<string, unknown>[]>(logicOut)).map((r) => ({ ...r, predecessor_master_id: nm.id })));
  await ins("plan_act_logic_rules", strip(unwrap<Record<string, unknown>[]>(logicIn)).map((r) => ({ ...r, successor_master_id: nm.id })));
  await copyMasterChips(db, id, nm.id);
  return nm;
}

/** Make an approved master the live version: supersede the current active version of the same code first. */
export async function activateMaster(db: Db, id: string): Promise<void> {
  const m = await getMaster(db, id);
  if (!m) throw new Error("Activity master not found");
  const { data: active } = await db.from("plan_act_masters").select("id").eq("code", m.code).eq("status", "active");
  for (const a of (active ?? []) as { id: string }[]) await setMasterStatus(db, a.id, "superseded");
  await setMasterStatus(db, id, "active");
}

export async function listMethods(db: Db, masterId: string): Promise<ActMethod[]> {
  return unwrap<ActMethod[]>(await db.from("plan_act_methods").select("*").eq("master_id", masterId).order("sort_order"));
}

export async function saveMethod(db: Db, m: Partial<ActMethod> & { master_id: string; code: string; name: string }): Promise<void> {
  const { error } = m.id
    ? await db.from("plan_act_methods").update(m).eq("id", m.id)
    : await db.from("plan_act_methods").insert(m);
  if (error) throw new Error(error.message);
}

export async function deleteMethod(db: Db, id: string): Promise<void> {
  const { error } = await db.from("plan_act_methods").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listProductivityStandards(db: Db, masterId: string): Promise<ActProductivityStandard[]> {
  const norms = unwrap<Record<string, unknown>[]>(
    await db.from("plan_productivity_norms").select("*").eq("activity_master_id", masterId).order("code"),
  );
  if (!norms.length) return [];
  const ids = norms.map((n) => n.id as string);
  const [factors, resources] = await Promise.all([
    db.from("plan_act_productivity_factors").select("*").in("norm_id", ids).order("sort_order"),
    db.from("plan_productivity_norm_resources").select("*").in("norm_id", ids).order("sort_order"),
  ]);
  const fRows = unwrap<(ProductivityFactor & { norm_id: string })[]>(factors);
  const rRows = unwrap<(ActResourceLine & { norm_id: string })[]>(resources);
  return norms.map((n) => ({
    id: n.id as string, code: n.code as string, name: n.name as string, unit: n.unit as string,
    status: n.status as ActProductivityStandard["status"], version: (n.version as number) ?? 1,
    method_id: (n.method_id as string | null) ?? null,
    output_per_day: n.output_per_day == null ? null : Number(n.output_per_day),
    labour_constant_hr_per_unit: Number(n.labour_constant_hr_per_unit),
    hours_per_day_basis: Number(n.hours_per_day_basis),
    efficiency_pct: Number(n.efficiency_pct),
    basis_note: n.basis_note as string,
    factors: fRows.filter((f) => f.norm_id === n.id).map((f) => ({ ...f, value: Number(f.value) })),
    resources: rRows.filter((r) => r.norm_id === n.id).map((r) => ({ ...r, workers_per_crew: Number(r.workers_per_crew) })),
  }));
}

export async function saveFactorValue(db: Db, factorId: string, value: number): Promise<void> {
  const { error } = await db.from("plan_act_productivity_factors").update({ value }).eq("id", factorId);
  if (error) throw new Error(error.message);
}

export async function listQuantityRules(db: Db, masterId: string): Promise<ActQuantityRule[]> {
  return unwrap<ActQuantityRule[]>(await db.from("plan_act_quantity_rules").select("*").eq("master_id", masterId));
}

export async function listLogicRules(db: Db, masterId: string): Promise<ActLogicRule[]> {
  const [a, b] = await Promise.all([
    db.from("plan_act_logic_rules").select("*").eq("predecessor_master_id", masterId),
    db.from("plan_act_logic_rules").select("*").eq("successor_master_id", masterId),
  ]);
  return [...unwrap<ActLogicRule[]>(a), ...unwrap<ActLogicRule[]>(b)];
}

export async function listRequirements(db: Db, masterId: string): Promise<ActRequirement[]> {
  return unwrap<ActRequirement[]>(await db.from("plan_act_requirements").select("*").eq("master_id", masterId).order("sort_order"));
}

export async function listApplicability(db: Db, targetType: "master" | "template", targetId: string): Promise<ApplicabilityRule[]> {
  return unwrap<ApplicabilityRule[]>(
    await db.from("plan_act_applicability").select("attribute, operator, values").eq("target_type", targetType).eq("target_id", targetId),
  );
}

export interface HistoryRow {
  id: string; action: string; from_status: string | null; to_status: string | null;
  reason: string | null; changed_by: string | null; changed_at: string;
}

export async function listHistory(db: Db, entityType: "master" | "template", entityId: string): Promise<HistoryRow[]> {
  return unwrap<HistoryRow[]>(
    await db.from("plan_act_change_history").select("*").eq("entity_type", entityType).eq("entity_id", entityId).order("changed_at", { ascending: false }),
  );
}

/** Templates (any version) that use any version of this master code. */
export async function listTemplatesUsingMaster(db: Db, masterId: string): Promise<(ActTemplate & { seq: number })[]> {
  const m = await getMaster(db, masterId);
  if (!m) return [];
  const { data: sameCode } = await db.from("plan_act_masters").select("id").eq("code", m.code);
  const ids = ((sameCode ?? []) as { id: string }[]).map((x) => x.id);
  const items = unwrap<{ template_id: string; seq: number }[]>(
    await db.from("plan_act_template_items").select("template_id, seq").in("master_id", ids),
  );
  if (!items.length) return [];
  const tpls = unwrap<ActTemplate[]>(await db.from("plan_act_templates").select("*").in("id", items.map((i) => i.template_id)));
  return tpls.map((t) => ({ ...t, seq: items.find((i) => i.template_id === t.id)!.seq }));
}

export async function listTemplates(db: Db): Promise<ActTemplate[]> {
  return unwrap<ActTemplate[]>(await db.from("plan_act_templates").select("*").order("code").order("version", { ascending: false }));
}

export interface TemplateDetail {
  template: ActTemplate;
  items: (ActTemplateItem & { master: Pick<ActMaster, "code" | "name" | "default_unit"> | null; method_name: string | null })[];
  dependencies: ActTemplateDependency[];
  applicability: ApplicabilityRule[];
}

export async function loadTemplateDetail(db: Db, templateId: string): Promise<TemplateDetail> {
  const [t, i, d, a] = await Promise.all([
    db.from("plan_act_templates").select("*").eq("id", templateId).single(),
    db.from("plan_act_template_items").select("*").eq("template_id", templateId).order("seq"),
    db.from("plan_act_template_dependencies").select("*").eq("template_id", templateId),
    listApplicability(db, "template", templateId),
  ]);
  const items = unwrap<ActTemplateItem[]>(i);
  const masters = items.length
    ? unwrap<Pick<ActMaster, "id" | "code" | "name" | "default_unit">[]>(await db.from("plan_act_masters").select("id, code, name, default_unit").in("id", items.map((x) => x.master_id)))
    : [];
  const methodIds = items.map((x) => x.method_id).filter((x): x is string => !!x);
  const methods = methodIds.length ? unwrap<Pick<ActMethod, "id" | "name">[]>(await db.from("plan_act_methods").select("id, name").in("id", methodIds)) : [];
  return {
    template: unwrap<ActTemplate>(t),
    items: items.map((x) => ({
      ...x,
      master: masters.find((m) => m.id === x.master_id) ?? null,
      method_name: methods.find((m) => m.id === x.method_id)?.name ?? null,
    })),
    dependencies: unwrap<ActTemplateDependency[]>(d),
    applicability: a,
  };
}

export async function setTemplateStatus(db: Db, id: string, status: LibraryStatus): Promise<void> {
  const { error } = await db.from("plan_act_templates").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Template authoring ────────────────────────────────────────────────────

export interface TemplateItemDraft {
  key: string; // client key; dependencies reference it
  master_id: string;
  scope: "floor" | "element" | "zone";
  method_id: string | null;
  duration_days_override: number | null;
  /** parallel crews (default 1) */
  crews?: number | null;
  note: string | null;
}

export interface TemplateDepDraft {
  from_key: string;
  to_key: string;
  relation: "fs" | "ss" | "ff" | "sf";
  lag_days: number;
  is_optional: boolean;
}

export async function createTemplate(
  db: Db, input: {
    code: string; name: string; description: string | null; owner: string | null; applies_to_level_types: string[];
    sectors?: string[]; building_types?: string[];
  },
): Promise<ActTemplate> {
  const { data, error } = await db.from("plan_act_templates").insert({ ...input, status: "draft", version: 1 }).select("*").single();
  if (error) throw new Error(error.message);
  return data as ActTemplate;
}

export async function updateTemplateHeader(
  db: Db, id: string, patch: Partial<Pick<ActTemplate, "name" | "description" | "owner" | "applies_to_level_types" | "inter_level_from_seq" | "inter_level_to_seq" | "inter_level_relation" | "inter_level_lag_days" | "sectors" | "building_types">>,
): Promise<void> {
  const { error } = await db.from("plan_act_templates").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Replace a DRAFT template's items and dependencies (the database refuses this once it has left draft). */
export async function saveTemplateRecipe(db: Db, templateId: string, items: TemplateItemDraft[], deps: TemplateDepDraft[]): Promise<void> {
  const del1 = await db.from("plan_act_template_dependencies").delete().eq("template_id", templateId);
  if (del1.error) throw new Error(del1.error.message);
  const del2 = await db.from("plan_act_template_items").delete().eq("template_id", templateId);
  if (del2.error) throw new Error(del2.error.message);
  if (!items.length) return;
  const { data, error } = await db.from("plan_act_template_items").insert(
    items.map((it, i) => ({
      template_id: templateId, seq: i + 1, master_id: it.master_id, scope: it.scope, method_id: it.method_id,
      duration_days_override: it.duration_days_override, crews: it.crews && it.crews > 0 ? it.crews : 1, note: it.note,
    })),
  ).select("id, seq");
  if (error) throw new Error(error.message);
  const idByKey = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; seq: number }[]) idByKey.set(items[row.seq - 1].key, row.id);
  const depRows = deps
    .filter((d) => idByKey.has(d.from_key) && idByKey.has(d.to_key) && d.from_key !== d.to_key)
    .map((d) => ({
      template_id: templateId, predecessor_item_id: idByKey.get(d.from_key)!, successor_item_id: idByKey.get(d.to_key)!,
      relation: d.relation, lag_days: d.lag_days, is_optional: d.is_optional,
    }));
  if (depRows.length) {
    const { error: e2 } = await db.from("plan_act_template_dependencies").insert(depRows);
    if (e2) throw new Error(e2.message);
  }
}

/** Draft copy (version + 1) of a template with items and dependencies. */
export async function createTemplateVersion(db: Db, id: string): Promise<ActTemplate> {
  const d = await loadTemplateDetail(db, id);
  const { data: latest } = await db.from("plan_act_templates").select("version").eq("code", d.template.code).order("version", { ascending: false }).limit(1);
  const next = ((latest?.[0] as { version: number } | undefined)?.version ?? d.template.version) + 1;
  const { data, error } = await db.from("plan_act_templates").insert({
    code: d.template.code, name: d.template.name, description: d.template.description, owner: d.template.owner,
    applies_to_level_types: d.template.applies_to_level_types, status: "draft", version: next, supersedes_id: d.template.id,
    inter_level_from_seq: d.template.inter_level_from_seq, inter_level_to_seq: d.template.inter_level_to_seq,
    inter_level_relation: d.template.inter_level_relation, inter_level_lag_days: d.template.inter_level_lag_days,
    sectors: d.template.sectors, building_types: d.template.building_types,
  }).select("*").single();
  if (error) throw new Error(error.message);
  const nt = data as ActTemplate;
  const items: TemplateItemDraft[] = d.items.map((it) => ({
    key: it.id, master_id: it.master_id, scope: it.scope, method_id: it.method_id,
    duration_days_override: it.duration_days_override, crews: it.crews && it.crews > 0 ? it.crews : 1, note: it.note,
  }));
  const deps: TemplateDepDraft[] = d.dependencies.map((x) => ({
    from_key: x.predecessor_item_id, to_key: x.successor_item_id, relation: x.relation, lag_days: x.lag_days, is_optional: x.is_optional,
  }));
  await saveTemplateRecipe(db, nt.id, items, deps);
  const appl = await listApplicability(db, "template", id);
  if (appl.length) {
    const { error: e3 } = await db.from("plan_act_applicability").insert(appl.map((a) => ({ ...a, target_type: "template", target_id: nt.id })));
    if (e3) throw new Error(e3.message);
  }
  return nt;
}

/** Make an approved template the live version: supersede the current active one first. */
export async function activateTemplate(db: Db, id: string): Promise<void> {
  const { data: t } = await db.from("plan_act_templates").select("code").eq("id", id).single();
  const { data: active } = await db.from("plan_act_templates").select("id").eq("code", (t as { code: string }).code).eq("status", "active");
  for (const a of (active ?? []) as { id: string }[]) await setTemplateStatus(db, a.id, "superseded");
  await setTemplateStatus(db, id, "active");
}

/** Active masters usable as template members (newest version of each code). */
export async function listPickableMasters(db: Db): Promise<Pick<ActMaster, "id" | "code" | "name" | "default_unit" | "status">[]> {
  return unwrap<Pick<ActMaster, "id" | "code" | "name" | "default_unit" | "status">[]>(
    await db.from("plan_act_masters").select("id, code, name, default_unit, status").in("status", ["active", "approved"]).order("code"),
  );
}

export async function listMethodsForMasters(db: Db, masterIds: string[]): Promise<ActMethod[]> {
  const rows = await inChunks<ActMethod>([...new Set(masterIds)], (part) => db.from("plan_act_methods").select("*").in("master_id", part));
  return rows.sort((a, b) => a.sort_order - b.sort_order);
}

// ── Planning attributes of a master (doc 21) ───────────────────────────────
// Not part of the versioned content (plan_act_master_guard does not freeze them), so they can be set on an
// active master. RLS: can_manage_master_libraries().

export interface WorkGroupOption { code: string; name: string }

export async function listWorkGroups(db: Db): Promise<WorkGroupOption[]> {
  const { data, error } = await db.from("plan_work_groups").select("code, name").eq("is_active", true).order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkGroupOption[];
}

export async function updateMasterPlanning(
  db: Db,
  id: string,
  patch: Partial<Pick<ActMaster, "duration_basis" | "default_work_group" | "default_step_template_id" | "sectors" | "building_types">>,
): Promise<void> {
  const { error } = await db.from("plan_act_masters").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
