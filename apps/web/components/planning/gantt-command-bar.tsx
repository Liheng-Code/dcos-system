"use client";

import {
  GanttChartSquare,
  Search,
  ZoomIn,
  ZoomOut,
  CalendarClock,
  ChevronsDown,
  ChevronsUp,
  Maximize,
  Minimize,
  MoveHorizontal,
  Zap,
} from "lucide-react";
import type { GanttZoom } from "./gantt-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatPeriodDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function StatPill({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  tone: "slate" | "blue" | "green";
}) {
  const toneClasses = {
    slate: "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-900/40 dark:border-slate-700 dark:text-slate-400",
    blue: "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-400",
    green: "bg-green-50 border-green-200 text-green-600 dark:bg-green-950/40 dark:border-green-800 dark:text-green-400",
  }[tone];
  const valueTone = {
    slate: "text-foreground",
    blue: "text-blue-700 dark:text-blue-400",
    green: "text-green-700 dark:text-green-400",
  }[tone];

  return (
    <div className={cn("flex flex-col rounded-md border px-2.5 py-1 leading-tight", toneClasses)}>
      <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
      <span className={cn("text-xs font-bold", valueTone)}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-medium text-muted-foreground">{unit}</span>}
      </span>
    </div>
  );
}

function LegendChip({ label, swatchClassName }: { label: string; swatchClassName: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
      <span className={cn("inline-block h-2.5 w-4 shrink-0 rounded-sm", swatchClassName)} />
      {label}
    </div>
  );
}

function TogglePill({
  label,
  active,
  activeColor,
  onClick,
}: {
  label: string;
  active: boolean;
  activeColor: "red" | "green";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
        active
          ? activeColor === "red"
            ? "border-red-500 bg-red-500 text-white"
            : "border-green-500 bg-green-500 text-white"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

interface GanttCommandBarProps {
  zoom: GanttZoom;
  onZoomChange: (zoom: GanttZoom) => void;
  zoomScale: number;
  onZoomScaleChange: (scale: number) => void;
  levelFilter: number | "all";
  maxLevel: number;
  onLevelFilterChange: (level: number | "all") => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onToday: () => void;
  onFitToScreen: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showBaseline: boolean;
  onBaselineToggle: (show: boolean) => void;
  showDependencies: boolean;
  onShowDependenciesChange: (show: boolean) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  visibleRows: number;
  weightedProgress: number;
  completedTasks: number;
  totalTasks: number;
  dependencyLinksCount: number;
  highlightCritical: boolean;
  onHighlightCriticalChange: (show: boolean) => void;
  autoScheduleActive: boolean;
  onAutoScheduleToggle: () => void;
  rangeMin: Date;
  rangeMax: Date;
  totalDays: number;
}

export function GanttCommandBar({
  zoom,
  onZoomChange,
  zoomScale,
  onZoomScaleChange,
  levelFilter,
  maxLevel,
  onLevelFilterChange,
  onExpandAll,
  onCollapseAll,
  onToday,
  onFitToScreen,
  searchQuery,
  onSearchChange,
  showBaseline,
  onBaselineToggle,
  showDependencies,
  onShowDependenciesChange,
  isFullscreen,
  onFullscreenToggle,
  visibleRows,
  weightedProgress,
  completedTasks,
  totalTasks,
  dependencyLinksCount,
  highlightCritical,
  onHighlightCriticalChange,
  autoScheduleActive,
  onAutoScheduleToggle,
  rangeMin,
  rangeMax,
  totalDays,
}: GanttCommandBarProps) {
  const zooms: { key: GanttZoom; label: string }[] = [
    { key: "day", label: "Days" },
    { key: "week", label: "Weeks" },
    { key: "month", label: "Months" },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2.5 shadow-xs">
      {/* Row 1 — title, stats, controls */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <GanttChartSquare className="h-4.5 w-4.5 text-primary" />
            <h2 className="text-sm font-bold leading-none whitespace-nowrap">WBS Integrated Roll-Up Gantt Chart</h2>
            <Badge
              variant="outline"
              className="h-4.5 border-amber-300 bg-amber-50 text-[9px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
            >
              Interactive Drag & Resize
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatPill label="Visible Rows" value={String(visibleRows)} unit="Rows" tone="slate" />
            <StatPill label="Roll-Up Execution" value={`${weightedProgress}%`} unit="Weighted" tone="blue" />
            <StatPill label="Task Roll-Up Status" value={`${completedTasks}/${totalTasks}`} unit="Done" tone="green" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="h-7 w-36 rounded-md border border-input bg-transparent pl-7 pr-2 text-[11px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
            />
          </div>

          {/* Level filter */}
          <select
            value={String(levelFilter)}
            onChange={(e) => onLevelFilterChange(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="h-7 rounded-md border border-input bg-transparent px-2 text-[11px] outline-none focus:border-ring"
          >
            <option value="all">All WBS Levels</option>
            {Array.from({ length: maxLevel }).map((_, i) => (
              <option key={i} value={i + 1}>
                Level {i + 1}
              </option>
            ))}
          </select>

          {/* Zoom scale */}
          <div className="flex items-center gap-0.5 rounded-md bg-muted/50 px-1 py-0.5">
            <button
              type="button"
              onClick={() => onZoomScaleChange(Math.max(0.5, Math.round((zoomScale - 0.25) * 100) / 100))}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-9 text-center text-[11px] tabular-nums">{Math.round(zoomScale * 100)}%</span>
            <button
              type="button"
              onClick={() => onZoomScaleChange(Math.min(2, Math.round((zoomScale + 0.25) * 100) / 100))}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Days / Weeks / Months */}
          <div className="flex items-center rounded-md bg-muted/50 p-0.5">
            {zooms.map((z) => (
              <button
                key={z.key}
                type="button"
                onClick={() => onZoomChange(z.key)}
                className={cn(
                  "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                  zoom === z.key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {z.label}
              </button>
            ))}
          </div>

          {/* Fit to screen width */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={onFitToScreen}
            title="Scale the timeline so the whole programme fits the window (no horizontal scroll)"
          >
            <MoveHorizontal className="h-3.5 w-3.5" /> Fit
          </Button>

          {/* Today */}
          <Button size="sm" className="h-7 gap-1 bg-red-500 text-[11px] text-white hover:bg-red-600" onClick={onToday}>
            <CalendarClock className="h-3.5 w-3.5" /> Today
          </Button>

          {/* Expand / Collapse */}
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={onExpandAll}>
            <ChevronsDown className="h-3.5 w-3.5" /> Expand
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={onCollapseAll}>
            <ChevronsUp className="h-3.5 w-3.5" /> Collapse
          </Button>

          {/* Baseline */}
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showBaseline}
              onChange={(e) => onBaselineToggle(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            Baseline
          </label>

          {/* Dependency links */}
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDependencies}
              onChange={(e) => onShowDependenciesChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            Links
          </label>

          {/* Fullscreen */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onFullscreenToggle}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Row 2 — interactive timeline legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-border/50 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap className="h-3 w-3 text-amber-500" /> Interactive Timeline
          </div>
          <LegendChip label="Parent Roll-Up Bracket (Auto-Roll-Up)" swatchClassName="bg-slate-600" />
          <LegendChip label="Task Bar (Drag center or resize)" swatchClassName="bg-blue-500" />
          <LegendChip label="Critical Path Bar" swatchClassName="bg-red-500" />
          <LegendChip label={`Dependency Links (${dependencyLinksCount})`} swatchClassName="bg-purple-500" />
          <TogglePill
            label={`Critical Path: ${highlightCritical ? "ON" : "OFF"}`}
            active={highlightCritical}
            activeColor="red"
            onClick={() => onHighlightCriticalChange(!highlightCritical)}
          />
          <TogglePill
            label={`Auto-Schedule: ${autoScheduleActive ? "ACTIVE" : "INACTIVE"}`}
            active={autoScheduleActive}
            activeColor="green"
            onClick={onAutoScheduleToggle}
          />
        </div>

        <div className="text-[10.5px] text-muted-foreground whitespace-nowrap">
          <span className="font-semibold text-foreground/70">Overall Period:</span> {formatPeriodDate(rangeMin)} ~{" "}
          {formatPeriodDate(rangeMax)} <span className="text-muted-foreground/70">({totalDays} Days)</span>
        </div>
      </div>
    </div>
  );
}
