import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BudgetCodeGroup {
  code_letter: string;
  name: string;
  sort_order: number;
}

export interface BudgetCode {
  id: string;
  code: string;
  code_letter: string;
  parent_code_id: string | null;
  code_level: 2 | 3;
  description: string;
  sort_order: number;
  is_active: boolean;
}

export interface BudgetCodeTreeNode extends BudgetCode {
  children: BudgetCode[];
}

export interface BudgetCodeGroupTree {
  group: BudgetCodeGroup;
  codes: BudgetCodeTreeNode[];
}

export interface TenderPriceListItem {
  id: string;
  tender_id: string;
  item_code: string;
  section: string | null;
  sub_section: string | null;
  sub_element: string | null;
  description: string;
  unit: string;
  labor_net_cost: number;
  labor_margin_pct: number;
  labor_rate: number;
  material_net_cost: number;
  material_margin_pct: number;
  material_rate: number;
  total_rate: number;
  basis_source: string | null;
  match_key: string;
  budget_code_id: string | null;
  source_unit_rate_id: string | null;
  budget_codes?: { code: string; description: string } | null;
}

export type RateSource = "manual" | "price_list";

export interface TenderBoqItem {
  id: string;
  tender_id: string;
  section: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  total_amount: number;
  sort_order: number;
  discipline: string | null;
  budget_code_id: string | null;
  building_code: string;
  level: string;
  sub_section: string | null;
  sub_element: string | null;
  material_type: string | null;
  element_group: string | null;
  element_id: string | null;
  brand: string | null;
  supplier: string | null;
  package_name: string | null;
  actual_quantity: number | null;
  labor_net_cost: number | null;
  labor_margin_pct: number | null;
  material_net_cost: number | null;
  material_margin_pct: number | null;
  price_list_item_id: string | null;
  rate_source: RateSource;
  notes: string | null;
  budget_codes?: { code: string; description: string; code_letter: string } | null;
}

export interface TenderPreliminariesItem {
  id: string;
  tender_id: string;
  code: string;
  budget_code_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
  notes: string | null;
}

export interface TenderBidSummary {
  id: string;
  tender_id: string;
  revision_no: number;
  direct_cost: number;
  preliminaries: number;
  subcontract_cost: number;
  overhead_pct: number;
  overhead_amount: number;
  profit_pct: number;
  profit_amount: number;
  contingency: number;
  contingency_pct: number | null;
  risk_allowance: number;
  risk_pct: number | null;
  vat_pct: number;
  vat_amount: number;
  total_bid_price: number;
  status: "draft" | "review" | "final" | "submitted";
  notes: string | null;
}

export interface BoqGroupSubSection {
  subSection: string;
  subtotal: number;
  items: TenderBoqItem[];
}

export interface BoqGroupSection {
  section: string;
  subtotal: number;
  subSections: BoqGroupSubSection[];
}

export interface BoqGroupBudgetCode {
  budgetCodeId: string | null;
  code: string;
  description: string;
  subtotal: number;
  sections: BoqGroupSection[];
}

export interface BoqGroupLetter {
  codeLetter: string;
  groupName: string;
  subtotal: number;
  budgetCodes: BoqGroupBudgetCode[];
}

export interface BoqItemsGrouped {
  groups: BoqGroupLetter[];
  grandTotal: number;
}

export interface TenderCoverSummary {
  tenderId: string;
  elementalCostSummary: {
    codeLetter: string;
    groupName: string;
    amount: number;
    priced: boolean;
  }[];
  directWorksTotal: number;
  preliminariesTotal: number;
  bidSummary: TenderBidSummary | null;
}

// ── Budget Codes ─────────────────────────────────────────────────────────────

export async function getBudgetCodeGroups(): Promise<BudgetCodeGroup[]> {
  const { data, error } = await createClient()
    .from("budget_code_groups")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as BudgetCodeGroup[];
}

export async function getBudgetCodes(): Promise<BudgetCode[]> {
  const { data, error } = await createClient()
    .from("budget_codes")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as BudgetCode[];
}

export async function getBudgetCodeTree(): Promise<BudgetCodeGroupTree[]> {
  const [groups, codes] = await Promise.all([getBudgetCodeGroups(), getBudgetCodes()]);
  const level2 = codes.filter((c) => c.code_level === 2);
  const childrenByParent: Record<string, BudgetCode[]> = {};
  for (const c of codes) {
    if (c.parent_code_id) {
      (childrenByParent[c.parent_code_id] ??= []).push(c);
    }
  }
  return groups.map((group) => ({
    group,
    codes: level2
      .filter((c) => c.code_letter === group.code_letter)
      .map((c) => ({ ...c, children: childrenByParent[c.id] ?? [] })),
  }));
}

export async function createBudgetCode(payload: {
  code: string;
  code_letter: string;
  parent_code_id?: string | null;
  code_level: 2 | 3;
  description: string;
  sort_order?: number;
}): Promise<BudgetCode> {
  const { data, error } = await createClient()
    .from("budget_codes")
    .insert({ ...payload, parent_code_id: payload.parent_code_id ?? null, sort_order: payload.sort_order ?? 0 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as BudgetCode;
}

export async function updateBudgetCode(
  id: string,
  payload: Partial<Pick<BudgetCode, "code" | "code_letter" | "description" | "sort_order" | "is_active" | "parent_code_id">>
): Promise<BudgetCode> {
  const { data, error } = await createClient()
    .from("budget_codes")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as BudgetCode;
}

export async function deleteBudgetCode(id: string): Promise<void> {
  const supabase = createClient();
  const [priceList, boqItems, prelimItems] = await Promise.all([
    supabase.from("tender_price_list").select("id").eq("budget_code_id", id).limit(1),
    supabase.from("tender_boq_items").select("id").eq("budget_code_id", id).limit(1),
    supabase.from("tender_preliminaries_items").select("id").eq("budget_code_id", id).limit(1),
  ]);
  if ((priceList.data?.length ?? 0) > 0 || (boqItems.data?.length ?? 0) > 0 || (prelimItems.data?.length ?? 0) > 0) {
    throw new Error("This budget code is in use by Price List, BOQ, or Preliminaries items and cannot be deleted.");
  }
  const { error } = await supabase.from("budget_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Price List ───────────────────────────────────────────────────────────────

export async function getPriceList(tenderId: string): Promise<TenderPriceListItem[]> {
  const { data, error } = await createClient()
    .from("tender_price_list")
    .select("*, budget_codes(code, description)")
    .eq("tender_id", tenderId)
    .order("item_code");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TenderPriceListItem[];
}

export async function getPriceListByMatchKey(
  tenderId: string,
  description: string,
  unit: string
): Promise<TenderPriceListItem | null> {
  const { data } = await createClient()
    .from("tender_price_list")
    .select("*")
    .eq("tender_id", tenderId)
    .eq("match_key", `${description}|${unit}`)
    .maybeSingle();
  return (data as TenderPriceListItem) ?? null;
}

export async function createPriceListItem(payload: {
  tender_id: string;
  item_code: string;
  section?: string | null;
  sub_section?: string | null;
  sub_element?: string | null;
  description: string;
  unit: string;
  labor_net_cost?: number;
  labor_margin_pct?: number;
  material_net_cost?: number;
  material_margin_pct?: number;
  basis_source?: string | null;
  budget_code_id?: string | null;
}): Promise<TenderPriceListItem> {
  const { data, error } = await createClient()
    .from("tender_price_list")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderPriceListItem;
}

export async function updatePriceListItem(
  id: string,
  payload: Partial<{
    section: string | null;
    sub_section: string | null;
    sub_element: string | null;
    description: string;
    unit: string;
    labor_net_cost: number;
    labor_margin_pct: number;
    material_net_cost: number;
    material_margin_pct: number;
    basis_source: string | null;
    budget_code_id: string | null;
  }>
): Promise<TenderPriceListItem> {
  const { data, error } = await createClient()
    .from("tender_price_list")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderPriceListItem;
}

export async function deletePriceListItem(id: string): Promise<void> {
  const { error } = await createClient().from("tender_price_list").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function bulkInsertPriceList(
  tenderId: string,
  rows: Array<{
    item_code: string;
    section?: string | null;
    sub_section?: string | null;
    sub_element?: string | null;
    description: string;
    unit: string;
    labor_net_cost: number;
    labor_margin_pct: number;
    material_net_cost: number;
    material_margin_pct: number;
    basis_source?: string | null;
    budget_code_id?: string | null;
  }>
): Promise<number> {
  const { error } = await createClient()
    .from("tender_price_list")
    .insert(rows.map((r) => ({ ...r, tender_id: tenderId })));
  if (error) throw new Error(error.message);
  return rows.length;
}

// ── BOQ Items ────────────────────────────────────────────────────────────────

export async function getBoqItems(
  tenderId: string,
  filters?: { budgetCodeId?: string; level?: string; discipline?: string }
): Promise<TenderBoqItem[]> {
  let query = createClient()
    .from("tender_boq_items")
    .select("*, budget_codes(code, description, code_letter)")
    .eq("tender_id", tenderId);
  if (filters?.budgetCodeId) query = query.eq("budget_code_id", filters.budgetCodeId);
  if (filters?.level) query = query.eq("level", filters.level);
  if (filters?.discipline) query = query.eq("discipline", filters.discipline);
  const { data, error } = await query.order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TenderBoqItem[];
}

export async function getBoqItemsGrouped(tenderId: string): Promise<BoqItemsGrouped> {
  const [items, groups] = await Promise.all([getBoqItems(tenderId), getBudgetCodeGroups()]);

  const groupMap = new Map<string, BoqGroupLetter>();
  const UNCLASSIFIED_LETTER = "—";

  for (const g of groups) {
    groupMap.set(g.code_letter, { codeLetter: g.code_letter, groupName: g.name, subtotal: 0, budgetCodes: [] });
  }
  groupMap.set(UNCLASSIFIED_LETTER, { codeLetter: UNCLASSIFIED_LETTER, groupName: "Unclassified", subtotal: 0, budgetCodes: [] });

  const budgetCodeMapByLetter = new Map<string, Map<string, BoqGroupBudgetCode>>();

  for (const item of items) {
    const letter = item.budget_codes?.code_letter ?? UNCLASSIFIED_LETTER;
    const group = groupMap.get(letter) ?? groupMap.get(UNCLASSIFIED_LETTER)!;
    const codeKey = item.budget_code_id ?? "unclassified";
    const codeLabel = item.budget_codes?.code ?? "Unclassified";
    const codeDesc = item.budget_codes?.description ?? "No budget code assigned";

    if (!budgetCodeMapByLetter.has(letter)) budgetCodeMapByLetter.set(letter, new Map());
    const bcMap = budgetCodeMapByLetter.get(letter)!;
    if (!bcMap.has(codeKey)) {
      const bc: BoqGroupBudgetCode = { budgetCodeId: item.budget_code_id, code: codeLabel, description: codeDesc, subtotal: 0, sections: [] };
      bcMap.set(codeKey, bc);
      group.budgetCodes.push(bc);
    }
    const bc = bcMap.get(codeKey)!;

    const sectionLabel = item.section || "General";
    let section = bc.sections.find((s) => s.section === sectionLabel);
    if (!section) {
      section = { section: sectionLabel, subtotal: 0, subSections: [] };
      bc.sections.push(section);
    }

    const subSectionLabel = item.sub_section || "—";
    let subSection = section.subSections.find((s) => s.subSection === subSectionLabel);
    if (!subSection) {
      subSection = { subSection: subSectionLabel, subtotal: 0, items: [] };
      section.subSections.push(subSection);
    }

    subSection.items.push(item);
    subSection.subtotal += Number(item.total_amount ?? 0);
    section.subtotal += Number(item.total_amount ?? 0);
    bc.subtotal += Number(item.total_amount ?? 0);
    group.subtotal += Number(item.total_amount ?? 0);
  }

  const orderedGroups = [...groups.map((g) => groupMap.get(g.code_letter)!), groupMap.get(UNCLASSIFIED_LETTER)!].filter(
    (g) => g.budgetCodes.length > 0
  );
  const grandTotal = orderedGroups.reduce((sum, g) => sum + g.subtotal, 0);

  return { groups: orderedGroups, grandTotal };
}

export async function createBoqItem(payload: {
  tender_id: string;
  section: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  discipline?: string | null;
  budget_code_id?: string | null;
  building_code?: string;
  level?: string;
  sub_section?: string | null;
  sub_element?: string | null;
  material_type?: string | null;
  element_group?: string | null;
  element_id?: string | null;
  brand?: string | null;
  supplier?: string | null;
  package_name?: string | null;
  actual_quantity?: number | null;
  notes?: string | null;
  price_list_item_id?: string | null;
  labor_net_cost?: number | null;
  labor_margin_pct?: number | null;
  material_net_cost?: number | null;
  material_margin_pct?: number | null;
  sort_order?: number;
}): Promise<TenderBoqItem> {
  const supabase = createClient();

  let rate = { labor_net_cost: payload.labor_net_cost ?? 0, labor_margin_pct: payload.labor_margin_pct ?? 0, material_net_cost: payload.material_net_cost ?? 0, material_margin_pct: payload.material_margin_pct ?? 0 };
  let rate_source: RateSource = "manual";
  let price_list_item_id = payload.price_list_item_id ?? null;

  if (price_list_item_id) {
    const { data: pl } = await supabase.from("tender_price_list").select("*").eq("id", price_list_item_id).single();
    if (pl) {
      rate = { labor_net_cost: pl.labor_net_cost, labor_margin_pct: pl.labor_margin_pct, material_net_cost: pl.material_net_cost, material_margin_pct: pl.material_margin_pct };
      rate_source = "price_list";
    }
  }

  const labor_rate = rate.labor_net_cost * (1 + rate.labor_margin_pct / 100);
  const material_rate = rate.material_net_cost * (1 + rate.material_margin_pct / 100);
  const unit_rate = labor_rate + material_rate;

  const { data, error } = await supabase
    .from("tender_boq_items")
    .insert({
      tender_id: payload.tender_id,
      section: payload.section,
      item_code: payload.item_code,
      description: payload.description,
      unit: payload.unit,
      quantity: payload.quantity,
      unit_rate,
      discipline: payload.discipline ?? null,
      budget_code_id: payload.budget_code_id ?? null,
      building_code: payload.building_code ?? "BA",
      level: payload.level ?? "All",
      sub_section: payload.sub_section ?? null,
      sub_element: payload.sub_element ?? null,
      material_type: payload.material_type ?? null,
      element_group: payload.element_group ?? null,
      element_id: payload.element_id ?? null,
      brand: payload.brand ?? null,
      supplier: payload.supplier ?? null,
      package_name: payload.package_name ?? null,
      actual_quantity: payload.actual_quantity ?? null,
      notes: payload.notes ?? null,
      price_list_item_id,
      rate_source,
      ...rate,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderBoqItem;
}

export async function updateBoqItem(
  id: string,
  payload: Partial<{
    description: string;
    unit: string;
    quantity: number;
    unit_rate: number;
    labor_net_cost: number;
    labor_margin_pct: number;
    material_net_cost: number;
    material_margin_pct: number;
    budget_code_id: string | null;
    notes: string | null;
  }>
): Promise<TenderBoqItem> {
  const changesRate =
    payload.labor_net_cost !== undefined ||
    payload.labor_margin_pct !== undefined ||
    payload.material_net_cost !== undefined ||
    payload.material_margin_pct !== undefined;

  const update: Record<string, unknown> = { ...payload };
  if (changesRate) {
    update.rate_source = "manual";
  }
  const { data, error } = await createClient().from("tender_boq_items").update(update).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as TenderBoqItem;
}

export async function deleteBoqItem(id: string): Promise<void> {
  const { error } = await createClient().from("tender_boq_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function bulkInsertBoqItems(
  tenderId: string,
  rows: Array<Omit<Parameters<typeof createBoqItem>[0], "tender_id">>
): Promise<number> {
  const supabase = createClient();

  // Resolve MatchKey lookups against the tender's Price List once, up front (avoid N+1 queries).
  const { data: priceListRows } = await supabase.from("tender_price_list").select("*").eq("tender_id", tenderId);
  const priceListByMatchKey = new Map((priceListRows ?? []).map((p) => [p.match_key as string, p]));

  const insertRows = rows.map((r) => {
    const matchKey = `${r.description}|${r.unit}`;
    const matched = priceListByMatchKey.get(matchKey);
    const laborNet = r.labor_net_cost ?? matched?.labor_net_cost ?? 0;
    const laborMargin = r.labor_margin_pct ?? matched?.labor_margin_pct ?? 0;
    const materialNet = r.material_net_cost ?? matched?.material_net_cost ?? 0;
    const materialMargin = r.material_margin_pct ?? matched?.material_margin_pct ?? 0;
    const unit_rate = laborNet * (1 + laborMargin / 100) + materialNet * (1 + materialMargin / 100);
    return {
      tender_id: tenderId,
      section: r.section,
      item_code: r.item_code,
      description: r.description,
      unit: r.unit,
      quantity: r.quantity,
      unit_rate,
      discipline: r.discipline ?? null,
      budget_code_id: r.budget_code_id ?? null,
      building_code: r.building_code ?? "BA",
      level: r.level ?? "All",
      sub_section: r.sub_section ?? null,
      sub_element: r.sub_element ?? null,
      material_type: r.material_type ?? null,
      element_group: r.element_group ?? null,
      element_id: r.element_id ?? null,
      brand: r.brand ?? null,
      supplier: r.supplier ?? null,
      package_name: r.package_name ?? null,
      actual_quantity: r.actual_quantity ?? null,
      notes: r.notes ?? null,
      price_list_item_id: matched?.id ?? null,
      rate_source: (matched ? "price_list" : "manual") as RateSource,
      labor_net_cost: laborNet,
      labor_margin_pct: laborMargin,
      material_net_cost: materialNet,
      material_margin_pct: materialMargin,
      sort_order: r.sort_order ?? 0,
    };
  });

  const { error } = await supabase.from("tender_boq_items").insert(insertRows);
  if (error) throw new Error(error.message);
  return insertRows.length;
}

// ── Preliminaries ────────────────────────────────────────────────────────────

export async function getPreliminariesItems(tenderId: string): Promise<TenderPreliminariesItem[]> {
  const { data, error } = await createClient()
    .from("tender_preliminaries_items")
    .select("*")
    .eq("tender_id", tenderId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as TenderPreliminariesItem[];
}

export async function createPreliminariesItem(payload: {
  tender_id: string;
  code: string;
  budget_code_id?: string | null;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  sort_order?: number;
  notes?: string | null;
}): Promise<TenderPreliminariesItem> {
  const { data, error } = await createClient().from("tender_preliminaries_items").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as TenderPreliminariesItem;
}

export async function updatePreliminariesItem(
  id: string,
  payload: Partial<{ description: string; unit: string; quantity: number; rate: number; notes: string | null }>
): Promise<TenderPreliminariesItem> {
  const { data, error } = await createClient()
    .from("tender_preliminaries_items")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderPreliminariesItem;
}

export async function deletePreliminariesItem(id: string): Promise<void> {
  const { error } = await createClient().from("tender_preliminaries_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getPreliminariesTotal(tenderId: string): Promise<number> {
  const items = await getPreliminariesItems(tenderId);
  return items.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
}

// ── Rollup / Bid Summary ─────────────────────────────────────────────────────

export async function getDirectWorksTotal(tenderId: string): Promise<number> {
  const { data, error } = await createClient().from("tender_boq_items").select("total_amount").eq("tender_id", tenderId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);
}

export async function getBidSummaries(tenderId: string): Promise<TenderBidSummary[]> {
  const { data, error } = await createClient()
    .from("tender_bid_summaries")
    .select("*")
    .eq("tender_id", tenderId)
    .order("revision_no", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TenderBidSummary[];
}

export async function createBidSummaryRevision(tenderId: string): Promise<TenderBidSummary> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const existing = await getBidSummaries(tenderId);
  const nextRev = existing.length > 0 ? Math.max(...existing.map((b) => b.revision_no)) + 1 : 1;
  const { data, error } = await supabase
    .from("tender_bid_summaries")
    .insert({ tender_id: tenderId, revision_no: nextRev, direct_cost: 0, overhead_pct: 10, profit_pct: 5, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderBidSummary;
}

export async function updateBidSummary(
  id: string,
  payload: Partial<{
    direct_cost: number;
    preliminaries: number;
    subcontract_cost: number;
    overhead_pct: number;
    profit_pct: number;
    contingency: number;
    contingency_pct: number | null;
    risk_allowance: number;
    risk_pct: number | null;
    vat_pct: number;
    status: TenderBidSummary["status"];
    notes: string | null;
  }>
): Promise<TenderBidSummary> {
  const { data, error } = await createClient()
    .from("tender_bid_summaries")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderBidSummary;
}

export async function deleteBidSummary(id: string): Promise<void> {
  const res = await fetch(`/api/procurement/tender_bid_summaries/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Delete failed (${res.status})`);
  }
}

/** Recomputes direct_cost from tender_boq_items and preliminaries from tender_preliminaries_items,
 *  writing both onto the given bid summary revision. An explicit action, not an automatic trigger,
 *  so it never silently clobbers a hand-adjusted revision during a bulk BOQ import. */
export async function recalculateBidSummaryFromBoq(tenderId: string, bidSummaryId: string): Promise<TenderBidSummary> {
  const [directCost, preliminariesTotal] = await Promise.all([getDirectWorksTotal(tenderId), getPreliminariesTotal(tenderId)]);
  return updateBidSummary(bidSummaryId, { direct_cost: directCost, preliminaries: preliminariesTotal });
}

// ── Cover / Tender Summary ───────────────────────────────────────────────────

export async function getTenderCoverSummary(tenderId: string, bidSummaryId?: string): Promise<TenderCoverSummary> {
  const [grouped, bidSummaries] = await Promise.all([getBoqItemsGrouped(tenderId), getBidSummaries(tenderId)]);
  const bidSummary = bidSummaryId
    ? bidSummaries.find((b) => b.id === bidSummaryId) ?? null
    : bidSummaries[0] ?? null;
  const preliminariesTotal = await getPreliminariesTotal(tenderId);

  return {
    tenderId,
    elementalCostSummary: grouped.groups.map((g) => ({
      codeLetter: g.codeLetter,
      groupName: g.groupName,
      amount: g.subtotal,
      priced: g.subtotal > 0,
    })),
    directWorksTotal: grouped.grandTotal,
    preliminariesTotal,
    bidSummary,
  };
}
