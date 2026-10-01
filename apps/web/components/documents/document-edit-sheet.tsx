"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, Save, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { insertDocumentRevision, insertDocumentsReturning, listDocumentTypesWithIsActive, listProjects, listWbsNodesByProjectId, updateDocumentById, updateDocumentByIdReturning } from "@/lib/documents/documents-queries";

interface DocumentType {
  id: string;
  code: string;
  name: string;
}

interface Project {
  id: string;
  project_code: string;
  project_name: string;
}

interface WbsNode {
  id: string;
  wbs_code: string;
  wbs_name: string;
  full_path: string | null;
}

export interface DocumentRecord {
  id: string;
  project_id: string;
  wbs_node_id: string | null;
  document_type_id: string;
  document_number: string;
  title: string;
  discipline: string | null;
  status: string;
  current_revision: number;
  current_revision_code?: string;
  review_code?: string | null;
  package_code?: string | null;
  description: string | null;
  created_by: string;
}

const STATUSES = [
  "draft", "submitted", "under_review", "approved",
  "approved_with_comment", "rejected", "ifc", "superseded", "archived",
];

const DISCIPLINES = [
  { value: "ARC", label: "Architecture" },
  { value: "STR", label: "Structural" },
  { value: "MEP", label: "MEP" },
  { value: "CVL", label: "Civil" },
  { value: "GEO", label: "Geotechnical" },
  { value: "QS", label: "Quantity Surveying" },
  { value: "HSE", label: "HSE" },
  { value: "QA", label: "QA/QC" },
  { value: "PRC", label: "Procurement" },
  { value: "GEN", label: "General" },
];

interface DocumentEditSheetProps {
  document: DocumentRecord | null;
  onClose: () => void;
  onSave: (doc: DocumentRecord) => void;
}

export function DocumentEditSheet({ document, onClose, onSave }: DocumentEditSheetProps) {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [wbsNodes, setWbsNodes] = useState<WbsNode[]>([]);
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    project_id: document?.project_id ?? "",
    wbs_node_id: document?.wbs_node_id ?? "",
    document_type_id: document?.document_type_id ?? "",
    document_number: document?.document_number ?? "",
    title: document?.title ?? "",
    discipline: document?.discipline ?? "",
    status: document?.status ?? "draft",
    current_revision_code: document?.current_revision_code ?? "R00",
    package_code: document?.package_code ?? "",
    suitability_code: "S0",
    sheet_size: "A1",
    description: document?.description ?? "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);

  const isEditing = !!document;

  useEffect(() => {
    listProjects().then(({ data }) => {
      if (data) setProjects(data as Project[]);
    });
    listDocumentTypesWithIsActive().then(({ data }) => {
      if (data) setDocTypes(data as DocumentType[]);
    });
  }, [supabase]);

  useEffect(() => {
    if (form.project_id) {
      listWbsNodesByProjectId(form.project_id).then(({ data }) => {
        if (data) setWbsNodes(data as WbsNode[]);
      });
    } else {
      setWbsNodes([]);
    }
  }, [form.project_id, supabase]);

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function uploadFile(): Promise<string | null> {
    if (!selectedFile) return filePath;
    setUploading(true);
    const ext = selectedFile.name.split(".").pop();
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const bucketPath = `documents/${form.project_id}/${fileName}`;

    const { error } = await supabase.storage.from("documents").upload(bucketPath, selectedFile);
    if (error) {
      toast.error("Upload failed: " + error.message);
      setUploading(false);
      return null;
    }

    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(bucketPath);
    setUploading(false);
    return urlData.publicUrl;
  }

  async function handleSave() {
    setSaving(true);

    const fileUrl = await uploadFile();
    if (selectedFile && !fileUrl) {
      setSaving(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;

    const payload = {
      project_id: form.project_id,
      wbs_node_id: form.wbs_node_id || null,
      document_type_id: form.document_type_id,
      document_number: form.document_number,
      title: form.title,
      discipline: form.discipline || null,
      status: form.status,
      current_revision: document?.current_revision ?? 0,
      current_revision_code: form.current_revision_code || "R00",
      package_code: form.package_code || null,
      description: form.description || null,
      created_by: document?.created_by ?? userId,
    };

    if (isEditing) {
      const { error } = await updateDocumentByIdReturning(payload, document.id);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      toast.success("Document updated");

      if (fileUrl) {
        const nextRevNum = (document.current_revision ?? 0) + 1;
        const nextRevCode = form.current_revision_code || `R${String(nextRevNum).padStart(2, "0")}`;
        const { error: revErr } = await insertDocumentRevision({
          document_id: document.id,
          revision_number: nextRevNum,
          revision_code: nextRevCode,
          suitability_code: form.suitability_code || "S0",
          sheet_size: form.sheet_size || null,
          file_url: fileUrl,
          file_name: selectedFile?.name ?? null,
          file_size: selectedFile?.size ?? null,
          uploaded_by: payload.created_by,
          status: form.status,
          notes: `Revision ${nextRevCode}`,
        });
        if (revErr) toast.error("Revision save failed: " + revErr.message);
        else {
          await updateDocumentById({
            current_revision: nextRevNum,
            current_revision_code: nextRevCode,
          }, document.id);
          payload.current_revision = nextRevNum;
          payload.current_revision_code = nextRevCode;
        }
      }

      onSave({ ...document!, ...payload } as DocumentRecord);
    } else {
      const { data, error } = await insertDocumentsReturning(payload);
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      const newDoc = data as DocumentRecord;

      if (fileUrl) {
        const initRevCode = form.current_revision_code || "R00";
        await insertDocumentRevision({
          document_id: newDoc.id,
          revision_number: 0,
          revision_code: initRevCode,
          suitability_code: form.suitability_code || "S0",
          sheet_size: form.sheet_size || null,
          file_url: fileUrl,
          file_name: selectedFile?.name ?? null,
          file_size: selectedFile?.size ?? null,
          uploaded_by: payload.created_by,
          status: form.status,
          notes: `Initial revision ${initRevCode}`,
        });
      }

      toast.success("Document created");
      onSave(newDoc);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border shadow-lg overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {isEditing ? form.document_number : "New Document"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isEditing ? form.title : "Create a new document record"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Info</legend>
            <div className="space-y-1.5">
              <Label htmlFor="project_id">Project *</Label>
              <select
                id="project_id"
                value={form.project_id}
                onChange={(e) => update("project_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              >
                <option value="">— Select Project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="document_number">Document Number *</Label>
                <input
                  id="document_number"
                  value={form.document_number}
                  onChange={(e) => update("document_number", e.target.value)}
                  placeholder="e.g. P001-STR-DWG-001"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="doc_type">Document Type *</Label>
                <select
                  id="doc_type"
                  value={form.document_type_id}
                  onChange={(e) => update("document_type_id", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">— Select Type —</option>
                  {docTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <input
                id="title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Classification</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="discipline">Discipline</Label>
                <select
                  id="discipline"
                  value={form.discipline}
                  onChange={(e) => update("discipline", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="">—</option>
                  {DISCIPLINES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => update("status", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="revision_code">Revision Code</Label>
                <input
                  id="revision_code"
                  value={form.current_revision_code}
                  onChange={(e) => update("current_revision_code", e.target.value)}
                  placeholder="e.g. R00, P01, C01"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="package_code">Package Code</Label>
                <input
                  id="package_code"
                  value={form.package_code}
                  onChange={(e) => update("package_code", e.target.value)}
                  placeholder="e.g. P01, ARC-01"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="suitability">ISO 19650 Suitability</Label>
                <select
                  id="suitability"
                  value={form.suitability_code}
                  onChange={(e) => update("suitability_code", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="S0">S0 — Work In Progress</option>
                  <option value="S1">S1 — Suitable for Coordination</option>
                  <option value="S2">S2 — Suitable for Information</option>
                  <option value="S3">S3 — Review &amp; Comment</option>
                  <option value="S4">S4 — Stage Approval</option>
                  <option value="F">F — Issued for Construction (IFC)</option>
                  <option value="AB">AB — As-Built Record</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sheet_size">Sheet Size</Label>
                <select
                  id="sheet_size"
                  value={form.sheet_size}
                  onChange={(e) => update("sheet_size", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary"
                >
                  <option value="A0">A0</option>
                  <option value="A1">A1</option>
                  <option value="A2">A2</option>
                  <option value="A3">A3</option>
                  <option value="A4">A4</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wbs_node">WBS Location</Label>
              <select
                id="wbs_node"
                value={form.wbs_node_id}
                onChange={(e) => update("wbs_node_id", e.target.value)}
                disabled={!form.project_id}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary disabled:opacity-50"
              >
                <option value="">—</option>
                {wbsNodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.full_path ?? n.wbs_code}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary resize-none"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">File</legend>
            <div className="flex items-center gap-3">
              <label
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 cursor-pointer hover:border-primary transition-colors",
                  selectedFile && "border-primary bg-primary/5",
                )}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {selectedFile ? selectedFile.name : "Click to upload file"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                      : "PDF, Images, Documents (max 50MB)"}
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {filePath && !selectedFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span className="truncate">File attached</span>
              </div>
            )}
          </fieldset>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !form.project_id || !form.document_number.trim() || !form.title.trim() || !form.document_type_id}
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Save className="mr-1.5 h-4 w-4" />
            {isEditing ? "Save Changes" : "Create Document"}
          </Button>
        </div>
      </div>
    </div>
  );
}
