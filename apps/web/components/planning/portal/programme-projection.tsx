"use client";

import { useEffect, useMemo, useState } from "react";
import { getVPlanClientProgrammeByProjectId, listWbsTaskMilestoneFlagsByProjectId } from "@/lib/planning/planning-queries";
import { Loader2, CalendarClock, Layers, Wallet, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProgrammeTask {
  id: string;
  start_date: string | null;
  end_date: string | null;
  budget_cost: number | null;
}

interface ProgrammeRow {
  project_id: string;
  project_code: string;
  project_name: string;
  data_date: string | null;
  revision_number: number;
  approved_at: string;
  programme: { tasks?: ProgrammeTask[] } | null;
}

export function ProgrammeProjection({ projectId }: { projectId: string }) {
  const [row, setRow] = useState<ProgrammeRow | null>(null);
  const [taskLabels, setTaskLabels] = useState<Record<string, { task_code: string; task_name: string; is_milestone: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!projectId) { setLoading(false); return; }
      const { data } = await getVPlanClientProgrammeByProjectId(projectId);
      if (!active) return;
      if (!data) { setMissing(true); setLoading(false); return; }
      setRow(data as unknown as ProgrammeRow);
      const { data: tasks } = await listWbsTaskMilestoneFlagsByProjectId(projectId);
      if (!active) return;
      const map: Record<string, { task_code: string; task_name: string; is_milestone: boolean }> = {};
      for (const t of (tasks as unknown as { id: string; task_code: string; task_name: string; is_milestone: boolean }[] ?? [])) {
        map[t.id] = t;
      }
      setTaskLabels(map);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [projectId]);

  const snapshot = useMemo(() => {
    if (!row?.programme?.tasks?.length) return null;
    const tasks = row.programme.tasks.filter((t) => t.start_date && t.end_date);
    const sortedByStart = [...tasks].sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1));
    const earliestStart = sortedByStart[0]?.start_date ?? null;
    const latestFinish = tasks.reduce<string | null>(
      (acc, t) => (t.end_date && (!acc || t.end_date > acc) ? t.end_date : acc),
      null,
    );
    const totalBudget = tasks.reduce((s, t) => s + (t.budget_cost ?? 0), 0);
    const milestoneCount = tasks.filter((t) => taskLabels[t.id]?.is_milestone).length;
    return { tasks, earliestStart, latestFinish, totalBudget, milestoneCount };
  }, [row, taskLabels]);

  if (loading) return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (missing || !row) {
    return (
      <div className="flex h-60 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-6 w-6" />
        No client-approved programme is available for this project yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{row.project_name}</h1>
            <Badge variant="secondary">{row.project_code}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Client programme — revision {row.revision_number} issued {new Date(row.approved_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">Data date {row.data_date ? new Date(row.data_date).toLocaleDateString() : "—"}</Badge>
          <Badge variant="outline">Read-only</Badge>
        </div>
      </div>

      {!snapshot && (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          This revision contains an empty programme snapshot.
        </div>
      )}

      {snapshot && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card><CardContent className="flex items-center gap-3 pt-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600"><CalendarClock className="h-5 w-5" /></div>
              <div>
                <div className="text-xs text-muted-foreground">Programme Start</div>
                <div className="text-base font-semibold">{snapshot.earliestStart ? new Date(snapshot.earliestStart).toLocaleDateString() : "—"}</div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 pt-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><CalendarClock className="h-5 w-5" /></div>
              <div>
                <div className="text-xs text-muted-foreground">Programme Finish</div>
                <div className="text-base font-semibold">{snapshot.latestFinish ? new Date(snapshot.latestFinish).toLocaleDateString() : "—"}</div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 pt-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Layers className="h-5 w-5" /></div>
              <div>
                <div className="text-xs text-muted-foreground">Activities</div>
                <div className="text-base font-semibold">{snapshot.tasks.length}{snapshot.milestoneCount > 0 ? ` · ${snapshot.milestoneCount} milestones` : ""}</div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 pt-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Wallet className="h-5 w-5" /></div>
              <div>
                <div className="text-xs text-muted-foreground">Scheduled Budget</div>
                <div className="text-base font-semibold">{snapshot.totalBudget.toLocaleString()}</div>
              </div>
            </CardContent></Card>
          </div>

          <Card><CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Activity</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Start</th>
                  <th className="px-4 py-2.5 font-medium">Finish</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshot.tasks]
                  .sort((a, b) => (a.start_date! < b.start_date! ? -1 : 1))
                  .map((t) => {
                    const label = taskLabels[t.id];
                    return (
                      <tr key={t.id} className="border-b last:border-b-0">
                        <td className="px-4 py-2.5">
                          <span className="font-medium">{label?.task_name ?? t.id.slice(0, 8)}</span>
                          {label?.task_code && <span className="ml-2 font-mono text-xs text-muted-foreground">{label.task_code}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {label?.is_milestone ? <Badge className="bg-purple-100 text-purple-700">Milestone</Badge> : <Badge variant="outline">Task</Badge>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{t.start_date ? new Date(t.start_date).toLocaleDateString() : "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{t.end_date ? new Date(t.end_date).toLocaleDateString() : "—"}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}