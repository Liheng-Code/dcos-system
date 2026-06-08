"use client";

import { Search, Maximize, Minimize, Layers } from "lucide-react";
import type { GanttZoom, ScheduleLevel } from "./gantt-types";
import { ZOOM_LABELS } from "./gantt-types";
import { SCHEDULE_LEVELS } from "./schedule-levels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface GanttToolbarProps {
  zoom: GanttZoom;
  onZoomChange: (zoom: GanttZoom) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showBaseline: boolean;
  onBaselineToggle: (show: boolean) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  taskCount: number;
  filteredCount: number;
  scheduleLevel?: ScheduleLevel;
  onScheduleLevelChange?: (level: ScheduleLevel) => void;
  levelLabel?: string;
}

export function GanttToolbar({
  zoom,
  onZoomChange,
  searchQuery,
  onSearchChange,
  showBaseline,
  onBaselineToggle,
  isFullscreen,
  onFullscreenToggle,
  taskCount,
  filteredCount,
  scheduleLevel,
  onScheduleLevelChange,
  levelLabel,
}: GanttToolbarProps) {
  const zooms: GanttZoom[] = ["day", "week", "month"];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-xs">
      {/* Left: schedule level + zoom + search */}
      <div className="flex items-center gap-2">
        {/* Schedule Level Selector */}
        {onScheduleLevelChange && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={scheduleLevel ?? 3}
              onChange={(e) => onScheduleLevelChange(Number(e.target.value) as ScheduleLevel)}
              className="h-6 rounded border-0 bg-transparent px-1 text-[11px] font-medium outline-none cursor-pointer"
            >
              {SCHEDULE_LEVELS.map((sl) => (
                <option key={sl.level} value={sl.level}>
                  L{sl.level}: {sl.shortLabel}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Zoom */}
        <div className="flex items-center rounded-md bg-muted/50 p-0.5">
          {zooms.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => onZoomChange(z)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                zoom === z
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ZOOM_LABELS[z]}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-8 w-44 rounded-md border border-input bg-transparent pl-7 pr-2 text-xs outline-none focus:border-ring focus:ring-1 focus:ring-ring/30"
          />
        </div>
      </div>

      {/* Right: toggles + actions */}
      <div className="flex items-center gap-2">
        {levelLabel && (
          <Badge variant="secondary" className="text-[10px] h-5">
            {levelLabel}
          </Badge>
        )}

        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBaseline}
            onChange={(e) => onBaselineToggle(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input accent-primary"
          />
          Baseline
        </label>

        <Badge variant="outline" className="text-[10px] h-5">
          {filteredCount}/{taskCount} tasks
        </Badge>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onFullscreenToggle}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? (
            <Minimize className="h-3.5 w-3.5" />
          ) : (
            <Maximize className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
