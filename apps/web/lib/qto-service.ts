import { createClient } from "@/lib/supabase/client";

// ── Types ────────────────────────────────────────────────────────────────────

export const QTO_STATUSES = [
  "DRAFT",
  "MEASURED",
  "SELF CHECKED",
  "SUBMITTED FOR CHECK",
  "QS CHECKED",
  "APPROVED",
  "REJECTED",
  "REVISION REQUIRED",
  "POSTED TO BOQ",
] as const;
export type QtoStatus = (typeof QTO_STATUSES)[number];

export const QTO_CONFIDENCE = ["HIGH", "MEDIUM", "LOW", "PROVISIONAL"] as const;
export type QtoConfidence = (typeof QTO_CONFIDENCE)[number];

export const QTO_SOURCE_TYPES = ["D1", "S1", "F1", "A1", "B1", "H1", "P1", "E1"] as const;
export type QtoSourceType = (typeof QTO_SOURCE_TYPES)[number];

export const QTO_MEASURE_TYPES = ["point", "length", "polyline", "area", "perimeter", "count"] as const;
export type QtoMeasureType = (typeof QTO_MEASURE_TYPES)[number];

export interface QtoDocument {
  id: string;
  tender_id: string;
  document_no: string;
  title: string;
  document_type: string;
  discipline: string | null;
  building: string | null;
  revision: string | null;
  issue_date: string | null;
  received_date: string | null;
  source: string | null;
  file_path: string | null;
  file_type: string | null;
  file_version: string | null;
  status: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface QtoDrawing {
  id: string;
  tender_id: string;
  drawing_no: string;
  title: string;
  discipline: string | null;
  building: string | null;
  drawing_type: string | null;
  status: string;
  remarks: string | null;
  current_revision_id: string | null;
  current_revision?: QtoDrawingRevision | null;
}

export interface QtoDrawingRevision {
  id: string;
  drawing_id: string;
  revision: string;
  revision_date: string | null;
  status: string;
  file_path: string | null;
  file_type: string | null;
  pdf_path: string | null;
  scale: string | null;
  units: string;
  supersedes_revision_id: string | null;
  remarks: string | null;
  created_at: string;
}

export interface QtoPackage {
  id: string;
  tender_id: string;
  building: string;
  discipline: string;
  work_section: string | null;
  package_code: string | null;
  assigned_to: string | null;
  status: string;
  progress_pct: number;
}

export interface QtoItem {
  id: string;
  tender_id: string;
  qto_no: string;
  building: string | null;
  discipline: string | null;
  work_section: string | null;
  element: string | null;
  item_code: string | null;
  description: string;
  unit: string;
  quantity: number;
  measurement_method: string;
  source_type: QtoSourceType;
  confidence: QtoConfidence;
  drawing_id: string | null;
  drawing_revision_id: string | null;
  page_no: number | null;
  grid_location: string | null;
  detail_ref: string | null;
  specification_ref: string | null;
  status: QtoStatus;
  revision_no: number;
  is_locked: boolean;
  assumption: string | null;
  prepared_by: string | null;
  prepared_date: string | null;
  checked_by: string | null;
  checked_date: string | null;
  approved_by: string | null;
  approved_date: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // joined
  drawing?: Pick<QtoDrawing, "id" | "drawing_no" | "title" | "discipline" | "building"> | null;
  drawing_revision?: Pick<QtoDrawingRevision, "id" | "revision" | "status"> | null;
}

export interface QtoCalculation {
  id: string;
  qto_item_id: string;
  formula: string;
  display_text: string | null;
  result: number | null;
  method: string;
  created_at: string;
  updated_at: string;
}

export interface QtoCalculationLine {
  id: string;
  calculation_id: string;
  seq: number;
  sign: string;
  description: string | null;
  amount: number;
  unit: string | null;
  measurement_id: string | null;
  source: string | null;
}

export interface QtoMeasurement {
  id: string;
  qto_item_id: string;
  drawing_revision_id: string | null;
  drawing_id: string | null;
  page_no: number | null;
  measure_type: QtoMeasureType;
  points: unknown;
  length: number | null;
  area: number | null;
  count: number | null;
  unit: string | null;
  scale_calibration: unknown;
  label: string | null;
  created_at: string;
}

export interface QtoAssumption {
  id: string;
  tender_id: string;
  qto_item_id: string | null;
  drawing_id: string | null;
  assumption_no: string | null;
  description: string;
  reason: string | null;
  risk_level: string;
  status: string;
  rfi_id: string | null;
  created_at: string;
}

export interface QtoClarification {
  id: string;
  tender_id: string;
  qto_item_id: string | null;
  drawing_id: string | null;
  clarification_no: string | null;
  description: string;
  reason: string | null;
  status: string;
  response: string | null;
  risk_level: string;
  rfi_id: string | null;
  rfi_no: string | null;
  created_at: string;
}

export interface QtoReview {
  id: string;
  qto_item_id: string;
  reviewer_id: string | null;
  decision: "approve" | "reject" | "return" | "comment";
  comment: string | null;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
}

export interface QtoRevisionHistory {
  id: string;
  qto_item_id: string;
  revision_no: number;
  quantity: number | null;
  unit: string | null;
  drawing_revision_id: string | null;
  status: string | null;
  change_reason: string | null;
  snapshot: unknown;
  created_at: string;
}

export interface QtoBoqLink {
  id: string;
  qto_item_id: string;
  boq_item_id: string;
  quantity: number;
  created_at: string;
}

export interface QtoItemDetail extends QtoItem {
  calculations: QtoCalculation[];
  measurements: QtoMeasurement[];
  reviews: QtoReview[];
  history: QtoRevisionHistory[];
}

export interface QtoSummaryRow {
  building: string | null;
  discipline: string | null;
  work_section: string | null;
  unit: string;
  quantity: number;
  qto_count: number;
}

export interface ProgressStats {
  total: number;
  byStatus: Record<string, number>;
  approved: number;
  posted: number;
}

export interface RiskItem {
  type: "missing_drawing" | "pending_rfi" | "assumption" | "provisional" | "superseded" | "revision_pending";
  label: string;
  count: number;
  qto_item_id?: string | null;
  qto_no?: string | null;
  building?: string | null;
  discipline?: string | null;
}

// ── Safe formula evaluator (numbers, + - * / ( ) . only) ─────────────────────
export function safeEvaluate(expr: string): { ok: true; value: number } | { ok: false; error: string } {
  const cleaned = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!/^[\d+\-*/().\s]+$/.test(cleaned)) {
    return { ok: false, error: "Formula contains unsupported characters" };
  }
  try {
    // eslint-disable-next-line no-new-func
    const value = new Function(`"use strict"; return (${cleaned});`)() as number;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, error: "Formula does not produce a valid number" };
    }
    return { ok: true, value: Math.round(value * 1000) / 1000 };
  } catch {
    return { ok: false, error: "Formula could not be evaluated" };
  }
}

// ── Status workflow ──────────────────────────────────────────────────────────
export const QTO_STATUS_TRANSITIONS: Record<QtoStatus, QtoStatus[]> = {
  DRAFT: ["MEASURED"],
  MEASURED: ["SELF CHECKED", "DRAFT"],
  "SELF CHECKED": ["SUBMITTED FOR CHECK", "MEASURED"],
  "SUBMITTED FOR CHECK": ["QS CHECKED", "REJECTED"],
  "QS CHECKED": ["APPROVED", "REJECTED"],
  REJECTED: ["REVISION REQUIRED"],
  "REVISION REQUIRED": ["MEASURED"],
  APPROVED: ["POSTED TO BOQ"],
  "POSTED TO BOQ": [],
};

export function canTransition(from: QtoStatus, to: QtoStatus): boolean {
  return QTO_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Documents ────────────────────────────────────────────────────────────────
export async function listDocuments(tenderId: string): Promise<{ data: QtoDocument[] | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_document_register")
    .select("*")
    .eq("tender_id", tenderId)
    .order("created_at", { ascending: false });
  return { data: (data as QtoDocument[]) ?? null, error: error?.message ?? null };
}

export async function createDocument(payload: Partial<QtoDocument>): Promise<{ data: QtoDocument | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_document_register")
    .insert(payload)
    .select()
    .single();
  return { data: (data as QtoDocument) ?? null, error: error?.message ?? null };
}

export async function updateDocument(id: string, patch: Partial<QtoDocument>): Promise<{ data: QtoDocument | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_document_register")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  return { data: (data as QtoDocument) ?? null, error: error?.message ?? null };
}

export async function deleteDocument(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("qto_document_register").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// ── Drawings ─────────────────────────────────────────────────────────────────
export async function listDrawings(tenderId: string): Promise<{ data: QtoDrawing[] | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_drawing_register")
    .select("*, current_revision:qto_drawing_revisions!qto_draw_current_rev_fk(*)")
    .eq("tender_id", tenderId)
    .order("drawing_no", { ascending: true });
  return { data: (data as QtoDrawing[]) ?? null, error: error?.message ?? null };
}

export async function createDrawing(payload: Partial<QtoDrawing>): Promise<{ data: QtoDrawing | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_drawing_register")
    .insert(payload)
    .select()
    .single();
  return { data: (data as QtoDrawing) ?? null, error: error?.message ?? null };
}

export async function addRevision(drawingId: string, payload: Partial<QtoDrawingRevision>): Promise<{ data: QtoDrawingRevision | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_drawing_revisions")
    .insert({ ...payload, drawing_id: drawingId, status: payload.status ?? "current" })
    .select()
    .single();
  return { data: (data as QtoDrawingRevision) ?? null, error: error?.message ?? null };
}

export async function listRevisions(drawingId: string): Promise<{ data: QtoDrawingRevision[] | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_drawing_revisions")
    .select("*")
    .eq("drawing_id", drawingId)
    .order("created_at", { ascending: true });
  return { data: (data as QtoDrawingRevision[]) ?? null, error: error?.message ?? null };
}

export async function setCurrentRevision(drawingId: string, revisionId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("qto_drawing_revisions")
    .update({ status: "current" })
    .eq("id", revisionId)
    .eq("drawing_id", drawingId);
  return { error: error?.message ?? null };
}

export async function updateDrawing(id: string, patch: Partial<QtoDrawing>): Promise<{ data: QtoDrawing | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("qto_drawing_register").update(patch).eq("id", id).select().single();
  return { data: (data as QtoDrawing) ?? null, error: error?.message ?? null };
}

export async function deleteDrawing(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("qto_drawing_register").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function getRevisionById(revisionId: string): Promise<QtoDrawingRevision | null> {
  const supabase = createClient();
  const { data } = await supabase.from("qto_drawing_revisions").select("*").eq("id", revisionId).single();
  return (data as QtoDrawingRevision) ?? null;
}

export function getDrawingUrl(revision: Pick<QtoDrawingRevision, "pdf_path" | "file_path"> | null | undefined): string | null {
  if (!revision) return null;
  const path = revision.pdf_path ?? revision.file_path;
  if (!path) return null;
  const supabase = createClient();
  return supabase.storage.from("qto-files").getPublicUrl(path).data.publicUrl;
}

// ── QTO items ────────────────────────────────────────────────────────────────
export interface QtoItemFilters {
  building?: string;
  discipline?: string;
  status?: string;
  qs?: string;
  drawingId?: string;
  search?: string;
}

export async function listQtoItems(tenderId: string, filters: QtoItemFilters = {}): Promise<{ data: QtoItem[] | null; error: string | null }> {
  const supabase = createClient();
  let query = supabase
    .from("qto_items")
    .select("*, drawing:qto_drawing_register(id, drawing_no, title, discipline, building), drawing_revision:qto_drawing_revisions(id, revision, status)")
    .eq("tender_id", tenderId)
    .order("qto_no", { ascending: true });

  if (filters.building) query = query.eq("building", filters.building);
  if (filters.discipline) query = query.eq("discipline", filters.discipline);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.drawingId) query = query.eq("drawing_id", filters.drawingId);
  if (filters.search) query = query.ilike("description", `%${filters.search}%`);

  const { data, error } = await query;
  return { data: (data as QtoItem[]) ?? null, error: error?.message ?? null };
}

export async function getQtoItem(id: string): Promise<{ data: QtoItemDetail | null; error: string | null }> {
  const supabase = createClient();
  const { data: item, error } = await supabase
    .from("qto_items")
    .select("*, drawing:qto_drawing_register(id, drawing_no, title, discipline, building), drawing_revision:qto_drawing_revisions(id, revision, status)")
    .eq("id", id)
    .single();
  if (error || !item) return { data: null, error: error?.message ?? "QTO item not found" };

  const [calculations, measurements, reviews, history] = await Promise.all([
    supabase.from("qto_calculations").select("*").eq("qto_item_id", id).order("created_at", { ascending: false }),
    supabase.from("qto_measurements").select("*").eq("qto_item_id", id).order("created_at", { ascending: true }),
    supabase.from("qto_reviews").select("*").eq("qto_item_id", id).order("created_at", { ascending: true }),
    supabase.from("qto_revisions").select("*").eq("qto_item_id", id).order("revision_no", { ascending: true }),
  ]);

  return {
    data: {
      ...(item as QtoItem),
      calculations: (calculations.data as QtoCalculation[]) ?? [],
      measurements: (measurements.data as QtoMeasurement[]) ?? [],
      reviews: (reviews.data as QtoReview[]) ?? [],
      history: (history.data as QtoRevisionHistory[]) ?? [],
    },
    error: null,
  };
}

export async function createQtoItem(payload: Partial<QtoItem>): Promise<{ data: QtoItem | null; error: string | null }> {
  const supabase = createClient();
  if (!payload.tender_id) return { data: null, error: "tender_id is required" };

  const { data: seq } = await supabase
    .from("qto_items")
    .select("qto_no")
    .eq("tender_id", payload.tender_id)
    .order("qto_no", { ascending: false })
    .limit(1);
  const next = (() => {
    const last = seq?.[0]?.qto_no;
    if (last && last.startsWith("QTO-")) {
      return "QTO-" + String(parseInt(last.slice(4), 10) + 1).padStart(6, "0");
    }
    return "QTO-000001";
  })();

  const { data, error } = await supabase
    .from("qto_items")
    .insert({ ...payload, qto_no: next, status: "DRAFT", revision_no: 1 })
    .select()
    .single();
  return { data: (data as QtoItem) ?? null, error: error?.message ?? null };
}

export async function updateQtoItem(id: string, patch: Partial<QtoItem>): Promise<{ data: QtoItem | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("qto_items").update(patch).eq("id", id).select().single();
  return { data: (data as QtoItem) ?? null, error: error?.message ?? null };
}

export async function deleteQtoItem(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: item } = await supabase.from("qto_items").select("status").eq("id", id).single();
  if (item && item.status !== "DRAFT") return { error: "Only DRAFT items can be deleted" };
  const { error } = await supabase.from("qto_items").delete().eq("id", id);
  return { error: error?.message ?? null };
}

async function writeAudit(record: {
  table_name: string;
  record_id: string;
  action: string;
  new_data?: unknown;
  old_data?: unknown;
}) {
  const supabase = createClient();
  await supabase.from("qto_audit_log").insert({
    table_name: record.table_name,
    record_id: record.record_id,
    action: record.action,
    new_data: record.new_data ? JSON.stringify(record.new_data) : null,
    old_data: record.old_data ? JSON.stringify(record.old_data) : null,
  });
}

export async function changeStatus(
  id: string,
  to: QtoStatus,
  opts: { comment?: string; actorId?: string | null } = {}
): Promise<{ data: QtoItem | null; error: string | null }> {
  const supabase = createClient();
  const { data: item } = await supabase.from("qto_items").select("*").eq("id", id).single();
  if (!item) return { data: null, error: "QTO item not found" };
  const from = item.status as QtoStatus;

  if (!canTransition(from, to)) {
    return { data: null, error: `Invalid transition: ${from} → ${to}` };
  }

  // Segregation of duties: preparer cannot approve their own item
  if (to === "APPROVED" && item.prepared_by && opts.actorId && item.prepared_by === opts.actorId) {
    return { data: null, error: "Preparer cannot approve their own QTO (segregation of duties)" };
  }

  // Cannot submit against a superseded drawing revision
  if (to === "SUBMITTED FOR CHECK" && item.drawing_revision_id) {
    const rev = await getRevisionById(item.drawing_revision_id);
    if (rev && rev.status !== "current") {
      return { data: null, error: "Cannot submit QTO referencing a superseded drawing revision" };
    }
  }

  const patch: Partial<QtoItem> = { status: to };
  if (to === "APPROVED") {
    patch.is_locked = true;
    patch.approved_date = new Date().toISOString();
  }
  if (to === "QS CHECKED") patch.checked_date = new Date().toISOString();
  if (to === "REVISION REQUIRED") patch.is_locked = false;

  const { data, error } = await supabase
    .from("qto_items")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "Status update failed" };

  await writeAudit({ table_name: "qto_items", record_id: id, action: to, new_data: data });

  // Record review history for check/approve/reject decisions
  if (["QS CHECKED", "APPROVED", "REJECTED", "REVISION REQUIRED"].includes(to)) {
    await supabase.from("qto_reviews").insert({
      qto_item_id: id,
      reviewer_id: opts.actorId ?? null,
      decision: to === "APPROVED" ? "approve" : to === "QS CHECKED" ? "comment" : to === "REJECTED" ? "reject" : "return",
      comment: opts.comment ?? null,
      from_status: from,
      to_status: to,
    });
  }

  return { data: data as QtoItem, error: null };
}

export async function createRevision(id: string, changeReason: string): Promise<{ data: QtoItem | null; error: string | null }> {
  const supabase = createClient();
  const { data: item } = await supabase.from("qto_items").select("*").eq("id", id).single();
  if (!item) return { data: null, error: "QTO item not found" };

  await supabase.from("qto_revisions").insert({
    qto_item_id: id,
    revision_no: item.revision_no,
    quantity: item.quantity,
    unit: item.unit,
    drawing_revision_id: item.drawing_revision_id,
    status: item.status,
    change_reason: changeReason || null,
    snapshot: item,
  });

  const { data, error } = await supabase
    .from("qto_items")
    .update({ revision_no: (item.revision_no ?? 0) + 1, status: "DRAFT", is_locked: false })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "Revision creation failed" };

  await writeAudit({ table_name: "qto_items", record_id: id, action: "REVISED", new_data: data, old_data: item });
  return { data: data as QtoItem, error: null };
}

// ── Calculations ─────────────────────────────────────────────────────────────
export async function addCalculation(
  itemId: string,
  payload: { formula: string; display_text?: string; method?: string }
): Promise<{ data: QtoCalculation | null; error: string | null }> {
  const evalResult = safeEvaluate(payload.formula);
  if (!evalResult.ok) return { data: null, error: evalResult.error };
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_calculations")
    .insert({
      qto_item_id: itemId,
      formula: payload.formula,
      display_text: payload.display_text ?? null,
      method: payload.method ?? "formula",
      result: evalResult.value,
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "Calculation failed" };

  // keep the item net quantity in sync
  await syncItemQuantity(itemId);
  return { data: data as QtoCalculation, error: null };
}

export async function updateCalculation(
  calcId: string,
  patch: { formula?: string; display_text?: string; method?: string }
): Promise<{ data: QtoCalculation | null; error: string | null }> {
  const supabase = createClient();
  const { data: existing } = await supabase.from("qto_calculations").select("qto_item_id, formula").eq("id", calcId).single();
  if (!existing) return { data: null, error: "Calculation not found" };

  const formula = patch.formula ?? existing.formula;
  const evalResult = safeEvaluate(formula);
  if (!evalResult.ok) return { data: null, error: evalResult.error };

  const { data, error } = await supabase
    .from("qto_calculations")
    .update({ formula, display_text: patch.display_text ?? null, method: patch.method ?? "formula", result: evalResult.value })
    .eq("id", calcId)
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "Calculation update failed" };

  await syncItemQuantity(existing.qto_item_id);
  return { data: data as QtoCalculation, error: null };
}

export async function addCalculationLine(
  calcId: string,
  payload: { seq: number; sign: string; description?: string; amount: number; unit?: string; source?: string }
): Promise<{ data: QtoCalculationLine | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_calculation_lines")
    .insert({ calculation_id: calcId, ...payload, amount: Math.round(payload.amount * 1000) / 1000 })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? "Line failed" };

  const { data: calc } = await supabase.from("qto_calculations").select("qto_item_id").eq("id", calcId).single();
  if (calc) await syncItemQuantity(calc.qto_item_id);
  return { data: data as QtoCalculationLine, error: null };
}

export async function deleteCalculationLine(lineId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: line } = await supabase.from("qto_calculation_lines").select("calculation_id").eq("id", lineId).single();
  const { error } = await supabase.from("qto_calculation_lines").delete().eq("id", lineId);
  if (!error && line) {
    const { data: calc } = await supabase.from("qto_calculations").select("qto_item_id").eq("id", line.calculation_id).single();
    if (calc) await syncItemQuantity(calc.qto_item_id);
  }
  return { error: error?.message ?? null };
}

export async function listCalculationLines(calcId: string): Promise<QtoCalculationLine[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("qto_calculation_lines")
    .select("*")
    .eq("calculation_id", calcId)
    .order("seq", { ascending: true });
  return (data as QtoCalculationLine[]) ?? [];
}

export async function syncItemQuantity(itemId: string): Promise<void> {
  const supabase = createClient();
  const { data: calcs } = await supabase
    .from("qto_calculations")
    .select("id, result")
    .eq("qto_item_id", itemId)
    .order("created_at", { ascending: true });
  if (!calcs || calcs.length === 0) return;

  const primaryCalc = calcs[0];
  const { data: lines } = await supabase
    .from("qto_calculation_lines")
    .select("sign, amount")
    .eq("calculation_id", primaryCalc.id)
    .order("seq", { ascending: true });

  const qty = lines && lines.length > 0
    ? lines.reduce((acc, l) => acc + (l.sign === "-" ? -l.amount : l.amount), 0)
    : (primaryCalc.result ?? 0);

  const { data: item } = await supabase.from("qto_items").select("unit").eq("id", itemId).single();
  await supabase.from("qto_items").update({ quantity: Math.round(qty * 1000) / 1000, unit: item?.unit ?? "m" }).eq("id", itemId);
}

// ── Measurements ─────────────────────────────────────────────────────────────
export async function addMeasurement(
  itemId: string,
  payload: Partial<QtoMeasurement>
): Promise<{ data: QtoMeasurement | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_measurements")
    .insert({ ...payload, qto_item_id: itemId })
    .select()
    .single();
  return { data: (data as QtoMeasurement) ?? null, error: error?.message ?? null };
}

export async function updateMeasurement(id: string, patch: Partial<QtoMeasurement>): Promise<{ data: QtoMeasurement | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("qto_measurements").update(patch).eq("id", id).select().single();
  return { data: (data as QtoMeasurement) ?? null, error: error?.message ?? null };
}

export async function deleteMeasurement(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("qto_measurements").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// ── Assumptions & clarifications ─────────────────────────────────────────────
export async function listAssumptions(tenderId: string): Promise<QtoAssumption[]> {
  const supabase = createClient();
  const { data } = await supabase.from("qto_assumptions").select("*").eq("tender_id", tenderId).order("created_at", { ascending: false });
  return (data as QtoAssumption[]) ?? [];
}

export async function addAssumption(payload: Partial<QtoAssumption>): Promise<{ data: QtoAssumption | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("qto_assumptions").insert(payload).select().single();
  return { data: (data as QtoAssumption) ?? null, error: error?.message ?? null };
}

export async function listClarifications(tenderId: string): Promise<QtoClarification[]> {
  const supabase = createClient();
  const { data } = await supabase.from("qto_clarifications").select("*").eq("tender_id", tenderId).order("created_at", { ascending: false });
  return (data as QtoClarification[]) ?? [];
}

export async function addClarification(payload: Partial<QtoClarification>): Promise<{ data: QtoClarification | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("qto_clarifications").insert(payload).select().single();
  return { data: (data as QtoClarification) ?? null, error: error?.message ?? null };
}

export async function respondClarification(id: string, response: string): Promise<{ data: QtoClarification | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_clarifications")
    .update({ response, status: "RESPONDED" })
    .eq("id", id)
    .select()
    .single();
  return { data: (data as QtoClarification) ?? null, error: error?.message ?? null };
}

// ── Summary / progress / risk ────────────────────────────────────────────────
export async function getQtoSummary(tenderId: string): Promise<QtoSummaryRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("qto_items")
    .select("building, discipline, work_section, unit, quantity, status")
    .eq("tender_id", tenderId);
  if (!data) return [];

  const rows = new Map<string, QtoSummaryRow>();
  for (const it of data as QtoItem[]) {
    if (it.status !== "APPROVED" && it.status !== "POSTED TO BOQ") continue;
    const key = `${it.building ?? ""}|${it.discipline ?? ""}|${it.work_section ?? ""}|${it.unit}`;
    const existing = rows.get(key);
    if (existing) {
      existing.quantity += it.quantity;
      existing.qto_count += 1;
    } else {
      rows.set(key, {
        building: it.building,
        discipline: it.discipline,
        work_section: it.work_section,
        unit: it.unit,
        quantity: it.quantity,
        qto_count: 1,
      });
    }
  }
  return [...rows.values()].map((r) => ({ ...r, quantity: Math.round(r.quantity * 1000) / 1000 }));
}

export async function getProgress(tenderId: string): Promise<ProgressStats> {
  const supabase = createClient();
  const { data } = await supabase.from("qto_items").select("status").eq("tender_id", tenderId);
  const byStatus: Record<string, number> = {};
  let approved = 0;
  let posted = 0;
  for (const it of (data ?? []) as { status: string }[]) {
    byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
    if (it.status === "APPROVED") approved += 1;
    if (it.status === "POSTED TO BOQ") posted += 1;
  }
  return { total: data?.length ?? 0, byStatus, approved, posted };
}

export async function getRiskRegister(tenderId: string): Promise<RiskItem[]> {
  const supabase = createClient();
  const { data: items } = await supabase
    .from("qto_items")
    .select("qto_no, status, confidence, building, discipline, drawing_id, drawing_revision_id, drawing:qto_drawing_register(id, drawing_no), drawing_revision:qto_drawing_revisions(id, revision, status)")
    .eq("tender_id", tenderId);

  const { data: assumptions } = await supabase.from("qto_assumptions").select("id, status").eq("tender_id", tenderId);
  const { data: clarifications } = await supabase.from("qto_clarifications").select("id, status").eq("tender_id", tenderId);

  const risks: RiskItem[] = [];
  const pendingRfi = (clarifications ?? []).filter((c) => c.status === "OPEN").length;
  const openAssumptions = (assumptions ?? []).filter((a) => a.status !== "RESOLVED").length;
  const provisional = (items ?? []).filter((it) => it.confidence === "PROVISIONAL").length;
  const superseded = (items ?? []).filter((it) => {
    const rev = Array.isArray(it.drawing_revision) ? it.drawing_revision[0] : it.drawing_revision;
    return !!rev && rev.status !== "current";
  }).length;
  const revisionPending = (items ?? []).filter((it) => it.status === "REVISION REQUIRED" || it.status === "REJECTED").length;
  const missingDrawing = (items ?? []).filter((it) => !it.drawing_id || !it.drawing_revision_id).length;

  risks.push({ type: "missing_drawing", label: "Missing Drawing", count: missingDrawing });
  risks.push({ type: "pending_rfi", label: "Pending RFI / Clarification", count: pendingRfi });
  risks.push({ type: "assumption", label: "Assumptions (Open)", count: openAssumptions });
  risks.push({ type: "provisional", label: "Provisional Quantity", count: provisional });
  risks.push({ type: "superseded", label: "Superseded Drawing", count: superseded });
  risks.push({ type: "revision_pending", label: "Revision Pending", count: revisionPending });
  return risks;
}

// ── BOQ mapping ──────────────────────────────────────────────────────────────
export async function listBoqLinks(tenderId: string): Promise<{ data: (QtoBoqLink & { qto?: Partial<QtoItem> | null; boq?: Partial<{ item_code: string; description: string; unit: string }> | null })[] | null; error: string | null }> {
  const supabase = createClient();
  const { data: items } = await supabase.from("qto_items").select("id").eq("tender_id", tenderId);
  if (!items || items.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from("qto_boq_links")
    .select("*, qto:qto_items(id, qto_no, description, unit, building, discipline), boq:tender_boq_items(id, item_code, description, unit, section)")
    .in("qto_item_id", items.map((r) => r.id));
  return { data: (data as never) ?? null, error: error?.message ?? null };
}

export async function linkToBoq(qtoItemId: string, boqItemId: string, quantity: number): Promise<{ data: QtoBoqLink | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("qto_boq_links")
    .insert({ qto_item_id: qtoItemId, boq_item_id: boqItemId, quantity })
    .select()
    .single();
  return { data: (data as QtoBoqLink) ?? null, error: error?.message ?? null };
}

export async function unlinkFromBoq(linkId: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("qto_boq_links").delete().eq("id", linkId);
  return { error: error?.message ?? null };
}

// ── Revision history ─────────────────────────────────────────────────────────
export async function getRevisionHistory(itemId: string): Promise<QtoRevisionHistory[]> {
  const supabase = createClient();
  const { data } = await supabase.from("qto_revisions").select("*").eq("qto_item_id", itemId).order("revision_no", { ascending: true });
  return (data as QtoRevisionHistory[]) ?? [];
}

export function compareRevisions(a: QtoRevisionHistory, b: QtoRevisionHistory) {
  return {
    quantityDelta: (b.quantity ?? 0) - (a.quantity ?? 0),
    unit: b.unit ?? a.unit,
    status: b.status ?? a.status,
    change_reason: b.change_reason ?? null,
    from_revision: a.revision_no,
    to_revision: b.revision_no,
  };
}

// ── Audit ────────────────────────────────────────────────────────────────────
export async function getAuditLog(tenderId: string): Promise<{ data: unknown[] | null; error: string | null }> {
  const supabase = createClient();
  const { data: itemIds } = await supabase.from("qto_items").select("id").eq("tender_id", tenderId);
  if (!itemIds || itemIds.length === 0) return { data: [], error: null };
  const { data, error } = await supabase
    .from("qto_audit_log")
    .select("*")
    .in("record_id", itemIds.map((r) => r.id))
    .order("changed_at", { ascending: false })
    .limit(100);
  return { data: data as unknown[] ?? [], error: error?.message ?? null };
}
