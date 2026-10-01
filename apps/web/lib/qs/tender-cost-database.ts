// QS → Cost & Estimation → Cost Database: saved, frozen Tender BOQ versions that can be reviewed and
// copied back (whole or selected lines) into any tender's BOQ.
// Schema: supabase/migrations/20260928000009_tender_cost_database.sql

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { boqUnitRate, isTenderLocked, type RateSource } from "@/lib/qs/tender-cost-service";

export type CostDatabase = Database["public"]["Tables"]["tender_cost_databases"]["Row"];
export type CostDatabaseItem = Database["public"]["Tables"]["tender_cost_database_items"]["Row"];

export async function listCostDatabases(): Promise<(CostDatabase & { created_by_name: string | null })[]> {
  const { data, error } = await createClient()
    .from("tender_cost_databases")
    .select("*, creator:profiles!tender_cost_databases_created_by_fkey(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ creator, ...row }) => ({
    ...row,
    created_by_name: (creator as { full_name: string | null } | null)?.full_name ?? null,
  }));
}

export async function getCostDatabaseItems(databaseId: string): Promise<CostDatabaseItem[]> {
  const { data, error } = await createClient()
    .from("tender_cost_database_items")
    .select("*")
    .eq("database_id", databaseId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Saves the tender's whole BOQ as a new named version, in one transaction. Returns the new id. */
export async function saveTenderToCostDatabase(tenderId: string, name: string, notes: string | null): Promise<string> {
  const { data, error } = await createClient().rpc("save_tender_cost_database", {
    p_tender_id: tenderId,
    p_name: name,
    p_notes: notes ?? undefined,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteCostDatabase(id: string): Promise<void> {
  const { error, count } = await createClient().from("tender_cost_databases").delete({ count: "exact" }).eq("id", id);
  if (error) throw new Error(error.message);
  if (!count) throw new Error("You can only delete versions you saved.");
}

export interface AssignCostDatabasePayload {
  tenderId: string;
  items: { item: CostDatabaseItem; quantity: number }[];
  /** true = keep each line's saved margins; false = apply the ones below. */
  keepMargins: boolean;
  labor_margin_pct: number;
  material_margin_pct: number;
  /** null = keep each line's saved level / building. */
  level: string | null;
  building_code: string | null;
}

/** Net cost of a saved line; lines saved without a labor/material split carry their rate as material. */
export function savedNetCosts(item: CostDatabaseItem) {
  const hasSplit = item.labor_net_cost != null || item.material_net_cost != null;
  return hasSplit
    ? { labor: Number(item.labor_net_cost ?? 0), material: Number(item.material_net_cost ?? 0), split: true }
    : { labor: 0, material: Number(item.unit_rate ?? 0), split: false };
}

export function assignedRate(item: CostDatabaseItem, keepMargins: boolean, laborPct: number, materialPct: number): number {
  const net = savedNetCosts(item);
  if (keepMargins && !net.split) return Number(item.unit_rate ?? 0);
  const lm = keepMargins ? Number(item.labor_margin_pct ?? 0) : laborPct;
  const mm = keepMargins ? Number(item.material_margin_pct ?? 0) : materialPct;
  // tender_boq_items.unit_rate is numeric(15,2)
  return Math.round(boqUnitRate(net.labor, lm, net.material, mm) * 100) / 100;
}

/** Copies saved lines into a tender's BOQ in one insert. Returns the count. */
export async function assignCostDatabaseItemsToBoq(p: AssignCostDatabasePayload): Promise<number> {
  if (p.items.length === 0) return 0;
  if (await isTenderLocked(p.tenderId)) {
    throw new Error("Tender pricing is locked after internal review — items can't be added.");
  }
  const supabase = createClient();

  // Keep the library link (so staleness/Refresh still work) only where the library item still exists.
  const assemblyIds = [...new Set(p.items.map((i) => i.item.dwl_assembly_id).filter((v): v is string => !!v))];
  const workItemIds = [...new Set(p.items.map((i) => i.item.dwl_work_item_id).filter((v): v is string => !!v))];
  const [{ data: existingCodes, error: codeErr }, asm, wi] = await Promise.all([
    supabase.from("tender_boq_items").select("item_code").eq("tender_id", p.tenderId),
    assemblyIds.length ? supabase.from("dwl_assemblies").select("id").in("id", assemblyIds) : Promise.resolve({ data: [] as { id: string }[] }),
    workItemIds.length ? supabase.from("dwl_work_items").select("id").in("id", workItemIds) : Promise.resolve({ data: [] as { id: string }[] }),
  ]);
  if (codeErr) throw new Error(codeErr.message);
  const liveAssemblies = new Set((asm.data ?? []).map((r) => r.id));
  const liveWorkItems = new Set((wi.data ?? []).map((r) => r.id));

  // item_code is unique per tender: suffix -2, -3… when the code is already taken.
  const used = new Set((existingCodes ?? []).map((r) => r.item_code));
  const uniqueCode = (code: string) => {
    let candidate = code;
    for (let n = 2; used.has(candidate); n++) candidate = `${code}-${n}`;
    used.add(candidate);
    return candidate;
  };

  const rows = p.items.map(({ item, quantity }) => {
    const net = savedNetCosts(item);
    const assemblyId = item.dwl_assembly_id && liveAssemblies.has(item.dwl_assembly_id) ? item.dwl_assembly_id : null;
    const workItemId = !assemblyId && item.dwl_work_item_id && liveWorkItems.has(item.dwl_work_item_id) ? item.dwl_work_item_id : null;
    const rate_source: RateSource = assemblyId ? "dwl_assembly" : workItemId ? "dwl_work_item" : "manual";
    const keepSplitMargins = p.keepMargins && net.split;
    return {
      tender_id: p.tenderId,
      item_code: uniqueCode(item.item_code),
      description: item.description,
      unit: item.unit,
      quantity,
      unit_rate: assignedRate(item, p.keepMargins, p.labor_margin_pct, p.material_margin_pct),
      labor_net_cost: net.labor,
      labor_margin_pct: keepSplitMargins ? Number(item.labor_margin_pct ?? 0) : p.keepMargins ? 0 : p.labor_margin_pct,
      material_net_cost: net.material,
      material_margin_pct: keepSplitMargins ? Number(item.material_margin_pct ?? 0) : p.keepMargins ? 0 : p.material_margin_pct,
      section: item.section,
      sub_section: item.sub_section,
      sub_element: item.sub_element,
      discipline: item.discipline,
      element_group: item.element_group,
      budget_code_id: item.budget_code_id,
      level: p.level ?? item.level,
      building_code: p.building_code ?? item.building_code,
      sourcing: item.sourcing,
      rate_source,
      dwl_assembly_id: assemblyId,
      dwl_work_item_id: workItemId,
      rate_build_up: rate_source === "manual" ? null : item.rate_build_up,
      is_manual_rate: rate_source === "manual",
      notes: item.notes,
      sort_order: item.sort_order,
      source_cost_db_item_id: item.id,
    };
  });

  const { error } = await supabase.from("tender_boq_items").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}
