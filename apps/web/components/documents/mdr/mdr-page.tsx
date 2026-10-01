"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  FileSpreadsheet,
  Download,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Printer,
  Calendar,
  ChevronRight,
  TrendingUp,
  FileCheck,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { MdrBatchImportDialog } from "./mdr-batch-import-dialog";
import { DocumentWorkflowPanel } from "../document-workflow-panel";
import { DocumentStampModal } from "../document-stamp-modal";
import type { DocumentRecord } from "../document-edit-sheet";

interface MdrRow {
  id: string;
  project_id: string;
  document_number: string;
  title: string;
  discipline: string | null;
  package_code: string | null;
  status: string;
  current_revision: number;
  current_revision_code: string;
  review_code: string | null;
  planned_submission_date: string | null;
  actual_submission_date: string | null;
  consultant_due_date: string | null;
  consultant_returned_at: string | null;
  suitability_code?: string;
  sheet_size?: string;
  created_at: string;
  printed_copies_count?: number;
}

export function MasterDocumentRegisterPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();

  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<MdrRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedReviewCode, setSelectedReviewCode] = useState("all");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | "delayed" | "on_track" | "completed">("all");

  // Dialogs
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [selectedDocForWorkflow, setSelectedDocForWorkflow] = useState<DocumentRecord | null>(null);
  const [selectedDocForStamp, setSelectedDocForStamp] = useState<DocumentRecord | null>(null);

  // Quick Date Editing
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editPlannedDate, setEditPlannedDate] = useState("");
  const [editActualDate, setEditActualDate] = useState("");
  const [savingDate, setSavingDate] = useState(false);

  const fetchMdr = useCallback(async () => {
    if (!selectedProjectId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // 1. Fetch documents
      const { data: docsData, error: docsError } = await supabase
        .from("documents")
        .select(`
          id,
          project_id,
          document_number,
          title,
          discipline,
          package_code,
          status,
          current_revision,
          current_revision_code,
          review_code,
          planned_submission_date,
          actual_submission_date,
          consultant_due_date,
          consultant_returned_at,
          created_at
        `)
        .eq("project_id", selectedProjectId)
        .order("document_number", { ascending: true });

      if (docsError) throw docsError;

      // 2. Fetch latest revision suitability & sheet sizes
      const docIds = (docsData || []).map((d) => d.id);
      let revMap: Record<string, { suitability_code: string; sheet_size: string }> = {};
      let printMap: Record<string, number> = {};

      if (docIds.length > 0) {
        const [{ data: revsData }, { data: printLogsData }] = await Promise.all([
          supabase
            .from("document_revisions")
            .select("document_id, suitability_code, sheet_size")
            .in("document_id", docIds)
            .eq("is_latest", true),
          supabase
            .from("document_print_logs")
            .select("id, document_revision_id, document_revisions!inner(document_id)")
            .is("recalled_at", null),
        ]);

        if (revsData) {
          for (const r of revsData as { document_id: string; suitability_code: string; sheet_size: string }[]) {
            revMap[r.document_id] = {
              suitability_code: r.suitability_code,
              sheet_size: r.sheet_size,
            };
          }
        }

        if (printLogsData) {
          for (const p of printLogsData as unknown as { document_revisions: { document_id: string } }[]) {
            const dId = p.document_revisions?.document_id;
            if (dId) {
              printMap[dId] = (printMap[dId] || 0) + 1;
            }
          }
        }
      }

      const rows: MdrRow[] = (docsData || []).map((d) => ({
        ...d,
        suitability_code: revMap[d.id]?.suitability_code || "S0",
        sheet_size: revMap[d.id]?.sheet_size || "A1",
        printed_copies_count: printMap[d.id] || 0,
      }));

      setDocuments(rows);
    } catch (err: unknown) {
      toast.error("Failed to load MDR: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, supabase]);

  useEffect(() => {
    fetchMdr();
  }, [fetchMdr]);

  // Unique disciplines for filter
  const disciplines = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => {
      if (d.discipline) set.add(d.discipline);
    });
    return Array.from(set).sort();
  }, [documents]);

  // Helper date calculations
  const today = new Date().toISOString().split("T")[0];

  function getScheduleVariance(row: MdrRow) {
    if (!row.planned_submission_date) return { label: "No Date", color: "text-muted-foreground", days: 0 };

    const planned = new Date(row.planned_submission_date).getTime();
    if (row.actual_submission_date) {
      const actual = new Date(row.actual_submission_date).getTime();
      const diffDays = Math.round((actual - planned) / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        return { label: `+${diffDays}d Late`, color: "bg-red-500/10 text-red-600 border-red-200", days: diffDays };
      } else if (diffDays < 0) {
        return { label: `${diffDays}d Early`, color: "bg-emerald-500/10 text-emerald-600 border-emerald-200", days: diffDays };
      }
      return { label: "On Time", color: "bg-blue-500/10 text-blue-600 border-blue-200", days: 0 };
    }

    // Not submitted yet
    const now = new Date(today).getTime();
    const diffDays = Math.round((now - planned) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) {
      return { label: `Overdue +${diffDays}d`, color: "bg-red-500/15 text-red-700 border-red-300 font-bold", days: diffDays };
    }
    return { label: `Planned (${-diffDays}d left)`, color: "bg-muted text-muted-foreground border-border", days: diffDays };
  }

  // Filtered rows
  const filteredRows = useMemo(() => {
    return documents.filter((row) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchNum = row.document_number.toLowerCase().includes(q);
        const matchTitle = row.title.toLowerCase().includes(q);
        const matchPkg = row.package_code?.toLowerCase().includes(q);
        if (!matchNum && !matchTitle && !matchPkg) return false;
      }

      if (selectedDiscipline !== "all" && row.discipline !== selectedDiscipline) {
        return false;
      }

      if (selectedStatus !== "all" && row.status !== selectedStatus) {
        return false;
      }

      if (selectedReviewCode !== "all") {
        if (selectedReviewCode === "pending" && row.review_code) return false;
        if (selectedReviewCode !== "pending" && row.review_code !== selectedReviewCode) return false;
      }

      if (scheduleFilter !== "all") {
        const variance = getScheduleVariance(row);
        if (scheduleFilter === "delayed" && (variance.days <= 0 || !variance.label.includes("Late") && !variance.label.includes("Overdue"))) {
          return false;
        }
        if (scheduleFilter === "completed" && !row.actual_submission_date) {
          return false;
        }
        if (scheduleFilter === "on_track" && variance.days > 0) {
          return false;
        }
      }

      return true;
    });
  }, [documents, searchQuery, selectedDiscipline, selectedStatus, selectedReviewCode, scheduleFilter]);

  // KPI Metrics
  const stats = useMemo(() => {
    const total = documents.length;
    let submittedCount = 0;
    let overdueCount = 0;
    let codeACount = 0;
    let codeBCount = 0;
    let codeCResubmit = 0;
    let ifcCount = 0;

    documents.forEach((d) => {
      if (d.actual_submission_date || d.status !== "draft") submittedCount++;
      if (d.status === "ifc") ifcCount++;
      if (d.review_code === "code_a") codeACount++;
      if (d.review_code === "code_b") codeBCount++;
      if (d.review_code === "code_c") codeCResubmit++;

      if (!d.actual_submission_date && d.planned_submission_date && d.planned_submission_date < today) {
        overdueCount++;
      }
    });

    const completionRate = total > 0 ? Math.round((submittedCount / total) * 100) : 0;

    return {
      total,
      submittedCount,
      overdueCount,
      codeACount,
      codeBCount,
      codeCResubmit,
      ifcCount,
      completionRate,
    };
  }, [documents, today]);

  // Export to CSV
  function handleExportCsv() {
    if (filteredRows.length === 0) {
      toast.error("No rows to export.");
      return;
    }

    const headers = [
      "Document Number",
      "Title",
      "Discipline",
      "Package",
      "Revision",
      "Suitability",
      "Sheet Size",
      "Status",
      "Review Code",
      "Planned Submission Date",
      "Actual Submission Date",
      "Schedule Variance",
      "Controlled Copies On Site",
    ];

    const csvLines = [headers.join(",")];

    filteredRows.forEach((r) => {
      const variance = getScheduleVariance(r);
      const line = [
        `"${r.document_number}"`,
        `"${r.title.replace(/"/g, '""')}"`,
        `"${r.discipline || ""}"`,
        `"${r.package_code || ""}"`,
        `"${r.current_revision_code || "R00"}"`,
        `"${r.suitability_code || "S0"}"`,
        `"${r.sheet_size || "A1"}"`,
        `"${r.status}"`,
        `"${r.review_code || "None"}"`,
        `"${r.planned_submission_date || ""}"`,
        `"${r.actual_submission_date || ""}"`,
        `"${variance.label}"`,
        `"${r.printed_copies_count || 0}"`,
      ];
      csvLines.push(line.join(","));
    });

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `MDR_Project_${selectedProjectId || "Export"}_${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("MDR exported to CSV successfully.");
  }

  // Quick save date
  async function handleSaveQuickDate(id: string) {
    setSavingDate(true);
    try {
      const { error } = await supabase
        .from("documents")
        .update({
          planned_submission_date: editPlannedDate || null,
          actual_submission_date: editActualDate || null,
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("Milestone dates updated.");
      setEditingDocId(null);
      fetchMdr();
    } catch (err: unknown) {
      toast.error("Error saving dates: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingDate(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Master Document Register (MDR)</h1>
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-semibold">
              ISO 19650 Living Ledger
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Single point of truth for drawings, technical submittals, consultant review milestones, and delay variance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchMdr}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="flex items-center gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            Export MDR (CSV)
          </Button>

          <Button
            size="sm"
            onClick={() => setShowBatchImport(true)}
            className="flex items-center gap-1.5 text-xs shadow-xs"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Bulk Document Ingestion
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Total Registered */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Registered</span>
            <Layers className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold mt-1">{stats.total}</p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <span>{stats.completionRate}% Submitted</span>
          </div>
        </div>

        {/* Overdue */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Overdue / Delayed</span>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <p className={cn("text-2xl font-bold mt-1", stats.overdueCount > 0 ? "text-red-600" : "text-foreground")}>
            {stats.overdueCount}
          </p>
          <div className="flex items-center gap-1 text-[11px] text-red-600/80 mt-0.5">
            <span>Past planned milestone</span>
          </div>
        </div>

        {/* Code A Approved */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Code A (Approved)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.codeACount}</p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <span>No remarks</span>
          </div>
        </div>

        {/* Code B Approved w/ Comments */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Code B (w/ Comments)</span>
            <Clock className="h-4 w-4 text-teal-500" />
          </div>
          <p className="text-2xl font-bold mt-1 text-teal-600">{stats.codeBCount}</p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <span>Proceed to site</span>
          </div>
        </div>

        {/* Issued for Construction */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">IFC Construction</span>
            <FileCheck className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold mt-1 text-indigo-600">{stats.ifcCount}</p>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
            <span>Site execution ready</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-muted/20 p-3 rounded-xl border border-border">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by Document Number, Title, Package..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-border bg-background outline-hidden focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Discipline */}
          <select
            value={selectedDiscipline}
            onChange={(e) => setSelectedDiscipline(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 outline-hidden focus:border-primary"
          >
            <option value="all">All Disciplines</option>
            {disciplines.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 outline-hidden focus:border-primary"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="approved">Approved</option>
            <option value="approved_with_comment">Approved w/ Comments</option>
            <option value="ifc">IFC</option>
            <option value="rejected">Rejected</option>
            <option value="superseded">Superseded</option>
          </select>

          {/* Review Code */}
          <select
            value={selectedReviewCode}
            onChange={(e) => setSelectedReviewCode(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 outline-hidden focus:border-primary"
          >
            <option value="all">All Review Codes</option>
            <option value="code_a">Code A (Approved)</option>
            <option value="code_b">Code B (Approved w/ Comment)</option>
            <option value="code_c">Code C (Revise & Resubmit)</option>
            <option value="code_d">Code D (Rejected)</option>
            <option value="pending">Review Pending</option>
          </select>

          {/* Schedule Health */}
          <select
            value={scheduleFilter}
            onChange={(e) => setScheduleFilter(e.target.value as typeof scheduleFilter)}
            className="h-8 rounded-lg border border-border bg-background px-2.5 outline-hidden focus:border-primary font-medium"
          >
            <option value="all">All Schedule Statuses</option>
            <option value="delayed">⚠️ Overdue / Delayed Only</option>
            <option value="on_track">🟢 On Track / Early</option>
            <option value="completed">Completed Submissions</option>
          </select>
        </div>
      </div>

      {/* MDR Register Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 text-muted-foreground border-b border-border uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3 font-semibold">Document No. / Package</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Rev / Suitability</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Review Code</th>
                <th className="px-4 py-3 font-semibold">Planned Date</th>
                <th className="px-4 py-3 font-semibold">Actual Date</th>
                <th className="px-4 py-3 font-semibold">Schedule Variance</th>
                <th className="px-4 py-3 font-semibold text-center">Controlled Copies</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                    Loading Master Document Register...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-muted-foreground">
                    No documents found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const variance = getScheduleVariance(row);
                  const isEditingThis = editingDocId === row.id;

                  return (
                    <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                      {/* Document Number & Package */}
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-foreground flex items-center gap-1.5">
                          {row.document_number}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {row.package_code && (
                            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded border border-border">
                              {row.package_code}
                            </span>
                          )}
                          {row.discipline && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {row.discipline}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Title */}
                      <td className="px-4 py-3 max-w-xs font-medium text-foreground">
                        <span className="line-clamp-2" title={row.title}>
                          {row.title}
                        </span>
                      </td>

                      {/* Rev & Suitability */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">
                            {row.current_revision_code || `R${row.current_revision}`}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 py-0.5 rounded border border-border">
                            {row.suitability_code || "S0"}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono block mt-0.5">
                          {row.sheet_size || "A1"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase border",
                            row.status === "approved" || row.status === "ifc"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-200"
                              : row.status === "under_review" || row.status === "submitted"
                              ? "bg-amber-500/10 text-amber-600 border-amber-200"
                              : row.status === "rejected"
                              ? "bg-red-500/10 text-red-600 border-red-200"
                              : "bg-muted text-muted-foreground border-border"
                          )}
                        >
                          {row.status.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Review Code */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.review_code ? (
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border",
                              row.review_code === "code_a"
                                ? "bg-emerald-500/10 text-emerald-700 border-emerald-300"
                                : row.review_code === "code_b"
                                ? "bg-teal-500/10 text-teal-700 border-teal-300"
                                : row.review_code === "code_c"
                                ? "bg-amber-500/15 text-amber-800 border-amber-300"
                                : "bg-red-500/15 text-red-800 border-red-300"
                            )}
                          >
                            {row.review_code.replace("_", " ").toUpperCase()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">Pending</span>
                        )}
                      </td>

                      {/* Planned Date */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px]">
                        {isEditingThis ? (
                          <input
                            type="date"
                            value={editPlannedDate}
                            onChange={(e) => setEditPlannedDate(e.target.value)}
                            className="rounded border border-primary px-1.5 py-0.5 text-xs bg-background"
                          />
                        ) : (
                          <span>{row.planned_submission_date || "—"}</span>
                        )}
                      </td>

                      {/* Actual Date */}
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-[11px]">
                        {isEditingThis ? (
                          <input
                            type="date"
                            value={editActualDate}
                            onChange={(e) => setEditActualDate(e.target.value)}
                            className="rounded border border-primary px-1.5 py-0.5 text-xs bg-background"
                          />
                        ) : (
                          <span>{row.actual_submission_date || "—"}</span>
                        )}
                      </td>

                      {/* Variance */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] border", variance.color)}>
                          {variance.label}
                        </span>
                      </td>

                      {/* Controlled Copies Printed */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {row.printed_copies_count && row.printed_copies_count > 0 ? (
                          <span className="inline-flex items-center gap-1 font-mono font-semibold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-200">
                            <Printer className="h-3 w-3" />
                            {row.printed_copies_count} on site
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">0</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isEditingThis ? (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingDocId(null)}
                              className="h-6 px-1.5 text-[10px]"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSaveQuickDate(row.id)}
                              disabled={savingDate}
                              className="h-6 px-2 text-[10px]"
                            >
                              Save
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDocId(row.id);
                                setEditPlannedDate(row.planned_submission_date || "");
                                setEditActualDate(row.actual_submission_date || "");
                              }}
                              title="Edit Milestone Dates"
                              className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedDocForStamp(row as unknown as DocumentRecord)}
                              title="Stamp Controlled Copy"
                              className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-amber-600"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedDocForWorkflow(row as unknown as DocumentRecord)}
                              title="View Document Workflow"
                              className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-primary"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Import Dialog */}
      {showBatchImport && (
        <MdrBatchImportDialog
          projectId={selectedProjectId}
          isOpen={showBatchImport}
          onClose={() => setShowBatchImport(false)}
          onSuccess={() => {
            setShowBatchImport(false);
            fetchMdr();
          }}
        />
      )}

      {/* Workflow Panel */}
      {selectedDocForWorkflow && (
        <DocumentWorkflowPanel
          document={selectedDocForWorkflow}
          onClose={() => setSelectedDocForWorkflow(null)}
          onUpdate={(updated) => {
            setDocuments((prev) =>
              prev.map((d) => (d.id === updated.id ? { ...d, status: updated.status } : d))
            );
            setSelectedDocForWorkflow(null);
          }}
        />
      )}

      {/* Controlled Copy Stamp Modal */}
      {selectedDocForStamp && (
        <DocumentStampModal
          document={selectedDocForStamp}
          onClose={() => setSelectedDocForStamp(null)}
        />
      )}
    </div>
  );
}
