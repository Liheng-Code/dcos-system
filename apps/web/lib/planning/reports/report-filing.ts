// Generate, file and keep a Planning report (doc 35 M1-M4). Server only (route handlers).
//   1. what the report may show is read with the CALLER's client (row-level security, membership and Schedule view,
//      checked again by plan_report_basis); generating needs Schedule export permission.
//   2. the content model is built and rendered to PDF and HTML.
//   3. both files are uploaded under a new name (never over an older report), filed in Document Control as a new
//      revision of the report's document, and the snapshot (content + basis + files) is stored in
//      plan_report_snapshots, which nobody can change afterwards.

import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadReportData } from "./report-data";
import { buildReport } from "./report-builders";
import { renderReportHtml } from "./report-html";
import { renderReportPdf } from "./report-pdf";
import { canonicalJson, REPORT_TYPE_LABEL, RENDERER_VERSION, type ReportBasis, type ReportDoc, type ReportType } from "./report-model";

export class ReportError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Document Control type and number of each report: one document per report and period, a revision per generation. */
export function documentFor(type: ReportType, doc: ReportDoc): { typeCode: string; number: string; title: string } {
  const d = doc.periodEnd ?? doc.asAt;
  switch (type) {
    case "monthly": return { typeCode: "MTH", number: `MTH-${doc.periodLabel}`, title: `Monthly Progress Report — ${doc.periodLabel}` };
    case "weekly": return { typeCode: "WLY", number: `WLY-${isoWeek(d)}`, title: `Weekly Progress Report — ${doc.periodLabel}` };
    case "recovery": return { typeCode: "SCH", number: `SCH-RCV-${d}`, title: `Recovery Report — ${d}` };
    case "master_programme": return { typeCode: "SCH", number: `SCH-MP-${d}`, title: `Master Programme — ${d}` };
  }
}

/** ISO 8601 week, e.g. 2026-W45. */
export function isoWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The content's fingerprint: the same programme data gives the same hash (the generation time is left out). */
export function contentHash(doc: ReportDoc): string {
  const { generatedAt: _a, generatedBy: _b, ...content } = doc;
  void _a; void _b;
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export interface GeneratedReport {
  id: string;
  report_type: ReportType;
  period_label: string;
  document_number: string;
  document_revision: number;
  page_count: number;
  content_hash: string;
}

export async function generateReport(opts: {
  userDb: SupabaseClient; adminDb: SupabaseClient; projectId: string; userId: string; type: ReportType; weekEnding?: string;
}): Promise<GeneratedReport> {
  const { userDb, adminDb, projectId, userId, type } = opts;

  const { data: basisRaw, error: basisError } = await userDb.rpc("plan_report_basis", { p_project_id: projectId });
  if (basisError) throw new ReportError(basisError.message, basisError.code === "42501" ? 403 : 500);
  const { data: canExport } = await userDb.rpc("has_permission", { p_module: "planning", p_action: "schedule", p_field: "export" });
  if (canExport !== true) throw new ReportError("Generating a report needs Schedule export permission.", 403);
  const basis = basisRaw as ReportBasis;

  const data = await loadReportData(userDb, projectId, basis, userId);
  const doc = buildReport(type, data, basis, { weekEnding: opts.weekEnding });
  const html = renderReportHtml(doc);
  const pdf = await renderReportPdf(doc);
  const hash = contentHash(doc);
  const id = randomUUID();

  // a new file name per report, so an older report is never replaced
  const base = `documents/${projectId}/planning-reports/${type}/${(doc.periodEnd ?? doc.asAt)}-${id.slice(0, 8)}`;
  const storage = adminDb.storage.from("documents");
  const up1 = await storage.upload(`${base}.pdf`, pdf.bytes, { contentType: "application/pdf", upsert: false });
  if (up1.error) throw new ReportError(up1.error.message, 500);
  const up2 = await storage.upload(`${base}.html`, html, { contentType: "text/html; charset=utf-8", upsert: false });
  if (up2.error) throw new ReportError(up2.error.message, 500);

  // Document Control: the report's document, with this generation as its next revision
  const target = documentFor(type, doc);
  const { data: docType } = await adminDb.from("document_types").select("id").eq("code", target.typeCode).maybeSingle();
  if (!docType) throw new ReportError(`Document type '${target.typeCode}' is not set up in Document Control`, 500);
  let documentId: string;
  const { data: existing } = await adminDb.from("documents").select("id").eq("project_id", projectId).eq("document_number", target.number).maybeSingle();
  if (existing) documentId = (existing as { id: string }).id;
  else {
    const { data: created, error } = await adminDb.from("documents").insert({
      project_id: projectId, document_type_id: (docType as { id: string }).id, document_number: target.number, title: target.title,
      status: "ifc", current_revision: 0, created_by: userId,
    }).select("id").single();
    if (error) throw new ReportError(error.message, 500);
    documentId = (created as { id: string }).id;
  }
  const { data: last } = await adminDb.from("document_revisions").select("revision_number").eq("document_id", documentId)
    .order("revision_number", { ascending: false }).limit(1).maybeSingle();
  const revision = ((last as { revision_number: number } | null)?.revision_number ?? 0) + 1;
  const revisionCode = `R${String(revision - 1).padStart(2, "0")}`;
  const { data: url } = storage.getPublicUrl(`${base}.pdf`);
  const revInsert = await adminDb.from("document_revisions").insert({
    document_id: documentId, revision_number: revision, revision_code: revisionCode, file_url: url.publicUrl,
    file_name: `${target.number}-${revisionCode}.pdf`, file_size: pdf.bytes.byteLength, page_count: pdf.pages,
    file_sha256: createHash("sha256").update(pdf.bytes).digest("hex"), uploaded_by: userId, status: "ifc",
    notes: `${REPORT_TYPE_LABEL[type]} generated from the programme (report ${id}).`,
  });
  if (revInsert.error) throw new ReportError(revInsert.error.message, 500);
  await adminDb.from("documents").update({ current_revision: revision, current_revision_code: revisionCode, status: "ifc", updated_at: new Date().toISOString() }).eq("id", documentId);

  const row = {
    id, project_id: projectId, report_type: type, period_label: doc.periodLabel, period_start: doc.periodStart, period_end: doc.periodEnd,
    data_date: basis.project?.data_date ?? null, basis, content: doc, renderer_version: RENDERER_VERSION, content_hash: hash,
    pdf_path: `${base}.pdf`, html_path: `${base}.html`, page_count: pdf.pages, document_id: documentId, document_number: target.number,
    document_revision: revision, generated_by: userId, generated_at: doc.generatedAt,
  };
  const ins = await adminDb.from("plan_report_snapshots").insert(row);
  if (ins.error) throw new ReportError(ins.error.message, 500);

  return { id, report_type: type, period_label: doc.periodLabel, document_number: target.number, document_revision: revision, page_count: pdf.pages, content_hash: hash };
}
