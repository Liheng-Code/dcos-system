// Browser side of the Planning reports (doc 35 M): the basis every screen shows, the list of generated reports, and
// asking the server to generate one. Generated reports are read-only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportBasis, ReportDoc, ReportType } from "./report-model";

type Db = SupabaseClient;

export async function getReportBasis(db: Db, projectId: string): Promise<ReportBasis> {
  const { data, error } = await db.rpc("plan_report_basis", { p_project_id: projectId });
  if (error) throw new Error(error.message);
  return data as ReportBasis;
}

export interface ReportSnapshotRow {
  id: string;
  report_type: ReportType;
  period_label: string;
  data_date: string | null;
  basis: ReportBasis;
  renderer_version: string;
  content_hash: string;
  page_count: number | null;
  document_number: string | null;
  document_revision: number | null;
  generated_by: string | null;
  generated_at: string;
}

export async function listReportSnapshots(db: Db, projectId: string): Promise<ReportSnapshotRow[]> {
  const { data, error } = await db.from("plan_report_snapshots")
    .select("id, report_type, period_label, data_date, basis, renderer_version, content_hash, page_count, document_number, document_revision, generated_by, generated_at")
    .eq("project_id", projectId).order("generated_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportSnapshotRow[];
}

/** The stored content model: the report exactly as it was generated. */
export async function getReportContent(db: Db, id: string): Promise<ReportDoc> {
  const { data, error } = await db.from("plan_report_snapshots").select("content").eq("id", id).single();
  if (error) throw new Error(error.message);
  return (data as { content: ReportDoc }).content;
}

export async function requestReport(projectId: string, type: ReportType, weekEnding?: string): Promise<{ id: string; document_number: string; document_revision: number; page_count: number }> {
  const res = await fetch(`/api/planning/reports/generate/${projectId}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, ...(weekEnding ? { weekEnding } : {}) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Report failed (${res.status})`);
  return json;
}

export const reportFileUrl = (id: string, format: "pdf" | "html") => `/api/planning/reports/file/${id}?format=${format}`;
