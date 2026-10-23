// Core CSI MasterFormat 2016 library (csi_divisions, csi_sections), shared by QS and Planning.
// Edited in Administration > Master Libraries > CSI Divisions (RLS: can_manage_master_libraries()); every module
// references it by text code. Migration: 20261023122000_core_csi_divisions.sql.
// Division code '03', section code '03 30 00' (level 2: 'xx yy 00', level 3: any other 'xx yy zz').

import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient;

export interface CsiDivision {
  code: string;
  name: string;
  group_name: string;
  sort_order: number;
  is_active: boolean;
}

export interface CsiSection {
  code: string;
  division_code: string;
  parent_code: string | null;
  level: 2 | 3;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/** Division (level 1) -> level-2 section -> level-3 section. */
export interface CsiTreeNode {
  kind: "division" | "section";
  code: string;
  name: string;
  /** 1 = division, 2 / 3 = section level. */
  level: 1 | 2 | 3;
  group_name?: string;
  sort_order: number;
  is_active: boolean;
  children: CsiTreeNode[];
}

export interface CsiUsageCounts {
  materialCategories: number;
  costDivisions: number;
  costSections: number;
  activities: number;
  workItems: number;
  /** QS WBS template items whose masterformat_code points at the section. */
  wbsTemplates: number;
  total: number;
}

export interface CsiUsage {
  divisions: Record<string, CsiUsageCounts>;
  sections: Record<string, CsiUsageCounts>;
}

export interface CsiDivisionInput {
  code: string;
  name: string;
  group_name: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface CsiSectionInput {
  code: string;
  name: string;
  /** Optional: derived from the code (level 2 when it ends in " 00"). A given value must agree with the code. */
  level?: 2 | 3;
  /** Optional: a level-3 section's parent is 'xx yy 00'. A given value must agree with the code. */
  parent_code?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

// ---------------------------------------------------------------- pure helpers

const DIVISION_RE = /^\d{2}$/;
const SECTION_RE = /^\d{2} \d{2} \d{2}$/;

export function isValidDivisionCode(code: unknown): code is string {
  return typeof code === "string" && DIVISION_RE.test(code);
}

export function isValidSectionCode(code: unknown): code is string {
  return typeof code === "string" && SECTION_RE.test(code);
}

/** '033000' | '03 30 00' | '03-30-00' | '03.30.00' -> '03 30 00'; null when it is not six digits. */
export function formatSectionCode(input: unknown): string | null {
  const digits = String(input ?? "").trim().replace(/[\s.\-_]/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
}

/** '03 30 00' -> '03'; null when the section code is malformed. */
export function divisionOfSection(sectionCode: string): string | null {
  return isValidSectionCode(sectionCode) ? sectionCode.slice(0, 2) : null;
}

/** 2 for 'xx yy 00' (including 'xx 00 00' headings), 3 otherwise; null when malformed. */
export function sectionLevel(sectionCode: string): 2 | 3 | null {
  if (!isValidSectionCode(sectionCode)) return null;
  return sectionCode.endsWith(" 00") ? 2 : 3;
}

/** Level-3 '03 30 13' -> '03 30 00'; level-2 and malformed codes have no parent (null). */
export function parentSectionCode(sectionCode: string): string | null {
  return sectionLevel(sectionCode) === 3 ? `${sectionCode.slice(0, 5)} 00` : null;
}

const bySortThenCode = (a: { sort_order: number; code: string }, b: { sort_order: number; code: string }) =>
  a.sort_order - b.sort_order || a.code.localeCompare(b.code);

/** Builds the division -> level 2 -> level 3 tree. A level-3 section whose parent is missing hangs off its division. */
export function buildCsiTree(divisions: CsiDivision[], sections: CsiSection[]): CsiTreeNode[] {
  const secNode = (s: CsiSection): CsiTreeNode => ({
    kind: "section", code: s.code, name: s.name, level: s.level, sort_order: s.sort_order, is_active: s.is_active, children: [],
  });
  const nodes = new Map<string, CsiTreeNode>(sections.map((s) => [s.code, secNode(s)]));
  const divNodes = new Map<string, CsiTreeNode>(
    divisions.map((d) => [d.code, {
      kind: "division", code: d.code, name: d.name, level: 1, group_name: d.group_name, sort_order: d.sort_order, is_active: d.is_active, children: [],
    }]),
  );
  for (const s of [...sections].sort(bySortThenCode)) {
    const node = nodes.get(s.code)!;
    const parent = s.parent_code ? nodes.get(s.parent_code) : undefined;
    (parent ?? divNodes.get(s.division_code))?.children.push(node);
  }
  return [...divisions].sort(bySortThenCode).map((d) => divNodes.get(d.code)!);
}

// ---------------------------------------------------------------- reads

const DIV_COLS = "code, name, group_name, sort_order, is_active";
const SEC_COLS = "code, division_code, parent_code, level, name, sort_order, is_active";
const PAGE = 1000;

function must(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function pages<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    must(error);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

export async function listCsiDivisions(db: Db, opts: { activeOnly?: boolean } = {}): Promise<CsiDivision[]> {
  let qb = db.from("csi_divisions").select(DIV_COLS);
  if (opts.activeOnly) qb = qb.eq("is_active", true);
  const { data, error } = await qb.order("sort_order").order("code");
  must(error);
  return (data ?? []) as CsiDivision[];
}

export async function listCsiSections(db: Db, opts: { divisionCode?: string; activeOnly?: boolean } = {}): Promise<CsiSection[]> {
  return pages<CsiSection>((from, to) => {
    let qb = db.from("csi_sections").select(SEC_COLS);
    if (opts.divisionCode) qb = qb.eq("division_code", opts.divisionCode);
    if (opts.activeOnly) qb = qb.eq("is_active", true);
    return qb.order("sort_order").order("code").range(from, to) as never;
  });
}

export async function getCsiTree(db: Db, opts: { activeOnly?: boolean } = {}): Promise<CsiTreeNode[]> {
  const [divisions, sections] = await Promise.all([listCsiDivisions(db, opts), listCsiSections(db, opts)]);
  return buildCsiTree(divisions, sections);
}

// ---------------------------------------------------------------- writes

function friendly(error: { message: string; code?: string }): Error {
  if (/row-level security/i.test(error.message)) return new Error("You do not have permission to change the CSI library.");
  if (error.code === "23505") return new Error("That CSI code already exists.");
  return new Error(error.message);
}

export async function upsertCsiDivision(db: Db, input: CsiDivisionInput): Promise<CsiDivision> {
  const code = input.code.trim();
  if (!isValidDivisionCode(code)) throw new Error(`Division code must be two digits, e.g. 03 (got "${input.code}").`);
  const name = input.name.trim();
  if (!name) throw new Error("Division name is required.");
  const group = input.group_name.trim();
  if (!group) throw new Error("Division group is required.");

  const row: Record<string, unknown> = { code, name, group_name: group };
  if (input.sort_order !== undefined) row.sort_order = input.sort_order;
  else if (!(await exists(db, "csi_divisions", code))) row.sort_order = Number(code);
  if (input.is_active !== undefined) row.is_active = input.is_active;

  const { data, error } = await db.from("csi_divisions").upsert(row, { onConflict: "code" }).select(DIV_COLS).single();
  if (error) throw friendly(error);
  return data as CsiDivision;
}

async function exists(db: Db, table: "csi_divisions" | "csi_sections", code: string): Promise<boolean> {
  const { count, error } = await db.from(table).select("code", { count: "exact", head: true }).eq("code", code);
  must(error);
  return (count ?? 0) > 0;
}

export async function upsertCsiSection(db: Db, input: CsiSectionInput): Promise<CsiSection> {
  const formatted = formatSectionCode(input.code);
  if (!formatted) throw new Error(`Section code must look like 03 30 00 (got "${input.code}").`);
  const code = formatted;
  const division = divisionOfSection(code)!;
  const level = sectionLevel(code)!;
  const parent = parentSectionCode(code);
  const name = input.name.trim();
  if (!name) throw new Error("Section name is required.");

  if (input.level !== undefined && input.level !== level) {
    throw new Error(`Section ${code} is level ${level}: level 2 ends in "00", level 3 does not.`);
  }
  if (input.parent_code !== undefined && (input.parent_code ?? null) !== parent) {
    throw new Error(parent
      ? `The parent of ${code} must be ${parent}.`
      : `Level-2 section ${code} has no parent.`);
  }
  if (!(await exists(db, "csi_divisions", division))) {
    throw new Error(`Division ${division} does not exist. Add it first.`);
  }
  if (parent && !(await exists(db, "csi_sections", parent))) {
    throw new Error(`Parent section ${parent} does not exist. Add it first.`);
  }

  const row: Record<string, unknown> = { code, division_code: division, parent_code: parent, level, name };
  if (input.sort_order !== undefined) row.sort_order = input.sort_order;
  if (input.is_active !== undefined) row.is_active = input.is_active;

  const { data, error } = await db.from("csi_sections").upsert(row, { onConflict: "code" }).select(SEC_COLS).single();
  if (error) throw friendly(error);
  return data as CsiSection;
}

export async function setCsiDivisionActive(db: Db, code: string, isActive: boolean): Promise<void> {
  const { data, error } = await db.from("csi_divisions").update({ is_active: isActive }).eq("code", code).select("code");
  if (error) throw friendly(error);
  if (!data?.length) throw new Error("Division not found, or you do not have permission to change the CSI library.");
}

export async function setCsiSectionActive(db: Db, code: string, isActive: boolean): Promise<void> {
  const { data, error } = await db.from("csi_sections").update({ is_active: isActive }).eq("code", code).select("code");
  if (error) throw friendly(error);
  if (!data?.length) throw new Error("Section not found, or you do not have permission to change the CSI library.");
}

// ---------------------------------------------------------------- usage

const emptyCounts = (): CsiUsageCounts => ({ materialCategories: 0, costDivisions: 0, costSections: 0, activities: 0, workItems: 0, wbsTemplates: 0, total: 0 });

type UsageKey = Exclude<keyof CsiUsageCounts, "total">;

/** How many records reference each division / section, so nobody deactivates a code that is in use. */
export async function getCsiUsage(db: Db): Promise<CsiUsage> {
  const usage: CsiUsage = { divisions: {}, sections: {} };
  const bump = (bucket: Record<string, CsiUsageCounts>, code: string | null | undefined, key: UsageKey, by = 1) => {
    if (!code) return;
    const c = (bucket[code] ??= emptyCounts());
    c[key] += by;
    c.total += by;
  };

  const [cats, costDivs, costSecs, masters, items, wbsItems] = await Promise.all([
    pages<{ division_code: string | null }>((f, t) => db.from("dwl_material_categories").select("division_code").order("id").range(f, t) as never),
    pages<{ csi_division_code: string | null }>((f, t) => db.from("qs_cost_divisions").select("csi_division_code").order("id").range(f, t) as never),
    pages<{ csi_section_code: string | null }>((f, t) => db.from("qs_cost_sections").select("csi_section_code").order("id").range(f, t) as never),
    // current activities only (same rule as plan_act_csi_division_counts); one per activity code
    pages<{ code: string; csi_division_code: string | null; csi_section_code: string | null }>((f, t) =>
      db.from("plan_act_masters").select("code, csi_division_code, csi_section_code").not("status", "in", "(superseded,archived)").order("id").range(f, t) as never),
    pages<{ csi_division_code: string | null; csi_section_code: string | null }>((f, t) =>
      db.from("dwl_work_items").select("csi_division_code, csi_section_code").or("csi_division_code.not.is.null,csi_section_code.not.is.null").order("id").range(f, t) as never),
    pages<{ masterformat_code: string | null }>((f, t) =>
      db.from("qs_wbs_template_items").select("masterformat_code").not("masterformat_code", "is", null).order("id").range(f, t) as never),
  ]);

  for (const r of cats) bump(usage.divisions, r.division_code, "materialCategories");
  for (const r of costDivs) bump(usage.divisions, r.csi_division_code, "costDivisions");
  for (const r of costSecs) {
    bump(usage.sections, r.csi_section_code, "costSections");
    bump(usage.divisions, r.csi_section_code ? divisionOfSection(r.csi_section_code) : null, "costSections");
  }
  const seen = new Set<string>();
  for (const r of masters) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    bump(usage.divisions, r.csi_division_code, "activities");
    bump(usage.sections, r.csi_section_code, "activities");
  }
  for (const r of wbsItems) {
    const code = formatSectionCode(r.masterformat_code);
    if (!code) continue;
    bump(usage.sections, code, "wbsTemplates");
    bump(usage.divisions, divisionOfSection(code), "wbsTemplates");
  }
  for (const r of items) {
    bump(usage.divisions, r.csi_division_code ?? (r.csi_section_code ? divisionOfSection(r.csi_section_code) : null), "workItems");
    bump(usage.sections, r.csi_section_code, "workItems");
  }
  return usage;
}

// ---------------------------------------------------------------- permission

/** True when the signed-in user may edit the CSI library (RLS: can_manage_master_libraries()). */
export async function canManageCsiLibrary(db: Db): Promise<boolean> {
  const { data, error } = await db.rpc("can_manage_master_libraries");
  return !error && data === true;
}
