"use client";

import { useMemo } from "react";
import type { GanttZoom } from "./gantt-types";
import { getZoomDayWidth } from "./gantt-utils";
import {
  applyZoomPreset,
  DEFAULT_TIMESCALE,
  enumerateTierSegments,
  formatTierLabel,
  segDayOffset,
  tierRowHeights,
  type TimescaleConfig,
} from "@/lib/planning/timescale";
import { cn } from "@/lib/utils";

interface GanttHeaderProps {
  /** Full MS-Project-style timescale config. When omitted it is derived from
   * `zoom` (keeps the older standalone charts working). */
  config?: TimescaleConfig;
  zoom?: GanttZoom;
  rangeMin: Date;
  rangeMax: Date;
  totalDays: number;
  dayWidth?: number;
  /** X offset (px) of the "today" marker, or < 0 when out of range */
  todayX?: number;
  /** X offset (px) of the schedule data date, or < 0 when unset / out of range */
  dataDateX?: number;
}

export function GanttHeader({
  config,
  zoom = "week",
  rangeMin,
  rangeMax,
  totalDays,
  dayWidth,
  todayX = -1,
  dataDateX = -1,
}: GanttHeaderProps) {
  const cfg = useMemo(
    () => config ?? applyZoomPreset(DEFAULT_TIMESCALE, zoom),
    [config, zoom],
  );
  const dayW = dayWidth ?? getZoomDayWidth(zoom);
  const chartW = Math.max(totalDays * dayW, 1);

  const { keys, rows } = useMemo(() => tierRowHeights(cfg), [cfg]);

  const tierRowsData = useMemo(() => {
    const fy = cfg.fiscalYearStartMonth;
    return keys.map((key) => {
      const tier = cfg.tiers[key];
      const cells = enumerateTierSegments(tier, rangeMin, rangeMax, fy).map((seg) => {
        const from = Math.max(0, segDayOffset(seg.start, rangeMin));
        const to = Math.min(totalDays, segDayOffset(seg.end, rangeMin));
        return {
          left: from * dayW,
          width: Math.max(0, (to - from) * dayW),
          // Always render the user's chosen format; the cell clips it if narrow.
          label: formatTierLabel(tier, seg.start, seg.index, { fiscalYearStartMonth: fy }),
          even: seg.index % 2 === 0,
        };
      });
      return { key, tier, cells };
    });
  }, [cfg, keys, rangeMin, rangeMax, totalDays, dayW]);

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background">
      {tierRowsData.map((row, ri) => (
        <div
          key={row.key}
          className={cn(
            "relative bg-background",
            ri > 0 && cfg.scaleSeparator && "border-t border-border/50",
          )}
          style={{ width: chartW, height: rows[ri] }}
        >
          {row.cells.map((c, ci) => (
            <div
              key={ci}
              className={cn(
                "absolute inset-y-0 flex items-center overflow-hidden text-[11px] font-semibold text-muted-foreground",
                row.tier.align === "center" && "justify-center",
                row.tier.align === "right" && "justify-end",
                row.tier.align === "left" && "justify-start",
                row.tier.tickLines && "border-r border-border/40",
                c.even && "bg-muted/25",
              )}
              style={{ left: c.left, width: c.width }}
            >
              {c.width >= 6 && <span className="truncate px-1">{c.label}</span>}
            </div>
          ))}
        </div>
      ))}

      {/* Data date tag */}
      {dataDateX >= 0 && dataDateX <= chartW && (
        <div className="pointer-events-none absolute top-0 z-30" style={{ left: dataDateX }}>
          <span className="inline-flex -translate-x-1/2 items-center gap-1 rounded-b-md bg-slate-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow">
            Data
          </span>
        </div>
      )}

      {/* Today tag */}
      {todayX >= 0 && todayX <= chartW && (
        <div className="pointer-events-none absolute top-0 z-30" style={{ left: todayX }}>
          <span className="inline-flex -translate-x-1/2 items-center gap-1 rounded-b-md bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow">
            <span className="h-1 w-1 rounded-full bg-white" /> Today
          </span>
        </div>
      )}
    </div>
  );
}
