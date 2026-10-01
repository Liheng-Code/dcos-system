"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  X,
  Loader2,
  Printer,
  Download,
  QrCode,
  ShieldCheck,
  Building2,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { stampPdfDocument, generateQrPngDataUrl } from "@/lib/documents/document-stamping";
import type { DocumentRecord } from "./document-edit-sheet";

interface PrintLog {
  id: string;
  document_revision_id: string;
  printed_by: string | null;
  copy_number: number;
  issued_to_party: string;
  is_controlled_copy: boolean;
  issued_at: string;
  recalled_at: string | null;
  recall_reason: string | null;
  profiles?: { full_name: string } | null;
}

interface DocumentStampModalProps {
  document: DocumentRecord;
  projectCode?: string;
  projectName?: string;
  onClose: () => void;
}

export function DocumentStampModal({
  document,
  projectCode = "P001",
  projectName = "Active Project",
  onClose,
}: DocumentStampModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [printLogs, setPrintLogs] = useState<PrintLog[]>([]);
  const [latestRevision, setLatestRevision] = useState<{ id: string; revision_code: string; file_url: string | null; file_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [stamping, setStamping] = useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string>("");

  // Form states for new controlled copy
  const [issuedToParty, setIssuedToParty] = useState("Site Execution Team A");
  const [copyNumber, setCopyNumber] = useState(1);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  const [recallReason, setRecallReason] = useState("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const verifyUrl = `${baseUrl}/verify/doc/${document.id}`;

  function fetchRevisionAndLogs() {
    setLoading(true);
    supabase
      .from("document_revisions")
      .select("id, revision_code, file_url, file_name, is_latest")
      .eq("document_id", document.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data: revData }) => {
        if (revData) {
          setLatestRevision(revData);
          const { data: logsData } = await supabase
            .from("document_print_logs")
            .select("*, profiles:printed_by(full_name)")
            .eq("document_revision_id", revData.id)
            .order("copy_number", { ascending: true });

          if (logsData) {
            setPrintLogs(logsData as PrintLog[]);
            setCopyNumber(logsData.length + 1);
          }
        }
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchRevisionAndLogs();
    generateQrPngDataUrl(verifyUrl).then(setQrPreviewUrl);
  }, [document.id, verifyUrl, supabase]);

  async function handleStampAndDownload() {
    if (!latestRevision?.file_url) {
      toast.error("No file attachment found for this document revision.");
      return;
    }

    setStamping(true);
    try {
      // 1. Fetch source PDF
      const response = await fetch(latestRevision.file_url);
      if (!response.ok) {
        throw new Error("Unable to fetch original PDF file from storage.");
      }
      const pdfArrayBuffer = await response.arrayBuffer();

      // 2. Apply stamp & QR watermark client-side
      const stampedPdfBytes = await stampPdfDocument(pdfArrayBuffer, {
        documentId: document.id,
        documentNumber: document.document_number,
        title: document.title,
        revisionCode: latestRevision.revision_code || "R00",
        status: document.status,
        reviewCode: document.review_code,
        projectCode,
        projectName,
        copyNumber,
        issuedToParty,
        baseUrl,
      });

      // 3. Log controlled copy print in database
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("document_print_logs").insert({
        document_revision_id: latestRevision.id,
        printed_by: userData.user?.id,
        copy_number: copyNumber,
        issued_to_party: issuedToParty.trim(),
        is_controlled_copy: true,
      });

      // 4. Trigger browser download of stamped copy
      const blob = new Blob([stampedPdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const downloadLink = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = downloadLink;
      a.download = `${document.document_number}_${latestRevision.revision_code || "R00"}_COPY_${String(copyNumber).padStart(2, "0")}.pdf`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadLink);

      toast.success(`Controlled Copy #${copyNumber} generated and downloaded!`);
      fetchRevisionAndLogs();
    } catch (err: unknown) {
      toast.error("PDF Stamping Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setStamping(false);
    }
  }

  async function handleRecallCopy(logId: string) {
    if (!recallReason.trim()) {
      toast.error("Please provide a recall reason (e.g. Superseded by Revision R02)");
      return;
    }

    const { error } = await supabase
      .from("document_print_logs")
      .update({
        recalled_at: new Date().toISOString(),
        recall_reason: recallReason.trim(),
      })
      .eq("id", logId);

    if (error) {
      toast.error("Failed to recall copy: " + error.message);
    } else {
      toast.success("Controlled physical copy marked as RECALLED from site.");
      setRecallingId(null);
      setRecallReason("");
      fetchRevisionAndLogs();
    }
  }

  const isIFC = document.status === "ifc" || document.review_code === "code_a";
  const isSuperseded = document.status === "superseded";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-background rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Controlled Copy &amp; QR Stamping</h2>
              <p className="text-xs text-muted-foreground font-mono">
                {document.document_number} • Rev {latestRevision?.revision_code || "R00"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Live Stamp Visual Mockup */}
          <div className="rounded-xl border border-border p-4 bg-slate-50 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span>Title Block Stamp Preview</span>
              <a
                href={verifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 font-normal lowercase"
              >
                test scan url <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {/* Stamp Box */}
            <div
              className={cn(
                "rounded-lg border-2 p-3 bg-white shadow-xs max-w-md mx-auto transition-colors",
                isIFC ? "border-emerald-600" : isSuperseded ? "border-red-600" : "border-blue-600"
              )}
            >
              <div
                className={cn(
                  "text-center py-1 text-[10px] font-black uppercase tracking-wider text-white rounded mb-2.5",
                  isIFC ? "bg-emerald-600" : isSuperseded ? "bg-red-600" : "bg-blue-600"
                )}
              >
                {isIFC
                  ? "CONTROLLED COPY • ISSUED FOR CONSTRUCTION"
                  : isSuperseded
                  ? "VOID • SUPERSEDED DRAWING"
                  : "CONTROLLED DOCUMENT • FOR REVIEW ONLY"}
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1 text-xs">
                  <p className="font-mono font-bold text-slate-900">{document.document_number}</p>
                  <p className="text-[11px] font-semibold text-slate-700">
                    REV: {latestRevision?.revision_code || "R00"} | COPY #{String(copyNumber).padStart(2, "0")}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    ISSUED TO: {issuedToParty}
                  </p>
                </div>

                {qrPreviewUrl && (
                  <div className="flex flex-col items-center">
                    <img src={qrPreviewUrl} alt="QR Code" className="h-16 w-16 border rounded p-0.5 bg-white" />
                    <span className="text-[9px] font-bold text-slate-500 mt-0.5">SCAN TO VERIFY</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Issue Controlled Copy Form */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">Issue New Physical Controlled Copy</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Copy Number</label>
                <input
                  type="number"
                  min={1}
                  value={copyNumber}
                  onChange={(e) => setCopyNumber(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-hidden focus:border-primary font-mono"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-xs font-medium text-foreground">Issued to Party / Subcontractor</label>
                <input
                  value={issuedToParty}
                  onChange={(e) => setIssuedToParty(e.target.value)}
                  placeholder="e.g. Civil Contractor - Site Engineer Team"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-hidden focus:border-primary"
                />
              </div>
            </div>

            <Button
              onClick={handleStampAndDownload}
              disabled={stamping || !latestRevision?.file_url}
              className="w-full"
            >
              {stamping ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Generate &amp; Download Stamped Controlled PDF (Copy #{copyNumber})
            </Button>
          </div>

          {/* Active Controlled Copies Distribution Register */}
          <div className="space-y-2 pt-2 border-t border-border">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Controlled Copies Distribution Log ({printLogs.length})
            </h3>

            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : printLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                No physical controlled copies logged for this revision yet.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {printLogs.map((log) => {
                  const isRecalled = !!log.recalled_at;
                  return (
                    <div key={log.id} className="p-3 flex items-center justify-between text-xs gap-3">
                      <div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-foreground">Copy #{log.copy_number}</span>
                          <span className="text-muted-foreground">— {log.issued_to_party}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Issued: {new Date(log.issued_at).toLocaleDateString()}
                          {log.profiles?.full_name && ` by ${log.profiles.full_name}`}
                        </p>
                        {isRecalled && (
                          <p className="text-[11px] text-red-600 mt-0.5 font-medium">
                            Recalled on {new Date(log.recalled_at!).toLocaleDateString()}: {log.recall_reason}
                          </p>
                        )}
                      </div>

                      <div>
                        {isRecalled ? (
                          <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-bold">
                            Recalled
                          </span>
                        ) : recallingId === log.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              value={recallReason}
                              onChange={(e) => setRecallReason(e.target.value)}
                              placeholder="Reason for recall..."
                              className="rounded border border-border px-2 py-1 text-[11px] outline-hidden w-40"
                            />
                            <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={() => handleRecallCopy(log.id)}>
                              Confirm Recall
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1" onClick={() => setRecallingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-amber-700 hover:bg-amber-50"
                            onClick={() => {
                              setRecallingId(log.id);
                              setRecallReason(`Superseded by Revision`);
                            }}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Recall Copy
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 bg-background flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
