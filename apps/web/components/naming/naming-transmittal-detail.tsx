"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, X, ArrowLeft, Send, FileText, Building2, User, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

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
}

interface TransmittalDoc {
  id: string;
  document_id: string;
  document_number: string;
  title: string;
}

export function TransmittalDetail({ transmittalId, projectId, onClose }: TransmittalDetailProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [transmittal, setTransmittal] = useState<Transmittal | null>(null);
  const [docs, setDocs] = useState<TransmittalDoc[]>([]);
  const [issuerName, setIssuerName] = useState("");
  const [receiverName, setReceiverName] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("transmittals").select("*").eq("id", transmittalId).single(),
      supabase
        .from("transmittal_documents")
        .select("id, document_id, documents!inner(document_number, title)")
        .eq("transmittal_id", transmittalId),
    ]).then(([tRes, dRes]) => {
      if (tRes.data) {
        const t = tRes.data as Transmittal;
        setTransmittal(t);
        supabase.from("companies").select("name").eq("id", t.issuer_company_id).single().then(({ data }) => {
          if (data) setIssuerName((data as { name: string }).name);
        });
        supabase.from("stakeholders").select("organization_name").eq("id", t.receiver_stakeholder_id).single().then(({ data }) => {
          if (data) setReceiverName((data as { organization_name: string }).organization_name);
        });
      }
      if (dRes.data) {
        setDocs((dRes.data as unknown as { id: string; document_id: string; documents: { document_number: string; title: string } }[]).map((d) => ({
          id: d.id,
          document_id: d.document_id,
          document_number: d.documents.document_number,
          title: d.documents.title,
        })));
      }
      setLoading(false);
    });
  }, [transmittalId, supabase]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onClose}><ArrowLeft className="h-4 w-4" /></Button>
          <h3 className="text-lg font-semibold font-mono">{transmittal.transmittal_code}</h3>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
            transmittal.status === "sent"
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
              : "bg-gray-500/10 text-gray-500 border-gray-200"
          }`}>
            {transmittal.status}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">From</span>
          </div>
          <p className="text-sm">{issuerName || "—"}</p>
          {transmittal.sent_at && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Sent: {new Date(transmittal.sent_at).toLocaleString()}
            </div>
          )}
        </div>
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">To</span>
          </div>
          <p className="text-sm">{receiverName || "—"}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            Created: {new Date(transmittal.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {transmittal.subject && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Subject</p>
          <p className="text-sm">{transmittal.subject}</p>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="text-sm font-medium">Attached Documents ({docs.length})</h4>
        <div className="rounded-xl border divide-y">
          {docs.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No documents attached</div>
          ) : (
            docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 px-3 py-2.5 text-xs">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono font-medium">{d.document_number}</span>
                <span className="text-muted-foreground">{d.title}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
