"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  captureProgressSnapshot,
  getScurveSeries,
  type ScurvePoint,
  type ScurveSeries,
} from "@/lib/planning/schedule-service";
import { currency, percent, ratio } from "@/lib/evm-service";
import { TrendingUp, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ProgressChart } from "@/components/report-kit/charts/progress-chart";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useProject } from "@/components/dashboard/project-context";
import {
  listComparisonSources,
  resolveSource,
  type ComparisonSourceOption,
  type TaskSnapshot,
} from "@/lib/planning/schedule-comparison-service";
import {
  buildComparisonCurve,
  curveDateAtPct,
  curveValueAt,
  type ComparisonCurve,
} from "@/lib/planning/scurve-comparison";
import { parseISO } from "@/lib/planning/work-calendar";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Resolves one "schedule source" slot (View / Compare A / Compare B) to its
 * planned S-curve. The network `resolveSource` call fires only on a source
 * change; the curve is rebuilt cheaply whenever `sampleSeries` reloads so its
 * x-points stay aligned with the live planned line.
 */
function useSourceCurve(
  projectId: string | undefined,
  key: string,
  options: ComparisonSourceOption[],
  sampleSeries: ScurveSeries | null,
): { curve: ComparisonCurve | null; label: string; loading: boolean } {
  const [map, setMap] = useState<Map<string, TaskSnapshot> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const opt = options.find((o) => o.key === key);
    if (!projectId || !opt) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setMap(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    setLoading(true);
    resolveSource(projectId, opt.source)
      .then((m) => {
        if (!cancelled) setMap(m);
      })
      .catch((e) => {
        if (cancelled) return;
        setMap(null);
        toast.error(e instanceof Error ? e.message : "Failed to load comparison schedule");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, key, options]);

  const curve = useMemo<ComparisonCurve | null>(
    () =>
      map ? buildComparisonCurve(map, { sampleDates: sampleSeries?.planned.map((p) => p.date) }) : null,
    [map, sampleSeries],
  );
  const label = useMemo(() => options.find((o) => o.key === key)?.label ?? "", [options, key]);

  return { curve, label, loading };
}

/** Schedule variance of the current earned position against one comparison curve. */
function scheduleVsCurve(
  curve: ComparisonCurve,
  dd: string,
  evPct: number,
  evCost: number,
  hasCost: boolean,
) {
  const pvPct = curveValueAt(curve, dd, "pct") ?? 0;
  const hit = curveDateAtPct(curve, evPct);
  const pvCost = hasCost && curve.hasCost ? curveValueAt(curve, dd, "value") : null;
  return {
    svPct: evPct - pvPct,
    spi: pvPct > 0 ? evPct / pvPct : null,
    daysDelta: hit
      ? Math.round((parseISO(dd).getTime() - parseISO(hit).getTime()) / 86_400_000)
      : null, // > 0 = behind that plan, < 0 = ahead
    svCost: pvCost != null ? evCost - pvCost : null,
  };
}

type VsData = ReturnType<typeof scheduleVsCurve>;

function VsLine({
  label,
  data,
  hasCost,
  dotClass,
}: {
  label: string;
  data: VsData;
  hasCost: boolean;
  dotClass: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
      <span className="flex items-center gap-1.5 font-medium text-slate-500">
        <span className={cn("inline-block h-1.5 w-4 shrink-0 rounded-full border border-dashed", dotClass)} />
        vs {label || "comparison"}:
      </span>
      <span>
        SPI{" "}
        <span className="font-semibold tabular-nums text-slate-900">
          {data.spi != null ? ratio(data.spi) : "—"}
        </span>
      </span>
      <span>
        SV{" "}
        <span
          className={cn(
            "font-semibold tabular-nums",
            (hasCost && data.svCost != null ? data.svCost : data.svPct) >= 0
              ? "text-emerald-600"
              : "text-red-600",
          )}
        >
          {hasCost && data.svCost != null
            ? currency(data.svCost)
            : `${data.svPct >= 0 ? "+" : ""}${data.svPct.toFixed(1)}%`}
        </span>
      </span>
      <span>
        Schedule{" "}
        <span
          className={cn(
            "font-semibold tabular-nums",
            data.daysDelta == null
              ? "text-slate-400"
              : data.daysDelta <= 0
                ? "text-emerald-600"
                : "text-red-600",
          )}
        >
          {data.daysDelta == null
            ? "—"
            : data.daysDelta === 0
              ? "on plan"
              : `${Math.abs(data.daysDelta)}d ${data.daysDelta > 0 ? "behind" : "ahead"}`}
        </span>
      </span>
    </div>
  );
}

/** One header dropdown pill (View / Compare A / Compare B). */
function SourcePill({
  swatch,
  activeClass,
  active,
  value,
  onChange,
  disabled,
  loading,
  title,
  noneLabel,
  prefix,
  options,
}: {
  swatch: string;
  activeClass: string;
  active: boolean;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  loading: boolean;
  title: string;
  noneLabel: string;
  prefix: string;
  options: ComparisonSourceOption[];
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5",
        active ? activeClass : "border-border",
      )}
    >
      <span className={cn("inline-block h-1.5 w-4 shrink-0 rounded-full", swatch)} title={title} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        title={title}
        className="h-7 rounded bg-transparent pr-1 text-xs font-medium text-foreground outline-none disabled:opacity-50"
      >
        <option value="">{noneLabel}</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {prefix}
            {o.label}
          </option>
        ))}
      </select>
      {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
    </span>
  );
}

// ── Page component ─────────────────────────────────────────────────────────────

export function WbsScurveChart() {
  const { selectedProjectId } = useProject();
  const [series, setSeries] = useState<ScurveSeries | null>(null);
  const [mode, setMode] = useState<"pct" | "cost">("pct");
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoCapture = useRef(false);

  // ── Three schedule-source slots, mirroring the Gantt Chart:
  //   View      → which schedule defines the Planned curve + the SPI/SV tiles.
  //   Compare A → an overlay planned curve (blue).
  //   Compare B → a second overlay planned curve (violet).
  // All "" = default (Baseline for View, none for the overlays).
  const [viewKey, setViewKey] = useState("");
  const [compareKeyA, setCompareKeyA] = useState("");
  const [compareKeyB, setCompareKeyB] = useState("");
  const [compareOptions, setCompareOptions] = useState<ComparisonSourceOption[]>([]);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      let next = await getScurveSeries(selectedProjectId);
      if (
        !didAutoCapture.current &&
        next.meta.baselined > 0 &&
        next.actual.length === 0
      ) {
        didAutoCapture.current = true;
        try {
          await captureProgressSnapshot(selectedProjectId);
          next = await getScurveSeries(selectedProjectId);
        } catch {
          /* non-fatal — the live point still renders the actual line */
        }
      }
      setSeries(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load S-curve");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    didAutoCapture.current = false;
  }, [selectedProjectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
  useEffect(() => { void load(); }, [load]);

  // Schedule-source options — Live is excluded (it ≈ the default planned source).
  useEffect(() => {
    if (!selectedProjectId) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setCompareOptions([]);
      setViewKey("");
      setCompareKeyA("");
      setCompareKeyB("");
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    listComparisonSources(selectedProjectId)
      .then((opts) => {
        if (cancelled) return;
        const usable = opts.filter((o) => o.source.kind !== "live");
        setCompareOptions(usable);
        // Stale-key guard: a source deleted in Manage Schedules leaves a dead key.
        const keep = (prev: string) => (prev && usable.some((o) => o.key === prev) ? prev : "");
        setViewKey(keep);
        setCompareKeyA(keep);
        setCompareKeyB(keep);
      })
      .catch(() => {
        if (!cancelled) setCompareOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  async function handleCapture() {
    if (!selectedProjectId) return;
    setCapturing(true);
    try {
      await captureProgressSnapshot(selectedProjectId);
      toast.success("Snapshot captured");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to capture snapshot");
    } finally {
      setCapturing(false);
    }
  }

  const hasCost = series?.meta.has_cost ?? false;
  const effectiveMode: "pct" | "cost" = mode === "cost" && hasCost ? "cost" : "pct";

  const projectId = selectedProjectId || undefined;
  const view = useSourceCurve(projectId, viewKey, compareOptions, series);
  const cmpA = useSourceCurve(projectId, compareKeyA, compareOptions, series);
  const cmpB = useSourceCurve(projectId, compareKeyB, compareOptions, series);

  const curveUsable = (c: ComparisonCurve | null) =>
    !!c && c.planned.length >= 2 && (effectiveMode === "pct" || c.hasCost);

  const viewActive = curveUsable(view.curve);
  const showA = curveUsable(cmpA.curve);
  const showB = curveUsable(cmpB.curve);

  /** The plan-of-record points — the View curve when set, else the RPC's baseline curve. */
  const plannedPts = useMemo<ScurvePoint[]>(
    () => (viewActive ? view.curve!.planned : series?.planned ?? []),
    [viewActive, view.curve, series],
  );

  // ── Chart rows: merge the planned curve with the actual snapshots + live point + overlays
  const chartData = useMemo(() => {
    if (!series) return [];
    const pick = (p: { pct: number | null; value: number | null }) =>
      effectiveMode === "cost" ? p.value : p.pct;

    const planned = new Map<string, number | null>();
    for (const p of plannedPts) planned.set(p.date, pick(p));

    const actual = new Map<string, number | null>();
    for (const a of series.actual) actual.set(a.date, pick(a));
    if (series.live) actual.set(series.live.date, pick(series.live));

    const cA = new Map<string, number | null>();
    if (showA && cmpA.curve) for (const p of cmpA.curve.planned) cA.set(p.date, pick(p));
    const cB = new Map<string, number | null>();
    if (showB && cmpB.curve) for (const p of cmpB.curve.planned) cB.set(p.date, pick(p));

    const dates = [
      ...new Set([...planned.keys(), ...actual.keys(), ...cA.keys(), ...cB.keys()]),
    ].sort();
    return dates.map((d) => ({
      date: d,
      planned: planned.get(d) ?? null,
      actual: actual.get(d) ?? null,
      compareA: cA.get(d) ?? null,
      compareB: cB.get(d) ?? null,
    }));
  }, [series, effectiveMode, plannedPts, showA, cmpA.curve, showB, cmpB.curve]);

  const chartSeries = useMemo(() => {
    const s: { dataKey: string; name: string; color: string; strokeDasharray?: string }[] = [
      {
        dataKey: "planned",
        name: viewActive ? `Plan: ${view.label}` : "Planned",
        color: "#94a3b8",
        strokeDasharray: "5 3",
      },
      { dataKey: "actual", name: "Actual", color: "#16a34a" },
    ];
    if (showA) {
      s.push({
        dataKey: "compareA",
        name: cmpA.label || "Compare A",
        color: "#2563eb",
        strokeDasharray: "2 3",
      });
    }
    if (showB) {
      s.push({
        dataKey: "compareB",
        name: cmpB.label || "Compare B",
        color: "#7c3aed",
        strokeDasharray: "2 3",
      });
    }
    return s;
  }, [viewActive, view.label, showA, cmpA.label, showB, cmpB.label]);

  // ── Current EVM position (as of today) — measured against the View plan.
  const evm = useMemo(() => {
    if (!series || series.meta.baselined === 0) return null;
    const t = todayIso();
    const plannedToDate = plannedPts.filter((p) => p.date <= t);
    const lastPlanned = plannedToDate[plannedToDate.length - 1] ?? plannedPts[0] ?? null;

    const pvPct = lastPlanned?.pct ?? 0;
    const evPct = series.live?.pct ?? 0;
    const spi = pvPct > 0 ? evPct / pvPct : null;
    const svPct = evPct - pvPct;

    const bac = series.meta.bac_cost ?? 0;
    const acCost = series.live?.value ?? 0;
    const pvCost = lastPlanned?.value ?? 0;
    const evCost = bac * (evPct / 100);
    const cpi = hasCost && acCost > 0 ? evCost / acCost : null;
    const cvCost = hasCost ? evCost - acCost : null;
    const svCost = hasCost ? evCost - pvCost : null;

    return { pvPct, evPct, spi, svPct, bac, acCost, evCost, cpi, cvCost, svCost, dataDate: series.live?.date ?? t };
  }, [series, hasCost, plannedPts]);

  const compareEvmA = useMemo(
    () =>
      evm && showA && cmpA.curve
        ? scheduleVsCurve(cmpA.curve, evm.dataDate, evm.evPct, evm.evCost, hasCost)
        : null,
    [evm, showA, cmpA.curve, hasCost],
  );
  const compareEvmB = useMemo(
    () =>
      evm && showB && cmpB.curve
        ? scheduleVsCurve(cmpB.curve, evm.dataDate, evm.evPct, evm.evCost, hasCost)
        : null,
    [evm, showB, cmpB.curve, hasCost],
  );

  const baseBasis = viewActive
    ? `Planned curve = "${view.label}", weighted by ${view.curve!.weightBasis}.`
    : series?.meta.weight_basis === "cost"
      ? "Planned curve weighted by task budget cost."
      : series?.meta.weight_basis === "duration"
        ? "Planned curve weighted by task duration (no budget cost on tasks)."
        : "Planned curve weighted equally (no cost or duration on tasks).";
  const basisNote =
    baseBasis +
    (showA && cmpA.curve ? ` Compare A "${cmpA.label}" weighted by ${cmpA.curve.weightBasis}.` : "") +
    (showB && cmpB.curve ? ` Compare B "${cmpB.label}" weighted by ${cmpB.curve.weightBasis}.` : "");

  const noBaseline = !!series && series.meta.baselined === 0;
  const pickDisabled = loading || compareOptions.length === 0;

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">S-Curve &amp; EVM</h1>
            <p className="text-sm text-muted-foreground">
              {series
                ? `${series.meta.baselined} of ${series.meta.total_tasks} tasks baselined · ${series.actual.length} snapshot${series.actual.length !== 1 ? "s" : ""}`
                : "Loading…"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* View / Compare A / Compare B — mirrors the Gantt Chart selectors */}
          {!noBaseline && (
            <>
              <SourcePill
                swatch="h-2 bg-slate-400"
                activeClass="border-slate-400 bg-slate-100"
                active={!!viewKey}
                value={viewKey}
                onChange={setViewKey}
                disabled={pickDisabled}
                loading={view.loading}
                title="Which schedule defines the grey Planned curve and the SPI / SV tiles"
                noneLabel="View: Baseline (active)"
                prefix="View: "
                options={compareOptions}
              />
              <SourcePill
                swatch="border border-dashed border-blue-600 bg-blue-300"
                activeClass="border-blue-500 bg-blue-50"
                active={!!compareKeyA}
                value={compareKeyA}
                onChange={setCompareKeyA}
                disabled={pickDisabled}
                loading={cmpA.loading}
                title="Overlay a schedule's planned S-curve (blue dotted line)"
                noneLabel="Compare A: none"
                prefix="Compare A: "
                options={compareOptions.filter((o) => o.key !== compareKeyB)}
              />
              <SourcePill
                swatch="border border-dashed border-violet-600 bg-violet-300"
                activeClass="border-violet-500 bg-violet-50"
                active={!!compareKeyB}
                value={compareKeyB}
                onChange={setCompareKeyB}
                disabled={pickDisabled}
                loading={cmpB.loading}
                title="Overlay a second schedule's planned S-curve (violet dotted line)"
                noneLabel="Compare B: none"
                prefix="Compare B: "
                options={compareOptions.filter((o) => o.key !== compareKeyA)}
              />
            </>
          )}

          {/* % / $ toggle */}
          <div className="flex items-center rounded-md bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setMode("pct")}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                effectiveMode === "pct" ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              %
            </button>
            <button
              type="button"
              onClick={() => setMode("cost")}
              disabled={!hasCost}
              title={hasCost ? undefined : "Add budget cost to tasks to enable the cost curve"}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                effectiveMode === "cost" ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
                !hasCost && "cursor-not-allowed opacity-40",
              )}
            >
              $
            </button>
          </div>

          <Button
            size="sm"
            disabled={capturing || !selectedProjectId}
            onClick={handleCapture}
            className="gap-1.5"
          >
            {capturing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Camera className="h-3.5 w-3.5" />}
            Capture Today
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {noBaseline ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 py-16 text-center">
          <TrendingUp className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No baseline yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-400">
            Open Planning ▸ Gantt Chart ▸ Project ▸ Set Baseline to capture baseline dates.
            The planned curve is computed from them and appears here.
          </p>
        </div>
      ) : (
        <>
          {/* EVM KPI strip */}
          {evm && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                {
                  label: "SPI",
                  fullName: "Schedule Performance Index — earned value ÷ planned value",
                  value: evm.spi != null ? ratio(evm.spi) : "—",
                  good: evm.spi != null ? evm.spi >= 1 : null,
                },
                {
                  label: "CPI",
                  fullName: "Cost Performance Index — earned value ÷ actual cost",
                  value: evm.cpi != null ? ratio(evm.cpi) : "—",
                  good: evm.cpi != null ? evm.cpi >= 1 : null,
                },
                {
                  label: "SV",
                  fullName: "Schedule Variance — earned value minus planned value",
                  value: hasCost && evm.svCost != null ? currency(evm.svCost) : `${evm.svPct >= 0 ? "+" : ""}${evm.svPct.toFixed(1)}%`,
                  good: (hasCost ? (evm.svCost ?? 0) : evm.svPct) >= 0,
                },
                {
                  label: "CV",
                  fullName: "Cost Variance — earned value minus actual cost",
                  value: evm.cvCost != null ? currency(evm.cvCost) : "—",
                  good: evm.cvCost != null ? evm.cvCost >= 0 : null,
                },
                {
                  label: "BAC",
                  fullName: "Budget At Completion — the total approved budget",
                  value: hasCost ? currency(evm.bac) : "—",
                  good: null,
                },
                {
                  label: "Data Date",
                  fullName: "The as-of date this snapshot's progress is measured against",
                  value: fmtDate(evm.dataDate),
                  good: null,
                },
              ].map(({ label, fullName, value, good }) => (
                <Tooltip key={label}>
                  <TooltipTrigger
                    render={
                      <div className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                        <div
                          className={cn(
                            "text-base font-bold tabular-nums",
                            good === true ? "text-emerald-600" : good === false ? "text-red-600" : "text-slate-900",
                          )}
                        >
                          {value}
                        </div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
                      </div>
                    }
                  />
                  <TooltipContent>{fullName}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Earned position vs each overlay plan */}
          {(compareEvmA || compareEvmB) && (
            <div className="flex flex-col gap-1">
              {compareEvmA && (
                <VsLine
                  label={cmpA.label}
                  data={compareEvmA}
                  hasCost={hasCost}
                  dotClass="border-blue-600 bg-blue-300"
                />
              )}
              {compareEvmB && (
                <VsLine
                  label={cmpB.label}
                  data={compareEvmB}
                  hasCost={hasCost}
                  dotClass="border-violet-600 bg-violet-300"
                />
              )}
            </div>
          )}

          {/* S-Curve chart */}
          <ProgressChart
            data={chartData}
            series={chartSeries}
            xKey="date"
            loading={loading}
            empty={chartData.length < 2}
            error={error}
            onRetry={() => load()}
            height={300}
            yDomain={effectiveMode === "cost" ? [0, "auto"] : [0, 100]}
            formatX={fmtMonth}
            formatY={effectiveMode === "cost" ? (v) => currency(v) : (v) => `${v}%`}
            formatTooltip={effectiveMode === "cost" ? (v) => currency(v) : (v) => percent(v)}
            todayX={evm?.dataDate}
            todayLabel={
              evm
                ? effectiveMode === "cost"
                  ? currency(evm.evCost)
                  : `${evm.evPct.toFixed(1)}%`
                : undefined
            }
          />

          <p className="text-[11px] text-muted-foreground">{basisNote}</p>

          {/* Snapshot history */}
          {series && series.actual.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-center">Planned %</th>
                    <th className="px-3 py-2 text-center">Actual %</th>
                    <th className="px-3 py-2 text-center">Variance</th>
                    <th className="px-3 py-2 text-center">SPI</th>
                    <th className="px-3 py-2 text-right">Actual Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series.actual].reverse().map((s, i) => {
                    const pp = s.planned_pct ?? 0;
                    const ap = s.pct ?? 0;
                    const v = ap - pp;
                    const spi = pp > 0 ? ap / pp : null;
                    return (
                      <tr key={`${s.date}-${i}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-medium text-slate-700">{fmtDate(s.date)}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{s.planned_pct?.toFixed(1) ?? "—"}%</td>
                        <td className="px-3 py-2 text-center font-semibold">{s.pct?.toFixed(1) ?? "—"}%</td>
                        <td className={`px-3 py-2 text-center font-semibold ${v >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {v >= 0 ? "+" : ""}{v.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-center text-slate-500">{spi != null ? spi.toFixed(2) : "—"}</td>
                        <td className="px-3 py-2 text-right">
                          {s.value != null ? currency(s.value) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
