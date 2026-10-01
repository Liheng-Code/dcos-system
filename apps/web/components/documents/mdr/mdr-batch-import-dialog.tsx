"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  FileText,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { insertDocumentReturning, insertDocumentRevision, listDocumentTypesOfIdAndCode } from "@/lib/documents/documents-queries";

interface BatchImportDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedDocRow {
  document_number: string;
  title: string;
  discipline: string;
  package_code: string;
  planned_submission_date: string;
  description: string;
  isValid: boolean;
  errorMsg?: string;
}

export function MdrBatchImportDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
}: BatchImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"paste" | "upload">("paste");
  const [csvContent, setCsvContent] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedDocRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<{ total: number; inserted: number; errors: number } | null>(null);

  if (!isOpen) return null;

  function parseCSV(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setParsedRows([]);
      return;
    }

    // Determine header mapping
    const firstLine = lines[0].toLowerCase();
    let startIndex = 0;
    const isHeader =
      firstLine.includes("document") ||
      firstLine.includes("number") ||
      firstLine.includes("title");

    if (isHeader) {
      startIndex = 1;
    }

    const rows: ParsedDocRow[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      // Split on comma or tab or semicolon
      const parts = line.split(/[,\t;]/).map((p) => p.trim().replace(/^["']|["']$/g, ""));

      const docNum = parts[0] || "";
      const docTitle = parts[1] || "";
      const discipline = (parts[2] || "GEN").toUpperCase();
      const pkgCode = parts[3] || "C01";
      const plannedDate = parts[4] || "";
      const desc = parts[5] || "";

      let isValid = true;
      let errorMsg = "";

      if (!docNum) {
        isValid = false;
        errorMsg = "Missing Document Number";
      } else if (!docTitle) {
        isValid = false;
        errorMsg = "Missing Document Title";
      }

      rows.push({
        document_number: docNum,
        title: docTitle,
        discipline,
        package_code: pkgCode,
        planned_submission_date: plannedDate,
        description: desc,
        isValid,
        errorMsg,
      });
    }

    setParsedRows(rows);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  }

  function handlePastedText(text: string) {
    setCsvContent(text);
    parseCSV(text);
  }

  async function handleExecuteBatchImport() {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      toast.error("No valid document rows to import.");
      return;
    }

    setImporting(true);
    const supabase = createClient();

    try {
      // 1. Get default document type & current user
      const [{ data: docTypes }, { data: userData }] = await Promise.all([
        listDocumentTypesOfIdAndCode(),
        supabase.auth.getUser(),
      ]);

      const defaultTypeId = docTypes?.[0]?.id;
      const userId = userData?.user?.id;

      if (!defaultTypeId || !userId) {
        throw new Error("Unable to resolve project default document type or user credentials.");
      }

      let insertedCount = 0;
      let errorCount = 0;

      for (const row of validRows) {
        // Insert into documents table
        const { data: newDoc, error: docError } = await insertDocumentReturning({
            project_id: projectId,
            document_number: row.document_number,
            title: row.title,
            discipline: row.discipline,
            package_code: row.package_code,
            planned_submission_date: row.planned_submission_date || null,
            description: row.description || null,
            document_type_id: defaultTypeId,
            status: "draft",
            current_revision_code: "R00",
            current_revision: 0,
            created_by: userId,
          });

        if (docError) {
          errorCount++;
          continue;
        }

        // Insert initial document_revision record
        await insertDocumentRevision({
          document_id: newDoc.id,
          revision_code: "R00",
          revision_number: 0,
          suitability_code: "S0",
          status: "draft",
          is_latest: true,
          created_by: userId,
        });

        insertedCount++;
      }

      setImportStats({ total: validRows.length, inserted: insertedCount, errors: errorCount });
      toast.success(`MDR Ingestion complete: ${insertedCount} imported, ${errorCount} skipped.`);
      onSuccess();
    } catch (err: unknown) {
      toast.error("Batch import failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImporting(false);
    }
  }

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Master Document Register (MDR) Bulk Ingestion</h2>
              <p className="text-xs text-muted-foreground">
                Batch register drawing deliverables, engineering calculation sheets, and specifications.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Instructions banner */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-3">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
            <div>
              <p className="font-semibold mb-1">Standard Industry CSV / TSV Format:</p>
              <p className="font-mono text-[11px] bg-background/80 px-2 py-1 rounded border border-border">
                Document Number, Title, Discipline, Package Code, Planned Date (YYYY-MM-DD), Description
              </p>
              <p className="mt-1 text-muted-foreground">
                Example: <span className="font-mono">P001-ARC-DWG-001, Ground Floor Architectural Plan, ARC, C01, 2026-10-15, Issue for Consultant Review</span>
              </p>
            </div>
          </div>

          {/* Tab selector */}
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Button
              variant={activeTab === "paste" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("paste")}
              className="text-xs"
            >
              Paste CSV / Text
            </Button>
            <Button
              variant={activeTab === "upload" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveTab("upload")}
              className="text-xs"
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Upload .CSV File
            </Button>
          </div>

          {/* Paste area */}
          {activeTab === "paste" && (
            <div>
              <textarea
                value={csvContent}
                onChange={(e) => handlePastedText(e.target.value)}
                placeholder={`Paste your document list lines here...\nExample:\nP001-STR-DWG-101, Foundation Layout Plan, STR, C01, 2026-10-20, Substructure drawing\nP001-MEP-DWG-201, Drainage & Sewer Schematic, MEP, C02, 2026-10-25, Plumbing schematics`}
                rows={6}
                className="w-full font-mono text-xs rounded-xl border border-border bg-background p-3 outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          {/* Upload area */}
          {activeTab === "upload" && (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Drag & Drop or Choose your CSV file</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">UTF-8 encoded .csv files</p>
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-file-input"
              />
              <label htmlFor="csv-file-input">
                <Button variant="outline" size="sm" asChild className="cursor-pointer">
                  <span>Browse Local File</span>
                </Button>
              </label>
            </div>
          )}

          {/* Parsed summary badge */}
          {parsedRows.length > 0 && (
            <div className="flex items-center justify-between text-xs px-1">
              <div className="flex items-center gap-3">
                <span className="font-semibold text-foreground">
                  Detected: <span className="font-mono">{parsedRows.length}</span> rows
                </span>
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {validCount} ready
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1 text-red-500 font-medium">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {invalidCount} invalid
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCsvContent("");
                  setParsedRows([]);
                }}
                className="text-xs h-7 text-muted-foreground"
              >
                Clear
              </Button>
            </div>
          )}

          {/* Rows preview table */}
          {parsedRows.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground sticky top-0 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Doc Number</th>
                    <th className="px-3 py-2 font-medium">Title</th>
                    <th className="px-3 py-2 font-medium">Discipline</th>
                    <th className="px-3 py-2 font-medium">Pkg</th>
                    <th className="px-3 py-2 font-medium">Planned Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono text-[11px]">
                  {parsedRows.slice(0, 50).map((row, idx) => (
                    <tr key={idx} className={row.isValid ? "hover:bg-muted/20" : "bg-red-500/5 text-red-600"}>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        {row.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-sans text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> Valid
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500 font-sans text-[10px]" title={row.errorMsg}>
                            <AlertCircle className="h-3 w-3" /> {row.errorMsg}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-bold text-foreground">{row.document_number}</td>
                      <td className="px-3 py-1.5 truncate max-w-xs font-sans text-foreground">{row.title}</td>
                      <td className="px-3 py-1.5">{row.discipline}</td>
                      <td className="px-3 py-1.5">{row.package_code}</td>
                      <td className="px-3 py-1.5">{row.planned_submission_date || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedRows.length > 50 && (
                <div className="p-2 text-center text-xs text-muted-foreground bg-muted/20 border-t border-border">
                  Showing first 50 of {parsedRows.length} documents. All valid rows will be imported.
                </div>
              )}
            </div>
          )}

          {importStats && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-700">
              <p className="font-semibold">Batch Ingestion Succeeded!</p>
              <p>Successfully registered {importStats.inserted} documents into the MDR. {importStats.errors > 0 ? `${importStats.errors} skipped.` : ""}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-muted/20">
          <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleExecuteBatchImport}
            disabled={importing || validCount === 0}
            className="flex items-center gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ingesting {validCount} Documents...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                Commit Batch Ingestion ({validCount})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
