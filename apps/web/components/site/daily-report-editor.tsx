"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudRain,
  HardHat,
  ListChecks,
  Loader2,
  Plus,
  Save,
  Send,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  Users,
  X,
  ShieldAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createDailyReport,
  getDailyReport,
  getDailyReportPlanningContext,
  listDailyReportActivities,
  saveDailyReportActivities,
  syncDailyReportToPlanning,
  updateDailyReport,
  type ActivityExecutionStatus,
  type DailyReportActivityInput,
  type DelayCategory,
  type PlanningContextActivity,
  type SiteDailyReport,
  type StepProgressItem,
} from "@/lib/site/daily-report-service";
import {
  calculateWeightedProgress,
  deriveActivityStatus,
  validateDailyReportPayload,
} from "@/lib/site/daily-report-math";
import { todayISO } from "@/lib/planning/work-calendar";
import { cn } from "@/lib/utils";

interface DailyReportEditorProps {
  projectId: string;
  reportId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

interface QualityHoldpointInfo {
  task_id: string;
  total_inspections: number;
  passed_inspections: number;
  failed_inspections: number;
  pending_inspections: number;
  open_ncrs: number;
  has_blocking_holdpoint: boolean;
  holdpoint_message: string | null;
}

interface LocalActivityItem extends DailyReportActivityInput {
  task_code: string;
  task_name: string;
  discipline?: string | null;
  norm_code?: string | null;
  steps_count?: number;
  available_steps?: PlanningContextActivity["steps_json"];
  expanded?: boolean;
}

const EXEC_STATUS_OPTIONS: { value: ActivityExecutionStatus; label: string; color: string }[] = [
  { value: "in_progress", label: "In Progress", color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  { value: "completed", label: "Completed", color: "bg-emerald-500/10 text-emerald-600 border-emerald-200" },
  { value: "hindered", label: "Hindered / Impeded", color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  { value: "stopped", label: "Work Stopped", color: "bg-red-500/10 text-red-600 border-red-200" },
  { value: "not_started", label: "Not Started", color: "bg-slate-500/10 text-slate-600 border-slate-200" },
];

const DELAY_CATEGORIES: { value: DelayCategory; label: string }[] = [
  { value: "weather", label: "Weather (Rain / Wind / Heat)" },
  { value: "material", label: "Material Shortage / Delay" },
  { value: "labor", label: "Labor / Crew Shortage" },
  { value: "subcontractor", label: "Subcontractor Delay" },
  { value: "rfi_design", label: "RFI / Design Clarification Pending" },
  { value: "client", label: "Client / Engineer Instruction" },
  { value: "safety", label: "HSE / Safety Stoppage" },
  { value: "other", label: "Other" },
];

export function DailyReportEditor({
  projectId,
  reportId,
  onClose,
  onSaved,
}: DailyReportEditorProps) {
  const [report, setReport] = useState<SiteDailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Header fields
  const [reportDate, setReportDate] = useState(todayISO());
  const [weather, setWeather] = useState("");
  const [tempLow, setTempLow] = useState("");
  const [tempHigh, setTempHigh] = useState("");
  const [siteConditions, setSiteConditions] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [issues, setIssues] = useState("");
  const [plannedNext, setPlannedNext] = useState("");
  const [status, setStatus] = useState<string>("draft");

  // Activities & planning context
  const [activities, setActivities] = useState<LocalActivityItem[]>([]);
  const [planningTasks, setPlanningTasks] = useState<PlanningContextActivity[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [holdpoints, setHoldpoints] = useState<Map<string, QualityHoldpointInfo>>(new Map());

  const loadHoldpoints = useCallback(async (taskIds: string[]) => {
    if (!taskIds || taskIds.length === 0) return;
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc("check_task_quality_holdpoints", {
        p_task_ids: taskIds,
      });
      if (data) {
        setHoldpoints((prev) => {
          const next = new Map(prev);
          (data as QualityHoldpointInfo[]).forEach((hp) => next.set(hp.task_id, hp));
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to check quality holdpoints:", err);
    }
  }, []);

  // Load planning tasks active around reportDate
  const loadPlanningContext = useCallback(async (date: string) => {
    if (!projectId) return;
    setLoadingContext(true);
    try {
      const tasks = await getDailyReportPlanningContext(projectId, date);
      setPlanningTasks(tasks);
    } catch (e) {
      console.error("Failed to load planning context:", e);
    } finally {
      setLoadingContext(false);
    }
  }, [projectId]);

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        if (reportId) {
          const r = await getDailyReport(reportId);
          if (r) {
            setReport(r);
            setReportDate(r.report_date ? r.report_date.slice(0, 10) : todayISO());
            setWeather(r.weather_conditions || "");
            setTempLow(r.temperature_low != null ? String(r.temperature_low) : "");
            setTempHigh(r.temperature_high != null ? String(r.temperature_high) : "");
            setSiteConditions(r.site_conditions || "");
            setWorkSummary(r.work_summary || "");
            setIssues(r.issues_encountered || "");
            setPlannedNext(r.planned_next_day || "");
            setStatus(r.status || "draft");

            // Load existing activities
            const acts = await listDailyReportActivities(reportId);
            const contextTasks = await getDailyReportPlanningContext(projectId, r.report_date);
            setPlanningTasks(contextTasks);

            const contextMap = new Map(contextTasks.map((t) => [t.task_id, t]));

            setActivities(
              acts.map((a) => {
                const ctx = contextMap.get(a.task_id);
                return {
                  id: a.id,
                  task_id: a.task_id,
                  task_code: a.task_code || ctx?.task_code || "Task",
                  task_name: a.task_name || ctx?.task_name || "",
                  discipline: a.discipline || ctx?.discipline || null,
                  norm_code: ctx?.norm_code || null,
                  activity_status: a.activity_status,
                  progress_before: a.progress_before,
                  progress_today: a.progress_today,
                  actual_start_date: a.actual_start_date,
                  actual_finish_date: a.actual_finish_date,
                  step_progress: a.step_progress || [],
                  trade_code: a.trade_code || ctx?.suggested_trade || "",
                  headcount: a.headcount,
                  hours_normal: a.hours_normal,
                  hours_ot: a.hours_ot,
                  quantity_done: a.quantity_done,
                  quantity_unit: a.quantity_unit || ctx?.quantity_unit || "",
                  work_description: a.work_description,
                  has_delay: a.has_delay,
                  delay_reason: a.delay_reason,
                  delay_hours_lost: a.delay_hours_lost,
                  delay_category: a.delay_category,
                  available_steps: ctx?.steps_json || [],
                  steps_count: ctx?.steps_count || 0,
                  expanded: true,
                };
              })
            );
            void loadHoldpoints(acts.map((a) => a.task_id));
          }
        } else {
          // New report
          await loadPlanningContext(reportDate);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    void init();
  }, [projectId, reportId, loadPlanningContext]);

  // When report date changes, reload planning context
  function handleDateChange(newDate: string) {
    setReportDate(newDate);
    void loadPlanningContext(newDate);
  }

  // Filter planning tasks for picker
  const filteredTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    const existingIds = new Set(activities.map((a) => a.task_id));
    return planningTasks.filter((t) => {
      if (existingIds.has(t.task_id)) return false;
      if (!q) return true;
      return `${t.task_code} ${t.task_name} ${t.discipline || ""}`.toLowerCase().includes(q);
    });
  }, [planningTasks, activities, taskQuery]);

  // Add task to activities
  function pickTask(t: PlanningContextActivity) {
    const initialSteps: StepProgressItem[] = (t.steps_json || []).map((s) => ({
      step_id: s.id,
      step_no: s.step_no,
      step_name: s.step_name,
      progress: s.progress || 0,
      weight: s.weight || 0,
      is_completed: (s.progress || 0) === 100,
    }));

    const newItem: LocalActivityItem = {
      task_id: t.task_id,
      task_code: t.task_code,
      task_name: t.task_name,
      discipline: t.discipline,
      norm_code: t.norm_code,
      activity_status: "in_progress",
      progress_before: t.current_progress || 0,
      progress_today: t.current_progress || 0,
      actual_start_date: t.actual_start_date || reportDate,
      actual_finish_date: t.actual_finish_date || null,
      step_progress: initialSteps,
      trade_code: t.suggested_trade || "",
      headcount: 1,
      hours_normal: 8,
      hours_ot: 0,
      quantity_done: null,
      quantity_unit: t.quantity_unit || "",
      work_description: "",
      has_delay: false,
      delay_reason: "",
      delay_hours_lost: 0,
      delay_category: null,
      available_steps: t.steps_json || [],
      steps_count: t.steps_count || 0,
      expanded: true,
    };

    setActivities((prev) => [...prev, newItem]);
    void loadHoldpoints([t.task_id]);
    setShowTaskPicker(false);
    setTaskQuery("");
  }

  // Update activity field
  function updateActivity(index: number, patch: Partial<LocalActivityItem>) {
    setActivities((prev) => {
      const copy = [...prev];
      const cur = copy[index];
      if (!cur) return prev;
      copy[index] = { ...cur, ...patch };
      return copy;
    });
  }

  // Update step progress with weighted rollup to activity progress_today
  function updateStepProgress(actIndex: number, stepIndex: number, newProg: number) {
    setActivities((prev) => {
      const copy = [...prev];
      const act = copy[actIndex];
      if (!act || !act.step_progress) return prev;

      const stepsCopy = [...act.step_progress];
      const step = stepsCopy[stepIndex];
      if (!step) return prev;

      stepsCopy[stepIndex] = {
        ...step,
        progress: newProg,
        is_completed: newProg === 100,
      };

      // Recalculate weighted progress using domain helper
      const calculatedProgress = calculateWeightedProgress(stepsCopy);

      copy[actIndex] = {
        ...act,
        step_progress: stepsCopy,
        progress_today: calculatedProgress,
        activity_status: deriveActivityStatus(calculatedProgress, Boolean(act.has_delay), act.progress_before),
        actual_finish_date: calculatedProgress === 100 ? act.actual_finish_date || reportDate : null,
      };
      return copy;
    });
  }

  // Remove activity
  function removeActivity(index: number) {
    setActivities((prev) => prev.filter((_, i) => i !== index));
  }

  // Save report and activities to database
  async function persistReport(statusToSet: "draft" | "submitted" = "draft"): Promise<string | null> {
    if (!projectId) {
      toast.error("No project selected");
      return null;
    }
    if (!reportDate) {
      toast.error("Please provide a report date");
      return null;
    }

    const payload = {
      report_date: reportDate,
      weather_conditions: weather || null,
      temperature_low: tempLow ? parseFloat(tempLow) : null,
      temperature_high: tempHigh ? parseFloat(tempHigh) : null,
      site_conditions: siteConditions || null,
      work_summary: workSummary || null,
      issues_encountered: issues || null,
      planned_next_day: plannedNext || null,
    };

    let targetReportId = reportId;

    if (targetReportId) {
      await updateDailyReport(targetReportId, {
        ...payload,
        status: statusToSet,
        activities_count: activities.length,
      });
    } else {
      const created = await createDailyReport(projectId, payload);
      targetReportId = created.id;
    }

    // Persist child activities
    if (targetReportId && activities.length > 0) {
      await saveDailyReportActivities(
        targetReportId,
        projectId,
        activities.map((a) => ({
          id: a.id,
          task_id: a.task_id,
          activity_status: a.activity_status,
          progress_before: a.progress_before,
          progress_today: a.progress_today,
          actual_start_date: a.actual_start_date || null,
          actual_finish_date: a.actual_finish_date || null,
          step_progress: a.step_progress || [],
          trade_code: a.trade_code || null,
          headcount: a.headcount || null,
          hours_normal: Number(a.hours_normal) || 0,
          hours_ot: Number(a.hours_ot) || 0,
          quantity_done: a.quantity_done != null ? Number(a.quantity_done) : null,
          quantity_unit: a.quantity_unit || null,
          work_description: a.work_description || null,
          has_delay: a.has_delay,
          delay_reason: a.has_delay ? a.delay_reason || null : null,
          delay_hours_lost: a.has_delay ? Number(a.delay_hours_lost) || 0 : 0,
          delay_category: a.has_delay ? a.delay_category || null : null,
        }))
      );
    }

    return targetReportId;
  }

  // Handle Save Draft
  async function handleSaveDraft() {
    setSaving(true);
    try {
      const savedId = await persistReport("draft");
      if (savedId) {
        toast.success("Daily report draft saved");
        onSaved();
        onClose();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // Handle Submit & Sync to Planning
  async function handleSubmitAndSync() {
    const validation = validateDailyReportPayload(
      { report_date: reportDate },
      activities.map((a) => ({
        task_id: a.task_id,
        progress_today: a.progress_today,
        has_delay: a.has_delay,
        delay_reason: a.delay_reason,
        delay_category: a.delay_category,
        step_progress: a.step_progress,
      }))
    );

    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    const blockedActivity = activities.find((a) => {
      const hp = holdpoints.get(a.task_id);
      return (
        (a.progress_today >= 100 || a.activity_status === "completed") &&
        hp?.has_blocking_holdpoint
      );
    });

    if (blockedActivity) {
      const hp = holdpoints.get(blockedActivity.task_id);
      const proceed = confirm(
        `Quality Hold-Point Warning:\nActivity [${blockedActivity.task_code}] "${blockedActivity.task_name}" has unresolved quality issues:\n${hp?.holdpoint_message || "Inspection Failed or Open NCR"}.\n\nDo you want to confirm supervisor override and submit anyway?`
      );
      if (!proceed) return;
    }

    setSyncing(true);
    try {
      const savedId = await persistReport("submitted");
      if (!savedId) return;

      const syncResult = await syncDailyReportToPlanning(savedId);

      const msg = [
        `Report submitted!`,
        `${syncResult.activities_direct_synced} activities updated directly.`,
        syncResult.activities_pending_review > 0
          ? `${syncResult.activities_pending_review} queued for Planner Review.`
          : "",
        syncResult.productivity_logs_recorded > 0
          ? `${syncResult.productivity_logs_recorded} productivity output logs created.`
          : "",
        syncResult.delays_logged > 0 ? `${syncResult.delays_logged} delays logged to register.` : "",
      ]
        .filter(Boolean)
        .join(" ");

      toast.success(msg, { duration: 6000 });
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isSubmitted = status === "submitted" || status === "verified_by_pm";

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">
              {reportId ? "Edit Site Daily Report" : "New Site Daily Report"}
            </h2>
            <Badge
              variant={isSubmitted ? "default" : "outline"}
              className={cn(
                "capitalize",
                isSubmitted ? "bg-blue-600 text-white" : "border-amber-400 bg-amber-50 text-amber-700"
              )}
            >
              {status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Record daily site execution, track activity progress, installed quantities, crew hours, and site delays.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving || syncing}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={saving || syncing}
            className="border-slate-300"
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            Save Draft
          </Button>
          <Button
            size="sm"
            onClick={handleSubmitAndSync}
            disabled={saving || syncing}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {syncing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isSubmitted ? "Re-sync to Planning" : "Submit & Sync to Planning"}
          </Button>
        </div>
      </div>

      {/* General Diary Card */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
            <Sun className="h-4 w-4 text-amber-500" />
            <span>Site Conditions & Weather</span>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Report Date *</Label>
              <Input
                type="date"
                value={reportDate}
                onChange={(e) => handleDateChange(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Weather</Label>
              <Input
                value={weather}
                onChange={(e) => setWeather(e.target.value)}
                placeholder="Sunny, Rain AM, Cloudy..."
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Temp Low (°C)</Label>
              <Input
                type="number"
                value={tempLow}
                onChange={(e) => setTempLow(e.target.value)}
                placeholder="24"
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Temp High (°C)</Label>
              <Input
                type="number"
                value={tempHigh}
                onChange={(e) => setTempHigh(e.target.value)}
                placeholder="33"
                className="h-9 text-xs"
              />
            </div>
            <div className="col-span-2 sm:col-span-4 space-y-1.5">
              <Label className="text-xs">Site & Access Conditions</Label>
              <Input
                value={siteConditions}
                onChange={(e) => setSiteConditions(e.target.value)}
                placeholder="Dry, accessible, crane operational..."
                className="h-9 text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ACTIVITIES SECTION */}
      <Card className="border-primary/20 bg-primary/[0.01]">
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-primary" />
              <div>
                <h3 className="text-sm font-bold text-foreground">Activities Performed Today</h3>
                <p className="text-xs text-muted-foreground">
                  Synchronize physical progress, activity steps, quantities, and hours into the Planning module.
                </p>
              </div>
              <Badge variant="outline" className="ml-2 font-mono text-xs">
                {activities.length} {activities.length === 1 ? "activity" : "activities"}
              </Badge>
            </div>

            <div className="relative">
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={() => setShowTaskPicker(!showTaskPicker)}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Plus className="h-3.5 w-3.5" /> Add Planning Activity
              </Button>

              {/* Task Picker Dropdown */}
              {showTaskPicker && (
                <div className="absolute right-0 top-10 z-50 w-96 max-h-80 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl flex flex-col">
                  <div className="p-2 border-b bg-muted/40">
                    <Input
                      autoFocus
                      placeholder="Search active WBS tasks..."
                      value={taskQuery}
                      onChange={(e) => setTaskQuery(e.target.value)}
                      className="h-8 text-xs"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground flex items-center justify-between">
                      <span>Scheduled for {reportDate}</span>
                      {loadingContext && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                    </p>
                  </div>

                  <div className="overflow-y-auto flex-1 p-1 divide-y divide-border/40">
                    {filteredTasks.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        {loadingContext ? "Loading schedule tasks..." : "No matching tasks found."}
                      </p>
                    ) : (
                      filteredTasks.map((t) => (
                        <button
                          key={t.task_id}
                          type="button"
                          onClick={() => pickTask(t)}
                          className="w-full text-left p-2.5 hover:bg-muted/70 rounded-md transition-colors flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs text-primary">{t.task_code}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {t.discipline || "General"}
                            </Badge>
                          </div>
                          <span className="text-xs font-medium text-foreground line-clamp-1">{t.task_name}</span>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Current progress: {t.current_progress}%</span>
                            {t.steps_count > 0 && (
                              <span className="text-indigo-500 font-medium">
                                {t.steps_count} steps
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activities List */}
          {activities.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-muted-foreground">
              <CalendarCheck className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-medium">No planning activities linked to this report yet.</p>
              <p className="text-[11px] text-muted-foreground">
                Click &ldquo;Add Planning Activity&rdquo; to record progress on scheduled activities.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((act, idx) => (
                <div
                  key={act.task_id}
                  className="rounded-xl border border-border bg-card shadow-sm overflow-hidden"
                >
                  {/* Activity Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-2.5 border-b">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-primary">{act.task_code}</span>
                      <span className="font-semibold text-xs text-foreground line-clamp-1">
                        {act.task_name}
                      </span>
                      {act.discipline && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-background">
                          {act.discipline}
                        </Badge>
                      )}
                      {(() => {
                        const hp = holdpoints.get(act.task_id);
                        if (!hp) return null;
                        if (hp.has_blocking_holdpoint) {
                          return (
                            <span
                              className="inline-flex items-center gap-1 rounded bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                              title={hp.holdpoint_message || "Quality Hold-point Active"}
                            >
                              <ShieldAlert className="h-3 w-3 text-rose-600" />
                              {hp.failed_inspections > 0 ? "WIR Failed" : `${hp.open_ncrs} Open NCR`}
                            </span>
                          );
                        }
                        if (hp.pending_inspections > 0) {
                          return (
                            <span
                              className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                              title="WIR inspection pending sign-off"
                            >
                              <Clock className="h-3 w-3 text-amber-600" />
                              WIR Pending
                            </span>
                          );
                        }
                        if (hp.passed_inspections > 0) {
                          return (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              QA Approved
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Status selector */}
                      <select
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium"
                        value={act.activity_status}
                        onChange={(e) =>
                          updateActivity(idx, {
                            activity_status: e.target.value as ActivityExecutionStatus,
                            progress_today:
                              e.target.value === "completed" ? 100 : act.progress_today,
                            actual_finish_date:
                              e.target.value === "completed" ? act.actual_finish_date || reportDate : null,
                          })
                        }
                      >
                        {EXEC_STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateActivity(idx, { expanded: !act.expanded })}
                        className="h-7 w-7 p-0"
                      >
                        {act.expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeActivity(idx)}
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {act.expanded && (
                    <div className="p-4 space-y-4 text-xs">
                      {/* Progress & Dates Row */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 bg-muted/20 p-3 rounded-lg border border-border/50">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Previous Progress</Label>
                          <p className="mt-1 font-semibold text-sm text-foreground tabular-nums">
                            {act.progress_before}%
                          </p>
                        </div>

                        <div>
                          <Label className="text-[11px] font-semibold text-foreground">
                            Today&apos;s Progress (%) *
                          </Label>
                          <div className="flex items-center gap-2 mt-1">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={act.progress_today}
                              onChange={(e) => {
                                const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                                updateActivity(idx, {
                                  progress_today: val,
                                  activity_status:
                                    val === 100
                                      ? "completed"
                                      : val > 0
                                      ? "in_progress"
                                      : act.activity_status,
                                  actual_finish_date: val === 100 ? act.actual_finish_date || reportDate : null,
                                });
                              }}
                              className="h-8 text-xs font-bold tabular-nums"
                            />
                            {act.progress_today > (act.progress_before ?? 0) && (
                              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-300 text-[10px] px-1 py-0">
                                +{(act.progress_today - (act.progress_before ?? 0)).toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div>
                          <Label className="text-[11px] text-muted-foreground">Actual Start Date</Label>
                          <Input
                            type="date"
                            value={act.actual_start_date || ""}
                            onChange={(e) => updateActivity(idx, { actual_start_date: e.target.value || null })}
                            className="mt-1 h-8 text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-[11px] text-muted-foreground">Actual Finish Date</Label>
                          <Input
                            type="date"
                            value={act.actual_finish_date || ""}
                            onChange={(e) => updateActivity(idx, { actual_finish_date: e.target.value || null })}
                            className="mt-1 h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* ACTIVITY STEPS ACCORDION (If steps exist) */}
                      {act.step_progress && act.step_progress.length > 0 && (
                        <div className="rounded-lg border border-indigo-200 bg-indigo-50/20 p-3 space-y-2">
                          <div className="flex items-center justify-between text-indigo-700 font-semibold text-xs">
                            <span className="flex items-center gap-1.5">
                              <ListChecks className="h-4 w-4" />
                              Activity Steps Checklist ({act.step_progress.length} steps)
                            </span>
                            <span className="text-[11px] font-normal text-muted-foreground">
                              Steps roll up weighted progress to today&apos;s total
                            </span>
                          </div>

                          <div className="space-y-1.5 divide-y divide-indigo-100">
                            {act.step_progress.map((step, sIdx) => (
                              <div
                                key={step.step_id}
                                className="pt-1.5 flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    #{step.step_no}
                                  </span>
                                  <span className="font-medium text-foreground truncate">
                                    {step.step_name}
                                  </span>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                                    Weight: {step.weight}%
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={step.progress}
                                      onChange={(e) =>
                                        updateStepProgress(
                                          idx,
                                          sIdx,
                                          Math.min(100, Math.max(0, Number(e.target.value) || 0))
                                        )
                                      }
                                      className="h-7 w-16 text-xs text-right tabular-nums"
                                    />
                                    <span className="text-muted-foreground text-[11px]">%</span>
                                  </div>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={step.progress === 100 ? "default" : "outline"}
                                    onClick={() => updateStepProgress(idx, sIdx, step.progress === 100 ? 0 : 100)}
                                    className="h-7 text-[10px] px-2"
                                  >
                                    {step.progress === 100 ? (
                                      <>
                                        <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-300" /> Done
                                      </>
                                    ) : (
                                      "100%"
                                    )}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Productivity & Crew Output */}
                      <div className="border rounded-lg p-3 bg-card space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>Installed Output & Crew Manpower</span>
                          {act.norm_code && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Norm: {act.norm_code}
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Trade</Label>
                            <Input
                              value={act.trade_code || ""}
                              onChange={(e) => updateActivity(idx, { trade_code: e.target.value })}
                              placeholder="e.g. Concreting"
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px]">Headcount</Label>
                            <Input
                              type="number"
                              min={1}
                              value={act.headcount != null ? act.headcount : ""}
                              onChange={(e) =>
                                updateActivity(idx, {
                                  headcount: e.target.value ? parseInt(e.target.value) : null,
                                })
                              }
                              placeholder="Workers"
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px]">Normal Hours</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              value={act.hours_normal}
                              onChange={(e) => updateActivity(idx, { hours_normal: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px]">OT Hours</Label>
                            <Input
                              type="number"
                              min={0}
                              step={0.5}
                              value={act.hours_ot}
                              onChange={(e) => updateActivity(idx, { hours_ot: parseFloat(e.target.value) || 0 })}
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="col-span-2 sm:col-span-1 space-y-1">
                            <Label className="text-[11px]">Quantity Done</Label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                value={act.quantity_done != null ? act.quantity_done : ""}
                                onChange={(e) =>
                                  updateActivity(idx, {
                                    quantity_done: e.target.value !== "" ? parseFloat(e.target.value) : null,
                                  })
                                }
                                placeholder="Qty"
                                className="h-8 text-xs"
                              />
                              <Input
                                value={act.quantity_unit || ""}
                                onChange={(e) => updateActivity(idx, { quantity_unit: e.target.value })}
                                placeholder="Unit"
                                className="h-8 w-14 text-xs text-center"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Live Man-hours preview */}
                        {(act.headcount || 0) > 0 && ((act.hours_normal || 0) + (act.hours_ot || 0)) > 0 && (
                          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
                            <span>
                              Logged Crew Hours:{" "}
                              <strong className="text-foreground">
                                {((act.headcount || 1) * ((act.hours_normal || 0) + (act.hours_ot || 0))).toFixed(1)}{" "}
                                man-hours
                              </strong>
                            </span>
                            <span className="text-[10px] text-emerald-600">
                              ✓ Automatically feeds Productivity Index on submission
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Delay & Hindrance Section */}
                      <div className="border rounded-lg p-3 bg-card space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={act.has_delay}
                            onChange={(e) => updateActivity(idx, { has_delay: e.target.checked })}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            Delay / Site Impediment encountered on this activity today
                          </span>
                        </label>

                        {act.has_delay && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Category</Label>
                              <select
                                className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                                value={act.delay_category || ""}
                                onChange={(e) =>
                                  updateActivity(idx, { delay_category: (e.target.value || null) as DelayCategory })
                                }
                              >
                                <option value="">— Select Category —</option>
                                {DELAY_CATEGORIES.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px]">Hours Lost</Label>
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={act.delay_hours_lost}
                                onChange={(e) =>
                                  updateActivity(idx, { delay_hours_lost: parseFloat(e.target.value) || 0 })
                                }
                                placeholder="e.g. 3.5"
                                className="h-8 text-xs"
                              />
                            </div>

                            <div className="col-span-1 sm:col-span-3 space-y-1">
                              <Label className="text-[11px]">Delay Reason / Impact Description</Label>
                              <Input
                                value={act.delay_reason || ""}
                                onChange={(e) => updateActivity(idx, { delay_reason: e.target.value })}
                                placeholder="Describe hindrance, waiting for concrete pump arrival, rain stoppage..."
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Notes / Work Description */}
                      <div className="space-y-1">
                        <Label className="text-[11px]">Activity Work Description & Observations</Label>
                        <textarea
                          rows={2}
                          value={act.work_description || ""}
                          onChange={(e) => updateActivity(idx, { work_description: e.target.value })}
                          placeholder="Specific location (Grid lines / Room), methods, QA inspection notes..."
                          className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-xs outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Narrative & Overall Summaries */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
            <span>Overall Site Notes</span>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">General Work Summary</Label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus:border-primary"
                value={workSummary}
                onChange={(e) => setWorkSummary(e.target.value)}
                placeholder="High-level summary of work carried out across the site today..."
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">General Site Issues Encountered</Label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus:border-primary"
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                  placeholder="Material delivery issues, utility cuts, site safety concerns..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Planned Next Day</Label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs outline-none focus:border-primary"
                  value={plannedNext}
                  onChange={(e) => setPlannedNext(e.target.value)}
                  placeholder="Key priorities and critical activities planned for tomorrow..."
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
