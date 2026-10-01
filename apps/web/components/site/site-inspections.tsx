"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  Plus,
  Loader2,
  Pencil,
  Search,
  ClipboardCheck,
  Calendar,
  Layers,
  MapPin,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayISO } from "@/lib/planning/work-calendar";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<
  string,
  { label: string; badge: string; icon: typeof Clock }
> = {
  draft: { label: "Draft", badge: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  submitted: { label: "Submitted", badge: "bg-blue-50 text-blue-700 border-blue-200", icon: Clock },
  scheduled: { label: "Scheduled", badge: "bg-amber-50 text-amber-700 border-amber-200", icon: Calendar },
  inspected: { label: "Inspected", badge: "bg-purple-50 text-purple-700 border-purple-200", icon: ClipboardCheck },
  passed: { label: "Passed", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  failed: { label: "Failed", badge: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle },
  closed: { label: "Closed", badge: "bg-slate-100 text-slate-500 border-slate-200", icon: CheckCircle2 },
};

interface InspectionRow {
  id: string;
  project_id: string;
  ir_number: string;
  location: string | null;
  inspector_name: string | null;
  request_date: string;
  inspection_date: string | null;
  status: string;
  notes: string | null;
  wbs_task_id?: string | null;
  wbs_tasks?: { task_code?: string; task_name?: string } | null;
}

interface WbsTaskOption {
  id: string;
  task_code: string;
  task_name: string;
}

export function SiteInspections() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [tasks, setTasks] = useState<WbsTaskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InspectionRow | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  // Form states
  const [irNumber, setIrNumber] = useState("");
  const [location, setLocation] = useState("");
  const [inspectorName, setInspectorName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(todayISO());
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [wbsTaskId, setWbsTaskId] = useState("");

  async function load() {
    if (!selectedProjectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("inspection_requests")
        .select("*, wbs_tasks(task_code, task_name)")
        .eq("project_id", selectedProjectId)
        .order("request_date", { ascending: false })
        .limit(200);

      if (error) throw error;
      setRows((data || []) as InspectionRow[]);

      // Load tasks
      const { data: taskData } = await supabase
        .from("wbs_tasks")
        .select("id, task_code, task_name")
        .eq("project_id", selectedProjectId)
        .order("task_code", { ascending: true })
        .limit(200);

      setTasks(taskData || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [selectedProjectId]);

  function resetForm() {
    setIrNumber(`IR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(rows.length + 1).padStart(3, "0")}`);
    setLocation("");
    setInspectorName("");
    setInspectionDate(todayISO());
    setStatus("draft");
    setNotes("");
    setWbsTaskId("");
    setEditing(null);
  }

  function openEdit(row: InspectionRow) {
    setIrNumber(row.ir_number || "");
    setLocation(row.location || "");
    setInspectorName(row.inspector_name || "");
    setInspectionDate(row.inspection_date?.slice(0, 10) || todayISO());
    setStatus(row.status || "draft");
    setNotes(row.notes || "");
    setWbsTaskId(row.wbs_task_id || "");
    setEditing(row);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) {
      toast.error("Please select a project first.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        project_id: selectedProjectId,
        ir_number: irNumber.trim(),
        location: location.trim() || null,
        inspector_name: inspectorName.trim() || null,
        inspection_date: inspectionDate || null,
        status,
        notes: notes.trim() || null,
        wbs_task_id: wbsTaskId || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("inspection_requests")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Inspection request updated");
      } else {
        const { error } = await supabase.from("inspection_requests").insert([
          {
            ...payload,
            request_date: todayISO(),
          },
        ]);
        if (error) throw error;
        toast.success("Inspection request created");
      }

      setShowForm(false);
      resetForm();
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.ir_number?.toLowerCase().includes(q) ||
      r.location?.toLowerCase().includes(q) ||
      r.inspector_name?.toLowerCase().includes(q) ||
      r.wbs_tasks?.task_name?.toLowerCase().includes(q) ||
      r.wbs_tasks?.task_code?.toLowerCase().includes(q)
    );
  });

  if (projectLoading || loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top search & filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search IR#, location, task..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Statuses ({rows.length})</option>
            {Object.keys(STATUS_CONFIG).map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>

        <Button
          size="sm"
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="gap-1.5"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" /> Cancel
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> New Inspection (WIR)
            </>
          )}
        </Button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <Card className="border-primary/20 bg-card shadow-sm">
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">
                    {editing ? `Edit ${editing.ir_number}` : "Create Work Inspection Request (WIR)"}
                  </h3>
                </div>
                {editing && (
                  <Badge variant="outline" className="text-xs">
                    {editing.status}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">IR Number *</Label>
                  <Input
                    value={irNumber}
                    onChange={(e) => setIrNumber(e.target.value)}
                    placeholder="e.g. WIR-20260928-001"
                    className="text-xs font-mono"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Linked Schedule Activity</Label>
                  <select
                    value={wbsTaskId}
                    onChange={(e) => setWbsTaskId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">(None - General Inspection)</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.task_code}] {t.task_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Inspection Date</Label>
                  <Input
                    type="date"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Inspector / Consultant Name</Label>
                  <Input
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    placeholder="e.g. Eng. Sarah Mitchell (RE)"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Location / Grid / Level</Label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Podium Level 2, Column Grid 4-8"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Status</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {Object.keys(STATUS_CONFIG).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_CONFIG[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-full space-y-1">
                  <Label className="text-xs">Inspection Scope & Notes</Label>
                  <textarea
                    rows={3}
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Specify pre-pour checklists, rebar spacing, embedments, testing requirements..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : editing ? (
                    "Update Inspection"
                  ) : (
                    "Create Request"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Inspections Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                <th className="px-4 py-3">IR #</th>
                <th className="px-4 py-3">Linked Activity</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Inspector</th>
                <th className="px-4 py-3">Inspection Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const conf = STATUS_CONFIG[r.status] || {
                  label: r.status,
                  badge: "bg-slate-100 text-slate-700 border-slate-200",
                };
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold font-mono text-foreground">
                      {r.ir_number}
                    </td>
                    <td className="px-4 py-3">
                      {r.wbs_tasks ? (
                        <div className="flex items-center gap-1.5 font-medium text-blue-600">
                          <Layers className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[200px]" title={r.wbs_tasks.task_name}>
                            {r.wbs_tasks.task_code} {r.wbs_tasks.task_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px]">General</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.location ? (
                        <div className="flex items-center gap-1 truncate max-w-[180px]">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{r.location}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.inspector_name ? (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 shrink-0" />
                          <span>{r.inspector_name}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {r.inspection_date ? r.inspection_date.slice(0, 10) : r.request_date.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                          conf.badge
                        )}
                      >
                        {conf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(r)}
                        className="h-7 px-2 gap-1 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <ClipboardCheck className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="font-medium text-foreground">No inspection requests found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create a WIR to track quality assurance check-points and sign-offs for this project.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
