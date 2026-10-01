"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Search,
  Filter,
  X,
  Plus,
  Loader2,
  FileCheck2,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  RotateCcw,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { SubmittalCreateDialog } from "./submittal-create-dialog";
import { SubmittalDetailPanel, type SubmittalRecord } from "./submittal-detail-panel";

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700 border-slate-300" },
  submitted: { label: "Under Review", color: "bg-blue-100 text-blue-700 border-blue-300" },
  under_review: { label: "In Review", color: "bg-blue-100 text-blue-700 border-blue-300" },
  code_a_approved: { label: "Code A (Approved)", color: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold" },
  code_b_approved_as_noted: { label: "Code B (Approved w/ Note)", color: "bg-teal-100 text-teal-800 border-teal-300 font-bold" },
  code_c_revise_resubmit: { label: "Code C (Revise & Resubmit)", color: "bg-amber-100 text-amber-800 border-amber-300 font-bold" },
  code_d_rejected: { label: "Code D (Rejected)", color: "bg-red-100 text-red-800 border-red-300 font-bold" },
  code_e_for_information: { label: "Code E (For Info)", color: "bg-purple-100 text-purple-800 border-purple-300" },
};

const TYPE_LABELS: Record<string, string> = {
  shop_drawing: "Shop Drawing",
  material_approval: "Material Approval",
  method_statement: "Method Statement",
  prequal: "Prequalification",
  test_commissioning: "T&C Procedure",
  sample: "Material Sample",
};

export function SubmittalListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [submittals, setSubmittals] = useState<SubmittalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "overdue" | "pending_qc">("all");

  // Selection & Modals
  const [selectedSubmittal, setSelectedSubmittal] = useState<SubmittalRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function fetchSubmittals() {
    if (!selectedProjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    supabase
      .from("submittal_packages")
      .select("*, originator:originator_id(full_name), reviewer:consultant_reviewer_id(full_name)")
      .eq("project_id", selectedProjectId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setSubmittals(data as SubmittalRecord[]);
        }
        setLoading(false);
      });
  }

  useEffect(() => {
    fetchSubmittals();
  }, [selectedProjectId, supabase]);

  // KPI Calculations
  const stats = useMemo(() => {
    let pendingQC = 0;
    let underConsultant = 0;
    let overdue = 0;
    let approved = 0;
    let needsResubmit = 0;

    const now = new Date();

    for (const s of submittals) {
      if (s.contractor_qc_status === "pending") pendingQC++;
      if (s.consultant_status === "submitted" || s.consultant_status === "under_review") {
        underConsultant++;
        if (s.consultant_due_date && !s.consultant_returned_at) {
          if (new Date(s.consultant_due_date) < now) overdue++;
        }
      }
      if (s.consultant_status === "code_a_approved" || s.consultant_status === "code_b_approved_as_noted") approved++;
      if (s.consultant_status === "code_c_revise_resubmit" || s.consultant_status === "code_d_rejected") needsResubmit++;
    }

    return { total: submittals.length, pendingQC, underConsultant, overdue, approved, needsResubmit };
  }, [submittals]);

  // Filtered List
  const filtered = useMemo(() => {
    const now = new Date();
    return submittals.filter((s) => {
      const q = search.toLowerCase();
      if (q && !s.submittal_number.toLowerCase().includes(q) && !s.title.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter && s.submittal_type !== typeFilter) return false;
      if (disciplineFilter && s.discipline !== disciplineFilter) return false;
      if (statusFilter && s.consultant_status !== statusFilter) return false;

      if (urgencyFilter === "overdue") {
        if (!s.consultant_due_date || s.consultant_returned_at) return false;
        if (new Date(s.consultant_due_date) >= now) return false;
      }
      if (urgencyFilter === "pending_qc") {
        if (s.contractor_qc_status !== "pending") return false;
      }

      return true;
    });
  }, [submittals, search, typeFilter, disciplineFilter, statusFilter, urgencyFilter]);

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Package className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
        <h3 className="text-base font-semibold text-foreground">Select a Project</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          Please choose an active project from the project switcher in the header to view and manage submittal packages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-3.5 flex flex-col items-center text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mb-1">
              <FileText className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground">{stats.total}</p>
            <p className="text-[11px] text-muted-foreground">Total Submittals</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5 flex flex-col items-center text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 mb-1">
              <FileCheck2 className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground">{stats.pendingQC}</p>
            <p className="text-[11px] text-muted-foreground">Pending QC</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5 flex flex-col items-center text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mb-1">
              <Clock className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground">{stats.underConsultant}</p>
            <p className="text-[11px] text-muted-foreground">Under Review</p>
          </CardContent>
        </Card>

        <Card className={cn(stats.overdue > 0 && "border-red-300 bg-red-50/10")}>
          <CardContent className="p-3.5 flex flex-col items-center text-center">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg mb-1", stats.overdue > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500")}>
              <AlertTriangle className="h-4 w-4" />
            </div>
            <p className={cn("text-xl font-bold tabular-nums", stats.overdue > 0 ? "text-red-600" : "text-foreground")}>
              {stats.overdue}
            </p>
            <p className="text-[11px] text-muted-foreground">SLA Overdue (&gt;14d)</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3.5 flex flex-col items-center text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 mb-1">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground">{stats.approved}</p>
            <p className="text-[11px] text-muted-foreground">Code A / B Approved</p>
          </CardContent>
        </Card>

        <Card className={cn(stats.needsResubmit > 0 && "border-amber-300 bg-amber-50/10")}>
          <CardContent className="p-3.5 flex flex-col items-center text-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 mb-1">
              <RotateCcw className="h-4 w-4" />
            </div>
            <p className="text-xl font-bold tabular-nums text-amber-700">{stats.needsResubmit}</p>
            <p className="text-[11px] text-muted-foreground">Code C/D Resubmit</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Bar & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              placeholder="Search submittal # or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-hidden focus:border-primary"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-1.5 px-2.5 text-xs outline-hidden focus:border-primary"
          >
            <option value="">All Categories</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-1.5 px-2.5 text-xs outline-hidden focus:border-primary"
          >
            <option value="">All Disciplines</option>
            {["ARC", "STR", "MEP", "CVL", "GEO", "QS", "HSE", "QA", "GEN"].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-border bg-background py-1.5 px-2.5 text-xs outline-hidden focus:border-primary"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_BADGES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Quick Urgency Toggles */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setUrgencyFilter("all")}
              className={cn("px-2 py-1 rounded-md transition-colors", urgencyFilter === "all" ? "bg-background font-bold text-foreground shadow-xs" : "text-muted-foreground")}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setUrgencyFilter("overdue")}
              className={cn("px-2 py-1 rounded-md transition-colors", urgencyFilter === "overdue" ? "bg-red-500 text-white font-bold" : "text-muted-foreground hover:text-foreground")}
            >
              Overdue
            </button>
            <button
              type="button"
              onClick={() => setUrgencyFilter("pending_qc")}
              className={cn("px-2 py-1 rounded-md transition-colors", urgencyFilter === "pending_qc" ? "bg-primary text-white font-bold" : "text-muted-foreground hover:text-foreground")}
            >
              Pending QC
            </button>
          </div>

          {(search || typeFilter || disciplineFilter || statusFilter || urgencyFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTypeFilter("");
                setDisciplineFilter("");
                setStatusFilter("");
                setUrgencyFilter("all");
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              <X className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>

        <Button onClick={() => setShowCreate(true)} size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New Submittal Package
        </Button>
      </div>

      {/* Submittals Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left uppercase tracking-wider text-muted-foreground font-semibold">
              <th className="px-3.5 py-3">Submittal Reference</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Discipline</th>
              <th className="px-3 py-3">Rev</th>
              <th className="px-3 py-3">Internal QC</th>
              <th className="px-3 py-3">Consultant Status</th>
              <th className="px-3.5 py-3">SLA Target &amp; Countdown</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Loading submittal register...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No submittal packages found matching criteria
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const now = new Date();
                const isOverdue =
                  s.consultant_due_date &&
                  !s.consultant_returned_at &&
                  new Date(s.consultant_due_date) < now;

                return (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSubmittal(s)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="px-3.5 py-3">
                      <div>
                        <p className="font-bold text-foreground font-mono">{s.submittal_number}</p>
                        <p className="text-muted-foreground truncate max-w-sm mt-0.5">{s.title}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">
                        {TYPE_LABELS[s.submittal_type] || s.submittal_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-muted-foreground">
                      {s.discipline}
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-foreground">
                      {s.current_revision_code}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                          s.contractor_qc_status === "passed"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : s.contractor_qc_status === "rejected"
                            ? "bg-red-100 text-red-800 border border-red-300"
                            : "bg-slate-100 text-slate-700 border border-slate-300"
                        )}
                      >
                        {s.contractor_qc_status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                          STATUS_BADGES[s.consultant_status]?.color ?? "bg-slate-100 text-slate-700"
                        )}
                      >
                        {STATUS_BADGES[s.consultant_status]?.label ?? s.consultant_status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      {s.consultant_returned_at ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>Returned: {new Date(s.consultant_returned_at).toLocaleDateString()}</span>
                        </div>
                      ) : s.consultant_due_date ? (
                        <div
                          className={cn(
                            "flex items-center gap-1.5 font-medium",
                            isOverdue ? "text-red-600 font-bold" : "text-muted-foreground"
                          )}
                        >
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>Due: {s.consultant_due_date}</span>
                          {isOverdue && (
                            <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] text-red-800 uppercase font-black">
                              Overdue
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground font-mono text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Submittal Creation Dialog */}
      {showCreate && (
        <SubmittalCreateDialog
          projectId={selectedProjectId}
          onClose={() => setShowCreate(false)}
          onCreated={fetchSubmittals}
        />
      )}

      {/* Submittal Detail Panel */}
      {selectedSubmittal && (
        <SubmittalDetailPanel
          submittal={selectedSubmittal}
          onClose={() => setSelectedSubmittal(null)}
          onUpdate={(updated) => {
            setSubmittals((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setSelectedSubmittal(updated);
          }}
        />
      )}
    </div>
  );
}
