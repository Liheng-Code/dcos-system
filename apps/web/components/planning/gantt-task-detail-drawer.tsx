"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { X, Flag, GitBranch, AlertTriangle, Trash2, Loader2, Plus, Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { GanttTask } from "./gantt-types";
import { ACTIVITY_TYPE_OPTIONS } from "./gantt-types";
import { getStatusLabel, getDependencyLabel, wouldCreateCycle } from "./gantt-utils";
import { cn } from "@/lib/utils";
import {
  addAssignment,
  findOrCreateResourceForProfile,
  listAssignmentsForTask,
  listResources,
  removeAssignment,
  type Assignment,
  type PlanResource,
} from "@/lib/planning/resource-service";

interface StaffProfile {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  department: string | null;
}

interface GanttTaskDetailDrawerProps {
  task: GanttTask | null;
  allTasks: GanttTask[];
  /** Project the task belongs to — needed to scope the resource picker on the Resources tab. */
  projectId: string;
  onClose: () => void;
  onRefresh: () => void;
  /** Open the full relation editor for this task's predecessor at `index` */
  onEditLink?: (index: number) => void;
}

type TabKey = "properties" | "links" | "progress" | "resources";

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  labor: "Labor",
  equipment: "Equipment",
  material: "Material",
  subcontractor: "Subcontractor",
};

const LINK_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "fs", label: "Finish-to-Start (FS)" },
  { value: "ss", label: "Start-to-Start (SS)" },
  { value: "ff", label: "Finish-to-Finish (FF)" },
  { value: "sf", label: "Start-to-Finish (SF)" },
];

const today = () => new Date().toISOString().slice(0, 10);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function GanttTaskDetailDrawer({
  task,
  allTasks,
  projectId,
  onClose,
  onRefresh,
  onEditLink,
}: GanttTaskDetailDrawerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<TabKey>("properties");

  // Form state is seeded once from the task. The parent mounts this component
  // with `key={task.id}`, so opening a different activity remounts it with fresh
  // seed values, while an in-place refresh after a save keeps what the user typed.
  // ---- Properties form ----
  const [name, setName] = useState(() => task?.task_name ?? "");
  const [plannedStart, setPlannedStart] = useState(() => task?.start_date ?? "");
  const [plannedFinish, setPlannedFinish] = useState(() => task?.end_date ?? "");
  const [responsible, setResponsible] = useState(() => task?.owner_name ?? "");
  const [activityType, setActivityType] = useState(() => task?.activity_type ?? "normal");
  const [savingProps, setSavingProps] = useState(false);

  // ---- Links form ----
  const [newPredId, setNewPredId] = useState("");
  const [newLinkType, setNewLinkType] = useState("fs");
  const [newLag, setNewLag] = useState("0");
  const [savingLink, setSavingLink] = useState(false);

  // ---- Progress form ----
  const [newProgress, setNewProgress] = useState(() => String(task?.progress ?? 0));
  const [actualStart, setActualStart] = useState(() => task?.actual_start_date ?? "");
  const [actualFinish, setActualFinish] = useState(() => task?.actual_finish_date ?? "");
  const [notes, setNotes] = useState(() => task?.field_observation_notes ?? "");
  const [savingProgress, setSavingProgress] = useState(false);

  // ---- Resources tab ----
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [activeResources, setActiveResources] = useState<PlanResource[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [newResourceId, setNewResourceId] = useState("");
  const [newAllocation, setNewAllocation] = useState("100");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [teamProfiles, setTeamProfiles] = useState<StaffProfile[]>([]);
  const [teamProfilesLoaded, setTeamProfilesLoaded] = useState(false);
  const [assigningProfileId, setAssigningProfileId] = useState<string | null>(null);
  const loadingTeamProfiles = showTeamPicker && !teamProfilesLoaded;

  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    // loadingResources starts true (see useState above); the parent remounts this
    // drawer with key={task.id} per task, so the initial value covers the spinner
    // without a synchronous setState call inside the effect body.
    Promise.all([listAssignmentsForTask(task.id), listResources(projectId)])
      .then(([a, r]) => {
        if (cancelled) return;
        setAssignments(a);
        setActiveResources(r.filter((res) => res.is_active));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (!cancelled) setLoadingResources(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task, projectId]);

  useEffect(() => {
    if (!showTeamPicker || teamProfilesLoaded) return;
    Promise.resolve(
      supabase.from("profiles").select("id, full_name, role, avatar_url, department").order("full_name"),
    ).then(({ data, error }) => {
      if (error) {
        toast.error(error.message);
      } else {
        setTeamProfiles((data ?? []) as StaffProfile[]);
      }
      setTeamProfilesLoaded(true);
    });
  }, [showTeamPicker, teamProfilesLoaded, supabase]);

  const predecessors = useMemo(() => {
    if (!task) return [];
    return (task.dependency_task_ids ?? [])
      .map((id, i) => {
        const t = allTasks.find((at) => at.id === id);
        if (!t) return null;
        return {
          index: i,
          task: t,
          type: getDependencyLabel(task.dependency_types?.[i] || "fs"),
          lag: Number(task.dependency_lag_days?.[i] ?? 0) || 0,
        };
      })
      .filter(Boolean) as { index: number; task: GanttTask; type: string; lag: number }[];
  }, [task, allTasks]);

  const successors = useMemo(() => {
    if (!task) return [];
    return allTasks.filter((at) => at.dependency_task_ids?.includes(task.id));
  }, [task, allTasks]);

  const predecessorOptions = useMemo(() => {
    if (!task) return [];
    const linked = new Set(task.dependency_task_ids ?? []);
    return allTasks
      .filter((t) => t.id !== task.id && !linked.has(t.id))
      .sort((a, b) => a.task_code.localeCompare(b.task_code));
  }, [task, allTasks]);

  if (!task) return null;

  const linkCount = task.dependency_task_ids?.length ?? 0;

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  async function handleSaveProperties() {
    if (!task) return;
    if (!name.trim()) {
      toast.error("Activity name is required.");
      return;
    }
    setSavingProps(true);
    const { error } = await supabase
      .from("wbs_tasks")
      .update({
        task_name: name.trim(),
        start_date: plannedStart || null,
        end_date: plannedFinish || null,
        owner_name: responsible.trim() || null,
        activity_type: activityType,
      })
      .eq("id", task.id);
    setSavingProps(false);
    if (error) {
      toast.error("Failed to save: " + error.message);
      return;
    }
    toast.success("Activity properties saved");
    onRefresh();
  }

  async function handleAddDependency() {
    if (!task) return;
    if (!newPredId) {
      toast.error("Select a predecessor activity.");
      return;
    }
    if ((task.dependency_task_ids ?? []).includes(newPredId)) {
      toast.error("That predecessor is already linked.");
      return;
    }
    if (wouldCreateCycle(newPredId, task.id, allTasks)) {
      toast.error("That link would create a circular dependency.");
      return;
    }
    const lagNum = Number(newLag);
    if (Number.isNaN(lagNum)) {
      toast.error("Lag must be a number.");
      return;
    }
    setSavingLink(true);
    const { error } = await supabase
      .from("wbs_tasks")
      .update({
        dependency_task_ids: [...(task.dependency_task_ids ?? []), newPredId],
        dependency_types: [...(task.dependency_types ?? []), newLinkType],
        dependency_lag_days: [...(task.dependency_lag_days ?? []), lagNum],
      })
      .eq("id", task.id);
    setSavingLink(false);
    if (error) {
      toast.error("Failed to add link: " + error.message);
      return;
    }
    toast.success("Dependency added");
    setNewPredId("");
    setNewLinkType("fs");
    setNewLag("0");
    onRefresh();
  }

  async function handleRemoveDependency(index: number) {
    if (!task) return;
    const ids = [...(task.dependency_task_ids ?? [])];
    const types = [...(task.dependency_types ?? [])];
    const lags = [...(task.dependency_lag_days ?? [])];
    ids.splice(index, 1);
    types.splice(index, 1);
    lags.splice(index, 1);
    const { error } = await supabase
      .from("wbs_tasks")
      .update({
        dependency_task_ids: ids,
        dependency_types: types,
        dependency_lag_days: lags,
      })
      .eq("id", task.id);
    if (error) {
      toast.error("Failed to remove link: " + error.message);
      return;
    }
    toast.success("Dependency removed");
    onRefresh();
  }

  async function handleSubmitProgress() {
    if (!task) return;
    const p = clamp(Math.round(Number(newProgress)), 0, 100);
    if (Number.isNaN(p)) {
      toast.error("Progress must be a number between 0 and 100.");
      return;
    }
    const patch: Record<string, unknown> = {
      progress: p,
      actual_start_date: actualStart || null,
      actual_finish_date: actualFinish || null,
      field_observation_notes: notes.trim() || null,
    };
    if (p >= 100) {
      patch.status = "completed";
      patch.delay_status = "on_track";
      if (!actualStart) patch.actual_start_date = task.start_date ?? today();
      if (!actualFinish) patch.actual_finish_date = today();
    } else if (p > 0) {
      if (!actualStart) patch.actual_start_date = task.start_date ?? today();
      if (task.status === "open" || task.status === "assigned") patch.status = "in_progress";
    }

    setSavingProgress(true);
    const { error } = await supabase.from("wbs_tasks").update(patch).eq("id", task.id);
    setSavingProgress(false);
    if (error) {
      toast.error("Failed to submit update: " + error.message);
      return;
    }
    toast.success("Progress update submitted");
    onRefresh();
  }

  async function refreshAssignments() {
    if (!task) return;
    try {
      setAssignments(await listAssignmentsForTask(task.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAddAssignment() {
    if (!task) return;
    if (!newResourceId) {
      toast.error("Select a resource.");
      return;
    }
    if (assignments.some((a) => a.resource_id === newResourceId)) {
      toast.error("That resource is already assigned to this task.");
      return;
    }
    const pct = Number(newAllocation);
    if (Number.isNaN(pct) || pct <= 0) {
      toast.error("Allocation % must be a positive number.");
      return;
    }
    setSavingAssignment(true);
    try {
      await addAssignment(task.id, newResourceId, pct);
      toast.success("Resource assigned");
      setNewResourceId("");
      setNewAllocation("100");
      await refreshAssignments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAssignment(false);
    }
  }

  async function handleRemoveAssignment(resourceId: string) {
    if (!task) return;
    try {
      await removeAssignment(task.id, resourceId);
      toast.success("Assignment removed");
      await refreshAssignments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAssignTeamMember(profile: StaffProfile) {
    if (!task) return;
    setAssigningProfileId(profile.id);
    try {
      const resource = await findOrCreateResourceForProfile(projectId, profile.id, profile.full_name);
      await addAssignment(task.id, resource.id, 100);
      toast.success(`${profile.full_name} assigned`);
      setShowTeamPicker(false);
      const refreshed = await listResources(projectId);
      setActiveResources(refreshed.filter((res) => res.is_active));
      await refreshAssignments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigningProfileId(null);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const tabs: { key: TabKey; label: string }[] = [
    { key: "properties", label: "Properties" },
    { key: "links", label: `Links (${linkCount})` },
    { key: "progress", label: "Progress" },
    { key: "resources", label: `Resources (${assignments.length})` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/10" onClick={onClose} />
      <div className="relative flex h-full w-[440px] max-w-[92vw] flex-col border-l border-border bg-background shadow-xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="shrink-0 border-b border-border px-4 pt-3 pb-0">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-primary">{task.task_code}</span>
                <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">
                  {task.discipline || task.wbs_name || "—"}
                </span>
                {task.is_milestone && <Flag className="h-3.5 w-3.5 text-amber-500" />}
                {task.is_critical && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              </div>
              <h2 className="mt-1 truncate text-base font-semibold leading-snug">{task.task_name}</h2>
              <Link
                href={`/dashboard/tasks/${task.id}`}
                className="mt-0.5 inline-flex items-center text-[10px] font-medium text-primary hover:underline"
              >
                Open full task detail →
              </Link>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tab strip */}
          <div className="mt-3 flex gap-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "border-b-2 pb-2 text-xs font-semibold uppercase tracking-wide transition-colors",
                  tab === t.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === "properties" && (
            <div className="space-y-4">
              {/* CPM float analysis */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  CPM Float Analysis
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <Metric
                    label="Total Float"
                    value={task.total_float != null ? `${task.total_float} Days` : "—"}
                    tone={task.total_float != null && task.total_float <= 0 ? "danger" : "default"}
                  />
                  <Metric
                    label="Free Float"
                    value={task.free_float != null ? `${task.free_float} Days` : "—"}
                  />
                  <Metric label="Early Start / Finish" value={`${task.early_start ?? "—"}  /  ${task.early_finish ?? "—"}`} />
                  <Metric label="Late Start / Finish" value={`${task.late_start ?? "—"}  /  ${task.late_finish ?? "—"}`} />
                </div>
              </div>

              <Field label="Activity Name">
                <input
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Planned Start">
                  <input
                    type="date"
                    className={inputCls}
                    value={plannedStart}
                    onChange={(e) => setPlannedStart(e.target.value)}
                  />
                </Field>
                <Field label="Planned Finish">
                  <input
                    type="date"
                    className={inputCls}
                    value={plannedFinish}
                    onChange={(e) => setPlannedFinish(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Responsible Party">
                  <input
                    className={inputCls}
                    value={responsible}
                    onChange={(e) => setResponsible(e.target.value)}
                    placeholder="e.g. Mobilization Team"
                  />
                </Field>
                <Field label="Activity Type">
                  <select
                    className={inputCls}
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value)}
                  >
                    {ACTIVITY_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <button
                type="button"
                onClick={handleSaveProperties}
                disabled={savingProps}
                className={primaryBtnCls}
              >
                {savingProps && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Properties
              </button>
            </div>
          )}

          {tab === "links" && (
            <div className="space-y-5">
              {/* Add predecessor */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Add Predecessor Link
                </div>
                <div className="space-y-3">
                  <Field label="Predecessor Activity">
                    <select
                      className={inputCls}
                      value={newPredId}
                      onChange={(e) => setNewPredId(e.target.value)}
                    >
                      <option value="">-- Select Predecessor --</option>
                      {predecessorOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.task_code} — {t.task_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Link Type">
                      <select
                        className={inputCls}
                        value={newLinkType}
                        onChange={(e) => setNewLinkType(e.target.value)}
                      >
                        {LINK_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Lag Days (+/-)">
                      <input
                        type="number"
                        className={inputCls}
                        value={newLag}
                        onChange={(e) => setNewLag(e.target.value)}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddDependency}
                    disabled={savingLink}
                    className={primaryBtnCls}
                  >
                    {savingLink ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add Dependency
                  </button>
                </div>
              </div>

              {/* Predecessors */}
              <div>
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Predecessors
                </h4>
                {predecessors.length === 0 ? (
                  <p className="rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    No predecessor links configured.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {predecessors.map((p) => (
                      <div
                        key={p.task.id}
                        className="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-xs"
                      >
                        <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="font-mono text-[10px] text-muted-foreground">{p.task.task_code}</span>
                        <span className="truncate">{p.task.task_name}</span>
                        <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">
                          {p.type} · Lag: {p.lag}d
                        </span>
                        {onEditLink && (
                          <button
                            type="button"
                            onClick={() => onEditLink(p.index)}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Edit relation"
                            title="Edit relation type & lag"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveDependency(p.index)}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove predecessor"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Successors */}
              <div>
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Successors
                </h4>
                {successors.length === 0 ? (
                  <p className="rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    No successor links.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {successors.map((s) => {
                      const i = s.dependency_task_ids?.indexOf(task.id) ?? -1;
                      const type = getDependencyLabel(s.dependency_types?.[i] || "fs");
                      const lag = Number(s.dependency_lag_days?.[i] ?? 0) || 0;
                      return (
                        <div
                          key={s.id}
                          className="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-xs"
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">{s.task_code}</span>
                          <span className="truncate">{s.task_name}</span>
                          <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">
                            {type} · Lag: {lag}d
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "progress" && (
            <div className="space-y-4">
              {/* Current progress */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Current Progress
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <Metric label="Confirmed Progress" value={`${task.progress}%`} />
                  <Metric label="Activity Status" value={getStatusLabel(task.status)} />
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>

              <Field label="New Physical Progress % (0-100)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={newProgress}
                  onChange={(e) => setNewProgress(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Actual Start Date">
                  <input
                    type="date"
                    className={inputCls}
                    value={actualStart}
                    onChange={(e) => setActualStart(e.target.value)}
                  />
                </Field>
                <Field label="Actual Finish Date (if 100%)">
                  <input
                    type="date"
                    className={inputCls}
                    value={actualFinish}
                    onChange={(e) => setActualFinish(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Site Field Observation / Notes">
                <textarea
                  rows={4}
                  className={cn(inputCls, "resize-y")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Enter field notes, pour details, or site observations..."
                />
              </Field>

              <button
                type="button"
                onClick={handleSubmitProgress}
                disabled={savingProgress}
                className={primaryBtnCls}
              >
                {savingProgress && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Submit Progress Update
              </button>
            </div>
          )}

          {tab === "resources" && (
            <div className="space-y-5">
              {/* Add assignment */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Add Assignment
                </div>
                <div className="space-y-3">
                  <Field label="Resource">
                    <select
                      className={inputCls}
                      value={newResourceId}
                      onChange={(e) => setNewResourceId(e.target.value)}
                    >
                      <option value="">-- Select Resource --</option>
                      {activeResources
                        .filter((r) => !assignments.some((a) => a.resource_id === r.id))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.profile_id ? "(Team) " : ""}{r.name} ({RESOURCE_TYPE_LABEL[r.resource_type] ?? r.resource_type})
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Allocation %">
                    <input
                      type="number"
                      min={1}
                      className={inputCls}
                      value={newAllocation}
                      onChange={(e) => setNewAllocation(e.target.value)}
                    />
                  </Field>
                  <button
                    type="button"
                    onClick={handleAddAssignment}
                    disabled={savingAssignment}
                    className={primaryBtnCls}
                  >
                    {savingAssignment ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Add Assignment
                  </button>
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  {!showTeamPicker ? (
                    <button
                      type="button"
                      onClick={() => setShowTeamPicker(true)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      + Assign a team member…
                    </button>
                  ) : (
                    <div className="rounded-lg border border-border bg-background p-2">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Assign Team Member
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowTeamPicker(false)}
                          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {loadingTeamProfiles ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="max-h-40 space-y-0.5 overflow-y-auto">
                          {teamProfiles.length === 0 && (
                            <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">No staff found</p>
                          )}
                          {teamProfiles.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleAssignTeamMember(p)}
                              disabled={assigningProfileId !== null}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:opacity-50"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-medium text-slate-600">
                                {p.full_name.charAt(0).toUpperCase()}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                <span className="block truncate font-medium">{p.full_name}</span>
                                <span className="block text-[9px] text-muted-foreground">
                                  {p.role}{p.department ? ` · ${p.department}` : ""}
                                </span>
                              </span>
                              {assigningProfileId === p.id && (
                                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Current assignments */}
              <div>
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned Resources
                </h4>
                {loadingResources ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  </div>
                ) : assignments.length === 0 ? (
                  <p className="rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    No resources assigned to this activity.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {assignments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-md bg-muted/20 px-2.5 py-1.5 text-xs"
                      >
                        <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{a.resource_name}</span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {RESOURCE_TYPE_LABEL[a.resource_type] ?? a.resource_type}
                        </span>
                        <span className="ml-auto whitespace-nowrap text-[10px] text-muted-foreground">
                          {a.allocation_percent}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignment(a.resource_id)}
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Remove assignment"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
const inputCls =
  "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const primaryBtnCls =
  "mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-semibold", tone === "danger" ? "text-red-600" : "text-foreground")}>
        {value}
      </div>
    </div>
  );
}
