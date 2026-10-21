"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckSquare, ChevronDown, ListPlus, Loader2, Search, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { TemplatePicker } from "@/components/project/wbs/wbs-activity-steps-panel";
import { listActivityStepTemplates, loadProjectKind, type ActivityStepTemplate } from "@/lib/planning/activity-steps-service";
import { buildMatcher, groupStepTemplates, isConfidentMatch, type MatchKind } from "@/lib/planning/step-template-matching";
import type { ProjectKind } from "@/lib/template-fit";
import {
  activityStatus,
  applyStepTemplatesBulk,
  listActivitiesForSteps,
  listRememberedMatches,
  rememberMatches,
  type StepActivityRow,
  type StepActivityStatus,
} from "@/lib/planning/step-template-bulk-service";

type Filter = "suggested" | "ambiguous" | "none" | "has_steps" | "selected" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "suggested", label: "Suggested" },
  { key: "ambiguous", label: "Needs a choice" },
  { key: "none", label: "No match" },
  { key: "has_steps", label: "Has steps" },
  { key: "selected", label: "Selected" },
  { key: "all", label: "All" },
];

const MATCH_BADGE: Record<MatchKind, { label: string; cls: string; title: string }> = {
  remembered: { label: "Remembered", cls: "bg-violet-100 text-violet-700", title: "You picked this template for this activity name before" },
  exact: { label: "Exact", cls: "bg-emerald-100 text-emerald-700", title: "Same name once level prefixes are ignored" },
  partial: { label: "Close", cls: "bg-sky-100 text-sky-700", title: "Every word of the activity name is in the template name. Check it" },
  ambiguous: { label: "Choose", cls: "bg-amber-100 text-amber-700", title: "Several templates fit. Pick one" },
  none: { label: "—", cls: "text-muted-foreground", title: "No template matches this name" },
};

const STATUS_LABEL: Record<StepActivityStatus, { label: string; cls: string }> = {
  no_steps: { label: "No steps", cls: "text-muted-foreground" },
  has_steps: { label: "Has steps", cls: "text-sky-700" },
  in_progress: { label: "In progress (locked)", cls: "text-amber-700" },
  milestone: { label: "Milestone", cls: "text-muted-foreground" },
};

const ROW_LIMIT = 300;

/**
 * Template-first selection: after a template is picked, choose the activities that get it
 * from a searchable checklist. Activities this template matches by name are listed first.
 */
function ActivityPicker({
  activities,
  rank,
  disabled,
  onConfirm,
}: {
  activities: StepActivityRow[];
  /** 0 = matched to this template by name, 1 = everything else. */
  rank: (a: StepActivityRow) => number;
  disabled?: boolean;
  onConfirm: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities
      .filter((a) => activityStatus(a) !== "milestone")
      .filter((a) => !q
        || a.task_name.toLowerCase().includes(q)
        || (a.wbs_code ?? "").toLowerCase().includes(q)
        || (a.wbs_name ?? "").toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b));
  }, [activities, query, rank]);
  const shown = list.slice(0, 300);
  const pickable = (a: StepActivityRow) => activityStatus(a) !== "in_progress";
  const matchedIds = list.filter((a) => rank(a) === 0 && pickable(a)).map((a) => a.id);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setQuery(""); setPicked(new Set()); } }}>
      <PopoverTrigger
        disabled={disabled}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium outline-none hover:bg-muted focus:border-primary disabled:opacity-50"
      >
        <ListPlus className="h-3.5 w-3.5" /> Choose activities
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[460px] max-w-[92vw] p-0">
        <div className="space-y-1.5 border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activity or WBS (e.g. Blockwork, Level 3)…"
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{list.length} activities{matchedIds.length > 0 ? ` · ${matchedIds.length} match this template by name` : ""}</span>
            <span className="flex gap-2">
              {matchedIds.length > 0 && (
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPicked(new Set(matchedIds))}>
                  Tick matches
                </button>
              )}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPicked(new Set(list.filter(pickable).map((a) => a.id)))}>
                Tick all listed
              </button>
              {picked.size > 0 && (
                <button type="button" className="hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
              )}
            </span>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          {shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {activities.length === 0 ? "This project has no activities yet." : `No activities match "${query}"`}
            </p>
          ) : shown.map((a) => {
            const status = activityStatus(a);
            const can = pickable(a);
            return (
              <label
                key={a.id}
                className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted", !can && "cursor-not-allowed opacity-50")}
              >
                <input type="checkbox" className="mt-0.5" disabled={!can} checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{a.task_name}</span>
                    {rank(a) === 0 && <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700">match</span>}
                    {status === "has_steps" && <span className="rounded bg-sky-100 px-1 text-[9px] font-semibold text-sky-700">has steps</span>}
                    {status === "in_progress" && <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700">in progress</span>}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {[a.wbs_code, a.wbs_name].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            );
          })}
          {list.length > shown.length && (
            <p className="px-2 py-1.5 text-center text-[10px] text-muted-foreground">Showing 300 of {list.length}. Search to narrow the list.</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">{picked.size} ticked</span>
          <Button
            size="sm"
            className="h-7 rounded-md"
            disabled={picked.size === 0}
            onClick={() => { onConfirm([...picked]); setOpen(false); }}
          >
            Use this template for {picked.size} activit{picked.size === 1 ? "y" : "ies"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PlanApplyStepTemplates() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const { canEditSchedule, loaded: permsLoaded } = usePlanningPermissions();

  const [activities, setActivities] = useState<StepActivityRow[]>([]);
  const [templates, setTemplates] = useState<ActivityStepTemplate[]>([]);
  const [remembered, setRemembered] = useState<Map<string, string>>(new Map());
  // The project's sector / building type: templates written for it win ties in the matcher.
  const [projectKind, setProjectKind] = useState<ProjectKind>({});
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Map<string, string | null>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("suggested");
  const [search, setSearch] = useState("");
  const [replace, setReplace] = useState(false);
  const [remember, setRemember] = useState(true);
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [applying, setApplying] = useState(false);

  async function load(projectId: string) {
    setLoading(true);
    try {
      const [acts, tpls, mem, kind] = await Promise.all([
        listActivitiesForSteps(supabase, projectId),
        listActivityStepTemplates(supabase),
        listRememberedMatches(supabase),
        loadProjectKind(supabase, projectId),
      ]);
      setActivities(acts);
      setTemplates(tpls);
      setRemembered(mem);
      setProjectKind(kind);
      // Start from the suggestions; pre-tick only confident matches on activities without steps.
      const suggest = buildMatcher(tpls, mem, kind);
      const nextChoice = new Map<string, string | null>();
      const nextSelected = new Set<string>();
      for (const a of acts) {
        const s = suggest(a.task_name);
        nextChoice.set(a.id, s.templateId);
        if (s.templateId && isConfidentMatch(s.kind) && activityStatus(a) === "no_steps") nextSelected.add(a.id);
      }
      setChoice(nextChoice);
      setSelected(nextSelected);
      // Nothing suggested (small or custom-named project): open on every activity instead of an empty list.
      setFilter(nextSelected.size > 0 ? "suggested" : "all");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load activities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedProjectId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
    void load(selectedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const suggest = useMemo(() => buildMatcher(templates, remembered, projectKind), [templates, remembered, projectKind]);
  const suggestions = useMemo(() => new Map(activities.map((a) => [a.id, suggest(a.task_name)])), [activities, suggest]);
  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);

  // "Recommended for this project" first, then the trade groups.
  const groups = useMemo(
    () => groupStepTemplates(templates, projectKind).map((g): [string, ActivityStepTemplate[]] => [g.label, g.items]),
    [templates, projectKind],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { suggested: 0, ambiguous: 0, none: 0, has_steps: 0, selected: selected.size, all: activities.length };
    for (const a of activities) {
      const kind = suggestions.get(a.id)?.kind ?? "none";
      const status = activityStatus(a);
      if (status === "milestone") continue;
      if (status !== "no_steps") c.has_steps++;
      if (isConfidentMatch(kind)) c.suggested++;
      else if (kind === "ambiguous") c.ambiguous++;
      else c.none++;
    }
    return c;
  }, [activities, suggestions, selected]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter((a) => {
      const kind = suggestions.get(a.id)?.kind ?? "none";
      const status = activityStatus(a);
      if (filter !== "all" && status === "milestone") return false;
      if (filter === "suggested" && !isConfidentMatch(kind)) return false;
      if (filter === "ambiguous" && kind !== "ambiguous") return false;
      if (filter === "none" && kind !== "none") return false;
      if (filter === "has_steps" && status === "no_steps") return false;
      if (filter === "selected" && !selected.has(a.id)) return false;
      if (!q) return true;
      return (
        a.task_name.toLowerCase().includes(q) ||
        (a.task_code ?? "").toLowerCase().includes(q) ||
        (a.wbs_code ?? "").toLowerCase().includes(q) ||
        (a.wbs_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [activities, suggestions, filter, search, selected]);

  const rendered = showAll ? visible : visible.slice(0, ROW_LIMIT);
  const selectable = (a: StepActivityRow) => {
    const st = activityStatus(a);
    return st === "no_steps" || (st === "has_steps" && replace);
  };
  const visibleSelectable = visible.filter(selectable);
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((a) => selected.has(a.id));

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleAllVisible(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of visibleSelectable) {
        if (on && choice.get(a.id)) next.add(a.id);
        else if (!on) next.delete(a.id);
      }
      return next;
    });
  }

  function setRowTemplate(id: string, templateId: string) {
    setChoice((prev) => new Map(prev).set(id, templateId));
    const a = activities.find((x) => x.id === id);
    if (a && selectable(a)) toggle(id, true);
  }

  function applyBulkTemplate() {
    if (!bulkTemplateId) return;
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Tick the activities first");
      return;
    }
    setChoice((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, bulkTemplateId);
      return next;
    });
    toast.success(`Set "${templateById.get(bulkTemplateId)?.template_name}" on ${ids.length} activities`);
  }

  const rankForTemplate = useCallback((a: StepActivityRow) => {
    const s = suggestions.get(a.id);
    return s && (s.templateId === bulkTemplateId || s.alternatives.includes(bulkTemplateId)) ? 0 : 1;
  }, [suggestions, bulkTemplateId]);

  function assignTemplateTo(ids: string[]) {
    if (!bulkTemplateId || ids.length === 0) return;
    setChoice((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, bulkTemplateId);
      return next;
    });
    setSelected((prev) => new Set([...prev, ...ids]));
    const withSteps = activities.filter((a) => ids.includes(a.id) && activityStatus(a) === "has_steps").length;
    if (withSteps > 0) setReplace(true);
    setFilter("selected");
    setShowAll(false);
    toast.success(
      `"${templateById.get(bulkTemplateId)?.template_name}" set on ${ids.length} activities${withSteps > 0 ? ` (${withSteps} already have steps: "Replace existing steps" is now on)` : ""}. Click Apply to save.`,
    );
  }

  const toApply = activities.filter((a) => selected.has(a.id) && choice.get(a.id) && selectable(a));
  const replacing = toApply.filter((a) => activityStatus(a) === "has_steps").length;

  async function handleApply() {
    if (!selectedProjectId || toApply.length === 0) return;
    const msg = replacing > 0
      ? `Apply step templates to ${toApply.length} activities? ${replacing} of them already have steps, which will be replaced.`
      : `Apply step templates to ${toApply.length} activities?`;
    if (!confirm(msg)) return;
    setApplying(true);
    try {
      const assignments = toApply.map((a) => ({ taskId: a.id, templateId: choice.get(a.id)! }));
      const r = await applyStepTemplatesBulk(supabase, selectedProjectId, activities, assignments, { replace });
      if (remember && r.applied > 0) {
        const skippedIds = new Set(r.skipped.map((s) => s.taskId));
        await rememberMatches(
          supabase,
          toApply.filter((a) => !skippedIds.has(a.id)).map((a) => ({ activityName: a.task_name, templateId: choice.get(a.id)! })),
        );
      }
      toast.success(`Applied to ${r.applied} activities (${r.steps} steps, days spread over each activity's duration)`);
      if (r.skipped.length > 0) toast.warning(`${r.skipped.length} skipped: ${[...new Set(r.skipped.map((s) => s.reason))].join(", ")}`);
      await load(selectedProjectId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply templates");
    } finally {
      setApplying(false);
    }
  }

  if (projectLoading || (loading && selectedProjectId)) {
    return <div className="flex flex-1 items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!selectedProjectId) {
    return <p className="p-6 text-sm text-muted-foreground">Select a project to apply step templates to its activities.</p>;
  }

  const readOnly = permsLoaded && !canEditSchedule;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <div className="space-y-2 border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setShowAll(false); }}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                filter === f.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label} <span className="opacity-70">{counts[f.key]}</span>
            </button>
          ))}
          <div className="relative ml-auto w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activity, code or WBS…"
              className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-7 text-xs outline-none focus:border-primary"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">1.</span>
              <div className="w-72">
                <TemplatePicker
                  groups={groups}
                  totalCount={templates.length}
                  value={bulkTemplateId}
                  onChange={setBulkTemplateId}
                  placeholder="Pick a template…"
                  triggerClassName="h-8"
                />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">2.</span>
              <ActivityPicker
                activities={activities}
                rank={rankForTemplate}
                disabled={!bulkTemplateId}
                onConfirm={assignTemplateTo}
              />
              {selected.size > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 rounded-lg text-[11px]"
                  disabled={!bulkTemplateId}
                  onClick={applyBulkTemplate}
                  title="Give the picked template to every activity already ticked in the list below"
                >
                  <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> or set on {selected.size} ticked
                </Button>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Activities that already have steps (and no progress) get the new template's steps instead">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace existing steps
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="Next time, an activity with the same name (any level) suggests the same template">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember matches
            </label>
            <Button size="sm" className="ml-auto h-8 rounded-lg" disabled={applying || toApply.length === 0} onClick={() => void handleApply()}>
              {applying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
              Apply to {toApply.length} activit{toApply.length === 1 ? "y" : "ies"}
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Each activity gets the template&apos;s steps, with their days spread over the activity&apos;s duration (from its quantity in Task Work, or its schedule).
          Activities with progress recorded are locked and never changed.
          {readOnly && " You can view suggestions but need Schedule edit permission to apply them."}
        </p>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  disabled={readOnly || visibleSelectable.length === 0}
                  checked={allVisibleSelected}
                  onChange={(e) => toggleAllVisible(e.target.checked)}
                  title="Tick every listed activity that has a template"
                />
              </th>
              <th className="w-48 px-2 py-1.5 text-left">WBS</th>
              <th className="px-2 py-1.5 text-left">Activity</th>
              <th className="w-20 px-2 py-1.5 text-right">Duration</th>
              <th className="w-80 px-2 py-1.5 text-left">Step template</th>
              <th className="w-24 px-2 py-1.5 text-left">Match</th>
              <th className="w-36 px-2 py-1.5 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rendered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  {activities.length === 0 ? (
                    <>This project has no activities yet. Add them in the WBS builder (or apply a WBS template) first.</>
                  ) : (
                    <>
                      No activities in this view.{" "}
                      <button type="button" className="font-semibold text-primary hover:underline" onClick={() => { setFilter("all"); setSearch(""); }}>
                        Show all {activities.length} activities
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ) : rendered.map((a) => {
              const sug = suggestions.get(a.id);
              const kind = sug?.kind ?? "none";
              const chosen = choice.get(a.id) ?? null;
              const overridden = chosen != null && chosen !== sug?.templateId;
              const status = activityStatus(a);
              const canTick = !readOnly && selectable(a) && !!chosen;
              const badge = MATCH_BADGE[kind];
              return (
                <tr key={a.id} className={cn("border-b border-border/60", selected.has(a.id) && canTick && "bg-primary/5")}>
                  <td className="px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      disabled={!canTick}
                      checked={selected.has(a.id) && canTick}
                      onChange={(e) => toggle(a.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <div className="truncate font-mono text-[10px] text-muted-foreground">{a.wbs_code ?? a.task_code ?? ""}</div>
                    <div className="truncate text-[11px]" title={a.wbs_name ?? ""}>{a.wbs_name ?? ""}</div>
                  </td>
                  <td className="px-2 py-1 font-medium">{a.task_name}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                    {a.duration_days ?? "–"} {a.duration_unit === "cd" ? "cd" : "wd"}
                  </td>
                  <td className="px-2 py-1">
                    <TemplatePicker
                      groups={groups}
                      totalCount={templates.length}
                      value={chosen ?? ""}
                      onChange={(id) => setRowTemplate(a.id, id)}
                      placeholder={kind === "none" ? "Pick a template…" : "Select…"}
                      triggerClassName="h-7 rounded-md"
                      disabled={readOnly || status === "milestone" || status === "in_progress"}
                    />
                    {kind === "ambiguous" && !overridden && sug && sug.alternatives.length > 0 && (
                      <div className="mt-0.5 truncate text-[9px] text-amber-700">
                        Also fits: {sug.alternatives.map((id) => templateById.get(id)?.template_name).filter(Boolean).join(", ")}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <span title={overridden ? "Your choice" : badge.title} className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", overridden ? "bg-slate-100 text-slate-700" : badge.cls)}>
                      {overridden ? "Your choice" : badge.label}
                    </span>
                  </td>
                  <td className={cn("px-2 py-1 text-[11px]", STATUS_LABEL[status].cls)}>
                    {STATUS_LABEL[status].label}
                    {a.stepCount > 0 && a.stepTemplateId && (
                      <div className="truncate text-[9px] text-muted-foreground">{templateById.get(a.stepTemplateId)?.template_name ?? "Custom steps"}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!showAll && visible.length > ROW_LIMIT && (
          <button type="button" onClick={() => setShowAll(true)} className="w-full border-t border-border py-2 text-xs text-primary hover:bg-muted/40">
            Show all {visible.length} activities
          </button>
        )}
      </div>
    </div>
  );
}
