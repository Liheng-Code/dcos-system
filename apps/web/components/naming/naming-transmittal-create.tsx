"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Send, Save, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";

interface TransmittalCreateProps {
  onClose: () => void;
  onCreated: () => void;
}

interface Company {
  id: string;
  code: string;
  name: string;
}

interface StakeholderAbbr {
  stakeholder_id: string;
  organization_name: string;
  abbreviation: string;
}

interface ProjectDocument {
  id: string;
  document_number: string;
  title: string;
  doc_type_code?: string;
}

export function TransmittalCreate({ onClose, onCreated }: TransmittalCreateProps) {
  const supabase = createClient();
  const { selectedProjectId, selectedProject } = useProject();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [receivers, setReceivers] = useState<StakeholderAbbr[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [currentUserCompanyId, setCurrentUserCompanyId] = useState<string>("");

  const [issuerCompanyId, setIssuerCompanyId] = useState("");
  const [receiverStakeholderId, setReceiverStakeholderId] = useState("");
  const [subject, setSubject] = useState("");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  const issuerCode = companies.find((c) => c.id === issuerCompanyId)?.code ?? "CMED";
  const receiverAbbr = receivers.find((r) => r.stakeholder_id === receiverStakeholderId)?.abbreviation ?? "XXXX";

  useEffect(() => {
    if (!selectedProjectId) { setLoading(false); return; }
    Promise.all([
      supabase.from("companies").select("id, code, name").order("code"),
      supabase
        .from("stakeholder_abbreviations")
        .select("stakeholder_id, abbreviation, stakeholders!inner(organization_name)")
        .order("abbreviation"),
      supabase.from("documents").select("id, document_number, title").eq("project_id", selectedProjectId).order("document_number"),
      supabase.auth.getUser().then(({ data }) => data.user?.id).then((uid) => {
        if (!uid) return null;
        return supabase.from("profiles").select("company_id").eq("id", uid).single();
      }),
    ]).then(([compRes, recRes, docRes, userRes]) => {
      if (compRes.data) setCompanies(compRes.data as Company[]);
      if (recRes.data) {
        const mapped = (recRes.data as unknown as { stakeholder_id: string; abbreviation: string; stakeholders: { organization_name: string } }[]).map((r) => ({
          stakeholder_id: r.stakeholder_id,
          abbreviation: r.abbreviation,
          organization_name: r.stakeholders?.organization_name ?? "",
        }));
        setReceivers(mapped);
      }
      if (docRes.data) setDocuments(docRes.data as ProjectDocument[]);
      if (userRes?.data?.company_id) {
        setCurrentUserCompanyId(userRes.data.company_id as string);
        setIssuerCompanyId(userRes.data.company_id as string);
      }
      setLoading(false);
    });
  }, [selectedProjectId, supabase]);

  const projectCode = selectedProject?.project_code ?? "P001";
  const [nextSeq, setNextSeq] = useState(1);

  useEffect(() => {
    if (!selectedProjectId) return;
    supabase
      .from("transmittal_running_numbers")
      .select("last_sequence")
      .eq("project_id", selectedProjectId)
      .maybeSingle()
      .then(({ data }) => {
        setNextSeq(data ? (data.last_sequence as number) + 1 : 1);
      });
  }, [selectedProjectId, supabase]);

  const transmittalCode = `${projectCode}-DT-${issuerCode}-${receiverAbbr}-${String(nextSeq).padStart(3, "0")}`;

  function toggleDoc(id: string) {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  }

  async function handleSave(status: "draft" | "sent") {
    if (!selectedProjectId) { toast.error("No project selected"); return; }
    if (!issuerCompanyId) { toast.error("Select issuing company"); return; }
    if (!receiverStakeholderId) { toast.error("Select receiving party"); return; }

    setSaving(true);
    const uid = (await supabase.auth.getUser()).data.user?.id;
    if (!uid) { toast.error("Not authenticated"); setSaving(false); return; }

    const payload = {
      project_id: selectedProjectId,
      transmittal_code: transmittalCode,
      issuer_company_id: issuerCompanyId,
      receiver_stakeholder_id: receiverStakeholderId,
      subject: subject || null,
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      created_by: uid,
    };

    const { data, error } = await supabase.from("transmittals").insert(payload).select().single();
    if (error) { toast.error(error.message); setSaving(false); return; }

    if (selectedDocIds.length > 0) {
      const docLinks = selectedDocIds.map((docId) => ({
        transmittal_id: data.id,
        document_id: docId,
      }));
      await supabase.from("transmittal_documents").insert(docLinks);
    }

    await supabase.from("transmittal_running_numbers").upsert(
      { project_id: selectedProjectId, last_sequence: nextSeq },
      { onConflict: "project_id" }
    );

    toast.success(`Transmittal ${status === "sent" ? "sent" : "saved as draft"}`);
    setSaving(false);
    onCreated();
    onClose();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">New Transmittal</h3>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">Auto-Generated Transmittal Code</span>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 font-mono text-sm break-all text-center">
          {transmittalCode}
        </div>
        <div className="flex justify-center gap-4 text-[10px] text-muted-foreground font-mono">
          <span>↑ {projectCode}</span>
          <span>↑ DT</span>
          <span>↑ {issuerCode}</span>
          <span>↑ {receiverAbbr}</span>
          <span>↑ {String(nextSeq).padStart(3, "0")}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Issuing Company *</Label>
          <select
            value={issuerCompanyId}
            onChange={(e) => setIssuerCompanyId(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
          >
            <option value="">— Select —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Receiving Party *</Label>
          <select
            value={receiverStakeholderId}
            onChange={(e) => setReceiverStakeholderId(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
          >
            <option value="">— Select —</option>
            {receivers.map((r) => (
              <option key={r.stakeholder_id} value={r.stakeholder_id}>{r.abbreviation} — {r.organization_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Subject</Label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-hidden focus:border-primary"
          placeholder="e.g. Transmittal of Architectural & Structural drawings"
        />
      </div>

      <div className="space-y-2">
        <Label>Attached Documents ({selectedDocIds.length} selected)</Label>
        <div className="rounded-xl border divide-y max-h-48 overflow-y-auto">
          {documents.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No documents found for this project</div>
          ) : (
            documents.map((doc) => (
              <label key={doc.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/20 text-xs">
                <input
                  type="checkbox"
                  checked={selectedDocIds.includes(doc.id)}
                  onChange={() => toggleDoc(doc.id)}
                  className="h-3.5 w-3.5 rounded border-border accent-foreground"
                />
                <span className="font-mono font-medium">{doc.document_number}</span>
                <span className="text-muted-foreground truncate">{doc.title}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
        <Button variant="outline" onClick={() => handleSave("draft")} disabled={saving} className="rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save as Draft
        </Button>
        <Button onClick={() => handleSave("sent")} disabled={saving} className="rounded-xl">
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
          Send
        </Button>
      </div>
    </div>
  );
}
