"use client";

// Generated Planning reports (doc 35 M1-M4): generate a master programme, weekly, monthly or recovery report as PDF
// (plus HTML), filed as a new Document Control revision; every report generated is kept as generated and can be
// reopened, downloaded again or exported to Excel from its stored content.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileDown, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, REPORT_TYPE_LABEL, reportTables, type ReportType } from "@/lib/planning/reports/report-model";
import { renderReportHtml } from "@/lib/planning/reports/report-html";
import {
  getReportContent, listReportSnapshots, reportFileUrl, requestReport, type ReportSnapshotRow,
} from "@/lib/planning/reports/report-snapshots-service";

const TYPES: { value: ReportType; hint: string }[] = [
  { value: "master_programme", hint: "Every activity by WBS with baseline, variance and float" },
  { value: "weekly", hint: "The week's starts, finishes, progress, slippage, delays and the next two weeks" },
  { value: "monthly", hint: "Status, progress history, delays, milestones and critical work" },
  { value: "recovery", hint: "Recovery scenarios, what was adopted and applied, and whether it worked" },
];
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export function PlanReportDocuments() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId: projectId } = useProject();
  const { can } = usePlanningPermissions();
  const canExport = can("schedule", "export");
  const [type, setType] = useState<ReportType>("master_programme");
  const [weekEnding, setWeekEnding] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ projectId: string; list: ReportSnapshotRow[] } | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  const load = useCallback(() => {
    if (!projectId) return;
    listReportSnapshots(db, projectId)
      .then(async (list) => {
        setRows({ projectId, list });
        const ids = [...new Set(list.map((r) => r.generated_by).filter((x): x is string => !!x))];
        if (ids.length) {
          const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
          setNames(new Map(((data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name])));
        }
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
  }, [db, projectId]);
  useEffect(load, [load]);

  async function generate() {
    if (!projectId) return;
    setBusy(true);
    try {
      const r = await requestReport(projectId, type, type === "weekly" ? weekEnding : undefined);
      toast.success(`${REPORT_TYPE_LABEL[type]} generated: ${r.page_count} page(s), filed as ${r.document_number} revision ${r.document_revision}.`);
      window.open(reportFileUrl(r.id, "pdf"), "_blank", "noopener");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Report failed"); } finally { setBusy(false); }
  }

  async function reopen(r: ReportSnapshotRow) {
    try {
      const doc = await getReportContent(db, r.id);
      const url = URL.createObjectURL(new Blob([renderReportHtml(doc)], { type: "text/html" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function excel(r: ReportSnapshotRow) {
    try {
      const doc = await getReportContent(db, r.id);
      const wb = XLSX.utils.book_new();
      const meta = [["Report", doc.title], ["Project", doc.subtitle], ["Period", doc.periodLabel], ["Generated", doc.generatedAt],
        ["Data date", doc.basis.project?.data_date ?? `none (as at ${doc.asAt})`],
        ["Baseline", doc.basis.baseline ? `BL${doc.basis.baseline.number} ${doc.basis.baseline.name}` : "none"],
        ["Calculation", doc.basis.calculation ? `${doc.basis.calculation.at} engine ${doc.basis.calculation.engine_version}` : "none"]];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), "Basis");
      for (const t of reportTables(doc)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.header, ...t.rows]), t.name);
      XLSX.writeFile(wb, `${r.document_number ?? r.report_type}-R${String((r.document_revision ?? 1) - 1).padStart(2, "0")}.xlsx`);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  if (!projectId) return null;
  const list = rows?.projectId === projectId ? rows.list : null;
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Report documents</h3>
        <p className="text-xs text-muted-foreground">
          Generates a PDF from the programme as it is now, files it in Document Control as a new revision, and keeps it exactly as generated. An earlier report is never replaced.
        </p>
      </div>
      {canExport ? (
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="text-xs"><span className="mb-1 block text-muted-foreground">Report</span>
            <select className={sel} value={type} onChange={(e) => setType(e.target.value as ReportType)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{REPORT_TYPE_LABEL[t.value]}</option>)}
            </select>
          </label>
          {type === "weekly" && (
            <label className="text-xs"><span className="mb-1 block text-muted-foreground">Week ending</span>
              <Input className="w-40" type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} />
            </label>
          )}
          <Button onClick={generate} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}Generate PDF</Button>
          <span className="pb-2 text-xs text-muted-foreground">{TYPES.find((t) => t.value === type)?.hint}</span>
        </div>
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">Generating reports needs Schedule export permission. Reports already generated are listed below.</p>
      )}
      {!list ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div> : list.length === 0 ? (
        <p className="border-t border-border px-4 py-4 text-xs text-muted-foreground">No report generated yet.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto border-t border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 text-left text-[11px] uppercase text-muted-foreground">
              <tr><th className="px-3 py-2">Report</th><th className="px-3 py-2">Generated</th><th className="px-3 py-2">Based on</th><th className="px-3 py-2">Document</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-1.5"><b>{REPORT_TYPE_LABEL[r.report_type]}</b><div className="text-muted-foreground">{r.period_label}</div></td>
                  <td className="px-3 py-1.5">{fmtDate(r.generated_at.slice(0, 10))} {r.generated_at.slice(11, 16)}<div className="text-muted-foreground">{(r.generated_by && names.get(r.generated_by)) ?? "—"}</div></td>
                  <td className="px-3 py-1.5">
                    Data date {fmtDate(r.data_date)}
                    <div className="text-muted-foreground">{r.basis.baseline ? `BL${r.basis.baseline.number} ${r.basis.baseline.name}${r.basis.baseline.approved_at ? "" : " (not approved)"}` : "no approved baseline"}</div>
                  </td>
                  <td className="px-3 py-1.5">{r.document_number ?? "—"}{r.document_revision != null && <span className="text-muted-foreground"> · R{String(r.document_revision - 1).padStart(2, "0")}</span>}<div className="text-muted-foreground">{r.page_count ?? "—"} page(s)</div></td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <a className="mr-2 inline-flex items-center gap-1 text-primary hover:underline" href={reportFileUrl(r.id, "pdf")} target="_blank" rel="noopener noreferrer"><FileDown className="h-3.5 w-3.5" />PDF</a>
                    <button type="button" className="mr-2 inline-flex items-center gap-1 text-primary hover:underline" onClick={() => void reopen(r)} title="Rebuilt from the stored content"><FileText className="h-3.5 w-3.5" />View</button>
                    <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => void excel(r)}><FileSpreadsheet className="h-3.5 w-3.5" />Excel</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
