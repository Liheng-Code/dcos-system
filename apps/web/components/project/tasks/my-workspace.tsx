"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/ui/kpi-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { loadCalendar, loadEmployeeCapacity, loadHolidays } from "@/lib/project/tasks/capacity-service";
import { type CapacityCalendar, type CapacityResult } from "@/lib/project/tasks/capacity";
import { bucketTasks, plannedHoursByDay, weekStartOf, type DayLoad } from "@/lib/project/tasks/my-work";
import { TaskActionDialog, type ActionTask } from "./task-action-dialog";

type Row = ActionTask & {
  priority: string | null;
  projects?: { project_code: string; project_name: string } | { project_code: string; project_name: string }[] | null;
};

type View = "today" | "week" | "all" | "review" | "done";

const COLUMNS =
  "id, task_code, task_name, description, status, progress, priority, start_date, end_date, owner_id, reviewer_id, approver_id, estimated_hours, planned_hours, actual_hours, remaining_hours, is_blocked, projects(project_code, project_name)";

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const label = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function projectLabel(t: Row) {
  const p = Array.isArray(t.projects) ? t.projects[0] : t.projects;
  return p ? `${p.project_code} · ${p.project_name}` : "";
}

const LEVEL_STYLE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  over: "bg-red-50 text-red-700",
  unknown: "bg-slate-100 text-slate-600",
};

export function MyWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [mine, setMine] = useState<Row[]>([]);
  const [toReview, setToReview] = useState<Row[]>([]);
  const [returnedIds, setReturnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("today");
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayIso()));
  const [capacity, setCapacity] = useState<CapacityResult | null>(null);
  const [days, setDays] = useState<DayLoad[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => [...mine, ...toReview].find((t) => t.id === selectedId) ?? null,
    [mine, toReview, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;

      const [ownRes, revRes] = await Promise.all([
        supabase.from("wbs_tasks").select(COLUMNS).eq("owner_id", uid).order("end_date", { ascending: true, nullsFirst: false }).limit(500),
        supabase
          .from("wbs_tasks")
          .select(COLUMNS)
          .or(`reviewer_id.eq.${uid},approver_id.eq.${uid}`)
          .eq("status", "review")
          .limit(200),
      ]);
      if (ownRes.error) throw new Error(ownRes.error.message);
      const own = (ownRes.data ?? []) as unknown as Row[];
      setMine(own);
      setToReview(((revRes.data ?? []) as unknown as Row[]).filter((t) => t.owner_id !== uid));

      const ids = own.map((t) => t.id);
      if (ids.length) {
        const { data: reviews } = await supabase
          .from("task_reviews")
          .select("wbs_task_id, decision, decided_at")
          .in("wbs_task_id", ids)
          .order("decided_at", { ascending: false });
        const latest = new Map<string, string>();
        for (const r of reviews ?? []) if (!latest.has(r.wbs_task_id as string)) latest.set(r.wbs_task_id as string, r.decision as string);
        setReturnedIds(new Set([...latest].filter(([, d]) => d === "returned").map(([id]) => id)));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load your tasks");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Week capacity and day grid
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const to = addDays(weekStart, 6);
    void (async () => {
      const [cal, hol, cap] = await Promise.all([
        loadCalendar(supabase, null),
        loadHolidays(supabase, weekStart, to),
        loadEmployeeCapacity(supabase, { profileIds: [userId], from: weekStart, to }),
      ]);
      if (cancelled) return;
      setCapacity(cap.get(userId) ?? null);
      const active = mine.filter((t) => !["completed", "closed", "cancelled", "approved", "rejected"].includes(t.status));
      const calendar: CapacityCalendar | undefined = cal ?? undefined;
      setDays(
        plannedHoursByDay(
          active.map((t) => ({ taskId: t.id, start: t.start_date, end: t.end_date, hours: Number(t.estimated_hours ?? t.planned_hours ?? 0) })),
          weekStart,
          to,
          calendar,
          hol,
        ).days,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, weekStart, mine]);

  const today = todayIso();
  const buckets = useMemo(() => bucketTasks(mine, today, returnedIds), [mine, today, returnedIds]);

  const listFor: Record<View, Row[]> = {
    today: [...new Map([...buckets.overdue, ...buckets.today].map((t) => [t.id, t])).values()],
    week: buckets.dueThisWeek,
    all: mine.filter((t) => !["completed", "closed", "cancelled"].includes(t.status)),
    review: toReview,
    done: buckets.recentlyCompleted,
  };
  const rows = listFor[view];
  const weekLabel = `${weekStart} → ${addDays(weekStart, 6)}`;

  if (loading && !userId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <div className="text-xs font-medium text-slate-500">DCOS / My Work</div>
          <h1 className="text-xl font-bold tracking-tight">My Work</h1>
          <div className="mt-0.5 text-xs text-slate-500">Tasks you own, your week, and work waiting for your review</div>
        </div>
        <Button size="sm" variant="outline" className="gap-1 rounded-lg text-xs" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Due today" value={buckets.dueToday.length} icon={ListChecks} />
        <KPICard label="Overdue" value={buckets.overdue.length} icon={AlertTriangle} gradient={buckets.overdue.length ? "from-red-500 to-orange-600" : undefined} />
        <KPICard label="Returned for revision" value={buckets.returnedForRevision.length} icon={ClipboardCheck} />
        <KPICard label="Blocked" value={buckets.blocked.length} icon={AlertTriangle} gradient={buckets.blocked.length ? "from-amber-500 to-orange-500" : undefined} />
      </section>

      {/* My Week */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4" /> My Week
            <span className="font-normal text-slate-500">{weekLabel}</span>
          </h2>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setWeekStart(weekStartOf(todayIso()))}>
              This week
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => (
            <div
              key={d.date}
              className={cn(
                "rounded-lg border p-2 text-center text-xs",
                d.working ? "border-slate-200" : "border-dashed border-slate-200 bg-slate-50 text-slate-400",
                d.date === today && "ring-2 ring-blue-300",
              )}
            >
              <div className="font-medium">{new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })}</div>
              <div className="mt-1 text-base font-semibold tabular-nums">{d.working ? `${d.plannedHours}h` : "off"}</div>
              <div className="text-[10px] text-slate-500">{d.taskIds.length} task{d.taskIds.length === 1 ? "" : "s"}</div>
            </div>
          ))}
        </div>
        {capacity && (
          <div className="mt-3 space-y-1 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 font-medium", LEVEL_STYLE[capacity.level])}>
                {capacity.utilizationPct == null ? "No capacity" : `${Math.round(capacity.utilizationPct)}% planned`}
              </span>
              <span className="text-slate-600">
                {capacity.plannedHours}h planned of {capacity.availableHours}h available
                {capacity.leaveHours ? ` · ${capacity.leaveHours}h leave` : ""}
                {capacity.holidayHours ? ` · ${capacity.holidayHours}h holiday` : ""}
              </span>
            </div>
            {capacity.limitations.map((l) => (
              <div key={l} className="text-slate-500">
                Note: {l}
              </div>
            ))}
            <div className="text-slate-500">Planned and actual hours are separate; planned hours are spread over each task’s working days.</div>
          </div>
        )}
      </section>

      {/* Task lists */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <Tabs value={view} onValueChange={(v) => setView(v as View)}>
          <TabsList>
            <TabsTrigger value="today">Today ({listFor.today.length})</TabsTrigger>
            <TabsTrigger value="week">Due this week ({listFor.week.length})</TabsTrigger>
            <TabsTrigger value="all">All open ({listFor.all.length})</TabsTrigger>
            <TabsTrigger value="review">To review ({listFor.review.length})</TabsTrigger>
            <TabsTrigger value="done">Completed ({listFor.done.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-3 divide-y divide-slate-100">
          {loading && <div className="py-6 text-center text-sm text-slate-500">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              {view === "review" ? "Nothing is waiting for your review." : "No tasks here."}
            </div>
          )}
          {rows.map((t) => {
            const overdue = t.end_date && t.end_date < today && !["completed", "closed"].includes(t.status);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {t.task_code} · {t.task_name}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {projectLabel(t)} · {t.start_date ?? "—"} → {t.end_date ?? "—"}
                    {t.priority ? ` · ${label(t.priority)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {returnedIds.has(t.id) && t.status === "in_progress" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">Returned</span>}
                  {t.is_blocked && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Blocked</span>}
                  {overdue && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Overdue</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{label(t.status)}</span>
                  <span className="w-10 text-right tabular-nums">{Math.round(t.progress ?? 0)}%</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {userId && (
        <TaskActionDialog
          task={selected}
          userId={userId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
