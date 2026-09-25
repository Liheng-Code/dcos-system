"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { ChartWrapper } from "@/components/reports/charts/chart-wrapper";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { getTaskStatus } from "@/components/planning/task-status";
import type { SheetRow, SheetTask } from "@/components/planning/sheet-types";
import type { TaskFloat } from "@/lib/planning/schedule-engine";

// ── shared chart styling (theme tokens from app/globals.css) ─────────────────
export const TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
export const TOOLTIP_STYLE = {
  contentStyle: {
    fontSize: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
  },
  labelStyle: { color: "var(--popover-foreground)" },
  itemStyle: { color: "var(--popover-foreground)" },
  cursor: { fill: "var(--muted)", opacity: 0.4 },
} as const;
export const LEGEND_STYLE = { fontSize: 11, paddingTop: 4 } as const;

const EXCLUDED_STATUSES = new Set(["cancelled", "on_hold"]);
const activeTasks = (tasks: SheetTask[]) => tasks.filter((t) => !EXCLUDED_STATUSES.has(t.status));

// ── small UTC date helpers (ISO yyyy-mm-dd strings) ──────────────────────────
export function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
export const DAY = 86_400_000;
/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const ms = toUtc(iso);
  const dow = new Date(ms).getUTCDay(); // 0 = Sunday
  return fromUtc(ms - ((dow + 6) % 7) * DAY);
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

interface CommonProps {
  loading?: boolean;
  className?: string;
}

// ── 1. Task status donut ─────────────────────────────────────────────────────
const STATUS_ORDER = ["On Track", "At Risk", "Overdue", "Complete", "No Date"] as const;
const STATUS_COLORS: Record<string, string> = {
  "On Track": "#3b82f6",
  "At Risk": "#eab308",
  Overdue: "#ef4444",
  Complete: "#22c55e",
  "No Date": "#64748b",
};

export function TaskStatusDonutCard({
  tasks, asOf, loading, className,
}: CommonProps & { tasks: SheetTask[]; asOf: string }) {
  const { data, total } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of activeTasks(tasks)) {
      const label = t.progress >= 100 ? "Complete" : getTaskStatus(t, asOf).label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const data = STATUS_ORDER.map((name) => ({ name, value: counts.get(name) ?? 0 })).filter((d) => d.value > 0);
    return { data, total: data.reduce((s, d) => s + d.value, 0) };
  }, [tasks, asOf]);

  return (
    <ChartWrapper
      title="Task Status"
      description="All active tasks as of the project data date"
      loading={loading}
      empty={total === 0}
      emptyMessage="No tasks yet"
      height={240}
      className={className}
    >
      <div className="flex w-full flex-wrap items-center justify-center gap-6 px-4 py-2">
        <div className="relative h-[190px] w-[190px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                {data.map((d) => <Cell key={d.name} fill={STATUS_COLORS[d.name]} />)}
              </Pie>
              <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v} tasks`]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-foreground">{total}</span>
            <span className="text-[10px] text-muted-foreground">tasks</span>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.name] }} />
              <span className="w-16 text-muted-foreground">{d.name}</span>
              <span className="font-semibold tabular-nums text-foreground">{d.value}</span>
              <span className="tabular-nums text-muted-foreground">({Math.round((d.value / total) * 100)}%)</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartWrapper>
  );
}

// ── 2. Progress by WBS phase ─────────────────────────────────────────────────
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function PhaseProgressCard({
  tree, loading, className,
}: CommonProps & { tree: SheetRow[] }) {
  const data = useMemo(() => {
    // tree[0] is the synthetic project row; its node children are the top-level WBS phases.
    const root = tree[0];
    const phases = (root?.kind === "node" && root.node.node_type === "project" ? root.children : tree)
      .filter((r): r is Extract<SheetRow, { kind: "node" }> => r.kind === "node" && r.rollup.taskCount > 0);
    return phases.map((r) => ({
      name: `${r.node.wbs_code} ${r.node.wbs_name}`,
      progress: Math.round(r.node.progress_percent ?? 0),
      tasks: r.rollup.taskCount,
    }));
  }, [tree]);

  const height = Math.max(240, data.length * 40 + 40);

  return (
    <ChartWrapper
      title="Progress by WBS Phase"
      description="% complete of each top-level WBS branch"
      loading={loading}
      empty={data.length === 0}
      emptyMessage="No WBS phases with tasks yet"
      height={height}
      className={className}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 36, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" width={170} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v: string) => truncate(v, 26)} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Progress"]} />
          <Bar dataKey="progress" name="Progress" fill="var(--chart-1)" radius={[0, 3, 3, 0]} maxBarSize={22} background={{ fill: "var(--muted)", radius: 3 }}>
            <LabelList dataKey="progress" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "var(--foreground)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

// ── 3a. Look-ahead: tasks starting vs finishing per week ─────────────────────
const LOOKAHEAD_WEEKS = 12;

export function LookaheadBarsCard({
  tasks, asOf, loading, className,
}: CommonProps & { tasks: SheetTask[]; asOf: string }) {
  const { data, hasAny } = useMemo(() => {
    const first = weekStart(asOf);
    const weeks = Array.from({ length: LOOKAHEAD_WEEKS }, (_, i) => fromUtc(toUtc(first) + i * 7 * DAY));
    const idx = (iso: string | null) => {
      if (!iso) return -1;
      const i = Math.floor((toUtc(weekStart(iso)) - toUtc(first)) / (7 * DAY));
      return i >= 0 && i < LOOKAHEAD_WEEKS ? i : -1;
    };
    const rows = weeks.map((w) => ({ week: shortDate(w), starting: 0, finishing: 0 }));
    for (const t of activeTasks(tasks)) {
      if (t.progress >= 100) continue;
      const s = idx(t.start_date);
      if (s >= 0) rows[s].starting++;
      const f = idx(t.end_date);
      if (f >= 0) rows[f].finishing++;
    }
    return { data: rows, hasAny: rows.some((r) => r.starting > 0 || r.finishing > 0) };
  }, [tasks, asOf]);

  return (
    <ChartWrapper
      title={`Look-ahead — next ${LOOKAHEAD_WEEKS} weeks`}
      description="Incomplete tasks starting and finishing per week (week commencing Monday)"
      loading={loading}
      empty={!hasAny}
      emptyMessage="No tasks starting or finishing in the next 12 weeks"
      height={260}
      className={className}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="week" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={0} />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip {...TOOLTIP_STYLE} />
          <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
          <Bar dataKey="starting" name="Starting" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={22} />
          <Bar dataKey="finishing" name="Finishing" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

// ── 3b. Float histogram ──────────────────────────────────────────────────────
const FLOAT_BINS: { label: string; test: (f: number) => boolean; color: string }[] = [
  { label: "< 0",    test: (f) => f < 0,              color: "#ef4444" },
  { label: "0",      test: (f) => f === 0,            color: "#f97316" },
  { label: "1–5",    test: (f) => f >= 1 && f <= 5,   color: "#eab308" },
  { label: "6–10",   test: (f) => f >= 6 && f <= 10,  color: "#84cc16" },
  { label: "11–20",  test: (f) => f >= 11 && f <= 20, color: "#22c55e" },
  { label: "> 20",   test: (f) => f > 20,             color: "#14b8a6" },
];

export function FloatHistogramCard({
  tasks, float, loading, className,
}: CommonProps & { tasks: SheetTask[]; float: Map<string, TaskFloat> }) {
  const { data, total } = useMemo(() => {
    const counts = FLOAT_BINS.map(() => 0);
    let total = 0;
    for (const t of activeTasks(tasks)) {
      if (t.progress >= 100) continue;
      const f = float.get(t.id);
      if (!f) continue;
      const i = FLOAT_BINS.findIndex((b) => b.test(f.totalFloat));
      if (i >= 0) { counts[i]++; total++; }
    }
    return { data: FLOAT_BINS.map((b, i) => ({ bin: b.label, tasks: counts[i], color: b.color })), total };
  }, [tasks, float]);

  return (
    <ChartWrapper
      title="Float Distribution"
      description="Incomplete tasks by total float (working days)"
      loading={loading}
      empty={total === 0}
      emptyMessage="No float data — tasks need dates and dependencies"
      height={240}
      className={className}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="bin" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v} tasks`, "Tasks"]} />
          <Bar dataKey="tasks" name="Tasks" radius={[3, 3, 0, 0]} maxBarSize={40}>
            {data.map((d) => <Cell key={d.bin} fill={d.color} />)}
            <LabelList dataKey="tasks" position="top" style={{ fontSize: 11, fill: "var(--foreground)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}

// ── 4. Delays by cause (one query on delay_register) ─────────────────────────
interface DelayRow {
  cause: string | null;
  impact_days: number | null;
  status: "open" | "resolved" | "disputed";
}

const DELAY_STATUS: { key: DelayRow["status"]; name: string; color: string }[] = [
  { key: "open",     name: "Open",     color: "#f59e0b" },
  { key: "disputed", name: "Disputed", color: "#ef4444" },
  { key: "resolved", name: "Resolved", color: "#22c55e" },
];

export function DelaysByCauseCard({
  projectId, className, refreshToken = 0,
}: { projectId: string; className?: string; refreshToken?: number }) {
  const [retry, setRetry] = useState(0);
  const { data: rawRows, loading, error } = useCachedFetch<DelayRow[]>(
    projectId ? `dcos.planning.dashboard.delays.${projectId}` : null,
    async () => {
      const { data, error: err } = await createClient()
        .from("delay_register")
        .select("cause, impact_days, status")
        .eq("project_id", projectId)
        .limit(2000);
      if (err) throw new Error(err.message);
      return (data ?? []) as DelayRow[];
    },
    `${refreshToken}:${retry}`,
  );
  const rows = rawRows ?? [];

  const { data, totalDays, openCount } = useMemo(() => {
    const rows = rawRows ?? [];
    const byCause = new Map<string, { cause: string; open: number; disputed: number; resolved: number; total: number }>();
    let totalDays = 0;
    let openCount = 0;
    for (const r of rows) {
      const cause = r.cause?.trim() || "Unspecified";
      const days = r.impact_days ?? 0;
      const entry = byCause.get(cause) ?? { cause, open: 0, disputed: 0, resolved: 0, total: 0 };
      entry[r.status] += days;
      entry.total += days;
      byCause.set(cause, entry);
      totalDays += days;
      if (r.status === "open") openCount++;
    }
    const data = [...byCause.values()].sort((a, b) => b.total - a.total).slice(0, 8);
    return { data, totalDays, openCount };
  }, [rawRows]);

  const height = Math.max(240, data.length * 40 + 60);

  return (
    <ChartWrapper
      title="Delays by Cause"
      description={
        rows.length > 0
          ? `${rows.length} delay events · ${totalDays} impact days · ${openCount} open`
          : "Impact days from the delay register"
      }
      loading={loading}
      error={error}
      onRetry={() => setRetry((n) => n + 1)}
      empty={rows.length === 0}
      emptyMessage="No delay events logged"
      height={height}
      className={className}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => `${v}d`} />
          <YAxis type="category" dataKey="cause" width={140} tick={TICK} tickLine={false} axisLine={false} tickFormatter={(v: string) => truncate(v, 22)} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [`${v} days`, String(name)]} />
          <Legend wrapperStyle={LEGEND_STYLE} iconType="circle" iconSize={8} />
          {DELAY_STATUS.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="delay" fill={s.color} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
