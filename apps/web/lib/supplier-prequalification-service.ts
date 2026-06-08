import { createClient } from "@/lib/supabase/client";

export type SupplierPqStatus =
  | "not_started"
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "expired"
  | "suspended"
  | "blacklisted";

export type SupplierPqRecordStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "expired";
export type SupplierPqDocumentStatus = "pending" | "verified" | "rejected" | "expired";
export type SupplierTradeStatus = "active" | "expired" | "suspended" | "revoked";

export interface SupplierPqSupplier {
  id: string;
  supplier_code: string;
  supplier_name: string;
  supplier_type: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  pq_status: SupplierPqStatus;
  pq_score: number | null;
  pq_approved_at: string | null;
  pq_expires_at: string | null;
  blacklist_reason: string | null;
}

export interface SupplierPqRecord {
  id: string;
  supplier_id: string;
  legal_status: string | null;
  registration_number: string | null;
  paid_up_capital: number | null;
  years_in_business: number | null;
  audited_accounts_available: boolean;
  annual_turnover: number | null;
  credit_rating: string | null;
  bank_reference: string | null;
  scope_of_work: string | null;
  equipment_summary: string | null;
  key_personnel_summary: string | null;
  project_references: string | null;
  quality_certifications: string | null;
  hse_incident_frequency: number | null;
  hse_near_miss_rate: number | null;
  hse_enforcement_history: string | null;
  insurance_summary: string | null;
  status: SupplierPqRecordStatus;
  reviewer_notes: string | null;
  final_score: number | null;
  submitted_at: string | null;
  reviewed_at: string | null;
}

export interface SupplierPqDocument {
  id: string;
  supplier_id: string;
  pq_record_id: string | null;
  document_category: string;
  document_name: string;
  file_url: string | null;
  reference_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  verification_status: SupplierPqDocumentStatus;
  notes: string | null;
}

export interface SupplierApprovedTrade {
  id: string;
  supplier_id: string;
  trade_category: string;
  approval_scope: string | null;
  approved_from: string;
  approved_until: string | null;
  status: SupplierTradeStatus;
  notes: string | null;
}

export interface SupplierPerformanceScore {
  id: string;
  supplier_id: string;
  score_period_start: string | null;
  score_period_end: string | null;
  delivery_score: number | null;
  quality_score: number | null;
  responsiveness_score: number | null;
  commercial_score: number | null;
  hse_score: number | null;
  overall_score: number | null;
  notes: string | null;
  scored_at: string;
}

export interface SupplierPqProfile {
  supplier: SupplierPqSupplier;
  record: SupplierPqRecord | null;
  documents: SupplierPqDocument[];
  trades: SupplierApprovedTrade[];
  scores: SupplierPerformanceScore[];
}

export interface SupplierPqDashboard {
  suppliers: SupplierPqSupplier[];
  total: number;
  approved: number;
  expiringSoon: number;
  expired: number;
  blacklisted: number;
  documentsExpiringSoon: number;
}

const SUPPLIER_SELECT = "id, supplier_code, supplier_name, supplier_type, contact_person, email, phone, status, pq_status, pq_score, pq_approved_at, pq_expires_at, blacklist_reason";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function isExpiringSoon(date: string | null) {
  if (!date) return false;
  const now = todayIso();
  const cutoff = addDaysIso(30);
  return date >= now && date <= cutoff;
}

function averageScore(values: Array<number | null | undefined>) {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((sum, value) => sum + value, 0) / nums.length);
}

export async function getSupplierPqDashboard(): Promise<SupplierPqDashboard> {
  const supabase = createClient();
  const [supplierRes, docRes] = await Promise.all([
    supabase.from("procurement_suppliers").select(SUPPLIER_SELECT).order("supplier_name"),
    supabase
      .from("supplier_pq_documents")
      .select("id, expiry_date, verification_status")
      .gte("expiry_date", todayIso())
      .lte("expiry_date", addDaysIso(30)),
  ]);

  if (supplierRes.error) throw supplierRes.error;
  if (docRes.error) throw docRes.error;

  const suppliers = (supplierRes.data ?? []) as SupplierPqSupplier[];
  return {
    suppliers,
    total: suppliers.length,
    approved: suppliers.filter(s => s.pq_status === "approved").length,
    expiringSoon: suppliers.filter(s => s.pq_status === "approved" && isExpiringSoon(s.pq_expires_at)).length,
    expired: suppliers.filter(s => s.pq_status === "expired" || (!!s.pq_expires_at && s.pq_expires_at < todayIso())).length,
    blacklisted: suppliers.filter(s => s.status === "blacklisted" || s.pq_status === "blacklisted").length,
    documentsExpiringSoon: (docRes.data ?? []).length,
  };
}

export async function getSupplierPqProfile(supplierId: string): Promise<SupplierPqProfile> {
  const supabase = createClient();
  const [supplierRes, recordRes, docRes, tradeRes, scoreRes] = await Promise.all([
    supabase.from("procurement_suppliers").select(SUPPLIER_SELECT).eq("id", supplierId).single(),
    supabase.from("supplier_pq_records").select("*").eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("supplier_pq_documents").select("*").eq("supplier_id", supplierId).order("expiry_date", { ascending: true }),
    supabase.from("supplier_approved_trades").select("*").eq("supplier_id", supplierId).order("trade_category"),
    supabase.from("supplier_performance_scores").select("*").eq("supplier_id", supplierId).order("scored_at", { ascending: false }).limit(8),
  ]);

  if (supplierRes.error) throw supplierRes.error;
  if (recordRes.error) throw recordRes.error;
  if (docRes.error) throw docRes.error;
  if (tradeRes.error) throw tradeRes.error;
  if (scoreRes.error) throw scoreRes.error;

  return {
    supplier: supplierRes.data as SupplierPqSupplier,
    record: recordRes.data as SupplierPqRecord | null,
    documents: (docRes.data ?? []) as SupplierPqDocument[],
    trades: (tradeRes.data ?? []) as SupplierApprovedTrade[],
    scores: (scoreRes.data ?? []) as SupplierPerformanceScore[],
  };
}

export async function upsertSupplierPqRecord(payload: Partial<SupplierPqRecord> & { supplier_id: string }) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("supplier_pq_records")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  await supabase.from("procurement_suppliers").update({ pq_status: payload.status ?? "draft" }).eq("id", payload.supplier_id);
  return data as SupplierPqRecord;
}

export async function submitSupplierPq(supplierId: string, recordId: string) {
  const supabase = createClient();
  const submittedAt = new Date().toISOString();
  const [recordRes, supplierRes] = await Promise.all([
    supabase.from("supplier_pq_records").update({ status: "submitted", submitted_at: submittedAt }).eq("id", recordId),
    supabase.from("procurement_suppliers").update({ pq_status: "submitted" }).eq("id", supplierId),
  ]);
  if (recordRes.error) throw recordRes.error;
  if (supplierRes.error) throw supplierRes.error;
}

export async function reviewSupplierPq(
  supplierId: string,
  recordId: string,
  decision: "under_review" | "approved" | "rejected",
  notes: string,
  finalScore: number | null,
  expiresAt: string | null,
) {
  const supabase = createClient();
  const reviewedAt = new Date().toISOString();
  const supplierUpdate: Record<string, string | number | null> = {
    pq_status: decision,
    pq_score: finalScore,
  };
  if (decision === "approved") {
    supplierUpdate.status = "active";
    supplierUpdate.pq_approved_at = reviewedAt;
    supplierUpdate.pq_expires_at = expiresAt;
  }

  const [recordRes, supplierRes] = await Promise.all([
    supabase.from("supplier_pq_records").update({
      status: decision,
      reviewer_notes: notes || null,
      final_score: finalScore,
      reviewed_at: reviewedAt,
    }).eq("id", recordId),
    supabase.from("procurement_suppliers").update(supplierUpdate).eq("id", supplierId),
  ]);
  if (recordRes.error) throw recordRes.error;
  if (supplierRes.error) throw supplierRes.error;
}

export async function upsertSupplierPqDocument(payload: Partial<SupplierPqDocument> & { supplier_id: string; document_name: string; document_category: string }) {
  const supabase = createClient();
  const { data, error } = await supabase.from("supplier_pq_documents").upsert(payload, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return data as SupplierPqDocument;
}

export async function upsertSupplierApprovedTrade(payload: Partial<SupplierApprovedTrade> & { supplier_id: string; trade_category: string }) {
  const supabase = createClient();
  const { data, error } = await supabase.from("supplier_approved_trades").upsert(payload, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return data as SupplierApprovedTrade;
}

export async function recordSupplierPerformanceScore(payload: Partial<SupplierPerformanceScore> & { supplier_id: string }) {
  const supabase = createClient();
  const overall = payload.overall_score ?? averageScore([
    payload.delivery_score,
    payload.quality_score,
    payload.responsiveness_score,
    payload.commercial_score,
    payload.hse_score,
  ]);
  const { data, error } = await supabase
    .from("supplier_performance_scores")
    .insert([{ ...payload, overall_score: overall }])
    .select("*")
    .single();
  if (error) throw error;
  if (overall != null) {
    await supabase.from("procurement_suppliers").update({ pq_score: overall }).eq("id", payload.supplier_id);
  }
  return data as SupplierPerformanceScore;
}

export async function blacklistSupplier(supplierId: string, reason: string) {
  const supabase = createClient();
  const { error } = await supabase.from("procurement_suppliers").update({
    status: "blacklisted",
    pq_status: "blacklisted",
    blacklist_reason: reason || null,
    blacklisted_at: new Date().toISOString(),
  }).eq("id", supplierId);
  if (error) throw error;
}
