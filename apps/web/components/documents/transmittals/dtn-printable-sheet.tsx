"use client";

import { useRef } from "react";
import { Printer, Download, X, Building2, User, FileText, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TransmittalDocItem {
  id: string;
  document_number: string;
  title: string;
  revision_code?: string;
  sheet_size?: string;
  media_format?: string;
  copies_count?: number;
  notes?: string;
}

export interface DtnPrintableSheetProps {
  transmittal: {
    transmittal_code: string;
    project_code?: string;
    project_name?: string;
    issuer_name?: string;
    receiver_name?: string;
    subject?: string;
    sent_at?: string | null;
    issue_reason?: string;
    courier_tracking_no?: string | null;
    physical_copies_summary?: string | null;
    acknowledged_at?: string | null;
    acknowledged_by_name?: string | null;
  };
  documents: TransmittalDocItem[];
  onClose: () => void;
}

export function DtnPrintableSheet({
  transmittal,
  documents,
  onClose,
}: DtnPrintableSheetProps) {
  const printContainerRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  const reasonMap: Record<string, string> = {
    for_review: "For Review & Comment",
    for_approval: "For Formal Approval",
    for_construction: "Issued for Construction (IFC)",
    for_information: "For Information Only (FIO)",
    for_record: "For Record / Archive",
    for_tender: "For Tender / Procurement",
    for_fabrication: "For Fabrication / Shop Drawing",
  };

  const currentReason = transmittal.issue_reason || "for_review";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white text-black border border-gray-300 rounded-xl shadow-2xl overflow-hidden my-8 print:m-0 print:border-none print:shadow-none print:w-full print:max-w-none">
        {/* Action Header - Hidden when printing */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 bg-gray-50 print:hidden">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-700" />
            <h3 className="font-semibold text-sm text-gray-800">
              Document Transmittal Note (DTN) Preview
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs bg-gray-900 text-white hover:bg-gray-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Print / Save PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Formal DTN Printable Body */}
        <div ref={printContainerRef} className="p-8 space-y-6 text-sm print:p-6 print:text-xs">
          {/* Header Banner */}
          <div className="flex items-start justify-between border-b-2 border-black pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Project Document Management
              </p>
              <h1 className="text-xl font-bold tracking-tight mt-0.5">
                {transmittal.project_name || "DCOS Construction Project"}
              </h1>
              <p className="text-xs font-mono text-gray-600">
                Project Code: {transmittal.project_code || "P001"}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block border-2 border-black font-mono font-bold text-base px-3 py-1 bg-gray-50">
                DOCUMENT TRANSMITTAL NOTE
              </span>
              <p className="font-mono font-bold text-sm mt-1 text-black">
                {transmittal.transmittal_code}
              </p>
              <p className="text-xs text-gray-600">
                Date: {transmittal.sent_at ? new Date(transmittal.sent_at).toLocaleDateString() : new Date().toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* From / To Matrix */}
          <div className="grid grid-cols-2 gap-4 border border-gray-300 rounded p-4 bg-gray-50/50">
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 mb-1 flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" /> ISSUED BY (Sender):
              </p>
              <p className="font-bold text-sm">{transmittal.issuer_name || "Main Contractor"}</p>
              <p className="text-xs text-gray-600">Document Control Dept.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-gray-500 mb-1 flex items-center gap-1">
                <User className="h-3.5 w-3.5" /> TRANSMITTED TO (Recipient):
              </p>
              <p className="font-bold text-sm">{transmittal.receiver_name || "Client / Supervision Consultant"}</p>
              <p className="text-xs text-gray-600">Attn: Project Resident Engineer / Lead Consultant</p>
            </div>
          </div>

          {/* Subject & Reason For Issue */}
          <div className="border border-gray-300 rounded p-4 space-y-3">
            <div>
              <span className="text-xs font-bold uppercase text-gray-500 block">Subject:</span>
              <p className="font-medium mt-0.5">{transmittal.subject || "Transmittal of Design / Engineering Deliverables"}</p>
            </div>

            <div>
              <span className="text-xs font-bold uppercase text-gray-500 block mb-1.5">
                Purpose / Reason for Issue:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(reasonMap).map(([key, label]) => {
                  const isChecked = currentReason === key;
                  return (
                    <div key={key} className="flex items-center gap-1.5">
                      {isChecked ? (
                        <CheckSquare className="h-4 w-4 text-black shrink-0" />
                      ) : (
                        <Square className="h-4 w-4 text-gray-400 shrink-0" />
                      )}
                      <span className={isChecked ? "font-bold text-black" : "text-gray-600"}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {(transmittal.courier_tracking_no || transmittal.physical_copies_summary) && (
              <div className="pt-2 border-t border-gray-200 grid grid-cols-2 gap-4 text-xs">
                {transmittal.courier_tracking_no && (
                  <div>
                    <span className="text-gray-500 font-semibold">Dispatch / Tracking:</span>{" "}
                    <span className="font-mono">{transmittal.courier_tracking_no}</span>
                  </div>
                )}
                {transmittal.physical_copies_summary && (
                  <div>
                    <span className="text-gray-500 font-semibold">Physical Copies Package:</span>{" "}
                    <span>{transmittal.physical_copies_summary}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Schedule of Transmitted Documents */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Schedule of Attached Documents ({documents.length} Items)
            </h4>
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead className="bg-gray-100 font-semibold">
                <tr>
                  <th className="border border-gray-300 px-2 py-1.5 text-center w-10">Item</th>
                  <th className="border border-gray-300 px-3 py-1.5 text-left">Document Number</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-center w-16">Rev</th>
                  <th className="border border-gray-300 px-3 py-1.5 text-left">Document Title</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-center w-16">Format</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-center w-14">Size</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-center w-14">Copies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300 font-mono text-[11px]">
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-gray-300 p-4 text-center text-gray-500 font-sans">
                      No documents attached to this transmittal note.
                    </td>
                  </tr>
                ) : (
                  documents.map((doc, idx) => (
                    <tr key={doc.id || idx}>
                      <td className="border border-gray-300 px-2 py-1 text-center font-sans">{idx + 1}</td>
                      <td className="border border-gray-300 px-3 py-1 font-bold text-black">{doc.document_number}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center font-bold">{doc.revision_code || "R00"}</td>
                      <td className="border border-gray-300 px-3 py-1 font-sans text-gray-900">{doc.title}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center uppercase">{doc.media_format || "PDF"}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center">{doc.sheet_size || "A1"}</td>
                      <td className="border border-gray-300 px-2 py-1 text-center">{doc.copies_count || 1}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Acknowledgement of Receipt (AOR) Section */}
          <div className="border-2 border-black rounded p-4 space-y-3 bg-gray-50">
            <div className="flex items-center justify-between border-b border-gray-300 pb-2">
              <span className="font-bold text-xs uppercase tracking-wide">
                FORMAL ACKNOWLEDGEMENT OF RECEIPT (AOR)
              </span>
              <span className="text-[10px] text-gray-600 italic">
                Please sign, stamp, and return duplicate copy within 3 working days.
              </span>
            </div>

            <p className="text-xs text-gray-700 leading-relaxed">
              We hereby acknowledge receipt of the documents/drawings listed above in good order and satisfactory condition, subject to any noted remarks.
            </p>

            <div className="grid grid-cols-3 gap-6 pt-4 text-xs">
              <div className="space-y-8">
                <div>
                  <div className="border-b border-gray-400 pb-1 font-medium min-h-6">
                    {transmittal.acknowledged_by_name || ""}
                  </div>
                  <span className="text-[10px] text-gray-500 uppercase">Received By (Print Name)</span>
                </div>
                <div>
                  <div className="border-b border-gray-400 pb-1 font-mono min-h-6">
                    {transmittal.acknowledged_at ? new Date(transmittal.acknowledged_at).toLocaleDateString() : ""}
                  </div>
                  <span className="text-[10px] text-gray-500 uppercase">Date of Receipt</span>
                </div>
              </div>

              <div>
                <div className="border-b border-gray-400 pb-1 min-h-20 flex items-end">
                  {transmittal.acknowledged_at && (
                    <span className="text-xs font-mono text-emerald-700 font-bold">
                      ✓ Digitally Acknowledged
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-gray-500 uppercase block mt-1">Authorized Signature</span>
              </div>

              <div className="border-2 border-dashed border-gray-400 rounded h-24 flex items-center justify-center text-center p-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                  Official Company / Consultant Stamp
                </span>
              </div>
            </div>
          </div>

          {/* Footer notice */}
          <div className="text-[10px] text-gray-500 text-center pt-2">
            Generated via DCOS Document Control System · ISO 19650 Common Data Environment (CDE) Audit Compliant
          </div>
        </div>
      </div>
    </div>
  );
}
