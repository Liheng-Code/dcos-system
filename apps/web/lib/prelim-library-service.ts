import { createClient } from "@/lib/supabase/client";

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
  category: "temporary_works" | "staff" | "design" | "risk";
  notes: string | null;
}

export interface PrelimLibraryComponent {
  id: string;
  item_id: string;
  description: string;
  qty_formula: string;
  unit: string;
  rate: number;
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
  created_at: string;
  updated_at: string;
}

export type PrelimCaseSummary = Pick<PrelimCase, "id" | "name" | "is_default">;

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
};

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
  const compsByItem = new Map<string, PrelimLibraryComponent[]>();
  for (const c of components) {
    (compsByItem.get(c.item_id) ?? compsByItem.set(c.item_id, []).get(c.item_id)!).push(c);
  }
  return items.map((item) => ({ ...item, components: compsByItem.get(item.id) ?? [] }));
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
  merged.P12 = merged.P02 * merged.P04;
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

// ── Apply to Tender ──────────────────────────────────────────────────────────

export async function applyLibraryToTender(
  tenderId: string,
  tree: CalculatedPrelimTree,
  replace: boolean = true
): Promise<void> {
  const supabase = createClient();

  if (replace) {
    await supabase.from("tender_preliminaries_items").delete().eq("tender_id", tenderId);
  }

  const rows: Array<{
    tender_id: string;
    code: string;
    description: string;
    unit: string;
    quantity: number;
    rate: number;
    sort_order: number;
    notes: string | null;
  }> = [];

  function flatten(items: CalculatedPrelimItem[], parentCode: string | null) {
    for (const item of items) {
      rows.push({
        tender_id: tenderId,
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        rate: item.rate,
        sort_order: item.sort_order,
        notes: null,
      });
      flatten(item.children, item.code);
    }
  }

  flatten(tree.sections, null);

  if (rows.length > 0) {
    const { error } = await supabase.from("tender_preliminaries_items").insert(rows);
    if (error) throw new Error(error.message);
  }
}

// ── Cases CRUD ───────────────────────────────────────────────────────────────

function mergeWithDefaults(raw: Record<string, number>): SiteDataParams {
  const merged = { ...DEFAULT_SITE_DATA };
  for (const [k, v] of Object.entries(raw)) {
    if (k in merged) (merged as unknown as Record<string, number>)[k] = v;
  }
  merged.P06 = merged.P03 * merged.P05;
  merged.P12 = merged.P02 * merged.P04;
  return merged;
}

export async function listCases(): Promise<PrelimCaseSummary[]> {
  const { data, error } = await createClient()
    .from("prelim_library_cases")
    .select("id, name, is_default")
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

export async function saveCase(id: string, params: SiteDataParams): Promise<void> {
  const { error } = await createClient()
    .from("prelim_library_cases")
    .update({ params, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createCase(name: string, params: SiteDataParams): Promise<PrelimCase> {
  const { data, error } = await createClient()
    .from("prelim_library_cases")
    .insert({ name, params, is_default: false })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ...data, params: mergeWithDefaults(data.params as Record<string, number>) } as PrelimCase;
}

export async function getCalculatedItemsForCase(caseId: string): Promise<CalculatedPrelimTree> {
  const c = await getCase(caseId);
  const items = await getLibraryItemsWithComponents();
  return calculatePrelimTree(items, c.params);
}

export async function duplicateCase(id: string, newName: string): Promise<PrelimCase> {
  const original = await getCase(id);
  return createCase(newName, original.params);
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
