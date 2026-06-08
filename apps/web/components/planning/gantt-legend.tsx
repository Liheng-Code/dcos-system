"use client";

import { cn } from "@/lib/utils";

interface LegendItem {
  label: string;
  color: string;
  count?: number;
  active: boolean;
  onClick?: () => void;
}

interface GanttLegendProps {
  items: LegendItem[];
  showBaseline: boolean;
  criticalCount: number;
  delayedCount: number;
}

export function GanttLegend({ items, showBaseline, criticalCount, delayedCount }: GanttLegendProps) {
  const legendItems: LegendItem[] = [
    ...items,
    ...(showBaseline ? [{ label: "Baseline", color: "bg-slate-300", active: true, count: undefined as number | undefined }] : []),
    ...(criticalCount > 0 ? [{ label: "Critical Path", color: "bg-red-500", active: true, count: criticalCount }] : []),
    ...(delayedCount > 0 ? [{ label: "Delayed", color: "bg-red-100 border-red-300", active: true, count: delayedCount }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 px-1">
      {legendItems.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className={cn(
            "flex items-center gap-1.5 text-[11px] text-muted-foreground transition-opacity",
            !item.active && "opacity-40",
          )}
        >
          <span
            className={cn(
              "inline-block h-2.5 rounded-full",
              item.color.includes("border") ? "w-5 border" : "w-5",
              item.color,
            )}
          />
          <span>{item.label}</span>
          {item.count !== undefined && (
            <span className="text-[10px] font-semibold text-muted-foreground/60">
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
