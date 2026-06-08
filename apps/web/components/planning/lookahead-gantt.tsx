"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, GanttChartSquare, User, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LookaheadTask {
  id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  owner_name: string | null;
  start_date: string;
  end_date: string;
  progress: number;
  status: string;
  delay_status: string;
  priority: string;
  is_milestone: boolean;
  schedule_level: number;
}

interface LookaheadGanttProps {
  projectId?: string;
}

type ConstraintStatus = "ok" | "missing" | "unknown";

function getWeekDates(startDate: Date, weeks: number): { label: string; start: Date; end: Date }[] {
  const result: { label: string; start: Date; end: Date }[] = [];
  for (let w = 0; w < weeks; w++) {
    const ws = new Date(startDate);
    ws.setDate(ws.getDate() + w * 7);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);
    const label = `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${we.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    result.push({ label, start: ws, end: we });
  }
  return result;
}

export function LookaheadGantt({ projectId }: LookaheadGanttProps) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<LookaheadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [lookaheadWeeks, setLookaheadWeeks] = useState(4);
  // Constraint status per task: { drawings: ConstraintStatus, materials: ConstraintStatus, crew: ConstraintStatus }
  const [constraints, setConstraints] = useState<Map<string, { drawings: ConstraintStatus; materials: ConstraintStatus; crew: ConstraintStatus }>>(new Map());

  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    setLoading(true);

    const today = new Date().toISOString().slice(0, 10);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + lookaheadWeeks * 7);
    const endStr = endDate.toISOString().slice(0, 10);

    Promise.all([
      supabase
        .from("wbs_tasks")
        .select(`
          id, task_code, task_name, discipline, owner_name,
          start_date, end_date, progress, status, delay_status, priority,
          is_milestone, schedule_level
        `)
        .eq("project_id", projectId)
        .gte("start_date", today)
        .lte("start_date", endStr)
        .in("status", ["open", "assigned", "in_progress", "paused"])
        .order("start_date", { ascending: true })
        .limit(200),
      supabase
        .from("task_constraints")
        .select("task_id, constraint_type, status")
        .eq("status", "missing"),
    ]).then(([tRes, cRes]) => {
      if (tRes.data) {
        setTasks(tRes.data as LookaheadTask[]);
        const taskIds = tRes.data.map((t: any) => t.id);
        buildConstraintMap(taskIds, cRes.data || []);
      }
      setLoading(false);
    });
  }, [supabase, projectId, lookaheadWeeks]);

  function buildConstraintMap(
    taskIds: string[],
    missingRows: { task_id: string; constraint_type: string; status: string }[],
  ) {
    const missing = new Map<string, Set<string>>();
    for (const r of missingRows) {
      if (!missing.has(r.task_id)) missing.set(r.task_id, new Set());
      missing.get(r.task_id)!.add(r.constraint_type);
    }
    const types = ["drawings", "materials", "crew"] as const;
    const cm = new Map<string, { drawings: ConstraintStatus; materials: ConstraintStatus; crew: ConstraintStatus }>();
    for (const id of taskIds) {
      const m = missing.get(id);
      cm.set(id, {
        drawings: m?.has("drawings") ? "missing" : "ok",
        materials: m?.has("materials") ? "missing" : "ok",
        crew: m?.has("crew") ? "missing" : "ok",
      });
    }
    setConstraints(cm);
  }

  const weekDates = useMemo(
    () => getWeekDates(new Date(), lookaheadWeeks),
    [lookaheadWeeks],
  );

  const today = new Date().toISOString().slice(0, 10);

  // Group tasks by week
  const tasksByWeek = useMemo(() => {
    const grouped: { weekIndex: number; tasks: LookaheadTask[] }[] = weekDates.map((_, i) => ({ weekIndex: i, tasks: [] }));
    for (const task of tasks) {
      for (let w = 0; w < weekDates.length; w++) {
        const wd = weekDates[w];
        if (task.start_date >= wd.start.toISOString().slice(0, 10) && task.start_date <= wd.end.toISOString().slice(0, 10)) {
          grouped[w].tasks.push(task);
          break;
        }
      }
    }
    return grouped;
  }, [tasks, weekDates]);

  if (loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <GanttChartSquare className="mb-2 h-8 w-8 opacity-30" />
        <p className="text-xs">No upcoming tasks in the look-ahead window</p>
      </div>
    );
  }

  const totalTasks = tasks.length;
  const readyTasks = tasks.filter((t) => {
    const c = constraints.get(t.id);
    return c && c.drawings === "ok" && c.materials === "ok" && c.crew === "ok";
  }).length;

  const ConstraintIcon = ({ status }: { status: ConstraintStatus }) => {
    if (status === "ok") return <CheckCircle2 className="h-3 w-3 text-green-500" />;
    if (status === "missing") return <XCircle className="h-3 w-3 text-red-500" />;
    return <AlertTriangle className="h-3 w-3 text-amber-400" />;
  };

  return (
    <div className="flex flex-col space-y-3 px-4">
      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground">Tasks in Window</div>
          <div className="text-xl font-bold">{totalTasks}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground">Ready to Start</div>
          <div className="text-xl font-bold text-green-600">{readyTasks}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground">Constrained</div>
          <div className="text-xl font-bold text-amber-600">{totalTasks - readyTasks}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground">Starts Today</div>
          <div className="text-xl font-bold text-blue-600">
            {tasks.filter((t) => t.start_date === today).length}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[10px] text-muted-foreground">Window</div>
          <div className="flex items-center gap-1 mt-0.5">
            {[2, 4, 6].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setLookaheadWeeks(w)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
                  lookaheadWeeks === w
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {w}w
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Daily lookahead grid */}
      <div className="overflow-auto rounded-lg border border-border">
        <div className="min-w-[800px]">
          {/* Header */}
          <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: `220px repeat(${lookaheadWeeks}, 1fr) 80px 80px 80px 60px` }}>
            <div className="p-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Task</div>
            {weekDates.map((wd, i) => (
              <div key={i} className="border-l border-border/30 p-2.5 text-[10px] font-semibold text-muted-foreground">
                {wd.label}
              </div>
            ))}
            <div className="border-l border-border/30 p-2.5 text-[10px] font-semibold text-muted-foreground text-center">Drawings</div>
            <div className="border-l border-border/30 p-2.5 text-[10px] font-semibold text-muted-foreground text-center">Materials</div>
            <div className="border-l border-border/30 p-2.5 text-[10px] font-semibold text-muted-foreground text-center">Crew</div>
            <div className="border-l border-border/30 p-2.5 text-[10px] font-semibold text-muted-foreground text-center">Progress</div>
          </div>

          {/* Rows */}
          {tasksByWeek.map((group) =>
            group.tasks.map((task) => {
              const c = constraints.get(task.id);
              const isToday = task.start_date === today;
              const isDelayed = task.delay_status === "delayed" || task.delay_status === "blocked";

              return (
                <div
                  key={task.id}
                  className={cn(
                    "grid border-b border-border/20 hover:bg-muted/10 transition-colors",
                    isToday && "bg-blue-50/30",
                    isDelayed && "bg-red-50/30",
                  )}
                  style={{ gridTemplateColumns: `220px repeat(${lookaheadWeeks}, 1fr) 80px 80px 80px 60px` }}
                >
                  {/* Task info */}
                  <div className="flex items-center gap-2 p-2.5 min-w-0">
                    <span className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      task.delay_status === "delayed" ? "bg-red-500" :
                      task.delay_status === "risk" ? "bg-amber-500" :
                      task.delay_status === "blocked" ? "bg-slate-400" :
                      "bg-green-500",
                    )} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-[10px] text-muted-foreground">{task.task_code}</span>
                        <span className="text-xs font-medium truncate">{task.task_name}</span>
                      </div>
                      {task.owner_name && (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                          <User className="h-2.5 w-2.5" />
                          {task.owner_name}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Week columns */}
                  {weekDates.map((wd, wi) => {
                    const taskStart = new Date(task.start_date);
                    const taskEnd = new Date(task.end_date);
                    const inWeek = taskStart <= wd.end && taskEnd >= wd.start;
                    return (
                      <div
                        key={wi}
                        className="relative border-l border-border/20 p-2.5"
                      >
                        {inWeek && (
                          <div
                            className={cn(
                              "h-5 rounded-full px-2 text-[9px] font-medium leading-5 text-white truncate shadow-sm",
                              task.delay_status === "delayed" ? "bg-red-500" :
                              task.delay_status === "risk" ? "bg-amber-500" :
                              task.delay_status === "blocked" ? "bg-slate-500" :
                              "bg-green-500",
                            )}
                          >
                            {task.progress}%
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Constraint columns */}
                  <div className="flex items-center justify-center border-l border-border/20">
                    {c && <ConstraintIcon status={c.drawings} />}
                  </div>
                  <div className="flex items-center justify-center border-l border-border/20">
                    {c && <ConstraintIcon status={c.materials} />}
                  </div>
                  <div className="flex items-center justify-center border-l border-border/20">
                    {c && <ConstraintIcon status={c.crew} />}
                  </div>

                  {/* Progress */}
                  <div className="flex items-center justify-center border-l border-border/20">
                    <div className="flex items-center gap-1">
                      <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", task.progress >= 100 ? "bg-green-500" : "bg-primary")}
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{task.progress}%</span>
                    </div>
                  </div>
                </div>
              );
            }),
          )}

          {tasksByWeek.every((g) => g.tasks.length === 0) && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No tasks in the look-ahead window
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
