"use client";

import { useEffect, useState, useCallback } from "react";
import { getCompanyById, getProjectById, getStakeholderById, getTransmittalById, listDocumentRevisionsByDocumentIdsWithIsLatest, listTransmittalDocumentsByTransmittalId, updateTransmittalById } from "@/lib/naming/naming-queries";
import {
  Loader2,
  X,
  ArrowLeft,
  Send,
  FileText,
  Building2,
  User,
  Clock,
  Printer,
  CheckCircle2,
  FileSignature,
  Truck,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DtnPrintableSheet, type TransmittalDocItem } from "@/components/documents/transmittals/dtn-printable-sheet";

interface TransmittalDetailProps {
  transmittalId: string;
  projectId: string;
  onClose: () => void;
}

interface Transmittal {
  id: string;
  transmittal_code: string;
  issuer_company_id: string;
  receiver_stakeholder_id: string;
  subject: string;
  status: string;
  sent_at: string;
  created_by: string;
  created_at: string;
  issue_reason?: string;
  requires_acknowledgement?: boolean;
  acknowledgement_due_date?: string | null;
  acknowledged_at?: string | null;
  acknowledged_by_name?: string | null;
  signed_aor_file_url?: string | null;
  courier_tracking_no?: string | null;
  physical_copies_summary?: string | null;
}

export function TransmittalDetail({ transmittalId, projectId, onClose }: TransmittalDetailProps) {
  const [loading, setLoading] = useState(true);
  const [transmittal, setTransmittal] = useState<Transmittal | null>(null);
  const [docs, setDocs] = useState<TransmittalDocItem[]>([]);
  const [issuerName, setIssuerName] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [projectCode, setProjectCode] = useState("P001");
  const [projectName, setProjectName] = useState("Active Project");

  // DTN & AOR Modal States
  const [showDtnPrint, setShowDtnPrint] = useState(false);
  const [showAorModal, setShowAorModal] = useState(false);
  const [aorReceiverName, setAorReceiverName] = useState("");
  const [savingAor, setSavingAor] = useState(false);

  const fetchTransmittalData = useCallback(async () => {
    setLoading(true);
    const [tRes, dRes, pRes] = await Promise.all([
      getTransmittalById(transmittalId),
      listTransmittalDocumentsByTransmittalId(transmittalId),
      getProjectById(projectId, "project_code, name"),
    ]);

    if (tRes.data) {
      const t = tRes.data as Transmittal;
      setTransmittal(t);
      if (t.acknowledged_by_name) setAorReceiverName(t.acknowledged_by_name);

      getCompanyById(t.issuer_company_id, "name").then(({ data }) => {
        if (data) setIssuerName((data as { name: string }).name);
      });
      getStakeholderById(t.receiver_stakeholder_id).then(({ data }) => {
        if (data) setReceiverName((data as { organization_name: string }).organization_name);
      });
    }

    if (pRes.data) {
      setProjectCode((pRes.data as { project_code: string }).project_code);
      setProjectName((pRes.data as { name: string }).name);
    }

    if (dRes.data) {
      const docIds = (dRes.data as unknown as { document_id: string }[]).map((d) => d.document_id);
      let revMap: Record<string, { sheet_size: string; revision_code: string }> = {};

      if (docIds.length > 0) {
        const { data: revs } = await listDocumentRevisionsByDocumentIdsWithIsLatest(docIds);

        if (revs) {
          for (const r of revs as { document_id: string; sheet_size: string; revision_code: string }[]) {
            revMap[r.document_id] = { sheet_size: r.sheet_size, revision_code: r.revision_code };
          }
        }
      }

      setDocs(
        (dRes.data as unknown as {
          id: string;
          document_id: string;
          copies_count: number;
          media_format: string;
          notes: string;
          documents: { id: string; document_number: string; title: string; current_revision_code: string };
        }[]).map((d) => ({
          id: d.id,
          document_number: d.documents.document_number,
          title: d.documents.title,
          revision_code: revMap[d.document_id]?.revision_code || d.documents.current_revision_code || "R00",
          sheet_size: revMap[d.document_id]?.sheet_size || "A1",
          media_format: d.media_format || "PDF",
          copies_count: d.copies_count || 1,
          notes: d.notes,
        }))
      );
    }

    setLoading(false);
  }, [transmittalId, projectId]);

  useEffect(() => {
    fetchTransmittalData();
  }, [fetchTransmittalData]);

  async function handleAcknowledgeReceipt() {
    if (!aorReceiverName.trim()) {
      toast.error("Please enter the name of the recipient who acknowledged receipt.");
      return;
    }

    setSavingAor(true);
    try {
      const { error } = await updateTransmittalById({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by_name: aorReceiverName.trim(),
        }, transmittalId);

      if (error) throw error;

      toast.success("Acknowledgement of Receipt (AOR) recorded!");
      setShowAorModal(false);
      fetchTransmittalData();
    } catch (err: unknown) {
      toast.error("Failed to record AOR: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingAor(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!transmittal) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Transmittal not found</div>;
  }

  const reasonLabels: Record<string, string> = {
    for_review: "For Review & Comment",
    for_approval: "For Formal Approval",
    for_construction: "Issued for Construction (IFC)",
    for_information: "For Information Only (FIO)",
    for_record: "For Record / Archive",
    for_tender: "For Tender",
    for_fabrication: "For Fabrication",
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold font-mono">{transmittal.transmittal_code}</h3>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  transmittal.status === "sent"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                    : "bg-gray-500/10 text-gray-500 border-gray-200"
                }`}
              >
                {transmittal.status.toUpperCase()}
              </span>
              <span className="rounded-full bg-blue-500/10 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-medium">
                {reasonLabels[transmittal.issue_reason || "for_review"] || transmittal.issue_reason}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Project: {projectCode} · {projectName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDtnPrint(true)}
            className="flex items-center gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
          >
            <Printer className="h-3.5 w-3.5" />
            Print / Export DTN Slip
          </Button>

          {!transmittal.acknowledged_at ? (
            <Button
              size="sm"
              onClick={() => setShowAorModal(true)}
              className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <FileSignature className="h-3.5 w-3.5" />
              Sign / Acknowledge Receipt (AOR)
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="h-4 w-4" />
              AOR Signed by {transmittal.acknowledged_by_name}
            </span>
          )}

          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* From / To Info Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
            <Building2 className="h-4 w-4 text-primary" />
            <span>Issued By (Sender)</span>
          </div>
          <p className="text-sm font-bold text-foreground">{issuerName || "—"}</p>
          {transmittal.sent_at && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Sent: {new Date(transmittal.sent_at).toLocaleString()}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase">
            <User className="h-4 w-4 text-primary" />
            <span>Transmitted To (Recipient)</span>
          </div>
          <p className="text-sm font-bold text-foreground">{receiverName || "—"}</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Created: {new Date(transmittal.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Subject & Shipping details */}
      <div className="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Subject</p>
          <p className="text-sm font-medium">{transmittal.subject || "Transmittal of Design / Engineering Deliverables"}</p>
        </div>

        {(transmittal.courier_tracking_no || transmittal.physical_copies_summary) && (
          <div className="grid grid-cols-2 gap-4 pt-3 border-t text-xs">
            {transmittal.courier_tracking_no && (
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span>
                  <strong className="text-foreground">Tracking / Waybill:</strong>{" "}
                  <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{transmittal.courier_tracking_no}</code>
                </span>
              </div>
            )}
            {transmittal.physical_copies_summary && (
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span>
                  <strong className="text-foreground">Physical Hardcopies:</strong> {transmittal.physical_copies_summary}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attached Documents Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Attached Deliverables ({docs.length})</h4>
          <span className="text-xs text-muted-foreground">ISO 19650 Registered Documents</span>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden shadow-xs">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground border-b uppercase text-[10px]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Doc Number</th>
                <th className="px-4 py-2.5 font-semibold">Rev</th>
                <th className="px-4 py-2.5 font-semibold">Title</th>
                <th className="px-4 py-2.5 font-semibold">Format</th>
                <th className="px-4 py-2.5 font-semibold">Size</th>
                <th className="px-4 py-2.5 font-semibold text-center">Copies</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-sm text-muted-foreground text-center">
                    No documents attached
                  </td>
                </tr>
              ) : (
                docs.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-mono font-bold text-foreground">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        {d.document_number}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-primary">{d.revision_code || "R00"}</td>
                    <td className="px-4 py-2.5 max-w-sm truncate text-foreground">{d.title}</td>
                    <td className="px-4 py-2.5 uppercase font-mono">{d.media_format || "PDF"}</td>
                    <td className="px-4 py-2.5 font-mono">{d.sheet_size || "A1"}</td>
                    <td className="px-4 py-2.5 text-center font-mono font-semibold">{d.copies_count || 1}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DTN Print Modal */}
      {showDtnPrint && (
        <DtnPrintableSheet
          transmittal={{
            transmittal_code: transmittal.transmittal_code,
            project_code: projectCode,
            project_name: projectName,
            issuer_name: issuerName,
            receiver_name: receiverName,
            subject: transmittal.subject,
            sent_at: transmittal.sent_at,
            issue_reason: transmittal.issue_reason,
            courier_tracking_no: transmittal.courier_tracking_no,
            physical_copies_summary: transmittal.physical_copies_summary,
            acknowledged_at: transmittal.acknowledged_at,
            acknowledged_by_name: transmittal.acknowledged_by_name,
          }}
          documents={docs}
          onClose={() => setShowDtnPrint(false)}
        />
      )}

      {/* Acknowledgment of Receipt (AOR) Modal */}
      {showAorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-background border rounded-2xl shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FileSignature className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold text-sm">Acknowledgement of Receipt (AOR)</h3>
              </div>
              <button onClick={() => setShowAorModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Confirm that the physical / digital drawings for <strong className="font-mono">{transmittal.transmittal_code}</strong> were handed over and accepted.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Recipient Signer Name *</label>
              <input
                type="text"
                placeholder="e.g. John Doe (Site Resident Engineer)"
                value={aorReceiverName}
                onChange={(e) => setAorReceiverName(e.target.value)}
                className="w-full text-xs rounded-xl border border-border bg-background p-2.5 outline-hidden focus:border-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowAorModal(false)} disabled={savingAor}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAcknowledgeReceipt}
                disabled={savingAor}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {savingAor ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Confirm Receipt
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
