"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  CloudSun,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteDailyReport,
  listDailyReports,
  syncDailyReportToPlanning,
  type SiteDailyReport,
} from "@/lib/construction/site/daily-report-service";
import { DailyReportEditor } from "./daily-report-editor";
import { cn } from "@/lib/utils";

export function SiteDailyReports() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [reports, setReports] = useState<SiteDailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Editor modal/view state
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedProjectId) {
      setReports([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await listDailyReports(selectedProjectId);
      setReports(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleCreate() {
    setEditingReportId(null);
    setIsEditorOpen(true);
  }

  function handleEdit(reportId: string) {
    setEditingReportId(reportId);
    setIsEditorOpen(true);
  }

  async function handleDelete(reportId: string) {
    if (!confirm("Are you sure you want to delete this Daily Report and all linked activities?")) {
      return;
    }
    try {
      await deleteDailyReport(reportId);
      toast.success("Daily report deleted");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleQuickSync(reportId: string) {
    setSyncingId(reportId);
    try {
      const res = await syncDailyReportToPlanning(reportId);
      toast.success(
        `Synced ${res.activities_direct_synced} activities direct, ${res.activities_pending_review} queued for review, ${res.productivity_logs_recorded} productivity logs recorded.`
      );
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.report_date?.includes(q) ||
        r.work_summary?.toLowerCase().includes(q) ||
        r.issues_encountered?.toLowerCase().includes(q) ||
        r.weather_conditions?.toLowerCase().includes(q)
      );
    });
  }, [reports, search, statusFilter]);

  if (projectLoading || loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!selectedProjectId) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Select a project from the sidebar to view or write site daily reports.
      </p>
    );
  }

  if (isEditorOpen) {
    return (
      <DailyReportEditor
        projectId={selectedProjectId}
        reportId={editingReportId}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingReportId(null);
        }}
        onSaved={() => {
          setIsEditorOpen(false);
          setEditingReportId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search diary or issues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            className="h-9 rounded-md border border-border bg-background px-2.5 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Drafts</option>
            <option value="submitted">Submitted / Synced</option>
            <option value="verified_by_pm">Verified by PM</option>
          </select>
        </div>

        <Button onClick={handleCreate} size="sm" className="gap-1.5 text-xs font-semibold">
          <Plus className="h-4 w-4" /> New Daily Report
        </Button>
      </div>

      {/* Reports List */}
      <div className="space-y-3">
        {filtered.map((r) => {
          const isSubmitted = r.status === "submitted" || r.status === "verified_by_pm";
          return (
            <Card
              key={r.id}
              className="hover:border-slate-300 transition-all shadow-sm overflow-hidden"
            >
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-foreground">
                      {r.report_date?.slice(0, 10)}
                    </span>

                    <Badge
                      variant={isSubmitted ? "default" : "outline"}
                      className={cn(
                        "text-[10px] capitalize px-2 py-0.5",
                        isSubmitted
                          ? "bg-blue-600 text-white"
                          : "border-amber-400 bg-amber-50 text-amber-700"
                      )}
                    >
                      {r.status === "submitted"
                        ? "Submitted & Synced"
                        : r.status === "verified_by_pm"
                        ? "Verified"
                        : "Draft"}
                    </Badge>

                    {r.activities_count > 0 && (
                      <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/5">
                        <CalendarCheck className="h-3 w-3 mr-1" />
                        {r.activities_count} {r.activities_count === 1 ? "activity" : "activities"}
                      </Badge>
                    )}

                    {r.weather_conditions && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        <CloudSun className="h-3 w-3 mr-1 text-amber-500" />
                        {r.weather_conditions}
                        {r.temperature_low != null && r.temperature_high != null && (
                          <span className="ml-1">
                            ({r.temperature_low}°C – {r.temperature_high}°C)
                          </span>
                        )}
                      </Badge>
                    )}

                    {r.author_name && (
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        By {r.author_name}
                      </span>
                    )}
                  </div>

                  {r.work_summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {r.work_summary}
                    </p>
                  )}

                  {r.issues_encountered && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/60 rounded px-2 py-1 line-clamp-1">
                      <strong>Site Issues:</strong> {r.issues_encountered}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(r.id)}
                    className="h-8 gap-1 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {isSubmitted ? "View / Edit" : "Edit Draft"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    title={isSubmitted ? "Re-sync to Planning" : "Submit & Sync to Planning"}
                    disabled={syncingId === r.id}
                    onClick={() => handleQuickSync(r.id)}
                    className="h-8 text-primary hover:bg-primary/10"
                  >
                    {syncingId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(r.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground rounded-xl border border-dashed bg-muted/20">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs font-medium">No daily reports found.</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Click &ldquo;New Daily Report&rdquo; to start tracking site execution and planning activities.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
