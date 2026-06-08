"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Users } from "lucide-react";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ResourceTask {
  id: string; task_code: string; task_name: string; owner_name: string | null;
  start_date: string | null; end_date: string | null; progress: number;
  delay_status: string; priority: string;
}

function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export function PlanResourceLoading() {
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [tasks, setTasks] = useState<ResourceTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedProjectId) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    supabase.from("wbs_tasks").select(
      "id, task_code, task_name, owner_name, start_date, end_date, progress, delay_status, priority"
    ).eq("project_id", selectedProjectId).not("owner_name", "is", null).order("owner_name").limit(500)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setTasks((data || []) as unknown as ResourceTask[]);
        setLoading(false);
      });
  }, [supabase, selectedProjectId]);

  const resourceGroups = useMemo(() => {
    const groups: Record<string, ResourceTask[]> = {};
    for (const t of tasks) {
      const key = t.owner_name || "Unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return groups;
  }, [tasks]);

  const dateRange = useMemo(() => {
    const allDates = tasks.flatMap(t => [t.start_date, t.end_date].filter(Boolean) as string[]);
    if (!allDates.length) return { min: new Date(), max: new Date() };
    return {
      min: new Date(Math.min(...allDates.map(d => new Date(d).getTime()))),
      max: new Date(Math.max(...allDates.map(d => new Date(d).getTime()))),
    };
  }, [tasks]);

  const totalDays = daysBetween(dateRange.min.toISOString().slice(0, 10), dateRange.max.toISOString().slice(0, 10));
  const BAR_W = 16;
  const LABEL_W = 180;
  const chartW = totalDays * BAR_W;

  if (projectLoading || loading) return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Select a project to view resource loading.</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{Object.keys(resourceGroups).length}</p>
          <p className="text-xs text-muted-foreground">Resources</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{tasks.length}</p>
          <p className="text-xs text-muted-foreground">Assigned Tasks</p>
        </CardContent></Card>
      </div>

      {Object.entries(resourceGroups).map(([resource, resourceTasks]) => (
        <Card key={resource}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{resource}</span>
              <Badge variant="outline" className="text-xs">{resourceTasks.length} tasks</Badge>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-fit">
                {/* Header */}
                <div className="flex border-b bg-muted/20 text-xs text-muted-foreground">
                  <div className="shrink-0 border-r px-2 py-1 font-medium" style={{ width: LABEL_W }}>Task</div>
                  <div className="flex" style={{ width: chartW }}>
                    {Array.from({ length: Math.min(totalDays, 180) }).map((_, i) => {
                      if (i % 7 === 0) {
                        const d = new Date(dateRange.min.getTime() + i * 86400000);
                        return <div key={i} className="shrink-0 border-r px-1" style={{ width: BAR_W * 7 }}>{d.getDate()}/{d.getMonth() + 1}</div>;
                      }
                      return null;
                    })}
                  </div>
                </div>

                {/* Task bars */}
                {resourceTasks.map(t => {
                  const s = t.start_date || dateRange.min.toISOString().slice(0, 10);
                  const e = t.end_date || dateRange.max.toISOString().slice(0, 10);
                  const x = Math.round((new Date(s).getTime() - dateRange.min.getTime()) / 86400000) * BAR_W;
                  const w = daysBetween(s, e) * BAR_W;
                  const color = t.delay_status === "delayed" ? "bg-red-400" : t.delay_status === "risk" ? "bg-yellow-400" : "bg-blue-400";

                  return (
                    <div key={t.id} className="flex border-b last:border-0 hover:bg-muted/20">
                      <div className="shrink-0 border-r px-2 py-1.5 text-xs truncate" style={{ width: LABEL_W }}>
                        <span className="font-medium">{t.task_code}</span>
                        <span className="text-muted-foreground ml-1">{t.task_name}</span>
                      </div>
                      <div className="relative" style={{ width: chartW }}>
                        <div className={cn("absolute top-1 h-5 rounded-sm opacity-80", color)} style={{ left: x, width: Math.max(BAR_W, w) }} />
                        <div className="absolute top-1 h-5 rounded-sm bg-black/20" style={{ left: x, width: Math.max(BAR_W, w * (t.progress / 100)) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      {!Object.keys(resourceGroups).length && <p className="text-sm text-muted-foreground py-8 text-center">No assigned tasks found.</p>}
    </div>
  );
}
