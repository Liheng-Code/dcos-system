import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QsCostDivision {
  id: string;
  code: string;
  name: string;
  seq: number;
}

export interface QsCostSection {
  id: string;
  division_id: string;
  code: string;
  name: string;
  seq: number;
  qs_cost_divisions?: { code: string; name: string } | null;
}

export interface QsCostItem {
  id: string;
  section_id: string;
  code: string;
  description: string;
  unit: string;
  base_rate: number;
  labor_pct: number;
  material_pct: number;
  equipment_pct: number;
  is_active: boolean;
  qs_cost_sections?: {
    code: string;
    name: string;
    qs_cost_divisions?: { code: string; name: string } | null;
  } | null;
}

export interface QsBoqSection {
  id: string;
  project_id: string;
  seq: number;
  title: string;
  description: string | null;
  baseline_status?: "draft" | "approved" | "locked" | "revised";
  approved_at?: string | null;
  locked_at?: string | null;
  created_at: string;
}

export interface QsBoqItem {
  id: string;
  project_id: string;
  boq_section_id: string;
  wbs_node_id: string | null;
  cost_item_id: string | null;
  seq: number;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  total_amount: number;
  contingency_pct: number;
  is_provisional: boolean;
  notes: string | null;
  baseline_status?: "draft" | "approved" | "locked" | "revised";
  approved_at?: string | null;
  locked_at?: string | null;
  revision_reason?: string | null;
  effective_date?: string | null;
  qs_cost_items?: { code: string; description: string } | null;
  wbs_nodes?: { wbs_name: string; wbs_code: string } | null;
}

export interface QsCostTransaction {
  id: string;
  project_id: string;
  boq_item_id: string | null;
  wbs_node_id: string | null;
  transaction_type: "invoice" | "po" | "timesheet" | "delivery" | "other";
  cost_category: "labor" | "material" | "equipment" | "subcontract" | "other";
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number;
  reference_number: string | null;
  vendor_name: string | null;
  cost_date: string;
  invoice_date: string | null;
  payment_status: "pending" | "approved" | "paid";
  notes: string | null;
  created_at: string;
  qs_boq_items?: { description: string } | null;
}

export interface BudgetSummary {
  totalBudget: number;
  totalCommitted: number;
  totalActual: number;
  totalForecast: number;
  variance: number;
  variancePct: number;
  committedPct: number;
  costByCategory: Record<QsCostTransaction["cost_category"], number>;
  sections: {
    id: string;
    title: string;
    seq: number;
    budget: number;
    committed: number;
    actual: number;
    forecast: number;
    variance: number;
    variancePct: number;
    items: {
      id: string;
      description: string;
      unit: string;
      quantity: number;
      unit_rate: number;
      total_amount: number;
      committed: number;
      actual: number;
      forecast: number;
      variance: number;
    }[];
  }[];
}

export interface CommercialSummary {
  budget: number;
  committed: number;
  actual: number;
  forecast: number;
  variance: number;
  variancePct: number;
  committedPct: number;
  costByCategory: Record<QsCostTransaction["cost_category"], number>;
}

// ── BOQ Header (multi-BOQ support) ───────────────────────────────────────────

export type BoqType = "preliminary" | "main_works" | "variation" | "provisional_sum" | "supplement";
export type BoqStatus = "draft" | "active" | "locked" | "superseded";

export interface QsBoq {
  id: string;
  project_id: string;
  boq_number: string;
  title: string;
  description: string | null;
  boq_type: BoqType;
  version: number;
  status: BoqStatus;
  currency_code: string;
  exchange_rate: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QsBoqSummary extends QsBoq {
  section_count: number;
  item_count: number;
  total_amount: number;
}

export async function getBoqList(projectId: string): Promise<QsBoqSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qs_boq")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const boqs = (data ?? []) as QsBoq[];
  if (boqs.length === 0) return [];
  const boqIds = boqs.map((b) => b.id);

  const { data: sections } = await supabase
    .from("qs_boq_sections")
    .select("id, boq_id")
    .in("boq_id", boqIds);

  const sectionCount: Record<string, number> = {};
  const sectionIds: string[] = [];
  for (const s of sections ?? []) {
    if (s.boq_id) {
      sectionCount[s.boq_id] = (sectionCount[s.boq_id] ?? 0) + 1;
      sectionIds.push(s.id);
    }
  }

  const itemsPerBoq: Record<string, { count: number; total: number }> = {};
  if (sectionIds.length > 0) {
    const { data: boqItems } = await supabase
      .from("qs_boq_items")
      .select("boq_section_id, total_amount")
      .in("boq_section_id", sectionIds);
    for (const item of boqItems ?? []) {
      const sec = (sections ?? []).find((s) => s.id === item.boq_section_id);
      if (sec?.boq_id) {
        if (!itemsPerBoq[sec.boq_id]) itemsPerBoq[sec.boq_id] = { count: 0, total: 0 };
        itemsPerBoq[sec.boq_id].count++;
        itemsPerBoq[sec.boq_id].total += Number(item.total_amount ?? 0);
      }
    }
  }

  return boqs.map((b) => ({
    ...b,
    section_count: sectionCount[b.id] ?? 0,
    item_count: itemsPerBoq[b.id]?.count ?? 0,
    total_amount: itemsPerBoq[b.id]?.total ?? 0,
  })) as QsBoqSummary[];
}

export async function getBoq(id: string): Promise<QsBoq> {
  const { data, error } = await createClient()
    .from("qs_boq")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as QsBoq), exchange_rate: Number((data as QsBoq).exchange_rate) };
}

export async function getBoqByNumber(projectId: string, boqNumber: string): Promise<QsBoq | null> {
  const { data } = await createClient()
    .from("qs_boq")
    .select("*")
    .eq("project_id", projectId)
    .eq("boq_number", boqNumber)
    .maybeSingle();
  return data ? { ...(data as QsBoq), exchange_rate: Number((data as QsBoq).exchange_rate) } : null;
}

export async function getNextBoqNumber(projectId: string): Promise<string> {
  const { data } = await createClient()
    .from("qs_boq")
    .select("boq_number")
    .eq("project_id", projectId)
    .order("boq_number", { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return "BOQ-001";
  const last = data[0].boq_number;
  const num = parseInt(last.replace("BOQ-", ""), 10);
  return `BOQ-${String(num + 1).padStart(3, "0")}`;
}

export async function createBoq(payload: {
  project_id: string;
  boq_number?: string;
  title: string;
  description?: string | null;
  boq_type: BoqType;
  currency_code?: string;
}): Promise<QsBoq> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const boq_number = payload.boq_number ?? await getNextBoqNumber(payload.project_id);
  const { data, error } = await supabase
    .from("qs_boq")
    .insert({
      project_id: payload.project_id,
      boq_number,
      title: payload.title,
      description: payload.description ?? null,
      boq_type: payload.boq_type,
      currency_code: payload.currency_code ?? "USD",
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as QsBoq;
}

export async function updateBoq(
  id: string,
  payload: {
    title?: string;
    description?: string | null;
    boq_type?: BoqType;
    currency_code?: string;
    exchange_rate?: number;
    status?: BoqStatus;
  },
): Promise<QsBoq> {
  const { data, error } = await createClient()
    .from("qs_boq")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as QsBoq;
}

export async function deleteBoq(id: string): Promise<void> {
  const { error } = await createClient().from("qs_boq").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateBoqStatus(id: string, status: BoqStatus): Promise<QsBoq> {
  return updateBoq(id, { status });
}

// ── Cost library ─────────────────────────────────────────────────────────────

export async function getCostDivisions(): Promise<QsCostDivision[]> {
  const { data, error } = await createClient()
    .from("qs_cost_divisions")
    .select("*")
    .order("seq");
  if (error) throw new Error(error.message);
  return (data ?? []) as QsCostDivision[];
}

export async function getCostItems(): Promise<QsCostItem[]> {
  const { data, error } = await createClient()
    .from("qs_cost_items")
    .select("*, qs_cost_sections(code, name, qs_cost_divisions(code, name))")
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as QsCostItem[];
}

// ── BOQ sections ──────────────────────────────────────────────────────────────

export async function getBoqSections(
  projectId: string,
  boqId?: string,
): Promise<QsBoqSection[]> {
  let q = createClient()
    .from("qs_boq_sections")
    .select("*")
    .order("seq");
  if (boqId) {
    q = q.eq("boq_id", boqId);
  } else {
    q = q.eq("project_id", projectId);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as QsBoqSection[];
}

export async function createBoqSection(
  projectId: string,
  title: string,
  description?: string,
  boqId?: string,
): Promise<QsBoqSection> {
  const supabase = createClient();
  const { data: last } = await supabase
    .from("qs_boq_sections")
    .select("seq")
    .eq(boqId ? "boq_id" : "project_id", boqId ?? projectId)
    .order("seq", { ascending: false })
    .limit(1);
  const nextSeq = last && last.length > 0 ? (last[0].seq ?? 0) + 10 : 10;
  const insert: Record<string, unknown> = { project_id: projectId, title, description: description ?? null, seq: nextSeq };
  if (boqId) insert.boq_id = boqId;
  const { data, error } = await supabase
    .from("qs_boq_sections")
    .insert(insert)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as QsBoqSection;
}

export async function deleteBoqSection(id: string): Promise<void> {
  const { error } = await createClient().from("qs_boq_sections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── BOQ items ─────────────────────────────────────────────────────────────────

export async function getBoqItems(
  projectId: string,
  sectionId?: string,
  boqId?: string,
): Promise<QsBoqItem[]> {
  let q = createClient()
    .from("qs_boq_items")
    .select("*, qs_cost_items(code, description), wbs_nodes(wbs_name, wbs_code)")
    .eq("project_id", projectId)
    .order("seq");
  if (sectionId) q = q.eq("boq_section_id", sectionId);
  if (boqId) {
    // Filter items by sections that belong to this BOQ
    const { data: sectionIds } = await createClient()
      .from("qs_boq_sections")
      .select("id")
      .eq("boq_id", boqId);
    const ids = (sectionIds ?? []).map((s) => s.id);
    if (ids.length > 0) q = q.in("boq_section_id", ids);
    else return [];
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as QsBoqItem[];
}

export async function createBoqItem(payload: {
  project_id: string;
  boq_section_id: string;
  wbs_node_id?: string | null;
  cost_item_id?: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  contingency_pct?: number;
  is_provisional?: boolean;
  notes?: string | null;
}): Promise<QsBoqItem> {
  const supabase = createClient();
  const { data: last } = await supabase
    .from("qs_boq_items")
    .select("seq")
    .eq("boq_section_id", payload.boq_section_id)
    .order("seq", { ascending: false })
    .limit(1);
  const nextSeq = last && last.length > 0 ? (last[0].seq ?? 0) + 10 : 10;
  const { data, error } = await supabase
    .from("qs_boq_items")
    .insert({
      ...payload,
      seq: nextSeq,
      contingency_pct: payload.contingency_pct ?? 0,
      is_provisional: payload.is_provisional ?? false,
    })
    .select("*, qs_cost_items(code, description), wbs_nodes(wbs_name, wbs_code)")
    .single();
  if (error) throw new Error(error.message);
  return data as QsBoqItem;
}

export async function deleteBoqItem(id: string): Promise<void> {
  const { error } = await createClient().from("qs_boq_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateBoqBaselineStatus(
  projectId: string,
  status: "approved" | "locked" | "revised",
  boqId?: string,
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    baseline_status: status,
    updated_at: now,
  };
  if (status === "approved" || status === "locked") {
    patch.approved_by = user?.id ?? null;
    patch.approved_at = now;
  }
  if (status === "locked") patch.locked_at = now;

  if (boqId) {
    const { data: sectionIds } = await supabase
      .from("qs_boq_sections")
      .select("id")
      .eq("boq_id", boqId);
    const ids = (sectionIds ?? []).map((s) => s.id);
    const [sectionRes, itemRes] = await Promise.all([
      supabase.from("qs_boq_sections").update(patch).eq("boq_id", boqId),
      ids.length > 0
        ? supabase.from("qs_boq_items").update(patch).in("boq_section_id", ids)
        : Promise.resolve({ error: null }),
    ]);
    if (sectionRes.error) throw new Error(sectionRes.error.message);
    if (itemRes && "error" in itemRes && itemRes.error) throw new Error(itemRes.error.message);
  } else {
    const [sectionRes, itemRes] = await Promise.all([
      supabase.from("qs_boq_sections").update(patch).eq("project_id", projectId),
      supabase.from("qs_boq_items").update(patch).eq("project_id", projectId),
    ]);
    if (sectionRes.error) throw new Error(sectionRes.error.message);
    if (itemRes.error) throw new Error(itemRes.error.message);
  }
}

// ── Budget summary ────────────────────────────────────────────────────────────

export async function getBudgetSummary(projectId: string): Promise<BudgetSummary> {
  const supabase = createClient();
  const [secRes, itemRes, txRes] = await Promise.all([
    supabase.from("qs_boq_sections").select("*").eq("project_id", projectId).order("seq"),
    supabase.from("qs_boq_items").select("*").eq("project_id", projectId).order("seq"),
    supabase
      .from("qs_cost_transactions")
      .select("boq_item_id, total_cost, transaction_type, cost_category")
      .eq("project_id", projectId),
  ]);
  if (secRes.error)  throw new Error(secRes.error.message);
  if (itemRes.error) throw new Error(itemRes.error.message);
  if (txRes.error)   throw new Error(txRes.error.message);

  const actualByItem: Record<string, number> = {};
  const committedByItem: Record<string, number> = {};
  const costByCategory: Record<QsCostTransaction["cost_category"], number> = {
    labor: 0, material: 0, equipment: 0, subcontract: 0, other: 0,
  };
  for (const tx of txRes.data ?? []) {
    if (tx.cost_category) {
      costByCategory[tx.cost_category as QsCostTransaction["cost_category"]] =
        (costByCategory[tx.cost_category as QsCostTransaction["cost_category"]] ?? 0) + Number(tx.total_cost);
    }
    if (tx.boq_item_id) {
      if (tx.transaction_type === "po") {
        committedByItem[tx.boq_item_id] = (committedByItem[tx.boq_item_id] ?? 0) + Number(tx.total_cost);
      } else {
        actualByItem[tx.boq_item_id] = (actualByItem[tx.boq_item_id] ?? 0) + Number(tx.total_cost);
      }
    }
  }

  const sections = (secRes.data ?? []).map((s) => {
    const its = (itemRes.data ?? []).filter((i) => i.boq_section_id === s.id);
    const budget = its.reduce((sum, i) => sum + Number(i.total_amount ?? 0), 0);
    const committed = its.reduce((sum, i) => sum + (committedByItem[i.id] ?? 0), 0);
    const actual = its.reduce((sum, i) => sum + (actualByItem[i.id] ?? 0), 0);
    const forecast = Math.max(budget, committed, actual);
    const variance = budget - forecast;
    return {
      id: s.id,
      title: s.title,
      seq: s.seq,
      budget,
      committed,
      actual,
      forecast,
      variance,
      variancePct: budget > 0 ? (variance / budget) * 100 : 0,
      items: its.map((i) => {
        const iActual = actualByItem[i.id] ?? 0;
        const iCommitted = committedByItem[i.id] ?? 0;
        const iBudget = Number(i.total_amount ?? 0);
        const iForecast = Math.max(iBudget, iCommitted, iActual);
        return {
          id: i.id,
          description: i.description,
          unit: i.unit,
          quantity: Number(i.quantity),
          unit_rate: Number(i.unit_rate),
          total_amount: iBudget,
          committed: iCommitted,
          actual: iActual,
          forecast: iForecast,
          variance: iBudget - iForecast,
        };
      }),
    };
  });

  const totalBudget = sections.reduce((s, sec) => s + sec.budget, 0);
  const totalCommitted = sections.reduce((s, sec) => s + sec.committed, 0);
  const totalActual = sections.reduce((s, sec) => s + sec.actual, 0);
  const totalForecast = sections.reduce((s, sec) => s + sec.forecast, 0);
  const variance = totalBudget - totalForecast;
  return {
    totalBudget,
    totalCommitted,
    totalActual,
    totalForecast,
    variance,
    variancePct: totalBudget > 0 ? (variance / totalBudget) * 100 : 0,
    committedPct: totalBudget > 0 ? (totalCommitted / totalBudget) * 100 : 0,
    costByCategory,
    sections,
  };
}

export async function getProjectCommercialSummary(projectId: string): Promise<CommercialSummary> {
  const budget = await getBudgetSummary(projectId);
  const transactions = await getCostTransactions(projectId);
  const emptyCategories: CommercialSummary["costByCategory"] = {
    labor: 0,
    material: 0,
    equipment: 0,
    subcontract: 0,
    other: 0,
  };
  const costByCategory = transactions.reduce((acc, tx) => {
    if (tx.transaction_type !== "po") acc[tx.cost_category] += Number(tx.total_cost ?? 0);
    return acc;
  }, emptyCategories);
  return {
    budget: budget.totalBudget,
    committed: budget.totalCommitted,
    actual: budget.totalActual,
    forecast: budget.totalForecast,
    variance: budget.variance,
    variancePct: budget.variancePct,
    committedPct: budget.committedPct,
    costByCategory,
  };
}

export async function getWbsCommercialSummary(projectId: string, wbsNodeId: string): Promise<CommercialSummary> {
  const supabase = createClient();
  const [boqRes, txRes] = await Promise.all([
    supabase.from("qs_boq_items").select("id, total_amount").eq("project_id", projectId).eq("wbs_node_id", wbsNodeId),
    supabase.from("qs_cost_transactions").select("*").eq("project_id", projectId),
  ]);
  if (boqRes.error) throw new Error(boqRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);
  const boqIds = new Set((boqRes.data ?? []).map((item) => item.id));
  const txs = ((txRes.data ?? []) as QsCostTransaction[])
    .filter((tx) => tx.wbs_node_id === wbsNodeId || (tx.boq_item_id && boqIds.has(tx.boq_item_id)));
  const budget = (boqRes.data ?? []).reduce((sum, item) => sum + Number(item.total_amount ?? 0), 0);
  const committed = txs.filter((tx) => tx.transaction_type === "po").reduce((sum, tx) => sum + Number(tx.total_cost ?? 0), 0);
  const actual = txs.filter((tx) => tx.transaction_type !== "po").reduce((sum, tx) => sum + Number(tx.total_cost ?? 0), 0);
  const forecast = Math.max(budget, committed, actual);
  const costByCategory: CommercialSummary["costByCategory"] = { labor: 0, material: 0, equipment: 0, subcontract: 0, other: 0 };
  for (const tx of txs) {
    if (tx.transaction_type !== "po") costByCategory[tx.cost_category] += Number(tx.total_cost ?? 0);
  }
  return {
    budget,
    committed,
    actual,
    forecast,
    variance: budget - forecast,
    variancePct: budget > 0 ? ((budget - forecast) / budget) * 100 : 0,
    committedPct: budget > 0 ? (committed / budget) * 100 : 0,
    costByCategory,
  };
}

export async function getWbsBudgetRollup(
  projectId: string,
  rootNodeId: string,
): Promise<{ rollupBudget: number; rollupActual: number; nodeCount: number }> {
  const supabase = createClient();
  const [nodesRes, boqRes, txRes] = await Promise.all([
    supabase.from("wbs_nodes").select("id, parent_id").eq("project_id", projectId),
    supabase.from("qs_boq_items").select("id, wbs_node_id, total_amount").eq("project_id", projectId),
    supabase.from("qs_cost_transactions").select("wbs_node_id, boq_item_id, total_cost, transaction_type").eq("project_id", projectId),
  ]);
  if (nodesRes.error) throw new Error(nodesRes.error.message);

  // Build descendant set (including rootNodeId itself)
  const allNodes = nodesRes.data ?? [];
  const childMap = new Map<string, string[]>();
  for (const n of allNodes) {
    if (n.parent_id) {
      if (!childMap.has(n.parent_id)) childMap.set(n.parent_id, []);
      childMap.get(n.parent_id)!.push(n.id);
    }
  }
  const descendants = new Set<string>();
  const queue = [rootNodeId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    descendants.add(id);
    const children = childMap.get(id) ?? [];
    for (const c of children) if (!descendants.has(c)) queue.push(c);
  }

  const boqItems = boqRes.data ?? [];
  const txs      = txRes.data ?? [];
  const nodeBoqIds = new Set(boqItems.filter((i) => i.wbs_node_id && descendants.has(i.wbs_node_id)).map((i) => i.id));

  const rollupBudget = boqItems
    .filter((i) => i.wbs_node_id && descendants.has(i.wbs_node_id))
    .reduce((s, i) => s + Number(i.total_amount), 0);

  const rollupActual = txs
    .filter((tx) => tx.transaction_type !== "po" && (
      (tx.wbs_node_id && descendants.has(tx.wbs_node_id)) ||
      (tx.boq_item_id && nodeBoqIds.has(tx.boq_item_id))
    ))
    .reduce((s, tx) => s + Number(tx.total_cost), 0);

  return { rollupBudget, rollupActual, nodeCount: descendants.size };
}

// ── Cost transactions ─────────────────────────────────────────────────────────

export async function getCostTransactions(
  projectId: string,
): Promise<QsCostTransaction[]> {
  const { data, error } = await createClient()
    .from("qs_cost_transactions")
    .select("*, qs_boq_items(description)")
    .eq("project_id", projectId)
    .order("cost_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QsCostTransaction[];
}

export async function createCostTransaction(payload: {
  project_id: string;
  boq_item_id?: string | null;
  wbs_node_id?: string | null;
  transaction_type: QsCostTransaction["transaction_type"];
  cost_category: QsCostTransaction["cost_category"];
  description: string;
  quantity?: number | null;
  unit?: string | null;
  unit_cost?: number | null;
  total_cost: number;
  reference_number?: string | null;
  vendor_name?: string | null;
  cost_date: string;
  invoice_date?: string | null;
  notes?: string | null;
}): Promise<QsCostTransaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("qs_cost_transactions")
    .insert({ ...payload, created_by: user?.id ?? null })
    .select("*, qs_boq_items(description)")
    .single();
  if (error) throw new Error(error.message);
  return data as QsCostTransaction;
}

export async function deleteCostTransaction(id: string): Promise<void> {
  const { error } = await createClient().from("qs_cost_transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Phase 2: Variation Orders ─────────────────────────────────────────────────

export type VoType = "client_request" | "design_change" | "site_condition" | "regulatory" | "other";
export type VoStatus = "draft" | "submitted" | "approved" | "rejected" | "implemented";

export interface QsVariationOrder {
  id: string;
  project_id: string;
  vo_number: string;
  title: string;
  vo_type: VoType;
  description: string | null;
  total_amount: number;
  schedule_impact_days: number;
  status: VoStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface QsVoItem {
  id: string;
  vo_id: string;
  boq_item_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  total_amount: number;
}

export function generateVoNumber(): string {
  return `VO-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
}

export function voApprovalThreshold(amount: number): string {
  if (amount < 5000)  return "PM only";
  if (amount < 50000) return "PM → QS";
  return "PM → QS → Director";
}

export async function getVariationOrders(projectId: string): Promise<QsVariationOrder[]> {
  const { data, error } = await createClient()
    .from("qs_variation_orders")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QsVariationOrder[];
}

export async function createVariationOrder(payload: {
  project_id: string;
  title: string;
  vo_type: VoType;
  description?: string | null;
  schedule_impact_days?: number;
}): Promise<QsVariationOrder> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("qs_variation_orders")
    .insert({
      ...payload,
      vo_number: generateVoNumber(),
      schedule_impact_days: payload.schedule_impact_days ?? 0,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as QsVariationOrder;
}

export async function updateVoStatus(
  id: string,
  status: VoStatus,
  extra?: { rejection_reason?: string },
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "submitted") { patch.submitted_at = new Date().toISOString(); patch.submitted_by = user?.id; }
  if (status === "approved")  { patch.approved_at  = new Date().toISOString(); patch.approved_by  = user?.id; }
  if (extra?.rejection_reason) patch.rejection_reason = extra.rejection_reason;
  const { error } = await supabase.from("qs_variation_orders").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getVoItems(voId: string): Promise<QsVoItem[]> {
  const { data, error } = await createClient()
    .from("qs_vo_items")
    .select("*")
    .eq("vo_id", voId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as QsVoItem[];
}

export async function createVoItem(payload: {
  vo_id: string;
  boq_item_id?: string | null;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
}): Promise<QsVoItem> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qs_vo_items")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  // Recompute VO total_amount
  const { data: all } = await supabase
    .from("qs_vo_items")
    .select("total_amount")
    .eq("vo_id", payload.vo_id);
  const total = (all ?? []).reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  await supabase.from("qs_variation_orders").update({ total_amount: total }).eq("id", payload.vo_id);
  return data as QsVoItem;
}

export async function deleteVoItem(id: string, voId: string): Promise<void> {
  const supabase = createClient();
  await supabase.from("qs_vo_items").delete().eq("id", id);
  const { data: all } = await supabase.from("qs_vo_items").select("total_amount").eq("vo_id", voId);
  const total = (all ?? []).reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  await supabase.from("qs_variation_orders").update({ total_amount: total }).eq("id", voId);
}

// ── Phase 2: Progress Claims (IPC) ───────────────────────────────────────────

export type ClaimStatus = "draft" | "submitted" | "client_reviewed" | "certified" | "paid";

export interface QsProgressClaim {
  id: string;
  project_id: string;
  claim_number: number;
  period_start: string;
  period_end: string;
  original_contract_sum: number;
  net_vo_amount: number;
  total_completed_stored: number;
  retention_pct: number;
  retention_amount: number;
  prev_certificates_total: number;
  current_payment_due: number;
  status: ClaimStatus;
  certified_amount: number | null;
  client_adjustment_total?: number;
  notes: string | null;
  submitted_at: string | null;
  client_reviewed_at?: string | null;
  certified_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface QsClaimItem {
  id: string;
  claim_id: string;
  boq_section_id: string | null;
  boq_item_id: string | null;
  description: string;
  unit: string;
  scheduled_value: number;
  prev_completed: number;
  this_period: number;
  materials_stored: number;
  client_adjustment?: number;
  adjustment_reason?: string | null;
  certified_this_period?: number | null;
  certified_materials_stored?: number | null;
  total_to_date: number;
  pct_complete: number;
  qs_boq_sections?: { title: string } | null;
}

export async function getProgressClaims(projectId: string): Promise<QsProgressClaim[]> {
  const { data, error } = await createClient()
    .from("qs_progress_claims")
    .select("*")
    .eq("project_id", projectId)
    .order("claim_number", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QsProgressClaim[];
}

export async function createProgressClaim(payload: {
  project_id: string;
  period_start: string;
  period_end: string;
  retention_pct: number;
  original_contract_sum: number;
  notes?: string | null;
}): Promise<QsProgressClaim> {
  const supabase = createClient();

  // Auto-increment claim number
  const { data: last } = await supabase
    .from("qs_progress_claims")
    .select("claim_number")
    .eq("project_id", payload.project_id)
    .order("claim_number", { ascending: false })
    .limit(1);
  const nextNum = last && last.length > 0 ? (last[0].claim_number ?? 0) + 1 : 1;

  // Net VO amount from implemented VOs
  const { data: vos } = await supabase
    .from("qs_variation_orders")
    .select("total_amount")
    .eq("project_id", payload.project_id)
    .eq("status", "implemented");
  const netVo = (vos ?? []).reduce((s, v) => s + Number(v.total_amount ?? 0), 0);

  // Previous certificates total (sum of certified current_payment_due)
  const { data: prevClaims } = await supabase
    .from("qs_progress_claims")
    .select("current_payment_due")
    .eq("project_id", payload.project_id)
    .in("status", ["certified", "paid"]);
  const prevTotal = (prevClaims ?? []).reduce((s, c) => s + Number(c.current_payment_due ?? 0), 0);

  const { data, error } = await supabase
    .from("qs_progress_claims")
    .insert({
      project_id:              payload.project_id,
      claim_number:            nextNum,
      period_start:            payload.period_start,
      period_end:              payload.period_end,
      original_contract_sum:   payload.original_contract_sum,
      net_vo_amount:           netVo,
      retention_pct:           payload.retention_pct,
      prev_certificates_total: prevTotal,
      notes:                   payload.notes ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Initialize claim items from BOQ
  await initializeClaimItems(data.id, payload.project_id, data.id);
  return data as QsProgressClaim;
}

async function initializeClaimItems(
  claimId: string,
  projectId: string,
  currentClaimId: string,
): Promise<void> {
  const supabase = createClient();

  const itemsRes = await supabase
    .from("qs_boq_items")
    .select("id, boq_section_id, description, unit, total_amount")
    .eq("project_id", projectId)
    .in("baseline_status", ["approved", "locked"])
    .order("seq");

  if (!itemsRes.data || itemsRes.data.length === 0) return;

  // Compute prev_completed per BOQ item from prior certified/paid claims
  const { data: priorClaims } = await supabase
    .from("qs_progress_claims")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["certified", "paid"])
    .neq("id", currentClaimId);

  const prevMap: Record<string, number> = {};
  if (priorClaims && priorClaims.length > 0) {
    const { data: priorItems } = await supabase
      .from("qs_claim_items")
      .select("boq_item_id, total_to_date")
      .in("claim_id", priorClaims.map((c: { id: string }) => c.id));
    for (const pi of priorItems ?? []) {
      if (pi.boq_item_id) {
        prevMap[pi.boq_item_id] = (prevMap[pi.boq_item_id] ?? 0) +
          Number(pi.total_to_date);
      }
    }
  }

  const rows = itemsRes.data.map((item) => ({
    claim_id:        claimId,
    boq_section_id:  item.boq_section_id,
    boq_item_id:     item.id,
    description:     item.description,
    unit:            item.unit ?? "",
    scheduled_value: Number(item.total_amount ?? 0),
    prev_completed:  prevMap[item.id] ?? 0,
    this_period:     0,
    materials_stored: 0,
  }));

  await supabase.from("qs_claim_items").insert(rows);
}

export async function getClaimItems(claimId: string): Promise<QsClaimItem[]> {
  const { data, error } = await createClient()
    .from("qs_claim_items")
    .select("*, qs_boq_sections(title)")
    .eq("claim_id", claimId)
    .order("boq_section_id")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as QsClaimItem[];
}

export async function updateClaimItem(
  id: string,
  this_period: number,
  materials_stored: number,
  client_adjustment: number = 0,
  adjustment_reason?: string | null,
): Promise<void> {
  const { error } = await createClient()
    .from("qs_claim_items")
    .update({
      this_period,
      materials_stored,
      client_adjustment,
      adjustment_reason: adjustment_reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function recalculateClaim(claimId: string): Promise<QsProgressClaim> {
  const supabase = createClient();
  const { data: items } = await supabase
    .from("qs_claim_items")
    .select("total_to_date, client_adjustment")
    .eq("claim_id", claimId);

  const totalCompleted = (items ?? []).reduce((s, i) => s + Number(i.total_to_date ?? 0), 0);
  const adjustmentTotal = (items ?? []).reduce((s, i) => s + Number(i.client_adjustment ?? 0), 0);
  const certifiedBase = totalCompleted + adjustmentTotal;

  const { data: claim } = await supabase
    .from("qs_progress_claims")
    .select("retention_pct, prev_certificates_total")
    .eq("id", claimId)
    .single();

  const retPct = Number(claim?.retention_pct ?? 5);
  const retentionAmount = Math.round(certifiedBase * retPct) / 100;
  const prevTotal = Number(claim?.prev_certificates_total ?? 0);
  const paymentDue = certifiedBase - retentionAmount - prevTotal;

  const { data: updated, error } = await supabase
    .from("qs_progress_claims")
    .update({
      total_completed_stored:  totalCompleted,
      client_adjustment_total: adjustmentTotal,
      retention_amount:        retentionAmount,
      current_payment_due:     paymentDue,
      updated_at:              new Date().toISOString(),
    })
    .eq("id", claimId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return updated as QsProgressClaim;
}

export async function updateClaimStatus(
  id: string,
  status: ClaimStatus,
  extra?: { certified_amount?: number },
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "submitted") { patch.submitted_at = new Date().toISOString(); patch.submitted_by = user?.id; }
  if (status === "client_reviewed") {
    patch.client_reviewed_at = new Date().toISOString();
    patch.client_reviewed_by = user?.id;
  }
  if (status === "certified") {
    patch.certified_at = new Date().toISOString();
    patch.certified_by = user?.id;
    if (extra?.certified_amount !== undefined) patch.certified_amount = extra.certified_amount;
  }
  if (status === "paid") patch.paid_at = new Date().toISOString();
  const { error } = await supabase.from("qs_progress_claims").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  // On certification: auto-create retention deduction entry
  if (status === "certified") {
    const { data: claim } = await supabase
      .from("qs_progress_claims")
      .select("project_id, retention_amount")
      .eq("id", id)
      .single();
    if (claim && Number(claim.retention_amount) > 0) {
      await supabase.from("qs_retention_ledger").insert({
        project_id:       claim.project_id,
        claim_id:         id,
        transaction_type: "deduction",
        amount:           Number(claim.retention_amount),
        created_by:       user?.id ?? null,
      });
    }
  }

  // On payment: create receipt voucher in accounts module
  if (status === "paid") {
    const { data: claim } = await supabase
      .from("qs_progress_claims")
      .select("project_id, claim_number, certified_amount, current_payment_due, projects(project_name)")
      .eq("id", id)
      .single();
    if (claim) {
      type PaidClaim = { certified_amount: number | null; current_payment_due: number; claim_number: number; projects: { project_name?: string } | null };
      const c = claim as unknown as PaidClaim;
      const amount = Number(c.certified_amount ?? c.current_payment_due);
      const projectName = c.projects?.project_name ?? "Project";
      const yr = new Date().getFullYear();
      const voucherNo = `PV-IPC-${String(c.claim_number).padStart(3, "0")}-${yr}`;
      const { data: pv } = await supabase
        .from("account_payment_vouchers")
        .insert({
          voucher_no:   voucherNo,
          voucher_date: new Date().toISOString().split("T")[0],
          type:         "receipt",
          payee_type:   "client",
          payee_name:   projectName,
          amount,
          reference:    `IPC #${c.claim_number}`,
          status:       "paid",
          paid_at:      new Date().toISOString(),
          created_by:   user?.id ?? null,
        })
        .select("id")
        .single();
      if (pv) {
        await supabase.from("account_pv_links").insert({
          voucher_id:   pv.id,
          invoice_type: "ar",
          invoice_id:   id,
          amount,
        });
      }
    }
  }
}

// ── Phase 2: Retention Ledger ─────────────────────────────────────────────────

export type RetentionTrigger = "practical_completion" | "dlp_completion" | "other";

export interface QsRetentionEntry {
  id: string;
  project_id: string;
  claim_id: string | null;
  transaction_type: "deduction" | "release";
  amount: number;
  release_trigger: RetentionTrigger | null;
  approval_status?: "pending" | "approved" | "rejected";
  expected_release_date?: string | null;
  actual_release_date?: string | null;
  approved_at?: string | null;
  notes: string | null;
  created_at: string;
  qs_progress_claims?: { claim_number: number } | null;
}

export async function getRetentionLedger(projectId: string): Promise<QsRetentionEntry[]> {
  const { data, error } = await createClient()
    .from("qs_retention_ledger")
    .select("*, qs_progress_claims(claim_number)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QsRetentionEntry[];
}

export async function getRetentionBalance(
  projectId: string,
): Promise<{ deducted: number; released: number; balance: number }> {
  const { data, error } = await createClient()
    .from("qs_retention_ledger")
    .select("transaction_type, amount, approval_status")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  const deducted = (data ?? [])
    .filter((e) => e.transaction_type === "deduction")
    .reduce((s, e) => s + Number(e.amount), 0);
  const released = (data ?? [])
    .filter((e) => e.transaction_type === "release" && (e.approval_status ?? "approved") === "approved")
    .reduce((s, e) => s + Number(e.amount), 0);
  return { deducted, released, balance: deducted - released };
}

export async function createRetentionRelease(payload: {
  project_id: string;
  amount: number;
  release_trigger: RetentionTrigger;
  expected_release_date?: string | null;
  notes?: string | null;
}): Promise<QsRetentionEntry> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("qs_retention_ledger")
    .insert({
      ...payload,
      transaction_type: "release",
      approval_status: "pending",
      created_by: user?.id ?? null,
    })
    .select("*, qs_progress_claims(claim_number)")
    .single();
  if (error) throw new Error(error.message);
  return data as QsRetentionEntry;
}

export async function approveRetentionRelease(id: string): Promise<QsRetentionEntry> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("qs_retention_ledger")
    .update({
      approval_status: "approved",
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      actual_release_date: new Date().toISOString().split("T")[0],
    })
    .eq("id", id)
    .select("*, qs_progress_claims(claim_number)")
    .single();
  if (error) throw new Error(error.message);
  return data as QsRetentionEntry;
}

// ── VO Multi-Step Approval Workflow ──────────────────────────────────────────

export interface QsVoApproval {
  id: string;
  vo_id: string;
  step: number;
  approver_role: string;
  user_id: string | null;
  decision: "pending" | "approved" | "rejected";
  comments: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface VoApprovalStep {
  step: number;
  role: string;
  label: string;
}

export function getVoApprovalSteps(amount: number): VoApprovalStep[] {
  if (amount < 5000)  return [{ step: 1, role: "PM",       label: "Project Manager" }];
  if (amount < 50000) return [
    { step: 1, role: "PM", label: "Project Manager" },
    { step: 2, role: "QS", label: "QS Manager" },
  ];
  return [
    { step: 1, role: "PM",       label: "Project Manager" },
    { step: 2, role: "QS",       label: "QS Manager" },
    { step: 3, role: "Director", label: "Commercial Director" },
  ];
}

export async function getVoApprovals(voId: string): Promise<QsVoApproval[]> {
  const { data, error } = await createClient()
    .from("qs_vo_approvals")
    .select("*")
    .eq("vo_id", voId)
    .order("step");
  if (error) throw new Error(error.message);
  return (data ?? []) as QsVoApproval[];
}

export async function submitVoApprovalDecision(
  voId: string,
  totalAmount: number,
  step: number,
  decision: "approved" | "rejected",
  comments?: string,
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const steps = getVoApprovalSteps(totalAmount);
  const stepDef = steps.find((s) => s.step === step);
  const now = new Date().toISOString();

  // Delete existing row for this step (if re-deciding), then insert fresh
  await supabase.from("qs_vo_approvals").delete().eq("vo_id", voId).eq("step", step);
  const { error } = await supabase.from("qs_vo_approvals").insert({
    vo_id: voId,
    step,
    approver_role: stepDef?.role ?? "PM",
    user_id: user?.id ?? null,
    decision,
    comments: comments ?? null,
    decided_at: now,
  });
  if (error) throw new Error(error.message);

  if (decision === "rejected") {
    await updateVoStatus(voId, "rejected", { rejection_reason: comments });
    return;
  }

  // Check if all required steps are now approved
  const { data: approvals } = await supabase
    .from("qs_vo_approvals")
    .select("step, decision")
    .eq("vo_id", voId);

  const approvedSteps = new Set(
    (approvals ?? []).filter((a) => a.decision === "approved").map((a) => a.step),
  );
  if (steps.every((s) => approvedSteps.has(s.step))) {
    await updateVoStatus(voId, "approved");
  }
}

// ── QS Audit Log ─────────────────────────────────────────────────────────────

export interface QsAuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_by: string | null;
  changed_at: string;
}

export async function getQsAuditLog(
  projectId: string,
  limit = 100,
): Promise<QsAuditEntry[]> {
  const supabase = createClient();

  // Get all relevant record IDs for this project across QS tables
  const [vosRes, claimsRes, retRes] = await Promise.all([
    supabase.from("qs_variation_orders").select("id").eq("project_id", projectId),
    supabase.from("qs_progress_claims").select("id").eq("project_id", projectId),
    supabase.from("qs_retention_ledger").select("id").eq("project_id", projectId),
  ]);

  const recordIds = [
    ...(vosRes.data ?? []).map((r) => r.id),
    ...(claimsRes.data ?? []).map((r) => r.id),
    ...(retRes.data ?? []).map((r) => r.id),
  ];

  if (recordIds.length === 0) return [];

  const { data, error } = await supabase
    .from("qs_audit_log")
    .select("*")
    .in("record_id", recordIds)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as QsAuditEntry[];
}

// ── Time-Phased Cost Baseline (Cash Flow) ─────────────────────────────────────

export interface QsCostBaselineEntry {
  id: string;
  project_id: string;
  period_date: string;
  planned_cost: number;
  cumulative_planned: number;
  notes: string | null;
  created_at: string;
}

export async function getCostBaseline(projectId: string): Promise<QsCostBaselineEntry[]> {
  const { data, error } = await createClient()
    .from("qs_cost_baseline")
    .select("*")
    .eq("project_id", projectId)
    .order("period_date");
  if (error) throw new Error(error.message);
  return (data ?? []) as QsCostBaselineEntry[];
}

export async function upsertCostBaselineEntries(
  projectId: string,
  entries: { period_date: string; planned_cost: number }[],
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let cumulative = 0;
  const rows = entries.map((e) => {
    cumulative += e.planned_cost;
    return {
      project_id:         projectId,
      period_date:        e.period_date,
      planned_cost:       e.planned_cost,
      cumulative_planned: cumulative,
      created_by:         user?.id ?? null,
    };
  });
  const { error } = await supabase
    .from("qs_cost_baseline")
    .upsert(rows, { onConflict: "project_id,period_date" });
  if (error) throw new Error(error.message);
}

export async function deleteCostBaselineEntry(id: string): Promise<void> {
  const { error } = await createClient()
    .from("qs_cost_baseline")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Contingency Reserve ───────────────────────────────────────────────────────

export interface QsContingencyDrawdown {
  id: string;
  project_id: string;
  boq_item_id: string | null;
  amount: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  qs_boq_items?: { description: string } | null;
}

export async function getContingencyBalance(projectId: string): Promise<{
  contingencyBudget: number;
  approved: number;
  pending: number;
  balance: number;
}> {
  const supabase = createClient();
  const [itemsRes, drawRes] = await Promise.all([
    supabase
      .from("qs_boq_items")
      .select("total_amount, contingency_pct")
      .eq("project_id", projectId),
    supabase
      .from("qs_contingency_drawdowns")
      .select("amount, status")
      .eq("project_id", projectId),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  if (drawRes.error)  throw new Error(drawRes.error.message);

  const contingencyBudget = (itemsRes.data ?? []).reduce(
    (s, i) => s + Number(i.total_amount) * (Number(i.contingency_pct) / 100),
    0,
  );
  const draws = drawRes.data ?? [];
  const approved = draws.filter((d) => d.status === "approved").reduce((s, d) => s + Number(d.amount), 0);
  const pending  = draws.filter((d) => d.status === "pending").reduce((s, d) => s + Number(d.amount), 0);
  return { contingencyBudget, approved, pending, balance: contingencyBudget - approved };
}

export async function getContingencyDrawdowns(projectId: string): Promise<QsContingencyDrawdown[]> {
  const { data, error } = await createClient()
    .from("qs_contingency_drawdowns")
    .select("*, qs_boq_items(description)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QsContingencyDrawdown[];
}

export async function createContingencyDrawdown(payload: {
  project_id: string;
  boq_item_id?: string | null;
  amount: number;
  reason: string;
}): Promise<QsContingencyDrawdown> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("qs_contingency_drawdowns")
    .insert({ ...payload, created_by: user?.id ?? null })
    .select("*, qs_boq_items(description)")
    .single();
  if (error) throw new Error(error.message);
  return data as QsContingencyDrawdown;
}

export async function approveContingencyDrawdown(id: string, status: "approved" | "rejected"): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("qs_contingency_drawdowns")
    .update({ status, approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Budget Revisions ─────────────────────────────────────────────────────────

export interface QsBudgetRevision {
  id: string;
  project_id: string;
  boq_item_id: string;
  prev_quantity: number | null;
  new_quantity: number | null;
  prev_unit_rate: number | null;
  new_unit_rate: number | null;
  prev_total: number | null;
  new_total: number | null;
  reason: string | null;
  revised_by: string | null;
  revised_at: string;
  approved_by: string | null;
  approved_at: string | null;
  effective_date: string | null;
  qs_boq_items?: { description: string; unit: string } | null;
}

export async function getBudgetRevisions(projectId: string): Promise<QsBudgetRevision[]> {
  const { data, error } = await createClient()
    .from("qs_budget_revisions")
    .select("*, qs_boq_items(description, unit)")
    .eq("project_id", projectId)
    .order("revised_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as QsBudgetRevision[];
}

export async function approveBudgetRevision(id: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("qs_budget_revisions")
    .update({
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      effective_date: new Date().toISOString().split("T")[0],
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Payment Vouchers (QS Finance Integration) ────────────────────────────────

export interface QsPaymentVoucher {
  id: string;
  voucher_no: string;
  voucher_date: string;
  type: "payment" | "receipt" | "transfer";
  payee_name: string;
  amount: number;
  reference: string | null;
  status: "draft" | "submitted" | "approved" | "paid" | "cancelled";
  paid_at: string | null;
  created_at: string;
  claim_number: number | null;
}

export async function getQsPaymentVouchers(projectId: string): Promise<QsPaymentVoucher[]> {
  const supabase = createClient();

  const { data: claims } = await supabase
    .from("qs_progress_claims")
    .select("id, claim_number")
    .eq("project_id", projectId);

  if (!claims || claims.length === 0) return [];
  const claimIds = claims.map((c) => c.id);

  const { data: links } = await supabase
    .from("account_pv_links")
    .select("voucher_id, invoice_id, amount")
    .eq("invoice_type", "ar")
    .in("invoice_id", claimIds);

  if (!links || links.length === 0) return [];
  const voucherIds = [...new Set(links.map((l) => l.voucher_id))];

  const { data: vouchers, error } = await supabase
    .from("account_payment_vouchers")
    .select("id, voucher_no, voucher_date, type, payee_name, amount, reference, status, paid_at, created_at")
    .in("id", voucherIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (vouchers ?? []).map((v) => {
    const link = links.find((l) => l.voucher_id === v.id);
    const claim = link ? claims.find((c) => c.id === link.invoice_id) : null;
    return { ...v, amount: Number(v.amount), claim_number: claim?.claim_number ?? null } as QsPaymentVoucher;
  });
}

// ── Multi-Currency ────────────────────────────────────────────────────────────

export interface QsExchangeRate {
  id: string;
  project_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  source: string | null;
  created_at: string;
}

export async function getProjectBaseCurrency(projectId: string): Promise<string> {
  const { data } = await createClient()
    .from("qs_project_currency")
    .select("base_currency")
    .eq("project_id", projectId)
    .maybeSingle();
  return data?.base_currency ?? "USD";
}

export async function setProjectBaseCurrency(projectId: string, currency: string): Promise<void> {
  const { error } = await createClient()
    .from("qs_project_currency")
    .upsert({ project_id: projectId, base_currency: currency, updated_at: new Date().toISOString() }, { onConflict: "project_id" });
  if (error) throw new Error(error.message);
}

export async function getExchangeRates(projectId: string): Promise<QsExchangeRate[]> {
  const { data, error } = await createClient()
    .from("qs_exchange_rates")
    .select("*")
    .eq("project_id", projectId)
    .order("effective_date", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as QsExchangeRate[]).map((r) => ({ ...r, rate: Number(r.rate) }));
}

export async function upsertExchangeRate(payload: {
  project_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  source?: string | null;
}): Promise<QsExchangeRate> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("qs_exchange_rates")
    .upsert({ ...payload, created_by: user?.id ?? null }, { onConflict: "project_id,from_currency,to_currency,effective_date" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as QsExchangeRate), rate: Number((data as QsExchangeRate).rate) };
}

export async function deleteExchangeRate(id: string): Promise<void> {
  const { error } = await createClient().from("qs_exchange_rates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── GFA, Site Area & Cost per m² (DCOS-QS-GDL-001 V1.1) ─────────────────────
// See docs/03-Business-Modules/12-Quantity-Surveying/04-GFA-Site-Area-Cost-per-m2-Design.md

export type ElementalCategory = "substructure" | "superstructure" | "architectural" | "mep" | "external_works" | "prelims";

export interface WbsNodeGfa {
  wbsNodeId: string;
  value: number;
  unit: string;
  source: string | null;
  updatedAt: string;
}

export interface ProjectGfaSummary {
  gfaAbove: number;
  gfaBasement: number;
  gfaTotal: number;
}

export interface CostPerM2Summary {
  buildingCost: number;
  aboveGroundCost: number;
  basementCost: number;
  externalWorksCost: number;
  gfa: ProjectGfaSummary;
  siteArea: number | null;
  aboveGroundRate: number | null;
  basementRate: number | null;
  blendedRate: number | null;
  externalWorksRate: number | null;
}

export interface ElementalBreakdownLine {
  category: ElementalCategory | "unclassified";
  cost: number;
  costPerM2: number;
}

export interface PrelimsApportionment {
  aboveGroundShare: number;
  basementShare: number;
  aboveGroundRateRefined: number | null;
  basementRateRefined: number | null;
}

export interface FinalCostSummaryLine {
  no: string;
  description: string;
  cost: number;
  denominatorLabel: string;
  costPerM2: number | null;
}

export interface GfaDataQualityWarning {
  wbsNodeId: string;
  wbsName: string;
  cost: number;
}

// §11: GFA entered per level node, source = drawing revision reference.
export async function getWbsNodeGfa(wbsNodeId: string): Promise<WbsNodeGfa | null> {
  const { data, error } = await createClient()
    .from("wbs_node_quantities")
    .select("wbs_node_id, value, unit, source, updated_at")
    .eq("wbs_node_id", wbsNodeId)
    .eq("metric_code", "GFA")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    wbsNodeId: data.wbs_node_id,
    value: Number(data.value),
    unit: data.unit,
    source: data.source,
    updatedAt: data.updated_at,
  };
}

// §3 Non-Negotiable Rule 3: editing an existing value requires a reason, logged
// via qs_audit_log (trigger already attached to wbs_node_quantities). First
// entry needs no reason — nothing to revise yet.
export async function upsertWbsNodeGfa(payload: {
  wbsNodeId: string;
  value: number;
  source: string;
  revisionReason?: string;
}): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const existing = await getWbsNodeGfa(payload.wbsNodeId);

  if (existing && !payload.revisionReason) {
    throw new Error("A revision reason is required when changing an existing GFA value.");
  }

  const { error } = await supabase
    .from("wbs_node_quantities")
    .upsert(
      {
        wbs_node_id: payload.wbsNodeId,
        metric_code: "GFA",
        value: payload.value,
        source: payload.source,
        revision_reason: existing ? payload.revisionReason : null,
        updated_by: user?.id ?? null,
        ...(existing ? {} : { created_by: user?.id ?? null }),
      },
      { onConflict: "wbs_node_id,metric_code" },
    );
  if (error) throw new Error(error.message);
}

// §4: Site Area entered once per project, independent of the WBS GFA rollup.
export async function getProjectSiteArea(projectId: string): Promise<{ siteArea: number | null; siteAreaSource: string | null }> {
  const { data, error } = await createClient()
    .from("projects")
    .select("site_area, site_area_source")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);
  return {
    siteArea: data?.site_area != null ? Number(data.site_area) : null,
    siteAreaSource: data?.site_area_source ?? null,
  };
}

export async function updateProjectSiteArea(payload: {
  projectId: string;
  siteArea: number;
  siteAreaSource: string;
}): Promise<void> {
  const { error } = await createClient()
    .from("projects")
    .update({ site_area: payload.siteArea, site_area_source: payload.siteAreaSource })
    .eq("id", payload.projectId);
  if (error) throw new Error(error.message);
}

// §2/§6/§7: GFA above ground / basement / total, rolled up from level nodes.
// wbs_nodes.project_id is denormalized onto every node, so this is a flat
// aggregate — no recursive rollup needed.
export async function getProjectGfaSummary(projectId: string): Promise<ProjectGfaSummary> {
  const supabase = createClient();
  const { data: nodes, error: nodesError } = await supabase
    .from("wbs_nodes")
    .select("id, is_below_ground")
    .eq("project_id", projectId)
    .eq("node_type", "level");
  if (nodesError) throw new Error(nodesError.message);
  const levelNodes = nodes ?? [];
  if (levelNodes.length === 0) return { gfaAbove: 0, gfaBasement: 0, gfaTotal: 0 };

  const nodeIds = levelNodes.map((n) => n.id);
  const { data: quantities, error: qError } = await supabase
    .from("wbs_node_quantities")
    .select("wbs_node_id, value")
    .eq("metric_code", "GFA")
    .in("wbs_node_id", nodeIds);
  if (qError) throw new Error(qError.message);

  const belowGroundByNode = new Map(levelNodes.map((n) => [n.id, n.is_below_ground]));
  let gfaAbove = 0;
  let gfaBasement = 0;
  for (const q of quantities ?? []) {
    const value = Number(q.value ?? 0);
    if (belowGroundByNode.get(q.wbs_node_id)) gfaBasement += value;
    else gfaAbove += value;
  }
  return { gfaAbove, gfaBasement, gfaTotal: gfaAbove + gfaBasement };
}

interface BoqCostRow {
  wbs_node_id: string | null;
  elemental_category: ElementalCategory | null;
  total_amount: number;
}

async function getProjectBoqCostRows(projectId: string): Promise<BoqCostRow[]> {
  const { data, error } = await createClient()
    .from("qs_boq_items")
    .select("wbs_node_id, elemental_category, total_amount")
    .eq("project_id", projectId);
  if (error) throw new Error(error.message);
  return (data ?? []) as BoqCostRow[];
}

async function getBelowGroundMap(wbsNodeIds: string[]): Promise<Map<string, boolean>> {
  if (wbsNodeIds.length === 0) return new Map();
  const { data, error } = await createClient()
    .from("wbs_nodes")
    .select("id, is_below_ground")
    .in("id", wbsNodeIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((n) => [n.id, n.is_below_ground]));
}

// §5/§6/§7/§8: building cost ÷ GFA total (blended), split above/basement, and
// external works ÷ Site Area kept as an entirely separate figure. External
// works items are excluded from the building numerator by construction (never
// summed into aboveGroundCost/basementCost) rather than by a runtime check —
// the §8 "classic mistake" this guideline exists to prevent can't happen here
// because there is no code path that adds externalWorksCost into buildingCost.
export async function getCostPerM2Summary(projectId: string): Promise<CostPerM2Summary> {
  const supabase = createClient();
  const [rows, gfa, projectResult] = await Promise.all([
    getProjectBoqCostRows(projectId),
    getProjectGfaSummary(projectId),
    supabase.from("projects").select("site_area").eq("id", projectId).single(),
  ]);
  if (projectResult.error) throw new Error(projectResult.error.message);
  const siteArea = projectResult.data?.site_area != null ? Number(projectResult.data.site_area) : null;

  const wbsNodeIds = Array.from(new Set(rows.map((r) => r.wbs_node_id).filter((id): id is string => !!id)));
  const belowGroundMap = await getBelowGroundMap(wbsNodeIds);

  let aboveGroundCost = 0;
  let basementCost = 0;
  let externalWorksCost = 0;

  for (const row of rows) {
    const amount = Number(row.total_amount ?? 0);
    if (row.elemental_category === "external_works") {
      externalWorksCost += amount;
      continue;
    }
    const isBasement = row.wbs_node_id ? belowGroundMap.get(row.wbs_node_id) === true : false;
    if (isBasement) basementCost += amount;
    else aboveGroundCost += amount;
  }

  const buildingCost = aboveGroundCost + basementCost;

  return {
    buildingCost,
    aboveGroundCost,
    basementCost,
    externalWorksCost,
    gfa,
    siteArea,
    aboveGroundRate: gfa.gfaAbove > 0 ? aboveGroundCost / gfa.gfaAbove : null,
    basementRate: gfa.gfaBasement > 0 ? basementCost / gfa.gfaBasement : null,
    blendedRate: gfa.gfaTotal > 0 ? buildingCost / gfa.gfaTotal : null,
    externalWorksRate: siteArea && siteArea > 0 ? externalWorksCost / siteArea : null,
  };
}

// §5/§6 Step 3: elemental cost table, each line ÷ GFA total. External works
// never appears here divided by GFA — it has its own rate in CostPerM2Summary.
export async function getElementalBreakdown(projectId: string): Promise<ElementalBreakdownLine[]> {
  const [rows, gfa] = await Promise.all([
    getProjectBoqCostRows(projectId),
    getProjectGfaSummary(projectId),
  ]);

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (row.elemental_category === "external_works") continue;
    const key = row.elemental_category ?? "unclassified";
    totals.set(key, (totals.get(key) ?? 0) + Number(row.total_amount ?? 0));
  }

  return Array.from(totals.entries()).map(([category, cost]) => ({
    category: category as ElementalCategory | "unclassified",
    cost,
    costPerM2: gfa.gfaTotal > 0 ? cost / gfa.gfaTotal : 0,
  }));
}

// §7 Step 3: refined split — apportions shared prelims between above-ground and
// basement pro-rata by direct cost. Optional; the simple presentation (prelims
// fully in the above-ground line, from getCostPerM2Summary) remains the default
// for routine summaries. Never changes the blended figure.
export async function apportionPrelimsToSplit(projectId: string): Promise<PrelimsApportionment> {
  const [rows, gfa] = await Promise.all([
    getProjectBoqCostRows(projectId),
    getProjectGfaSummary(projectId),
  ]);
  const wbsNodeIds = Array.from(new Set(rows.map((r) => r.wbs_node_id).filter((id): id is string => !!id)));
  const belowGroundMap = await getBelowGroundMap(wbsNodeIds);

  let prelimsTotal = 0;
  let directCostAbove = 0;
  let directCostBasement = 0;

  for (const row of rows) {
    if (row.elemental_category === "external_works") continue;
    const amount = Number(row.total_amount ?? 0);
    if (row.elemental_category === "prelims") {
      prelimsTotal += amount;
      continue;
    }
    const isBasement = row.wbs_node_id ? belowGroundMap.get(row.wbs_node_id) === true : false;
    if (isBasement) directCostBasement += amount;
    else directCostAbove += amount;
  }

  const directCostTotal = directCostAbove + directCostBasement;
  const aboveGroundShare = directCostTotal > 0 ? prelimsTotal * (directCostAbove / directCostTotal) : 0;
  const basementShare = prelimsTotal - aboveGroundShare;

  return {
    aboveGroundShare,
    basementShare,
    aboveGroundRateRefined: gfa.gfaAbove > 0 ? (directCostAbove + aboveGroundShare) / gfa.gfaAbove : null,
    basementRateRefined: gfa.gfaBasement > 0 ? (directCostBasement + basementShare) / gfa.gfaBasement : null,
  };
}

// §9: Standard Final Cost Summary — mandatory format, lines 1/2/A/3/B/memo.
export async function getFinalCostSummary(projectId: string): Promise<FinalCostSummaryLine[]> {
  const summary = await getCostPerM2Summary(projectId);
  const { gfa, siteArea } = summary;
  const totalContract = summary.buildingCost + summary.externalWorksCost;

  const m2 = (area: number) => `${area.toLocaleString()} m² GFA`;

  return [
    { no: "1", description: "Building works — above ground", cost: summary.aboveGroundCost, denominatorLabel: m2(gfa.gfaAbove), costPerM2: summary.aboveGroundRate },
    { no: "2", description: "Building works — basement", cost: summary.basementCost, denominatorLabel: m2(gfa.gfaBasement), costPerM2: summary.basementRate },
    { no: "A", description: "Building subtotal (blended)", cost: summary.buildingCost, denominatorLabel: m2(gfa.gfaTotal), costPerM2: summary.blendedRate },
    { no: "3", description: "External works", cost: summary.externalWorksCost, denominatorLabel: siteArea ? `${siteArea.toLocaleString()} m² site` : "—", costPerM2: summary.externalWorksRate },
    { no: "B", description: "TOTAL CONTRACT", cost: totalContract, denominatorLabel: "—", costPerM2: null },
    { no: "memo", description: "Whole project ÷ GFA (memo only — not a benchmark)", cost: totalContract, denominatorLabel: m2(gfa.gfaTotal), costPerM2: gfa.gfaTotal > 0 ? totalContract / gfa.gfaTotal : null },
  ];
}

// §10 checklist item 5: "No level has cost > 0 with GFA = 0" — DCOS warns,
// does not block, per the guideline's own wording.
export async function getGfaDataQualityWarnings(projectId: string): Promise<GfaDataQualityWarning[]> {
  const supabase = createClient();
  const { data: levelNodes, error } = await supabase
    .from("wbs_nodes")
    .select("id, wbs_name")
    .eq("project_id", projectId)
    .eq("node_type", "level");
  if (error) throw new Error(error.message);
  const nodes = levelNodes ?? [];
  if (nodes.length === 0) return [];

  const nodeIds = nodes.map((n) => n.id);
  const [{ data: quantities }, { data: boqItems }] = await Promise.all([
    supabase.from("wbs_node_quantities").select("wbs_node_id").eq("metric_code", "GFA").in("wbs_node_id", nodeIds),
    supabase.from("qs_boq_items").select("wbs_node_id, total_amount").in("wbs_node_id", nodeIds),
  ]);

  const hasGfa = new Set((quantities ?? []).map((q) => q.wbs_node_id));
  const costByNode = new Map<string, number>();
  for (const item of boqItems ?? []) {
    if (!item.wbs_node_id) continue;
    costByNode.set(item.wbs_node_id, (costByNode.get(item.wbs_node_id) ?? 0) + Number(item.total_amount ?? 0));
  }

  return nodes
    .filter((n) => (costByNode.get(n.id) ?? 0) > 0 && !hasGfa.has(n.id))
    .map((n) => ({ wbsNodeId: n.id, wbsName: n.wbs_name, cost: costByNode.get(n.id) ?? 0 }));
}
