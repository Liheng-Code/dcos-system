"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import React from "react";
import { Search, Loader2, Filter, X, Plus, FileText, ChevronDown, ChevronRight, Download, Clock, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DocumentEditSheet, type DocumentRecord } from "@/components/documents/document-edit-sheet";
import { DocumentWorkflowPanel } from "@/components/documents/document-workflow-panel";

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

interface Revision {
  id: string;
  document_id: string;
  revision_number: number;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  notes: string | null;
  status: string;
  created_at: string;
}

interface DocWithRelations extends DocumentRecord {
  doc_type_code?: string;
  doc_type_name?: string;
  project_code?: string;
  project_name?: string;
  revisions?: Revision[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-200",
  submitted: "bg-blue-500/10 text-blue-600 border-blue-200",
  under_review: "bg-amber-500/10 text-amber-600 border-amber-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  approved_with_comment: "bg-teal-500/10 text-teal-600 border-teal-200",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
  ifc: "bg-green-500/10 text-green-600 border-green-200",
  superseded: "bg-purple-500/10 text-purple-600 border-purple-200",
  archived: "bg-slate-500/10 text-slate-600 border-slate-200",
};

const DISCIPLINES = [
  "ARC", "STR", "MEP", "CVL", "GEO", "QS", "HSE", "QA", "PRC", "GEN",
];

export function DocumentListPage() {
  const supabase = useMemo(() => createClient(), []);
  const [documents, setDocuments] = useState<DocWithRelations[]>([]);
  const [docTypes, setDocTypes] = useState<Map<string, DocumentType>>(new Map());
  const [projects, setProjects] = useState<Map<string, Project>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [selected, setSelected] = useState<DocWithRelations | null>(null);
  const [showWorkflow, setShowWorkflow] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editDoc, setEditDoc] = useState<DocWithRelations | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<Map<string, Revision[]>>(new Map());

  function fetchDocuments() {
    supabase.from("documents").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setDocuments(data as DocWithRelations[]);
      setLoading(false);
    });

    supabase.from("document_types").select("*").then(({ data }) => {
      if (data) {
        const map = new Map<string, DocumentType>();
        for (const t of data) map.set(t.id, t);
        setDocTypes(map);
      }
    });

    supabase.from("projects").select("id, project_code, project_name").then(({ data }) => {
      if (data) {
        const map = new Map<string, Project>();
        for (const p of data) map.set(p.id, p);
        setProjects(map);
      }
    });
  }

  useEffect(() => {
    fetchDocuments();
  }, [supabase]);

  const docsWithMeta = useMemo(() => {
    return documents.map((d) => ({
      ...d,
      doc_type_code: docTypes.get(d.document_type_id)?.code,
      doc_type_name: docTypes.get(d.document_type_id)?.name,
      project_code: projects.get(d.project_id)?.project_code,
      project_name: projects.get(d.project_id)?.project_name,
    }));
  }, [documents, docTypes, projects]);

  const filtered = useMemo(() => {
    return docsWithMeta.filter((d) => {
      const q = search.toLowerCase();
      if (q && !d.document_number.toLowerCase().includes(q) && !d.title.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter && d.document_type_id !== typeFilter) return false;
      if (statusFilter && d.status !== statusFilter) return false;
      if (disciplineFilter && d.discipline !== disciplineFilter) return false;
      return true;
    });
  }, [docsWithMeta, search, typeFilter, statusFilter, disciplineFilter]);

  function handleSave(updated: DocumentRecord) {
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
    setEditDoc(null);
    setShowCreate(false);
  }

  function handleWorkflowUpdate(updated: DocumentRecord) {
    setDocuments((prev) => {
      const idx = prev.findIndex((d) => d.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return prev;
    });
    setSelected((prev) => prev ? { ...prev, ...updated } : null);
  }

  async function toggleExpand(docId: string) {
    if (expandedDoc === docId) {
      setExpandedDoc(null);
      return;
    }
    setExpandedDoc(docId);
    if (!revisions.has(docId)) {
      const { data } = await supabase.from("document_revisions").select("*").eq("document_id", docId).order("revision_number", { ascending: false });
      if (data) {
        setRevisions((prev) => new Map(prev).set(docId, data as Revision[]));
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const allStatuses = Object.keys(STATUS_COLORS);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {documents.length} document{documents.length !== 1 ? "s" : ""}
          </p>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            New Document
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              placeholder="Search document number or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-hidden placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-border bg-background py-2 pl-7 pr-8 text-sm appearance-none outline-hidden focus:border-primary"
            >
              <option value="">All Types</option>
              {Array.from(docTypes.values()).map((t) => (
                <option key={t.id} value={t.id}>{t.code} — {t.name}</option>
              ))}
            </select>
          </div>
          <select
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-2 px-3 text-sm appearance-none outline-hidden focus:border-primary"
          >
            <option value="">All Disciplines</option>
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-2 px-3 text-sm appearance-none outline-hidden focus:border-primary"
          >
            <option value="">All Status</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
          {(search || typeFilter || statusFilter || disciplineFilter) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setTypeFilter(""); setStatusFilter(""); setDisciplineFilter(""); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>

        <div className="rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="w-8 px-2 py-2.5" />
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Document</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Project</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Discipline</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Rev</th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    No documents found
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <React.Fragment key={d.id}>
                    <tr
                      onClick={() => { setSelected(d); setShowWorkflow(true); }}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-muted/50",
                        selected?.id === d.id && "bg-primary/5",
                      )}
                    >
                      <td className="px-2 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(d.id); }}
                          className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                        >
                          {expandedDoc === d.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground">{d.title}</p>
                            <p className="text-xs font-mono text-muted-foreground">{d.document_number}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {d.project_code}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">
                          {d.doc_type_code ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {d.discipline || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">
                        R{d.current_revision}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                          STATUS_COLORS[d.status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                        )}>
                          {d.status.replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                    {expandedDoc === d.id && (
                      <tr key={`rev-${d.id}`}>
                        <td colSpan={7} className="bg-muted/20 px-3 py-3">
                          <div className="flex flex-col gap-2 pl-8">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Revision History</p>
                            {(revisions.get(d.id) ?? []).length === 0 ? (
                              <p className="text-xs text-muted-foreground">No revisions yet</p>
                            ) : (
                              (revisions.get(d.id) ?? []).map((rev) => (
                                <div key={rev.id} className="flex items-center gap-3 text-xs">
                                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="font-mono font-medium">R{rev.revision_number}</span>
                                  <span className="text-muted-foreground">{rev.file_name || "—"}</span>
                                  {rev.file_url && (
                                    <a
                                      href={rev.file_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-primary hover:underline"
                                    >
                                      <Download className="h-3 w-3" />
                                      Download
                                    </a>
                                  )}
                                  <span className={cn(
                                    "ml-auto inline-flex items-center rounded-full border px-1.5 py-0.5 capitalize",
                                    STATUS_COLORS[rev.status] ?? "bg-gray-500/10 text-gray-500 border-gray-200",
                                  )}>
                                    {rev.status.replace(/_/g, " ")}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {documents.length} documents
        </p>
      </div>

      {showWorkflow && selected && (
        <DocumentWorkflowPanel
          document={selected}
          onClose={() => { setShowWorkflow(false); setSelected(null); }}
          onUpdate={handleWorkflowUpdate}
          onEdit={(doc) => { setShowWorkflow(false); setEditDoc(doc); }}
        />
      )}

      {editDoc && (
        <DocumentEditSheet
          document={editDoc}
          onClose={() => setEditDoc(null)}
          onSave={handleSave}
        />
      )}

      {showCreate && (
        <DocumentEditSheet
          document={null}
          onClose={() => setShowCreate(false)}
          onSave={handleSave}
        />
      )}
    </>
  );
}
