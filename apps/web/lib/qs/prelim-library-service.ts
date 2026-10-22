import { createClient } from "@/lib/supabase/client";
import * as XLSX from "xlsx";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrelimLibraryItem {
  id: string;
  parent_code: string | null;
  code: string;
  description: string;
  unit: string;
  calc_mode: "fixed" | "param" | "sum_children";
  default_qty: number;
  formula: string | null;
  sort_order: number;
  category: "temporary_works" | "staff" | "design" | "risk" | "early_work";
  notes: string | null;
  applicable_profiles?: string[];
}

export type PrelimProfileCode = "PROF-BLD-HR" | "PROF-BLD-LR" | "PROF-IND" | "PROF-INF" | "PROF-GEN";
export interface PrelimProfile { code: PrelimProfileCode; name: string; description: string }
export interface PrelimProjectCategory { sector: string; buildingType: string; label: string; profile: PrelimProfileCode; note?: string }

export const PRELIM_PROFILES: PrelimProfile[] = [
  { code: "PROF-BLD-HR", name: "Building – High Rise", description: "Multi-storey building work; confirm actual scale and construction method." },
  { code: "PROF-BLD-LR", name: "Building – Low Rise", description: "Low-rise building work and smaller building sites." },
  { code: "PROF-IND", name: "Industrial", description: "Factories, warehouses, manufacturing and logistics facilities." },
  { code: "PROF-INF", name: "Infrastructure / Linear", description: "Road, bridge, drainage, water and utility work." },
  { code: "PROF-GEN", name: "General / Default", description: "Shared preliminaries for unmapped or internal work." },
];

const CATEGORY_DEFAULTS: Record<string, PrelimProfileCode> = {
  luxury_villa: "PROF-BLD-LR", mansion_estate: "PROF-BLD-LR", private_residence: "PROF-BLD-LR",
  standard_villa: "PROF-BLD-LR", townhouse: "PROF-BLD-LR", apartment: "PROF-BLD-LR",
  condominium: "PROF-BLD-HR", residential_tower: "PROF-BLD-HR", residential_development: "PROF-BLD-HR",
  showroom: "PROF-BLD-LR", office_building: "PROF-BLD-HR", shopping_mall: "PROF-BLD-LR",
  retail_building: "PROF-BLD-LR", mixed_use_building: "PROF-BLD-HR", hotel: "PROF-BLD-HR", restaurant: "PROF-BLD-LR",
  factory: "PROF-IND", warehouse: "PROF-IND", manufacturing_facility: "PROF-IND", logistics_center: "PROF-IND", industrial_building: "PROF-IND",
  school: "PROF-BLD-LR", university: "PROF-BLD-LR", hospital: "PROF-BLD-HR", clinic: "PROF-BLD-LR", government_building: "PROF-BLD-LR", religious_building: "PROF-BLD-LR",
  road: "PROF-INF", bridge: "PROF-INF", drainage: "PROF-INF", water_supply: "PROF-INF", utility: "PROF-INF", other_infrastructure: "PROF-INF",
};

const CATEGORY_REVIEW_NOTES: Record<string, string> = {
  apartment: "Confirm high-rise profile if the building meets the project scale threshold.",
  office_building: "Confirm low-rise profile for buildings below the project scale threshold.",
  residential_development: "Split materially different blocks or infrastructure scopes into packages.",
  mixed_use_building: "Split materially different building or civil scopes into packages.",
  shopping_mall: "Review scale and temporary works requirements.",
  university: "Review campus scale; split materially different packages.",
  school: "Review campus scale; split materially different packages.",
  bridge: "Review temporary works design and staging.",
};

export function getDefaultPrelimProfile(buildingType?: string | null): PrelimProfileCode {
  return buildingType ? CATEGORY_DEFAULTS[buildingType] ?? "PROF-GEN" : "PROF-GEN";
}

export function getCategoryReviewNote(buildingType?: string | null): string | undefined {
  return buildingType ? CATEGORY_REVIEW_NOTES[buildingType] : undefined;
}

export interface PrelimLibraryComponent {
  id: string;
  item_id: string;
  description: string;
  qty_formula: string;
  unit: string;
  rate: number;
  rate_currency?: string;
  rate_source?: string;
  rate_effective_date?: string | null;
  rate_status?: "unverified" | "benchmark" | "quoted" | "approved";
  sort_order: number;
}

export interface PrelimLibraryItemWithComponents extends PrelimLibraryItem {
  components: PrelimLibraryComponent[];
}

export interface PrelimLibraryTreeNode {
  item: PrelimLibraryItem;
  children: PrelimLibraryTreeNode[];
}

export interface SiteDataParams {
  P01: number; // Site perimeter (m)
  P02: number; // Building footprint (m2)
  P03: number; // Building perimeter (m)
  P04: number; // Storeys above ground
  P05: number; // Building height (m)
  P06: number; // Facade area (m2) — derived: P03 * P05
  P07: number; // Programme duration (months)
  P08: number; // Structure phase duration (months)
  P09: number; // Scaffold rental duration (months)
  P10: number; // Peak workforce
  P11: number; // Floors incl. roof
  P12: number; // Gross floor area (m2) — derived: P02 * P04
  P20: number; // Site area (plot, m2)
  P21: number; // Eaves / clear height (m)
  P22: number; // Number of crane / plant positions
  P30: number; // Alignment / road length (m)
  P31: number; // Earthworks volume (m3)
  P32: number; // Number of structures / crossings
  P33: number; // Working width / corridor (m)
}

export interface CalculatedPrelimItem {
  code: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  category: string;
  sort_order: number;
  children: CalculatedPrelimItem[];
}

export interface CalculatedPrelimTree {
  sections: CalculatedPrelimItem[];
  total: number;
}

export interface PrelimCase {
  id: string;
  name: string;
  params: SiteDataParams;
  is_default: boolean;
  profile_code?: PrelimProfileCode | null;
  sector_slug?: string | null;
  building_type_slug?: string | null;
  override_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export type PrelimCaseSummary = Pick<PrelimCase, "id" | "name" | "is_default" | "profile_code" | "sector_slug" | "building_type_slug">;

// ── Default Site Data ────────────────────────────────────────────────────────

export const DEFAULT_SITE_DATA: SiteDataParams = {
  P01: 130,
  P02: 800,
  P03: 115,
  P04: 10,
  P05: 36,
  P06: 4140,  // P03 * P05
  P07: 18,
  P08: 10,
  P09: 12,
  P10: 80,
  P11: 11,
  P12: 8000, // P02 * P04
  P20: 0,
  P21: 0,
  P22: 0,
  P30: 0,
  P31: 0,
  P32: 0,
  P33: 0,
};

export const SITE_DATA_META: Record<string, { label: string; unit: string; derived?: string }> = {
  P01: { label: "Site perimeter (hoarding line)", unit: "m" },
  P02: { label: "Building footprint", unit: "m2" },
  P03: { label: "Building perimeter", unit: "m" },
  P04: { label: "Storeys above ground", unit: "no" },
  P05: { label: "Building height", unit: "m" },
  P06: { label: "Facade area", unit: "m2", derived: "P03 × P05" },
  P07: { label: "Programme duration", unit: "months" },
  P08: { label: "Structure phase duration", unit: "months" },
  P09: { label: "Scaffold rental duration", unit: "months" },
  P10: { label: "Peak workforce", unit: "no" },
  P11: { label: "Floors incl. roof (edge protection)", unit: "no" },
  P12: { label: "Gross floor area", unit: "m2", derived: "P02 × P04" },
  P20: { label: "Site area (plot)", unit: "m2" },
  P21: { label: "Eaves / clear height", unit: "m" },
  P22: { label: "Crane / plant positions", unit: "no" },
  P30: { label: "Alignment / road length", unit: "m" },
  P31: { label: "Earthworks volume (cut + fill)", unit: "m3" },
  P32: { label: "Structures / crossings", unit: "no" },
  P33: { label: "Working width / corridor", unit: "m" },
};

export const PROFILE_PARAMS: Record<PrelimProfileCode, (keyof SiteDataParams)[]> = {
  "PROF-BLD-HR": ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"],
  "PROF-BLD-LR": ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"],
  "PROF-IND": ["P01", "P02", "P07", "P08", "P10", "P12", "P20", "P21", "P22", "P31"],
  "PROF-INF": ["P01", "P07", "P10", "P20", "P22", "P30", "P31", "P32", "P33"],
  "PROF-GEN": ["P01", "P07", "P10"],
};

export const PROFILE_REQUIRED_PARAMS: Record<PrelimProfileCode, (keyof SiteDataParams)[]> = {
  "PROF-BLD-HR": ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08", "P09", "P10", "P11", "P12"],
  "PROF-BLD-LR": ["P01", "P02", "P03", "P04", "P06", "P07", "P09", "P10", "P11", "P12"],
  "PROF-IND": ["P01", "P02", "P07", "P10", "P12", "P20", "P21", "P22", "P31"],
  "PROF-INF": ["P07", "P10", "P30", "P31", "P32", "P33"],
  "PROF-GEN": ["P07", "P10"],
};

export function getDefaultSiteData(profile: PrelimProfileCode): SiteDataParams {
  if (profile === "PROF-BLD-HR" || profile === "PROF-BLD-LR") return { ...DEFAULT_SITE_DATA };
  return { ...DEFAULT_SITE_DATA, P01: 0, P02: 0, P03: 0, P04: 0, P05: 0, P06: 0, P07: 0, P08: 0, P09: 0, P10: 0, P11: 0, P12: 0 };
}

// ── Formula Evaluator ────────────────────────────────────────────────────────

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === " ") { i++; continue; }
    if ("+-*/()".includes(expr[i])) { tokens.push(expr[i]); i++; continue; }
    if (/[0-9.]/.test(expr[i])) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      tokens.push(num);
      continue;
    }
    if (/[A-Z]/.test(expr[i])) {
      let ref = "";
      while (i < expr.length && /[A-Z0-9]/.test(expr[i])) { ref += expr[i]; i++; }
      tokens.push(ref);
      continue;
    }
    i++;
  }
  return tokens;
}

function evalExpression(expr: string, params: SiteDataParams): number {
  const tokens = tokenize(expr);
  let pos = 0;

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    if (pos >= tokens.length) return 0;
    const token = tokens[pos];
    if (token === "(") {
      pos++; // skip '('
      const val = parseExpr();
      if (pos < tokens.length && tokens[pos] === ")") pos++; // skip ')'
      return val;
    }
    if (token === "-") {
      pos++;
      return -parseFactor();
    }
    pos++;
    if (/^[A-Z]/.test(token)) {
      return (params as unknown as Record<string, number>)[token] ?? 0;
    }
    return parseFloat(token) || 0;
  }

  return parseExpr();
}

function resolveFormula(formula: string | null, params: SiteDataParams, fallback: number = 0): number {
  if (!formula || formula.trim() === "") return fallback;
  try {
    return evalExpression(formula, params);
  } catch {
    return fallback;
  }
}

// ── CRUD Operations ──────────────────────────────────────────────────────────

export async function getLibraryItems(): Promise<PrelimLibraryItem[]> {
  const { data, error } = await createClient()
    .from("prelim_library_items")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as PrelimLibraryItem[];
}

export async function getLibraryComponents(): Promise<PrelimLibraryComponent[]> {
  const { data, error } = await createClient()
    .from("prelim_library_components")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as PrelimLibraryComponent[];
}

export async function getLibraryItemsWithComponents(): Promise<PrelimLibraryItemWithComponents[]> {
  const [items, components] = await Promise.all([getLibraryItems(), getLibraryComponents()]);
  let profileRows: Array<{ item_id: string; profile_code: string }> = [];
  try {
    const db = createClient() as any;
    const { data, error } = await db.from("prelim_library_item_profiles").select("item_id, profile_code").eq("inclusion_state", "included");
    if (!error && data) profileRows = data;
  } catch {
    // Retain legacy all-profile behavior until the profile migration is applied.
  }
  const profilesByItem = new Map<string, string[]>();
  for (const row of profileRows) profilesByItem.set(row.item_id, [...(profilesByItem.get(row.item_id) ?? []), row.profile_code]);
  const compsByItem = new Map<string, PrelimLibraryComponent[]>();
  for (const c of components) {
    (compsByItem.get(c.item_id) ?? compsByItem.set(c.item_id, []).get(c.item_id)!).push(c);
  }
  return items.map((item) => ({
    ...item,
    applicable_profiles: profilesByItem.get(item.id) ?? PRELIM_PROFILES.map((profile) => profile.code),
    components: compsByItem.get(item.id) ?? [],
  }));
}

export function filterLibraryItemsByProfile(
  items: PrelimLibraryItemWithComponents[],
  profile: PrelimProfileCode,
): PrelimLibraryItemWithComponents[] {
  const includedCodes = new Set(items
    .filter((item) => item.calc_mode !== "sum_children" && (item.applicable_profiles ?? PRELIM_PROFILES.map((p) => p.code)).includes(profile))
    .map((item) => item.code));
  // Retain aggregate hierarchy nodes only when they contain an applicable item.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parent_code && includedCodes.has(item.code) && !includedCodes.has(item.parent_code)) {
        includedCodes.add(item.parent_code);
        changed = true;
      }
    }
  }
  return items.filter((item) => includedCodes.has(item.code));
}

export async function getProjectPrelimContext(tenderId: string): Promise<{
  sector: string | null; buildingType: string | null; profile: PrelimProfileCode;
}> {
  try {
    const db = createClient() as any;
    const { data: tender, error: tenderError } = await db.from("tender_register").select("project_id").eq("id", tenderId).maybeSingle();
    if (tenderError || !tender?.project_id) return { sector: null, buildingType: null, profile: "PROF-GEN" };
    const { data: project, error: projectError } = await db.from("projects").select("category, building_type").eq("id", tender.project_id).maybeSingle();
    if (projectError || !project) return { sector: null, buildingType: null, profile: "PROF-GEN" };
    const { data: mapping } = await db.from("prelim_category_profiles").select("profile_code").eq("sector_slug", project.category).eq("building_type_slug", project.building_type).maybeSingle();
    const buildingType = project.building_type ?? null;
    return {
      sector: project.category ?? null,
      buildingType,
      profile: (mapping?.profile_code ?? getDefaultPrelimProfile(buildingType)) as PrelimProfileCode,
    };
  } catch {
    return { sector: null, buildingType: null, profile: "PROF-GEN" };
  }
}

export async function getLibraryTree(): Promise<PrelimLibraryTreeNode[]> {
  const items = await getLibraryItems();
  const byParent = new Map<string | null, PrelimLibraryItem[]>();
  for (const item of items) {
    const key = item.parent_code ?? "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(item);
  }
  function build(parentCode: string | null): PrelimLibraryTreeNode[] {
    const key = parentCode ?? "__root__";
    const children = byParent.get(key) ?? [];
    return children.map((item) => ({
      item,
      children: build(item.code),
    }));
  }
  return build(null);
}

export async function createLibraryItem(payload: Omit<PrelimLibraryItem, "id">): Promise<PrelimLibraryItem> {
  const { data, error } = await createClient()
    .from("prelim_library_items")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PrelimLibraryItem;
}

export async function updateLibraryItem(id: string, payload: Partial<PrelimLibraryItem>): Promise<PrelimLibraryItem> {
  const { data, error } = await createClient()
    .from("prelim_library_items")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PrelimLibraryItem;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  const { error } = await createClient().from("prelim_library_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createLibraryComponent(payload: Omit<PrelimLibraryComponent, "id">): Promise<PrelimLibraryComponent> {
  const { data, error } = await createClient()
    .from("prelim_library_components")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PrelimLibraryComponent;
}

export async function updateLibraryComponent(id: string, payload: Partial<PrelimLibraryComponent>): Promise<PrelimLibraryComponent> {
  const { data, error } = await createClient()
    .from("prelim_library_components")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PrelimLibraryComponent;
}

export async function deleteLibraryComponent(id: string): Promise<void> {
  const { error } = await createClient().from("prelim_library_components").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Tender Settings ──────────────────────────────────────────────────────────

export async function getTenderPrelimSettings(tenderId: string): Promise<SiteDataParams> {
  const { data } = await createClient()
    .from("tender_prelim_settings")
    .select("params")
    .eq("tender_id", tenderId)
    .maybeSingle();
  if (!data?.params) return { ...DEFAULT_SITE_DATA };
  const merged = { ...DEFAULT_SITE_DATA };
  for (const [k, v] of Object.entries(data.params as unknown as Record<string, number>)) {
    if (k in merged) (merged as unknown as Record<string, number>)[k] = v;
  }
  merged.P06 = merged.P03 * merged.P05;
  if (merged.P04 > 0) merged.P12 = merged.P02 * merged.P04;
  return merged;
}

export async function saveTenderPrelimSettings(tenderId: string, params: SiteDataParams): Promise<void> {
  const { error } = await createClient()
    .from("tender_prelim_settings")
    .upsert({ tender_id: tenderId, params, updated_at: new Date().toISOString() }, { onConflict: "tender_id" });
  if (error) throw new Error(error.message);
}

// ── Calculation Engine ───────────────────────────────────────────────────────

function computeComponentRate(
  components: PrelimLibraryComponent[],
  params: SiteDataParams
): number {
  let total = 0;
  for (const comp of components) {
    const qty = resolveFormula(comp.qty_formula, params, 1);
    total += qty * comp.rate;
  }
  return total;
}

function computeItemQty(item: PrelimLibraryItem, params: SiteDataParams): number {
  switch (item.calc_mode) {
    case "fixed":
      return item.default_qty;
    case "param":
      return resolveFormula(item.formula, params, item.default_qty);
    case "sum_children":
      return 1; // amount comes from children
    default:
      return item.default_qty;
  }
}

export function calculatePrelimTree(
  items: PrelimLibraryItemWithComponents[],
  params: SiteDataParams
): CalculatedPrelimTree {
  const byParent = new Map<string | null, PrelimLibraryItemWithComponents[]>();
  for (const item of items) {
    const key = item.parent_code ?? "__root__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(item);
  }

  // Only compute leaf items (those with components or no children)
  const leafItems = items.filter(
    (item) => item.calc_mode !== "sum_children" || !items.some((c) => c.parent_code === item.code)
  );
  const leafAmounts = new Map<string, number>();
  for (const leaf of leafItems) {
    const rate = computeComponentRate(leaf.components, params);
    const qty = computeItemQty(leaf, params);
    leafAmounts.set(leaf.code, qty * rate);
  }

  function buildNode(item: PrelimLibraryItemWithComponents): CalculatedPrelimItem {
    const children = (byParent.get(item.code) ?? []).map(buildNode);

    if (item.calc_mode === "sum_children") {
      const amount = children.reduce((sum, c) => sum + c.amount, 0);
      return {
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity: 1,
        rate: amount,
        amount,
        category: item.category,
        sort_order: item.sort_order,
        children,
      };
    }

    const rate = computeComponentRate(item.components, params);
    const qty = computeItemQty(item, params);
    const amount = qty * rate;
    return {
      code: item.code,
      description: item.description,
      unit: item.unit,
      quantity: qty,
      rate,
      amount,
      category: item.category,
      sort_order: item.sort_order,
      children,
    };
  }

  const rootChildren = (byParent.get("__root__") ?? []).map(buildNode);
  const total = rootChildren.reduce((sum, s) => sum + s.amount, 0);

  return { sections: rootChildren, total };
}

// ── Export to Excel ──────────────────────────────────────────────────────────

export function exportPrelimTreeToExcel(
  tree: CalculatedPrelimTree,
  params: SiteDataParams,
  options?: { caseName?: string; profileCode?: PrelimProfileCode; sector?: string; buildingType?: string }
): void {
  const rows: Record<string, string | number>[] = [];

  function walk(items: CalculatedPrelimItem[], depth: number) {
    for (const item of items) {
      rows.push({
        Code: item.code,
        Description: `${"    ".repeat(depth)}${item.description}`,
        Unit: item.unit,
        Qty: Number(item.quantity.toFixed(2)),
        "Rate ($)": Number(item.rate.toFixed(2)),
        "Amount ($)": Number(item.amount.toFixed(2)),
      });
      walk(item.children, depth + 1);
    }
  }
  walk(tree.sections, 0);
  rows.push({
    Code: "",
    Description: "TOTAL PRELIMINARIES",
    Unit: "",
    Qty: "",
    "Rate ($)": "",
    "Amount ($)": Number(tree.total.toFixed(2)),
  });

  const wsPrelim = XLSX.utils.json_to_sheet(rows);
  wsPrelim["!cols"] = [{ wch: 10 }, { wch: 48 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 16 }];

  const paramKeys = Object.keys(SITE_DATA_META) as (keyof SiteDataParams)[];
  const paramRows: Record<string, string | number>[] = paramKeys.map((key) => ({
    Code: key,
    Parameter: SITE_DATA_META[key].label,
    Value: params[key],
    Unit: SITE_DATA_META[key].unit,
  }));
  paramRows.unshift(
    { Code: "PROFILE", Parameter: "Prelim profile", Value: options?.profileCode ?? "PROF-GEN", Unit: "" },
    { Code: "SECTOR", Parameter: "Project sector", Value: options?.sector ?? "", Unit: "" },
    { Code: "CATEGORY", Parameter: "Project category", Value: options?.buildingType ?? "", Unit: "" },
  );
  const wsParams = XLSX.utils.json_to_sheet(paramRows);
  wsParams["!cols"] = [{ wch: 8 }, { wch: 40 }, { wch: 10 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsParams, "Site Data");
  XLSX.utils.book_append_sheet(wb, wsPrelim, "Preliminaries");

  const caseName = (options?.caseName ?? "Default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Prelim_Cost_Library_${caseName}_${date}.xlsx`);
}

// Applying prelims to a tender is done from the tender's Preliminaries tab
// (components/qs/tenders/cost-estimation/load-library-dialog.tsx), which loads a saved case.

// ── Cases CRUD ───────────────────────────────────────────────────────────────

function mergeWithDefaults(raw: Record<string, number>): SiteDataParams {
  const merged = { ...DEFAULT_SITE_DATA };
  for (const [k, v] of Object.entries(raw)) {
    if (k in merged) (merged as unknown as Record<string, number>)[k] = v;
  }
  merged.P06 = merged.P03 * merged.P05;
  if (merged.P04 > 0) merged.P12 = merged.P02 * merged.P04;
  return merged;
}

export async function listCases(): Promise<PrelimCaseSummary[]> {
  const db = createClient() as any;
  const { data, error } = await db
    .from("prelim_library_cases")
    .select("id, name, is_default, profile_code, sector_slug, building_type_slug")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as PrelimCaseSummary[];
}

export async function getCase(id: string): Promise<PrelimCase> {
  const { data, error } = await createClient()
    .from("prelim_library_cases")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return { ...data, params: mergeWithDefaults(data.params as Record<string, number>) } as PrelimCase;
}

export async function getDefaultCase(): Promise<PrelimCase> {
  const { data } = await createClient()
    .from("prelim_library_cases")
    .select("*")
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();
  if (data) {
    return { ...data, params: mergeWithDefaults(data.params as Record<string, number>) } as PrelimCase;
  }
  // fallback: first case
  const { data: first } = await createClient()
    .from("prelim_library_cases")
    .select("*")
    .order("name")
    .limit(1)
    .maybeSingle();
  if (first) {
    return { ...first, params: mergeWithDefaults(first.params as Record<string, number>) } as PrelimCase;
  }
  // no cases exist → return defaults
  return {
    id: "",
    name: "Default",
    params: { ...DEFAULT_SITE_DATA },
    is_default: true,
    created_at: "",
    updated_at: "",
  };
}

export async function saveCase(
  id: string,
  params: SiteDataParams,
  context?: { profile_code?: PrelimProfileCode; sector_slug?: string | null; building_type_slug?: string | null; override_reason?: string | null },
): Promise<void> {
  const db = createClient() as any;
  const { error } = await db
    .from("prelim_library_cases")
    .update({ params, ...context, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createCase(
  name: string,
  params: SiteDataParams,
  context?: { profile_code?: PrelimProfileCode; sector_slug?: string | null; building_type_slug?: string | null; override_reason?: string | null },
): Promise<PrelimCase> {
  const db = createClient() as any;
  const { data, error } = await db
    .from("prelim_library_cases")
    .insert({ name, params, is_default: false, ...context })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ...data, params: mergeWithDefaults(data.params as Record<string, number>) } as PrelimCase;
}

export async function getCalculatedItemsForCase(caseId: string): Promise<CalculatedPrelimTree> {
  const c = await getCase(caseId);
  const items = await getLibraryItemsWithComponents();
  const profile = c.profile_code ?? "PROF-BLD-HR";
  return calculatePrelimTree(filterLibraryItemsByProfile(items, profile), c.params);
}

export async function duplicateCase(id: string, newName: string): Promise<PrelimCase> {
  const original = await getCase(id);
  return createCase(newName, original.params, {
    profile_code: original.profile_code ?? undefined,
    sector_slug: original.sector_slug,
    building_type_slug: original.building_type_slug,
    override_reason: original.override_reason,
  });
}

export async function deleteCase(id: string): Promise<void> {
  const { error } = await createClient()
    .from("prelim_library_cases")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function renameCase(id: string, name: string): Promise<void> {
  const { error } = await createClient()
    .from("prelim_library_cases")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
