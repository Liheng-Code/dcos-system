"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams } from "next/navigation";
import { getDocumentVerificationPayload, listDocumentRevisionsByDocumentIdOrderedByCreatedAt } from "@/lib/documents/documents-queries";
import {
  CheckCircle2,
  AlertOctagon,
  Clock,
  ShieldAlert,
  FileText,
  Loader2,
  Building2,
  Download,
  Printer,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VerificationPayload {
  valid?: boolean;
  error?: string;
  document_id: string;
  document_number: string;
  title: string;
  discipline: string | null;
  status: string;
  current_revision_code: string;
  is_ifc: boolean;
  project_code: string;
  project_name: string;
  latest_revision_id: string | null;
  latest_revision_code: string | null;
  latest_suitability: string | null;
  latest_review_code: string | null;
  latest_issued_at: string | null;
}

interface RevisionItem {
  id: string;
  revision_code: string;
  suitability_code: string | null;
  sheet_size: string | null;
  status: string;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  is_latest: boolean;
}

export default function DocumentVerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const docId = resolvedParams.id;
  const searchParams = useSearchParams();
  const copyQuery = searchParams.get("copy");

  const [data, setData] = useState<VerificationPayload | null>(null);
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    Promise.all([
      getDocumentVerificationPayload({ p_doc_id: docId }),
      listDocumentRevisionsByDocumentIdOrderedByCreatedAt(docId),
    ]).then(([rpcRes, revRes]) => {
      if (rpcRes.data && !rpcRes.error) {
        setData(rpcRes.data as VerificationPayload);
      }
      if (revRes.data && !revRes.error) {
        setRevisions(revRes.data as RevisionItem[]);
      }
      setLoading(false);
    });
  }, [docId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-slate-600">Verifying document status from DCOS CDE...</p>
        </div>
      </div>
    );
  }

  if (!data || data.valid === false || data.error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 border border-slate-200 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 mb-4">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Document Not Found</h1>
          <p className="text-sm text-slate-500 mt-2">
            The scanned QR code reference does not exist or has been removed from DCOS.
          </p>
        </div>
      </div>
    );
  }

  const isSuperseded = data.status === "superseded";
  const isIFC = data.status === "ifc" || data.latest_review_code === "code_a";
  const isRejected =
    data.status === "rejected" || data.latest_review_code === "code_c" || data.latest_review_code === "code_d";

  const latestFileUrl = revisions.find((r) => r.is_latest)?.file_url;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Status Header Banner */}
        {isIFC ? (
          <div className="bg-emerald-600 p-6 text-white text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/40 text-white mb-3">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-wider">VALID FOR CONSTRUCTION</h2>
            <p className="text-xs font-medium text-emerald-100 mt-1">
              Authorized Controlled Copy • Approved for site execution
            </p>
            {copyQuery && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-800/60 px-3 py-1 text-xs font-mono font-bold text-emerald-200">
                <Printer className="h-3 w-3" /> Copy #{copyQuery}
              </div>
            )}
          </div>
        ) : isSuperseded ? (
          <div className="bg-red-600 p-6 text-white text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/40 text-white mb-3">
              <AlertOctagon className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-wider">VOID — SUPERSEDED</h2>
            <p className="text-xs font-semibold text-red-100 mt-1">
              DO NOT USE ON SITE • A newer revision has been issued
            </p>
            <p className="text-xs font-bold text-white mt-2 bg-red-700/80 rounded px-2.5 py-1 inline-block">
              Current Active Revision: {data.current_revision_code}
            </p>
          </div>
        ) : isRejected ? (
          <div className="bg-amber-600 p-6 text-white text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/40 text-white mb-3">
              <AlertOctagon className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-wider">REJECTED / UNAPPROVED</h2>
            <p className="text-xs font-semibold text-amber-100 mt-1">
              Revise &amp; Resubmit required • Work must not proceed
            </p>
          </div>
        ) : (
          <div className="bg-blue-600 p-6 text-white text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/40 text-white mb-3">
              <Clock className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-wider">FOR REVIEW ONLY</h2>
            <p className="text-xs font-medium text-blue-100 mt-1">
              Not yet issued for construction • Subject to consultant review
            </p>
          </div>
        )}

        {/* Verification Details */}
        <div className="p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <Building2 className="h-3.5 w-3.5" />
              <span>Project</span>
            </div>
            <p className="text-base font-bold text-slate-900 mt-0.5">
              {data.project_name} ({data.project_code})
            </p>
          </div>

          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5" />
              <span>Document Details</span>
            </div>
            <p className="text-lg font-black font-mono text-slate-900 mt-0.5">
              {data.document_number}
            </p>
            <p className="text-sm font-medium text-slate-700 mt-1">
              {data.title}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Valid Revision</p>
              <p className="text-lg font-black font-mono text-slate-900 mt-0.5">
                {data.current_revision_code || "R00"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Discipline</p>
              <p className="text-base font-bold text-slate-900 mt-0.5">
                {data.discipline || "General"}
              </p>
            </div>
          </div>

          {data.latest_issued_at && (
            <div className="border-b border-slate-100 pb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Issued / Uploaded Date</p>
              <p className="text-sm font-medium text-slate-700 mt-0.5">
                {new Date(data.latest_issued_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          )}

          {/* Mobile Instant Download Button for Field Engineers */}
          {latestFileUrl && (
            <a
              href={latestFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-sm font-bold shadow-md transition-colors",
                isIFC ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-primary hover:bg-primary/90 text-white"
              )}
            >
              <Download className="h-4 w-4" />
              Download Latest Active Drawing ({data.current_revision_code})
            </a>
          )}

          {/* Revision History Collapsible */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex w-full items-center justify-between py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              <span>Revision History ({revisions.length})</span>
              {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showHistory && (
              <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                {revisions.map((rev) => (
                  <div key={rev.id} className="p-2.5 flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{rev.revision_code}</span>
                        {rev.suitability_code && (
                          <span className="rounded bg-white border border-slate-200 px-1.5 py-0.2 font-mono text-[10px] text-slate-600">
                            {rev.suitability_code}
                          </span>
                        )}
                        {rev.is_latest && (
                          <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.2 text-[10px] font-bold">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {new Date(rev.created_at).toLocaleDateString()} • {rev.status.replace(/_/g, " ")}
                      </p>
                    </div>

                    {rev.file_url && (
                      <a
                        href={rev.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" /> File
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 text-center">
              <p className="text-xs text-slate-600 font-mono font-semibold">
                DCOS Electronic Document Management System
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                ISO 19650 Common Data Environment • Live Field Verification
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
