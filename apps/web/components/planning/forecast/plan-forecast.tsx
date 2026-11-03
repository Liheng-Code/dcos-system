"use client";

// Planning › Forecast (doc 35 F5; PRD FR-109/110/112, "forecasts must retain their assumptions and calculation date").
// Record the live forecast with the assumptions behind it, follow how the forecast finish moved between records, and
// compare two records activity by activity. A record is never changed.

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Plus } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LEGEND_STYLE, TICK, TOOLTIP_STYLE } from "@/components/planning/planning-dashboard-charts";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  captureForecast, getLiveForecast, getSnapshotTasks, listForecastSnapshots, taskLabels, type LiveForecast,
} from "@/lib/planning/forecast/forecast-service";
import { compareSnapshots, forecastTrend, periodMissing, type ForecastSnapshot } from "@/lib/planning/forecast/forecast-trend";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—");
const ts = (iso: string | null) => (iso ? Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) : null);
const dayDiff = (from: string | null, to: string | null) => (from && to ? Math.round(((ts(to) ?? 0) - (ts(from) ?? 0)) / 86_400_000) : null);
const signed = (n: number | null, unit = "d") => (n == null ? "—" : `${n > 0 ? "+" : ""}${n} ${unit}`);
const today = () => new Date().toISOString().slice(0, 10);

export function PlanForecast() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId: projectId } = useProject();
  const { canEditSchedule } = usePlanningPermissions();
  const [loaded, setLoaded] = useState<{ projectId: string; snaps: ForecastSnapshot[]; live: LiveForecast } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const load = useCallback(() => {
    if (!projectId) return;
    Promise.all([listForecastSnapshots(db, projectId), getLiveForecast(db, projectId)])
      .then(([snaps, live]) => { setLoaded({ projectId, snaps, live }); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [db, projectId]);
  useEffect(load, [load]);

  if (!projectId) return <p className="text-sm text-muted-foreground">Select a project in the header.</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!loaded || loaded.projectId !== projectId) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const { snaps, live } = loaded;
  const last = snaps[0] ?? null;
  const trend = forecastTrend(snaps);
  const missing = periodMissing(snaps, today());

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Forecast finish now" value={fmtDate(live.forecast)} hint={live.dataDate ? `data date ${fmtDate(live.dataDate)}` : "no data date set"} />
        <Tile label="Against the baseline" value={signed(dayDiff(live.baseline, live.forecast))} hint={`baseline ${fmtDate(live.baseline)}`}
          tone={(dayDiff(live.baseline, live.forecast) ?? 0) > 0 ? "warn" : undefined} />
        <Tile label="Against the contract completion" value={signed(dayDiff(live.contract, live.forecast))} hint={`contract ${fmtDate(live.contract)}`}
          tone={(dayDiff(live.contract, live.forecast) ?? 0) > 0 ? "bad" : undefined} />
        <Tile label="Since the last record" value={last ? signed(dayDiff(last.forecast_finish, live.forecast)) : "—"}
          hint={last ? `${last.label ?? last.period}, ${fmtDate(last.captured_at)}` : "nothing recorded yet"} />
      </section>

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Record the forecast</p>
          <p className="text-xs text-muted-foreground">
            Keeps today&apos;s dates, progress and the calculation they came from, with the assumptions you write. A record cannot be changed later.
            {missing && " Nothing has been recorded this month yet."}
          </p>
        </div>
        {canEditSchedule && <Button size="sm" onClick={() => setRecording(true)}><Plus className="mr-1 h-4 w-4" /> Record forecast</Button>}
      </section>

      {trend.length > 0 && <TrendChart rows={trend} />}
      <RecordsTable snaps={snaps} />
      {snaps.length >= 2 && <Compare db={db} snaps={snaps} />}

      {recording && (
        <RecordDialog
          onClose={() => setRecording(false)}
          onSave={async (assumptions, label) => {
            await captureForecast(db, projectId, assumptions, label);
            toast.success("Forecast recorded");
            setRecording(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums", tone === "warn" && "text-amber-600", tone === "bad" && "text-red-600")}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TrendChart({ rows }: { rows: ReturnType<typeof forecastTrend> }) {
  const data = rows.map((r) => ({ at: r.at.slice(0, 10), label: r.label, forecast: ts(r.forecast), baseline: ts(r.baseline), contract: ts(r.contract) }));
  const tick = (v: number) => { const d = new Date(v).toISOString(); return `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`; };
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold">Forecast finish over time</p>
      <p className="mb-2 text-[11px] text-muted-foreground">Each point is a recorded forecast. A rising line means the finish keeps slipping.</p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={TICK} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
          <YAxis tick={TICK} tickLine={false} axisLine={false} domain={["dataMin - 1209600000", "dataMax + 1209600000"]} tickFormatter={tick} width={56} type="number" />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, name) => [v == null ? "—" : fmtDate(new Date(Number(v)).toISOString()), name]} />
          <Legend wrapperStyle={LEGEND_STYLE} />
          <Line dataKey="forecast" name="Forecast finish" stroke="#2563eb" strokeWidth={2} dot connectNulls />
          <Line dataKey="baseline" name="Baseline finish" stroke="var(--muted-foreground)" strokeDasharray="5 4" dot={false} connectNulls />
          <Line dataKey="contract" name="Contract completion" stroke="#e11d48" strokeDasharray="2 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

function RecordsTable({ snaps }: { snaps: ForecastSnapshot[] }) {
  if (snaps.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No forecast recorded yet. Record one at each progress update (for example at the month end) to build the trend.</p>;
  }
  const trend = new Map(forecastTrend(snaps).map((r) => [r.id, r]));
  return (
    <section className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-left text-[11px] uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Recorded</th><th className="px-3 py-2">Forecast finish</th><th className="px-3 py-2">Moved</th>
            <th className="px-3 py-2">vs baseline</th><th className="px-3 py-2">Progress / planned</th><th className="px-3 py-2">Critical · delays</th>
            <th className="px-3 py-2">Assumptions</th><th className="px-3 py-2">Calculation</th>
          </tr>
        </thead>
        <tbody>
          {snaps.map((s) => {
            const t = trend.get(s.id);
            return (
              <tr key={s.id} className="border-t border-border align-top">
                <td className="px-3 py-1.5"><b>{s.label ?? s.period}</b><div className="text-muted-foreground">{fmtDate(s.captured_at)}{s.data_date ? ` · data date ${fmtDate(s.data_date)}` : ""}</div></td>
                <td className="px-3 py-1.5 font-mono">{fmtDate(s.forecast_finish)}</td>
                <td className={cn("px-3 py-1.5 tabular-nums", (t?.driftDays ?? 0) > 0 ? "text-red-600" : (t?.driftDays ?? 0) < 0 ? "text-emerald-600" : "")}>{signed(t?.driftDays ?? null)}</td>
                <td className="px-3 py-1.5 tabular-nums">{signed(s.variance_wd, "wd")}</td>
                <td className="px-3 py-1.5 tabular-nums">{s.progress_pct ?? "—"}% / {s.planned_pct ?? "—"}%</td>
                <td className="px-3 py-1.5 tabular-nums">{s.critical_count ?? "—"} · {s.open_delays ?? 0}{s.open_delay_days ? ` (${s.open_delay_days} d)` : ""}</td>
                <td className="max-w-[320px] whitespace-pre-wrap px-3 py-1.5">{s.assumptions}
                  {(s.basis.recoveries_applied?.length ?? 0) > 0 && <div className="text-muted-foreground">Recoveries applied: {s.basis.recoveries_applied!.map((r) => r.name).join(", ")}</div>}
                </td>
                <td className="px-3 py-1.5">
                  {s.basis.calculation_current
                    ? <span className="flex items-center gap-1 text-emerald-600" title={`engine ${s.basis.engine_version ?? "?"} · ${s.basis.input_hash?.slice(0, 10) ?? ""}`}><CheckCircle2 className="h-3.5 w-3.5" /> current</span>
                    : <span className="flex items-center gap-1 text-amber-600" title="Activities changed after the last calculation"><AlertTriangle className="h-3.5 w-3.5" /> {s.basis.calculation_id ? "changed after calculation" : "never calculated"}</span>}
                  {s.basis.calculated_at && <div className="text-muted-foreground">{fmtDate(s.basis.calculated_at)} · v{s.basis.engine_version}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Compare({ db, snaps }: { db: ReturnType<typeof createClient>; snaps: ForecastSnapshot[] }) {
  const [a, setA] = useState(snaps[1].id);
  const [b, setB] = useState(snaps[0].id);
  const [result, setResult] = useState<{ key: string; r: ReturnType<typeof compareSnapshots>; names: Map<string, { code: string; name: string }> } | null>(null);
  const key = `${a}|${b}`;

  useEffect(() => {
    let live = true;
    const older = snaps.find((s) => s.id === a)!;
    const newer = snaps.find((s) => s.id === b)!;
    const [x, y] = older.captured_at <= newer.captured_at ? [a, b] : [b, a];
    Promise.all([getSnapshotTasks(db, x), getSnapshotTasks(db, y)])
      .then(async ([ta, tb]) => {
        const r = compareSnapshots(ta, tb, 40);
        const names = await taskLabels(db, r.moved.map((m) => m.id));
        if (live) setResult({ key, r, names });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [db, snaps, a, b, key]);

  const opt = (s: ForecastSnapshot) => <option key={s.id} value={s.id}>{s.label ?? s.period} · {fmtDate(s.captured_at)}</option>;
  return (
    <section className="rounded-lg border border-border bg-card p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">What moved between two records</p>
        <select className="h-7 rounded-md border border-border bg-background px-1.5" value={a} onChange={(e) => setA(e.target.value)}>{snaps.map(opt)}</select>
        <span>→</span>
        <select className="h-7 rounded-md border border-border bg-background px-1.5" value={b} onChange={(e) => setB(e.target.value)}>{snaps.map(opt)}</select>
      </div>
      {!result || result.key !== key ? <Loader2 className="mt-3 h-4 w-4 animate-spin" /> : (
        <>
          <p className="mt-2 text-muted-foreground">
            {result.r.later} activities finish later, {result.r.earlier} earlier{result.r.added ? `, ${result.r.added} added` : ""}{result.r.removed ? `, ${result.r.removed} removed` : ""}.
          </p>
          {result.r.moved.length > 0 && (
            <table className="mt-2 w-full">
              <thead className="text-left text-[11px] uppercase text-muted-foreground"><tr><th className="py-1">Activity</th><th>Finish was</th><th>Finish now</th><th className="text-right">Moved</th></tr></thead>
              <tbody>
                {result.r.moved.map((m) => {
                  const n = result.names.get(m.id);
                  return (
                    <tr key={m.id} className="border-t border-border">
                      <td className="py-1"><span className="font-mono text-primary">{n?.code ?? "—"}</span> {n?.name ?? "(deleted activity)"}</td>
                      <td>{fmtDate(m.fromFinish)}</td><td>{fmtDate(m.toFinish)}</td>
                      <td className={cn("text-right tabular-nums", (m.days ?? 0) > 0 ? "text-red-600" : "text-emerald-600")}>{m.change === "moved" ? signed(m.days) : m.change}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function RecordDialog({ onClose, onSave }: { onClose: () => void; onSave: (assumptions: string, label: string) => Promise<void> }) {
  const d = today();
  const [label, setLabel] = useState(`${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)} update`);
  const [assumptions, setAssumptions] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (assumptions.trim().length < 10) return toast.error("Write the assumptions behind this forecast (at least 10 characters).");
    setBusy(true);
    try { await onSave(assumptions, label); } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Record the forecast</DialogTitle></DialogHeader>
        <label className="block text-xs"><span className="font-medium">Name</span><Input className="mt-1" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="block text-xs">
          <span className="font-medium">Assumptions</span>
          <Textarea className="mt-1" rows={5} value={assumptions} onChange={(e) => setAssumptions(e.target.value)}
            placeholder="What this forecast relies on, e.g. crews at planned strength; rebar deliveries from week 12; no weather allowance; recovery R3 applied." />
          <span className="text-[11px] text-muted-foreground">Recalculate the programme first, so the record carries the dates the engine produced.</span>
        </label>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Record</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
