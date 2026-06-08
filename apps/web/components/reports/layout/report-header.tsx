"use client";

import { useState, useMemo } from "react";
import { CalendarRange, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: string;
  to: string;
}

interface Preset {
  label: string;
  days: number;
}

const PRESETS: Preset[] = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

interface ReportHeaderProps {
  title: string;
  description?: string;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  onRefresh?: () => void;
  loading?: boolean;
  children?: React.ReactNode;
}

export function ReportHeader({
  title,
  description,
  dateRange,
  onDateRangeChange,
  onRefresh,
  loading,
  children,
}: ReportHeaderProps) {
  const [activePreset, setActivePreset] = useState<string | null>(null);

  function handlePreset(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setActivePreset(`${days}d`);
    onDateRangeChange({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && (
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePreset(p.days)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                activePreset === p.label
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              {p.label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-1 px-1">
            <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => {
                setActivePreset(null);
                onDateRangeChange({ ...dateRange, from: e.target.value });
              }}
              className="w-28 rounded border-0 bg-transparent px-1 py-1 text-xs text-slate-700 outline-none focus:ring-0"
            />
            <span className="text-xs text-slate-400">—</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => {
                setActivePreset(null);
                onDateRangeChange({ ...dateRange, to: e.target.value });
              }}
              className="w-28 rounded border-0 bg-transparent px-1 py-1 text-xs text-slate-700 outline-none focus:ring-0"
            />
          </div>
        </div>
        {onRefresh && (
          <Button
            variant="outline"
            size="icon"
            className="rounded-lg h-8 w-8"
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
