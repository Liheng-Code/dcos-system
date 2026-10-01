import { createClient } from "@/lib/supabase/client";
import { createTenderBoqItem, getBudgetCodes, type BudgetCode } from "@/lib/qs/public-tender";
import { createQsBoqItem, getBoqList, getBoqSections, type QsBoqSummary, type QsBoqSection } from "@/lib/qs/public";
import type { BimElementTakeoff } from "./bim-types";

// Bridges the BIM "Extract for Takeoff" staging table (bim_element_takeoff,
// see bim-service.ts) into a real BOQ line. Deliberately bypasses the QTO
// module's DRAFT->...->APPROVED->POSTED TO BOQ workflow (qto-service.ts):
// that workflow is tender-scoped and built for manual on-screen PDF
// measurement, whereas BIM models are project-scoped (bim_models.project_id,
// no tender_id anywhere) with no source drawing at all. This is a separate,
// lightweight review-and-promote path with its own link table,
// bim_element_boq_promotions, which supports many staged elements
// aggregating into one BOQ line (see its migration for the schema).
//
// Client-side, like qs-service.ts/tender-cost-service.ts (not a server API
// route) — bim_element_takeoff/bim_element_boq_promotions RLS is the same
// permissive `USING (true)` pattern used by every bim_* table.

export type BoqTargetPhase = "precontract" | "postcontract";

export interface BoqPromotion {
  id: string;
  takeoff_id: string;
  tender_boq_item_id: string | null;
  qs_boq_item_id: string | null;
  quantity_contributed: number;
  promoted_by: string;
  promoted_at: string;
}

export interface PromotableTakeoffRow extends BimElementTakeoff {
  promotion: BoqPromotion | null;
}

async function getCurrentTenantId(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
  if (error || !data?.company_id) throw new Error("No tenant found for the current user");
  return data.company_id;
}

// Reuses the existing (previously unused) GET /api/bim/models/[id]/takeoff
// route, then left-joins the promotion link table so each row shows whether
// (and where) it has already been promoted.
export async function listPromotableTakeoff(modelId: string): Promise<PromotableTakeoffRow[]> {
  const res = await fetch(`/api/bim/models/${modelId}/takeoff`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Failed to load takeoff data");
  const rows: BimElementTakeoff[] = json.data ?? [];
  if (rows.length === 0) return [];

  const supabase = createClient();
  const { data: promotions, error } = await supabase
    .from("bim_element_boq_promotions")
    .select("*")
    .in("takeoff_id", rows.map((r) => r.id));
  if (error) throw new Error(error.message);

  const byTakeoffId = new Map((promotions ?? []).map((p) => [p.takeoff_id, p as BoqPromotion]));
  return rows.map((row) => ({ ...row, promotion: byTakeoffId.get(row.id) ?? null }));
}

// Same isPrecontract convention as sidebar.tsx: selectedProject?.project_type === "tender".
export async function resolveProjectPhase(projectId: string): Promise<BoqTargetPhase> {
  const supabase = createClient();
  const { data, error } = await supabase.from("projects").select("project_type").eq("id", projectId).single();
  if (error) throw new Error(error.message);
  return data?.project_type === "tender" ? "precontract" : "postcontract";
}

export interface TenderOption {
  id: string;
  tender_no: string;
  title: string;
}

export async function listProjectTenders(projectId: string): Promise<TenderOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tender_register")
    .select("id, tender_no, title")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listProjectBoqs(projectId: string): Promise<QsBoqSummary[]> {
  return getBoqList(projectId);
}

export async function listBoqSections(projectId: string, boqId?: string): Promise<QsBoqSection[]> {
  return getBoqSections(projectId, boqId);
}

export async function listTenderBudgetCodes(): Promise<BudgetCode[]> {
  return getBudgetCodes();
}

export interface BoqItemOption {
  id: string;
  description: string;
  unit: string;
  quantity: number;
}

export async function searchTenderBoqItems(tenderId: string, query: string): Promise<BoqItemOption[]> {
  const supabase = createClient();
  let q = supabase
    .from("tender_boq_items")
    .select("id, description, unit, quantity")
    .eq("tender_id", tenderId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (query.trim()) q = q.ilike("description", `%${query.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function searchQsBoqItems(boqSectionId: string, query: string): Promise<BoqItemOption[]> {
  const supabase = createClient();
  let q = supabase
    .from("qs_boq_items")
    .select("id, description, unit, quantity")
    .eq("boq_section_id", boqSectionId)
    .order("seq", { ascending: true })
    .limit(20);
  if (query.trim()) q = q.ilike("description", `%${query.trim()}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type PromoteTarget =
  | {
      type: "new";
      phase: "precontract";
      tenderId: string;
      section: string;
      budgetCodeId: string | null;
      description: string;
      unit: string;
    }
  | {
      type: "new";
      phase: "postcontract";
      boqSectionId: string;
      projectId: string;
      description: string;
      unit: string;
    }
  | { type: "existing"; phase: "precontract"; boqItemId: string }
  | { type: "existing"; phase: "postcontract"; boqItemId: string; boqSectionId: string };

async function assertSectionNotLocked(supabase: ReturnType<typeof createClient>, boqSectionId: string): Promise<void> {
  const { data, error } = await supabase.from("qs_boq_sections").select("baseline_status").eq("id", boqSectionId).single();
  if (error) throw new Error(error.message);
  if (data?.baseline_status === "locked") {
    throw new Error("This BOQ section is locked. Reopen it (Revision) before promoting BIM quantities into it.");
  }
}

// Creates (or reuses) one BOQ line and records one bim_element_boq_promotions
// row per selected staged element, pointing at it — many-to-one aggregation.
// quantity_contributed is snapshotted now: bulkUpsertElementTakeoff
// (bim-service.ts) upserts on (model_id, global_id) and can silently
// overwrite a staged row's quantity on re-extraction, even after promotion —
// the snapshot here keeps already-promoted BOQ history stable against that.
export async function promoteTakeoffToBoq(
  takeoffRows: { id: string; quantity: number | null }[],
  target: PromoteTarget,
): Promise<{ boqItemId: string }> {
  if (takeoffRows.length === 0) throw new Error("Select at least one element to promote");
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const totalQuantity = takeoffRows.reduce((s, r) => s + (r.quantity ?? 0), 0);
  let boqItemId: string;

  if (target.type === "new" && target.phase === "precontract") {
    const item = await createTenderBoqItem({
      tender_id: target.tenderId,
      section: target.section.trim() || "Uncategorized",
      item_code: `BIM-${Date.now()}`,
      description: target.description,
      unit: target.unit,
      quantity: totalQuantity,
      budget_code_id: target.budgetCodeId,
    });
    boqItemId = item.id;
  } else if (target.type === "new" && target.phase === "postcontract") {
    await assertSectionNotLocked(supabase, target.boqSectionId);
    const item = await createQsBoqItem({
      project_id: target.projectId,
      boq_section_id: target.boqSectionId,
      description: target.description,
      unit: target.unit,
      quantity: totalQuantity,
      unit_rate: 0,
    });
    boqItemId = item.id;
  } else if (target.type === "existing" && target.phase === "postcontract") {
    await assertSectionNotLocked(supabase, target.boqSectionId);
    boqItemId = target.boqItemId;
  } else {
    boqItemId = target.boqItemId;
  }

  const tenantId = await getCurrentTenantId(supabase);
  const rows = takeoffRows.map((r) => ({
    tenant_id: tenantId,
    takeoff_id: r.id,
    tender_boq_item_id: target.phase === "precontract" ? boqItemId : null,
    qs_boq_item_id: target.phase === "postcontract" ? boqItemId : null,
    quantity_contributed: r.quantity ?? 0,
    promoted_by: user.id,
  }));
  const { error } = await supabase.from("bim_element_boq_promotions").insert(rows);
  if (error) throw new Error(error.message);
  return { boqItemId };
}

// Removes the link only — never deletes the BOQ line itself, consistent
// with DCOS's general pattern of not cascading deletes into user-entered
// commercial data.
export async function unpromoteTakeoff(linkId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("bim_element_boq_promotions").delete().eq("id", linkId);
  if (error) throw new Error(error.message);
}
