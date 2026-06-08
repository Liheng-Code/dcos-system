import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Itp {
  id: string;
  project_id: string;
  wbs_node_id: string | null;
  title: string;
  discipline: string | null;
  description: string | null;
  status: "draft" | "active" | "closed";
  created_by: string | null;
  created_at: string;
}

export interface ItpItem {
  id: string;
  itp_id: string;
  seq: number;
  activity: string;
  inspection_type: "hold" | "witness" | "review";
  responsible_party: string | null;
  acceptance_criteria: string | null;
  document_reference: string | null;
}

export interface InspectionRequest {
  id: string;
  project_id: string;
  itp_id: string | null;
  wbs_node_id: string | null;
  wbs_task_id: string | null;
  ir_number: string;
  location: string | null;
  requested_by: string | null;
  request_date: string;
  inspection_date: string | null;
  inspector_name: string | null;
  status: "draft" | "submitted" | "scheduled" | "inspected" | "passed" | "failed" | "closed";
  notes: string | null;
  created_at: string;
  // joined
  itps?: { title: string } | null;
}

export interface InspectionResult {
  id: string;
  inspection_request_id: string;
  itp_item_id: string;
  result: "pass" | "fail" | "na" | "pending" | null;
  remark: string | null;
}

export interface Ncr {
  id: string;
  project_id: string;
  inspection_request_id: string | null;
  wbs_node_id: string | null;
  ncr_number: string;
  description: string;
  severity: "minor" | "major" | "critical";
  raised_by: string | null;
  raised_at: string;
  responsible_party: string | null;
  due_date: string | null;
  status: "open" | "corrective_action" | "reinspection" | "closed" | "voided";
  closed_at: string | null;
  closure_comment: string | null;
  created_at: string;
  // joined
  inspection_requests?: { ir_number: string } | null;
}

export interface NcrCorrectiveAction {
  id: string;
  ncr_id: string;
  action_description: string;
  assigned_to: string | null;
  due_date: string | null;
  status: "open" | "in_progress" | "completed";
  completed_at: string | null;
  completion_note: string | null;
  created_at: string;
}

// ── ITP ───────────────────────────────────────────────────────────────────────

export async function getItps(projectId: string): Promise<Itp[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("itps")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Itp[];
}

export async function createItp(
  payload: Pick<Itp, "project_id" | "title" | "discipline" | "description">,
): Promise<Itp> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("itps")
    .insert({ ...payload, status: "draft", created_by: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as Itp;
}

export async function updateItpStatus(id: string, status: Itp["status"]): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("itps").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ── ITP Items ─────────────────────────────────────────────────────────────────

export async function getItpItems(itpId: string): Promise<ItpItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("itp_items")
    .select("*")
    .eq("itp_id", itpId)
    .order("seq");
  if (error) throw error;
  return (data ?? []) as ItpItem[];
}

export async function createItpItem(
  payload: Pick<ItpItem, "itp_id" | "activity" | "inspection_type" | "responsible_party" | "acceptance_criteria" | "document_reference"> & { seq: number },
): Promise<ItpItem> {
  const supabase = createClient();
  const { data, error } = await supabase.from("itp_items").insert(payload).select().single();
  if (error) throw error;
  return data as ItpItem;
}

export async function deleteItpItem(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("itp_items").delete().eq("id", id);
  if (error) throw error;
}

// ── Inspection Requests ───────────────────────────────────────────────────────

export async function getInspectionRequests(projectId: string): Promise<InspectionRequest[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inspection_requests")
    .select("*, itps(title)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InspectionRequest[];
}

export async function getInspectionRequest(id: string): Promise<InspectionRequest> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inspection_requests")
    .select("*, itps(title)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as InspectionRequest;
}

export async function createInspectionRequest(
  payload: Pick<InspectionRequest, "project_id" | "itp_id" | "ir_number" | "location" | "request_date" | "inspection_date" | "inspector_name" | "notes">,
): Promise<InspectionRequest> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("inspection_requests")
    .insert({ ...payload, requested_by: user?.id, status: "submitted" })
    .select()
    .single();
  if (error) throw error;
  return data as InspectionRequest;
}

export async function updateInspectionRequestStatus(id: string, status: InspectionRequest["status"]): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("inspection_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Inspection Results ────────────────────────────────────────────────────────

export async function getInspectionResults(inspectionRequestId: string): Promise<InspectionResult[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("inspection_results")
    .select("*")
    .eq("inspection_request_id", inspectionRequestId);
  if (error) throw error;
  return (data ?? []) as InspectionResult[];
}

export async function upsertInspectionResult(
  payload: Pick<InspectionResult, "inspection_request_id" | "itp_item_id" | "result" | "remark">,
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("inspection_results").upsert(
    { ...payload, recorded_by: user?.id, recorded_at: new Date().toISOString() },
    { onConflict: "inspection_request_id,itp_item_id" },
  );
  if (error) throw error;
}

// ── NCRs ──────────────────────────────────────────────────────────────────────

export async function getNcrs(projectId: string): Promise<Ncr[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ncrs")
    .select("*, inspection_requests(ir_number)")
    .eq("project_id", projectId)
    .order("raised_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Ncr[];
}

export async function createNcr(
  payload: Pick<Ncr, "project_id" | "inspection_request_id" | "ncr_number" | "description" | "severity" | "responsible_party" | "due_date">,
): Promise<Ncr> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("ncrs")
    .insert({ ...payload, raised_by: user?.id, status: "open" })
    .select()
    .single();
  if (error) throw error;
  return data as Ncr;
}

export async function getNcrCorrectiveActions(ncrId: string): Promise<NcrCorrectiveAction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("ncr_corrective_actions")
    .select("*")
    .eq("ncr_id", ncrId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as NcrCorrectiveAction[];
}

export function generateIrNumber(): string {
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-5);
  return `IR-${year}-${suffix}`;
}

export function generateNcrNumber(): string {
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-5);
  return `NCR-${year}-${suffix}`;
}
