"use client";

import {
  CalendarClock,
  Calculator,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  FolderCog,
  FolderPlus,
  Flag,
  Hash,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Link2Off,
  MoveHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { GanttZoom } from "./gantt-types";
import { ZOOM_LABELS } from "./gantt-types";

export interface ToolbarBaseline {
  number: number;
  name: string;
  active: boolean;
}

interface ScheduleToolbarProps {
  taskCount: number;
  capped: boolean;
  selectedRowId: string | null;
  /** Two task rows selected → the Link button becomes available. */
  linkSourceId: string | null;
  linkTargetId: string | null;
  /** Number of task rows in the multi-selection (Ctrl/Shift) — ≥2 chain-links them. */
  linkCount: number;
  calendarName: string;
  scheduleError: string | null;
  autoSchedule: boolean;
  showTimeline: boolean;
  zoom: GanttZoom;
  showBaseline: boolean;
  showDependencies: boolean;
  showToday: boolean;
  onAddTask: () => void;
  onAddSummary: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefresh: () => void;
  onLink: () => void;
  onUnlink: () => void;
  onZoomChange: (z: GanttZoom) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onToday: () => void;
  onBaselineToggle: (v: boolean) => void;
  onDependenciesToggle: (v: boolean) => void;
  onAutoScheduleToggle: (v: boolean) => void;
  onRunAutoSchedule: () => void;
  onToggleTimeline: () => void;
  // --- Project ▾ menu (MS-Project "Project" tab) ---
  calcNeeded: boolean;
  baselines: ToolbarBaseline[];
  onOpenWbsCode: () => void;
  onOpenWorkingTime: () => void;
  onOpenSetBaseline: () => void;
  onOpenMoveProject: () => void;
  onActivateBaseline: (n: number) => void;
}

function Toggle({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "h-7 rounded-md border px-2 text-[11px] font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function ScheduleToolbar({
  taskCount,
  capped,
  selectedRowId,
  linkSourceId,
  linkTargetId,
  linkCount,
  calendarName,
  scheduleError,
  autoSchedule,
  showTimeline,
  zoom,
  showBaseline,
  showDependencies,
  showToday,
  onAddTask,
  onAddSummary,
  onIndent,
  onOutdent,
  onExpandAll,
  onCollapseAll,
  onRefresh,
  onLink,
  onUnlink,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onToday,
  onBaselineToggle,
  onDependenciesToggle,
  onAutoScheduleToggle,
  onRunAutoSchedule,
  onToggleTimeline,
  calcNeeded,
  baselines,
  onOpenWbsCode,
  onOpenWorkingTime,
  onOpenSetBaseline,
  onOpenMoveProject,
  onActivateBaseline,
}: ScheduleToolbarProps) {
  const noSelection = !selectedRowId;
  const canLink =
    linkCount >= 2 ||
    Boolean(linkSourceId && linkTargetId && linkSourceId !== linkTargetId);
  const activeBaseline = baselines.find((b) => b.active)?.number ?? -1;

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onAddTask}>
          <Plus className="h-3.5 w-3.5" /> Task
        </Button>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={onAddSummary}>
          <FolderPlus className="h-3.5 w-3.5" /> Summary row
        </Button>

        <span className="mx-1 h-4 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onOutdent}
          disabled={noSelection}
          title="Outdent (Alt+← on a selected row)"
        >
          <IndentDecrease className="h-3.5 w-3.5" /> Outdent
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onIndent}
          disabled={noSelection}
          title="Indent (Alt+→ on a selected row)"
        >
          <IndentIncrease className="h-3.5 w-3.5" /> Indent
        </Button>

        <span className="mx-1 h-4 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onLink}
          disabled={!canLink}
          title={
            linkCount >= 2
              ? "Chain-link the selected tasks in order (Finish-to-Start)"
              : "Link the previously selected task to the current one (Finish-to-Start)"
          }
        >
          <Link2 className="h-3.5 w-3.5" /> Link
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onUnlink}
          disabled={!linkTargetId}
          title="Remove every predecessor of the selected task"
        >
          <Link2Off className="h-3.5 w-3.5" /> Unlink
        </Button>

        <span className="mx-1 h-4 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted">
            <FolderCog className="h-3.5 w-3.5" /> Project
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Codes &amp; calendar</DropdownMenuLabel>
              <DropdownMenuItem onClick={onOpenWbsCode}>
                <Hash className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">WBS Code…</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenWorkingTime}>
                <CalendarClock className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">Change Working Time…</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>Baseline</DropdownMenuLabel>
              <DropdownMenuItem onClick={onOpenSetBaseline}>
                <Flag className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">Set Baseline…</span>
              </DropdownMenuItem>
              {baselines.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Eye className="size-3.5 text-muted-foreground" />
                    <span className="whitespace-nowrap">Show baseline</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-[180px]">
                    <DropdownMenuRadioGroup
                      value={String(activeBaseline)}
                      onValueChange={(v) => onActivateBaseline(Number(v))}
                    >
                      {baselines.map((b) => (
                        <DropdownMenuRadioItem key={b.number} value={String(b.number)}>
                          {b.name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>Schedule</DropdownMenuLabel>
              <DropdownMenuItem onClick={onOpenMoveProject}>
                <MoveHorizontal className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">Move Project…</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRunAutoSchedule}>
                <Calculator className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">Calculate now</span>
                <DropdownMenuShortcut>F9</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="mx-1 h-4 w-px bg-border" />

        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onExpandAll} title="Expand all">
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCollapseAll} title="Collapse all">
          <ChevronsDownUp className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRefresh} title="Refresh">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1" title="Scheduling calendar">
            <CalendarClock className="h-3.5 w-3.5" /> {calendarName}
          </span>
          <span>
            {taskCount} task{taskCount === 1 ? "" : "s"}
          </span>
          {capped && (
            <span className="text-amber-600">· showing first 1000</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
        <Toggle
          active={autoSchedule}
          onClick={() => onAutoScheduleToggle(!autoSchedule)}
          title="Calculation mode — Automatic reschedules on every edit; Manual waits for Calculate (F9)"
        >
          {autoSchedule ? "Auto-schedule" : "Manual"}
        </Toggle>
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "h-7 gap-1 text-[11px]",
            calcNeeded && "border-amber-400 text-amber-700",
          )}
          onClick={onRunAutoSchedule}
          title="Recalculate the whole schedule from links, constraints and the calendar (F9)"
        >
          <Calculator className="h-3.5 w-3.5" /> Calculate
          {calcNeeded && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
        </Button>

        <span className="mx-1 h-4 w-px bg-border" />

        <Toggle active={showBaseline} onClick={() => onBaselineToggle(!showBaseline)} title="Show the baseline bars">
          Baseline
        </Toggle>
        <Toggle
          active={showDependencies}
          onClick={() => onDependenciesToggle(!showDependencies)}
          title="Draw every dependency arrow (otherwise only the selected task's)"
        >
          Links
        </Toggle>

        <span className="mx-1 h-4 w-px bg-border" />

        <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
          {(Object.keys(ZOOM_LABELS) as GanttZoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => onZoomChange(z)}
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
                zoom === z ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {ZOOM_LABELS[z]}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onZoomOut} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onZoomIn} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onFitToScreen}>
          Fit
        </Button>
        <Toggle
          active={showToday}
          onClick={onToday}
          title={showToday ? "Hide the Today line" : "Show the Today line"}
        >
          Today
        </Toggle>

        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 text-[11px]"
          onClick={onToggleTimeline}
          title={showTimeline ? "Hide the Gantt pane" : "Show the Gantt pane"}
        >
          {showTimeline ? (
            <PanelRightClose className="h-3.5 w-3.5" />
          ) : (
            <PanelRightOpen className="h-3.5 w-3.5" />
          )}
          Timeline
        </Button>
      </div>

      {scheduleError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-700">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          {scheduleError}
        </div>
      )}
    </div>
  );
}
