"use client";

import { useMemo } from "react";
import type { GanttZoom } from "./gantt-types";
import { getZoomDayWidth, isWeekend, getWeekNumber, getMonthLabel } from "./gantt-utils";
import { cn } from "@/lib/utils";

interface GanttHeaderProps {
  zoom: GanttZoom;
  rangeMin: Date;
  rangeMax: Date;
  totalDays: number;
}

export function GanttHeader({ zoom, rangeMin, rangeMax, totalDays }: GanttHeaderProps) {
  const dayW = getZoomDayWidth(zoom);
  const chartW = totalDays * dayW;

  const days = useMemo(() => {
    const result: Date[] = [];
    const cur = new Date(rangeMin);
    while (cur <= rangeMax) {
      result.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [rangeMin, rangeMax]);

  const months = useMemo(() => {
    const seen = new Set<string>();
    const result: { label: string; left: number; width: number }[] = [];
    let monthStart = -1;

    for (let i = 0; i < days.length; i++) {
      const key = `${days[i].getFullYear()}-${days[i].getMonth()}`;
      if (!seen.has(key)) {
        if (monthStart >= 0) {
          result[result.length - 1].width = (i - monthStart) * dayW;
        }
        seen.add(key);
        monthStart = i;
        result.push({ label: getMonthLabel(days[i]), left: i * dayW, width: 0 });
      }
    }
    if (result.length > 0) {
      result[result.length - 1].width = (days.length - monthStart) * dayW;
    }
    return result;
  }, [days, dayW]);

  return (
    <div className="sticky top-0 z-20 bg-background border-b border-border">
      {/* Month row */}
      <div className="flex border-b border-border/50 bg-muted/20" style={{ height: 22 }}>
        <div className="relative flex" style={{ width: chartW }}>
          {months.map((m, i) => (
            <div
              key={i}
              className="absolute flex items-center px-2 text-[11px] font-semibold text-muted-foreground"
              style={{ left: m.left, width: m.width, height: 22 }}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>

      {/* Week / Day row */}
      <div className="flex" style={{ height: 24 }}>
        <div className="relative flex" style={{ width: chartW }}>
          {days.map((day, i) => {
            const isWeekendDay = isWeekend(day);
            let showLabel = false;
            let label = "";

            if (zoom === "day") {
              showLabel = true;
              label = String(day.getDate());
            } else if (zoom === "week") {
              showLabel = day.getDay() === 1;
              label = `W${getWeekNumber(day)}`;
            } else {
              showLabel = day.getDate() === 1;
              label = getMonthLabel(day);
            }

            return (
              <div
                key={i}
                className={cn(
                  "absolute top-0 border-r border-border/30",
                  isWeekendDay && "bg-muted/10",
                )}
                style={{ left: i * dayW, width: dayW, height: 24 }}
              >
                {showLabel && (
                  <span className="px-1 text-[10px] text-muted-foreground leading-6">
                    {label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
