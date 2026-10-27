"use client";

// The project S-curve (doc 33): one chart for cost and time. Planned value is the cost-loaded baseline; earned value,
// actual cost, certified (IPC) and committed (PO) are measured against it at the project's data date.
// Data: lib/project-scurve-service.ts (RPC project_scurve); maths: lib/project-scurve.ts.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import {
  CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartWrapper } from "@/components/report-kit/charts/chart-wrapper";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { getProjectScurve } from "@/lib/project-scurve-service";
import {
  dataDatePeriod, scurveHealth, scurveMetrics, scurveRows, type ProjectScurveData, type ScurveMode,
} from "@/lib/project-scurve";

const BASELINE_HREF = "/dashboard/planning/gantt";
const TICK = { fontSize: 11, fill: "var(--muted-foreground)" };
const TOOLTIP_STYLE = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" },
  labelStyle: { color: "var(--muted-foreground)" },
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const compact = (n: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);
const whole = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
const idx = (n: number | null) => (n == null ? "-" : n.toFixed(2));

const LINES: { key: "pv" | "forecast" | "ev" | "ac" | "certified" | "committed"; name: string; color: string; dash?: string; width: number; step?: boolean }[] = [
  { key: "pv", name: "Planned value (baseline)", color: "#2563eb", width: 2.5 },
  { key: "forecast", name: "Forecast (current programme)", color: "#2563eb", dash: "5 4", width: 1.5 },
  { key: "ev", name: "Earned value", color: "#059669", width: 2.5 },
  { key: "ac", name: "Actual cost", color: "#e11d48", width: 2 },
  { key: "certified", name: "Certified (IPC)", color: "#7c3aed", width: 2, step: true },
  { key: "committed", name: "Committed (PO)", color: "#94a3b8", dash: "2 3", width: 1.25 },
];

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-md border border-border p-0.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cn("rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            o.value === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "bad" | null }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums",
        tone === "good" && "text-emerald-600 dark:text-emerald-400", tone === "bad" && "text-red-600 dark:text-red-400")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const tone = (v: number | null, goodAtOrAbove = 1): "good" | "bad" | null => (v == null ? null : v >= goodAtOrAbove ? "good" : "bad");

export function ProjectScurveCard({ projectId, compact: small = false, className }: { projectId: string | null; compact?: boolean; className?: string }) {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [mode, setMode] = useState<ScurveMode>("value");
  const [retry, setRetry] = useState(0);
  const key = projectId ? `${projectId}|${period}|${retry}` : null;
  const [state, setState] = useState<{ key: string | null; data: ProjectScurveData | null; error: string | null }>({ key: null, data: null, error: null });

  useEffect(() => {
    if (!key || !projectId) return;
    let cancelled = false;
    getProjectScurve(createClient(), projectId, period)
      .then((data) => { if (!cancelled) setState({ key, data, error: null }); })
      .catch((e) => { if (!cancelled) setState({ key, data: null, error: e instanceof Error ? e.message : "Could not load the S-curve" }); });
    return () => { cancelled = true; };
  }, [key, projectId, period]);

  const loading = !!key && state.key !== key;
  const data = key && state.key === key ? state.data : null;
  const cur = data?.meta.currency ?? "";
  const money = (n: number) => `${cur ? cur + " " : ""}${whole(n)}`;
  const rows = useMemo(() => (data ? scurveRows(data, mode) : []), [data, mode]);
  const metrics = useMemo(() => (data ? scurveMetrics(data) : null), [data]);
  const warnings = useMemo(() => (data ? scurveHealth(data, money) : []), [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const marker = data ? dataDatePeriod(data) : null;
  const hasAny = !!data && rows.some((r) => r.pv > 0 || r.forecast > 0);
  const fmtAxis = (v: number) => (mode === "pct" ? `${v}%` : compact(v));
  const fmtTip = (v: number) => (mode === "pct" ? `${v}%` : money(v));

  return (
    <ChartWrapper
      title="Project S-Curve"
      description={
        data
          ? `Cost-loaded baseline vs earned, actual and certified · data date ${dayMonth(data.meta.data_date)}${data.meta.baseline_name ? ` · baseline ${data.meta.baseline_number}: ${data.meta.baseline_name}` : ""}`
          : "Planned value, earned value, actual cost and certified on one curve"
      }
      loading={loading}
      error={state.key === key ? state.error : null}
      onRetry={() => setRetry((n) => n + 1)}
      empty={!loading && !state.error && !hasAny && !warnings.length}
      emptyMessage="No budgeted activities with dates yet. Generate the programme from the BOQ, schedule it and set a baseline."
      height={small ? 360 : 520}
      className={className}
    >
      <div className="w-full space-y-3">
        {warnings.length > 0 && (
          <div className="space-y-1.5 px-3 pt-1">
            {warnings.map((w) => (
              <div key={w.code} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                w.severity === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                  : "border-border bg-muted/40 text-muted-foreground")}>
                {w.severity === "warning" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>
                  {w.message}{" "}
                  {(w.code === "baseline_coverage" || w.code === "no_baseline" || w.code === "unbaselined_tasks") && (
                    <Link href={BASELINE_HREF} className="font-medium underline">Set baseline in Planning</Link>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {metrics && !small && metrics.bac > 0 && (
          <div className="grid grid-cols-2 gap-2 px-3 sm:grid-cols-4 lg:grid-cols-8">
            <Tile label="BAC" value={compact(metrics.bac)} hint={cur || undefined} />
            <Tile label="Planned / earned" value={`${metrics.plannedPct}% / ${metrics.earnedPct}%`} />
            <Tile label="SPI" value={idx(metrics.spi)} hint={`SV ${compact(metrics.sv)}`} tone={tone(metrics.spi)} />
            <Tile label="CPI" value={idx(metrics.cpi)} hint={`CV ${compact(metrics.cv)}`} tone={tone(metrics.cpi)} />
            <Tile label="EAC" value={metrics.eac == null ? "-" : compact(metrics.eac)} hint={metrics.etc == null ? undefined : `ETC ${compact(metrics.etc)}`} />
            <Tile label="VAC" value={metrics.vac == null ? "-" : compact(metrics.vac)} tone={metrics.vac == null ? null : metrics.vac >= 0 ? "good" : "bad"} />
            <Tile label="Actual / committed" value={compact(metrics.ac)} hint={`PO ${compact(metrics.committed)}`} />
            <Tile label="Certified − EV" value={compact(metrics.billingGap)} hint={metrics.billingGap >= 0 ? "over-certified" : "under-certified"} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 px-3">
          <Toggle value={mode} options={[{ value: "value", label: "Value" }, { value: "pct", label: "% of BAC" }]} onChange={setMode} />
          <Toggle value={period} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }]} onChange={setPeriod} />
        </div>

        {hasAny && (
          <ResponsiveContainer width="100%" height={small ? 260 : 340}>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="period" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} tickFormatter={(v) => (period === "week" ? dayMonth(String(v)).replace(/ d{4}$/, "") : monthYear(String(v)))} minTickGap={24} />
              <YAxis tick={TICK} tickLine={false} axisLine={false} tickFormatter={fmtAxis} width={56} domain={mode === "pct" ? [0, 100] : undefined} />
              <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => `${period === "month" ? "Month" : "Week"} of ${dayMonth(String(v))}`}
                formatter={(v, name) => [v == null ? "-" : fmtTip(Number(v)), name]} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
              {marker && (
                <ReferenceLine x={marker} stroke="var(--muted-foreground)" strokeDasharray="2 3"
                  label={{ value: "Data date", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }} />
              )}
              {LINES.map((l) => (
                <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={l.width} strokeDasharray={l.dash}
                  type={l.step ? "stepAfter" : "monotone"} dot={false} connectNulls={false} isAnimationActive={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartWrapper>
  );
}
