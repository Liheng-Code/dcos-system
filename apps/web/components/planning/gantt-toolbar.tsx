"use client";

import { Search, Maximize, Minimize, MoveHorizontal, Plus, Filter, Download } from "lucide-react";
import type { GanttZoom } from "./gantt-types";
import { ZOOM_LABELS } from "./gantt-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface GanttToolbarProps {
  zoom: GanttZoom;
  onZoomChange: (zoom: GanttZoom) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showBaseline: boolean;
  onBaselineToggle: (show: boolean) => void;
  showDependencies?: boolean;
  onShowDependenciesChange?: (show: boolean) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
  taskCount: number;
  filteredCount: number;
  highlightCritical?: boolean;
  onHighlightCriticalChange?: (show: boolean) => void;
  onFitToScreen?: () => void;
  onAddActivity?: () => void;
}

export function GanttToolbar({
  zoom,
  onZoomChange,
  searchQuery,
  onSearchChange,
  showBaseline,
  onBaselineToggle,
  showDependencies,
  onShowDependenciesChange,
  isFullscreen,
  onFullscreenToggle,
  taskCount,
  filteredCount,
  highlightCritical,
  onHighlightCriticalChange,
  onFitToScreen,
  onAddActivity,
}: GanttToolbarProps) {
  const zooms: GanttZoom[] = ["day", "week", "month"];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-xs">
      {/* Left group */}
      <div className="flex items-center gap-2">
        {/* Zoom toggle */}
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

        {/* Fit to screen width */}
        {onFitToScreen && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={onFitToScreen}
            title="Scale the timeline so the whole programme fits the window"
          >
            <MoveHorizontal className="h-3.5 w-3.5" /> Fit
          </Button>
        )}

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

        {/* Filter dropdown placeholder */}
        <div className="relative group">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Filter">
            <Filter className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Add Activity */}
        {onAddActivity && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1 rounded-md"
            onClick={onAddActivity}
          >
            <Plus className="h-3 w-3" /> Activity
          </Button>
        )}
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2">
        {/* Show Baseline toggle */}
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showBaseline}
            onChange={(e) => onBaselineToggle(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input accent-primary"
          />
          Baseline
        </label>

        {/* Show dependency links toggle */}
        {onShowDependenciesChange && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!showDependencies}
              onChange={(e) => onShowDependenciesChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            Links
          </label>
        )}

        {/* Highlight Critical Path toggle */}
        {onHighlightCriticalChange !== undefined && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={highlightCritical}
              onChange={(e) => onHighlightCriticalChange(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-red-500"
            />
            <span className="text-red-600">Critical</span>
          </label>
        )}

        <Badge variant="outline" className="text-[10px] h-5">
          {filteredCount}/{taskCount} tasks
        </Badge>

        {/* Export PDF */}
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Export PDF">
          <Download className="h-3.5 w-3.5" />
        </Button>

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
