"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  Plus,
  Loader2,
  Pencil,
  Search,
  Users,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Clock,
  Layers,
  Calendar,
  X,
  Building2,
  Activity,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayISO } from "@/lib/planning/work-calendar";
import { cn } from "@/lib/utils";

interface ManpowerRow {
  id: string;
  project_id: string;
  report_date: string;
  trade: string;
  contractor: string | null;
  foreman: string | null;
  total_workers: number;
  skilled: number;
  unskilled: number;
  regular_hours: number;
  ot_hours: number;
  notes: string | null;
  subcontract_id?: string | null;
  wbs_task_id?: string | null;
  planned_workers?: number;
  wbs_tasks?: { task_code?: string; task_name?: string } | null;
  subcontracts?: { subcontract_no?: string; scope_of_work?: string } | null;
}

interface TradeVarianceRow {
  trade: string;
  contractor: string;
  actual_workers: number;
  planned_workers: number;
  variance: number;
  mobilization_pct: number;
  status: "surplus" | "balanced" | "under_mobilized";
  regular_hours: number;
  ot_hours: number;
}

interface SubcontractOption {
  id: string;
  subcontract_no: string;
  scope_of_work: string | null;
}

interface WbsTaskOption {
  id: string;
  task_code: string;
  task_name: string;
}

export function SiteManpower() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<ManpowerRow[]>([]);
  const [varianceRows, setVarianceRows] = useState<TradeVarianceRow[]>([]);
  const [subcontracts, setSubcontracts] = useState<SubcontractOption[]>([]);
  const [tasks, setTasks] = useState<WbsTaskOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingVariance, setLoadingVariance] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [activeTab, setActiveTab] = useState<"variance" | "records">("variance");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ManpowerRow | null>(null);
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  // Form states
  const [reportDate, setReportDate] = useState(todayISO());
  const [trade, setTrade] = useState("");
  const [contractor, setContractor] = useState("");
  const [foreman, setForeman] = useState("");
  const [total, setTotal] = useState("");
  const [planned, setPlanned] = useState("");
  const [skilled, setSkilled] = useState("");
  const [unskilled, setUnskilled] = useState("");
  const [regularHrs, setRegularHrs] = useState("8");
  const [otHrs, setOtHrs] = useState("0");
  const [subcontractId, setSubcontractId] = useState("");
  const [wbsTaskId, setWbsTaskId] = useState("");
  const [notes, setNotes] = useState("");

  async function loadData() {
    if (!selectedProjectId) {
      setRows([]);
      setVarianceRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Load actual manpower records
      const { data, error } = await supabase
        .from("site_manpower")
        .select("*, wbs_tasks(task_code, task_name), subcontracts(subcontract_no, scope_of_work)")
        .eq("project_id", selectedProjectId)
        .order("report_date", { ascending: false })
        .limit(300);

      if (error) throw error;
      setRows((data || []) as ManpowerRow[]);

      // 2. Load subcontracts
      const { data: scData } = await supabase
        .from("subcontracts")
        .select("id, subcontract_no, scope_of_work")
        .eq("project_id", selectedProjectId)
        .order("subcontract_no", { ascending: true });
      setSubcontracts(scData || []);

      // 3. Load active tasks
      const { data: taskData } = await supabase
        .from("wbs_tasks")
        .select("id, task_code, task_name")
        .eq("project_id", selectedProjectId)
        .order("task_code", { ascending: true })
        .limit(200);
      setTasks(taskData || []);

      // 4. Load variance for selectedDate
      await loadVariance(selectedDate);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadVariance(date: string) {
    if (!selectedProjectId) return;
    setLoadingVariance(true);
    try {
      const { data, error } = await supabase.rpc("get_site_manpower_variance", {
        p_project_id: selectedProjectId,
        p_date: date,
      });

      if (error) throw error;
      setVarianceRows((data || []) as TradeVarianceRow[]);
    } catch (e) {
      console.error("Failed to load manpower variance:", e);
    } finally {
      setLoadingVariance(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [selectedProjectId]);

  function handleDateChange(newDate: string) {
    setSelectedDate(newDate);
    void loadVariance(newDate);
  }

  function resetForm() {
    setReportDate(selectedDate || todayISO());
    setTrade("");
    setContractor("");
    setForeman("");
    setTotal("");
    setPlanned("");
    setSkilled("");
    setUnskilled("");
    setRegularHrs("8");
    setOtHrs("0");
    setSubcontractId("");
    setWbsTaskId("");
    setNotes("");
    setEditing(null);
  }

  function openEdit(row: ManpowerRow) {
    setReportDate(row.report_date?.slice(0, 10) || todayISO());
    setTrade(row.trade || "");
    setContractor(row.contractor || "");
    setForeman(row.foreman || "");
    setTotal(row.total_workers?.toString() || "");
    setPlanned(row.planned_workers?.toString() || "");
    setSkilled(row.skilled?.toString() || "0");
    setUnskilled(row.unskilled?.toString() || "0");
    setRegularHrs(row.regular_hours?.toString() || "8");
    setOtHrs(row.ot_hours?.toString() || "0");
    setSubcontractId(row.subcontract_id || "");
    setWbsTaskId(row.wbs_task_id || "");
    setNotes(row.notes || "");
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
        report_date: reportDate,
        trade: trade.trim(),
        contractor: contractor.trim() || null,
        foreman: foreman.trim() || null,
        total_workers: parseInt(total, 10) || 0,
        planned_workers: planned ? parseInt(planned, 10) : 0,
        skilled: parseInt(skilled, 10) || 0,
        unskilled: parseInt(unskilled, 10) || 0,
        regular_hours: parseFloat(regularHrs) || 0,
        ot_hours: parseFloat(otHrs) || 0,
        subcontract_id: subcontractId || null,
        wbs_task_id: wbsTaskId || null,
        notes: notes.trim() || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("site_manpower")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Manpower record updated");
      } else {
        const { error } = await supabase.from("site_manpower").insert([payload]);
        if (error) throw error;
        toast.success("Manpower record added");
      }

      setShowForm(false);
      resetForm();
      void loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Summary statistics for selectedDate
  const totalActualOnDate = varianceRows.reduce((sum, r) => sum + r.actual_workers, 0);
  const totalPlannedOnDate = varianceRows.reduce((sum, r) => sum + r.planned_workers, 0);
  const totalNetVariance = totalActualOnDate - totalPlannedOnDate;
  const overallMobilizationPct =
    totalPlannedOnDate > 0
      ? Math.round((totalActualOnDate / totalPlannedOnDate) * 100)
      : totalActualOnDate > 0
      ? 100
      : 0;

  const underMobilizedTrades = varianceRows.filter((r) => r.status === "under_mobilized");

  const filteredRecords = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.trade?.toLowerCase().includes(q) ||
      r.contractor?.toLowerCase().includes(q) ||
      r.foreman?.toLowerCase().includes(q) ||
      r.wbs_tasks?.task_name?.toLowerCase().includes(q)
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
    <div className="space-y-5">
      {/* Date Filter & Tab Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
            <span className="text-xs font-semibold px-2 text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Date:
            </span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="h-8 text-xs bg-background w-36 border-none shadow-none"
            />
          </div>

          <div className="flex items-center rounded-lg border border-border p-1 bg-muted/40">
            <button
              type="button"
              onClick={() => setActiveTab("variance")}
              className={cn(
                "rounded px-3 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5",
                activeTab === "variance"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Mobilization Variance
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("records")}
              className={cn(
                "rounded px-3 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5",
                activeTab === "records"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              Daily Gang Logs ({rows.length})
            </button>
          </div>
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
              <Plus className="h-4 w-4" /> Log Gang Strength
            </>
          )}
        </Button>
      </div>

      {/* KPI Cards for the selected date */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-blue-600" /> Total Actual Headcount
          </p>
          <p className="text-2xl font-bold mt-1 text-foreground">{totalActualOnDate}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Workers physically on site</p>
        </Card>

        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-purple-600" /> Planned Demand
          </p>
          <p className="text-2xl font-bold mt-1 text-foreground">{totalPlannedOnDate}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Planned in schedule</p>
        </Card>

        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            {totalNetVariance >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-rose-600" />
            )}
            Net Variance (Δ)
          </p>
          <p
            className={cn(
              "text-2xl font-bold mt-1",
              totalNetVariance >= 0 ? "text-emerald-600" : "text-rose-600"
            )}
          >
            {totalNetVariance > 0 ? `+${totalNetVariance}` : totalNetVariance}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {totalNetVariance >= 0 ? "Sufficient crew on site" : "Under-mobilized deficit"}
          </p>
        </Card>

        <Card className="p-3 border-border bg-card shadow-sm">
          <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Mobilization Rate
          </p>
          <p
            className={cn(
              "text-2xl font-bold mt-1",
              overallMobilizationPct >= 100
                ? "text-emerald-600"
                : overallMobilizationPct >= 80
                ? "text-amber-600"
                : "text-rose-600"
            )}
          >
            {overallMobilizationPct}%
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {underMobilizedTrades.length > 0
              ? `${underMobilizedTrades.length} trades under-resourced`
              : "All trades adequately manned"}
          </p>
        </Card>
      </div>

      {/* Under-mobilization Warning Banner */}
      {underMobilizedTrades.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-rose-900">
              Site Mobilization Deficit Alert ({selectedDate})
            </p>
            <p className="text-xs text-rose-700 mt-0.5">
              The following trades are operating below planned gang strength:{" "}
              {underMobilizedTrades
                .map((t) => `${t.trade} (${t.actual_workers}/${t.planned_workers} workers, Δ ${t.variance})`)
                .join(", ")}
              . Under-mobilization may cause schedule slippage.
            </p>
          </div>
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <Card className="border-primary/20 bg-card shadow-sm">
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">
                    {editing ? `Edit Manpower Entry (${editing.trade})` : "Record Site Gang Strength"}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Report Date *</Label>
                  <Input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Trade / Craft *</Label>
                  <Input
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    placeholder="e.g. Steel Fixer, Carpenter, Mason, MEP"
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Contractor / Gang Name</Label>
                  <Input
                    value={contractor}
                    onChange={(e) => setContractor(e.target.value)}
                    placeholder="e.g. ABC Civil Subcontractor"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Linked Subcontract</Label>
                  <select
                    value={subcontractId}
                    onChange={(e) => setSubcontractId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">(None - Direct / General Labor)</option>
                    {subcontracts.map((sc) => (
                      <option key={sc.id} value={sc.id}>
                        {sc.subcontract_no} {sc.scope_of_work ? `- ${sc.scope_of_work}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Linked Schedule Activity</Label>
                  <select
                    value={wbsTaskId}
                    onChange={(e) => setWbsTaskId(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">(General Site Overhead)</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        [{t.task_code}] {t.task_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Foreman / Supervisor</Label>
                  <Input
                    value={foreman}
                    onChange={(e) => setForeman(e.target.value)}
                    placeholder="e.g. David Brown"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Total Workers Today *</Label>
                  <Input
                    type="number"
                    min="0"
                    value={total}
                    onChange={(e) => setTotal(e.target.value)}
                    placeholder="e.g. 12"
                    className="text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Planned Headcount (Target)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={planned}
                    onChange={(e) => setPlanned(e.target.value)}
                    placeholder="e.g. 15"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Skilled Workers</Label>
                  <Input
                    type="number"
                    min="0"
                    value={skilled}
                    onChange={(e) => setSkilled(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Unskilled Workers</Label>
                  <Input
                    type="number"
                    min="0"
                    value={unskilled}
                    onChange={(e) => setUnskilled(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Regular Hours / Worker</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={regularHrs}
                    onChange={(e) => setRegularHrs(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Overtime Hours / Worker</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={otHrs}
                    onChange={(e) => setOtHrs(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="col-span-full space-y-1">
                  <Label className="text-xs">Site Observations & Gang Notes</Label>
                  <textarea
                    rows={2}
                    className="w-full rounded-md border border-input bg-background p-2.5 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="Work location, gang deployment, reasons for shortage..."
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
                    "Update Entry"
                  ) : (
                    "Save Manpower"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Main Tab 1: Mobilization Variance */}
      {activeTab === "variance" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-foreground">
                Trade Mobilization Variance on {selectedDate}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Comparison of actual site deployment against scheduled trade demand
              </p>
            </div>
            {loadingVariance && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                  <th className="px-4 py-3">Trade / Craft</th>
                  <th className="px-4 py-3">Contractor / Gang</th>
                  <th className="px-4 py-3 text-right">Planned (Target)</th>
                  <th className="px-4 py-3 text-right">Actual on Site</th>
                  <th className="px-4 py-3 text-right">Variance (Δ)</th>
                  <th className="px-4 py-3 text-right">Mobilization %</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {varianceRows.map((r, i) => {
                  const isUnder = r.status === "under_mobilized";
                  const isSurplus = r.status === "surplus";
                  return (
                    <tr key={i} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground">{r.trade}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.contractor}</td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                        {r.planned_workers}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                        {r.actual_workers}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 text-right font-mono font-semibold",
                          isUnder ? "text-rose-600" : isSurplus ? "text-blue-600" : "text-emerald-600"
                        )}
                      >
                        {r.variance > 0 ? `+${r.variance}` : r.variance}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {r.mobilization_pct}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                            isUnder
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : isSurplus
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}
                        >
                          {isUnder ? "Under-mobilized" : isSurplus ? "Surplus" : "Balanced"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!varianceRows.length && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="font-medium text-foreground">No manpower logs on {selectedDate}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Log today&apos;s site gang strengths to evaluate mobilization compliance.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Main Tab 2: Detailed Gang Records */}
      {activeTab === "records" && (
        <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search trades, contractors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-8"
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {filteredRecords.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Trade</th>
                  <th className="px-4 py-3">Contractor / Gang</th>
                  <th className="px-4 py-3">Linked Activity</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Skilled</th>
                  <th className="px-4 py-3 text-right">Unskilled</th>
                  <th className="px-4 py-3 text-right">Reg / OT</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {r.report_date?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{r.trade}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.contractor || "—"}
                      {r.foreman && <span className="block text-[10px] text-muted-foreground">Foreman: {r.foreman}</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.wbs_tasks ? (
                        <div className="flex items-center gap-1 font-medium text-blue-600 truncate max-w-[160px]" title={r.wbs_tasks.task_name}>
                          <Layers className="h-3 w-3 shrink-0" />
                          <span className="truncate">{r.wbs_tasks.task_code} {r.wbs_tasks.task_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px]">General Overhead</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-foreground">
                      {r.total_workers}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {r.skilled}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                      {r.unskilled}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                      {r.regular_hours}h / {r.ot_hours}h
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
                ))}
              </tbody>
            </table>
          </div>

          {!filteredRecords.length && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Users className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="font-medium text-foreground">No manpower gang records logged yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
