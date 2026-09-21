"use client";

import {
  CalendarClock,
  CalendarDays,
  Calculator,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  Eye,
  EyeOff,
  FolderCog,
  FolderPlus,
  Flag,
  Hash,
  IndentDecrease,
  IndentIncrease,
  FileDown,
  Gauge,
  Link2,
  Link2Off,
  MoveHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Printer,
  RotateCcw,
  TrendingUp,
  TriangleAlert,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
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
import type { ComparisonSourceOption } from "@/lib/planning/schedule-comparison-service";
import type { GanttZoom } from "./gantt-types";
import { ZOOM_LABELS } from "./gantt-types";
import {
  canHideColumn,
  NAV_COLUMNS,
  SHEET_COLUMNS,
  type ColumnOrder,
  type ColumnVisibility,
} from "./sheet-types";

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
  /** Hide the Timeline show/hide button entirely (Sheet has its own dedicated right pane). */
  showTimelineToggle?: boolean;
  zoom: GanttZoom;
  /** Schedules selectable as a comparison ghost bar (Baseline / Internal rev / External rev) — Live excluded. */
  referenceOptions: ComparisonSourceOption[];
  /** Compare A — "" = no bar drawn. */
  referenceKey: string;
  /** Compare B — "" = no bar drawn. */
  compareKey: string;
  /** Active view — "" = Live/editable, otherwise a saved revision rendered read-only. */
  viewKey: string;
  /** True while a saved revision is being viewed — hides/disables every editing control. */
  readOnlyView: boolean;
  showDependencies: boolean;
  showLinkLabels: boolean;
  showToday: boolean;
  showProgressLine: boolean;
  showCritical: boolean;
  showFloat: boolean;
  hideCompleted: boolean;
  onAddTask: () => void;
  onAddSummary: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onLink: () => void;
  onUnlink: () => void;
  onZoomChange: (z: GanttZoom) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onToday: () => void;
  onReferenceChange: (key: string) => void;
  onCompareChange: (key: string) => void;
  onViewChange: (key: string) => void;
  onDependenciesToggle: (v: boolean) => void;
  onLinkLabelsToggle: (v: boolean) => void;
  onProgressLineToggle: () => void;
  onCriticalToggle: (v: boolean) => void;
  onFloatToggle: (v: boolean) => void;
  onHideCompletedToggle: (v: boolean) => void;
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
  onOpenFloatSettings: () => void;
  onOpenDataDate: () => void;
  // --- Export ▾ menu ---
  onOpenPrint: () => void;
  onExportMsp: () => void;
  // --- Columns ▾ menu (hide/unhide + date format) ---
  columnOrder: ColumnOrder;
  columnVisibility: ColumnVisibility;
  onColumnVisibilityChange: (visibility: ColumnVisibility) => void;
  onResetColumns: () => void;
  dateFormatOptions: { id: string; label: string }[];
  /** This user's own override, or "" to mean "using the company default". */
  dateFormatId: string;
  onDateFormatChange: (id: string) => void;
}

function Toggle({
  active,
  onClick,
  children,
  title,
  disabled = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "h-7 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-40",
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
  showTimelineToggle = true,
  zoom,
  referenceOptions,
  referenceKey,
  compareKey,
  viewKey,
  readOnlyView,
  showDependencies,
  showLinkLabels,
  showToday,
  showProgressLine,
  showCritical,
  showFloat,
  hideCompleted,
  onAddTask,
  onAddSummary,
  onIndent,
  onOutdent,
  onExpandAll,
  onCollapseAll,
  onLink,
  onUnlink,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onToday,
  onReferenceChange,
  onCompareChange,
  onViewChange,
  onDependenciesToggle,
  onLinkLabelsToggle,
  onProgressLineToggle,
  onCriticalToggle,
  onFloatToggle,
  onHideCompletedToggle,
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
  onOpenFloatSettings,
  onOpenDataDate,
  onOpenPrint,
  onExportMsp,
  columnOrder,
  columnVisibility,
  onColumnVisibilityChange,
  onResetColumns,
  dateFormatOptions,
  dateFormatId,
  onDateFormatChange,
}: ScheduleToolbarProps) {
  const noSelection = !selectedRowId;
  const canLink =
    linkCount >= 2 ||
    Boolean(linkSourceId && linkTargetId && linkSourceId !== linkTargetId);
  const activeBaseline = baselines.find((b) => b.active)?.number ?? -1;
  const columnByField = new Map(SHEET_COLUMNS.map((c) => [c.field, c]));

  const toggleColumn = (field: (typeof NAV_COLUMNS)[number], checked: boolean) => {
    if (!checked && !canHideColumn(field, columnVisibility)) return;
    onColumnVisibilityChange({ ...columnVisibility, [field]: checked });
  };

  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onAddTask}
          disabled={readOnlyView}
        >
          <Plus className="h-3.5 w-3.5" /> Task
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onAddSummary}
          disabled={readOnlyView}
        >
          <FolderPlus className="h-3.5 w-3.5" /> Summary row
        </Button>

        <span className="mx-1 h-4 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onOutdent}
          disabled={noSelection || readOnlyView}
          title="Outdent (Alt+← on a selected row)"
        >
          <IndentDecrease className="h-3.5 w-3.5" /> Outdent
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          onClick={onIndent}
          disabled={noSelection || readOnlyView}
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
          disabled={!canLink || readOnlyView}
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
          disabled={!linkTargetId || readOnlyView}
          title="Remove every predecessor of the selected task"
        >
          <Link2Off className="h-3.5 w-3.5" /> Unlink
        </Button>

        <span className="mx-1 h-4 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={readOnlyView}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted disabled:opacity-40"
          >
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
              <DropdownMenuItem onClick={onOpenFloatSettings}>
                <Gauge className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">Float Settings…</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenDataDate}>
                <CalendarClock className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap">Advance Data Date…</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted">
            <Printer className="h-3.5 w-3.5" /> Export
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onClick={onOpenPrint}>
              <Printer className="size-3.5 text-muted-foreground" />
              <span className="whitespace-nowrap">Print / Export PDF…</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExportMsp}>
              <FileDown className="size-3.5 text-muted-foreground" />
              <span className="whitespace-nowrap">Export to MS Project (.xml)</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted">
            <Columns3 className="h-3.5 w-3.5" /> Columns
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Show / hide columns</DropdownMenuLabel>
              {columnOrder.map((field) => {
                const col = columnByField.get(field);
                if (!col) return null;
                const checked = columnVisibility[field] !== false;
                const disabled = checked && !canHideColumn(field, columnVisibility);
                return (
                  <DropdownMenuCheckboxItem
                    key={field}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(v) => toggleColumn(field, v)}
                  >
                    {col.label || field}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onResetColumns}>
              <RotateCcw className="size-3.5 text-muted-foreground" />
              <span className="whitespace-nowrap">Reset to default</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                  <span className="whitespace-nowrap">
                    Date format: {dateFormatId === "" ? "Company default" : (dateFormatOptions.find((o) => o.id === dateFormatId)?.label ?? "Company default")}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[180px]">
                  <DropdownMenuRadioGroup value={dateFormatId} onValueChange={onDateFormatChange}>
                    <DropdownMenuRadioItem value="">Use company default</DropdownMenuRadioItem>
                    {dateFormatOptions.map((opt) => (
                      <DropdownMenuRadioItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="mx-1 h-4 w-px bg-border" />

        <Toggle
          active={hideCompleted}
          onClick={() => onHideCompletedToggle(!hideCompleted)}
          title="Hide tasks at 100% complete"
        >
          <EyeOff className="mr-1 inline h-3 w-3" />
          Hide Completed
        </Toggle>

        <span className="mx-1 h-4 w-px bg-border" />

        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onExpandAll} title="Expand all">
          <ChevronsUpDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCollapseAll} title="Collapse all">
          <ChevronsDownUp className="h-3.5 w-3.5" />
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

      <div
        className={cn(
          "relative flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5",
          showTimelineToggle && "pr-10",
        )}
      >
        <Toggle
          active={autoSchedule}
          onClick={() => onAutoScheduleToggle(!autoSchedule)}
          disabled={readOnlyView}
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
          disabled={readOnlyView}
          title="Recalculate the whole schedule from links, constraints and the calendar (F9)"
        >
          <Calculator className="h-3.5 w-3.5" /> Calculate
          {calcNeeded && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
        </Button>

        <span className="mx-1 h-4 w-px bg-border" />

        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5",
            readOnlyView ? "border-amber-400 bg-amber-50" : "border-border",
          )}
        >
          <span
            className={cn(
              "inline-block h-2 w-4 shrink-0 rounded-full",
              readOnlyView ? "bg-amber-400" : "bg-blue-500",
            )}
            title="Active view — the solid bars"
          />
          <select
            value={viewKey}
            onChange={(e) => onViewChange(e.target.value)}
            title="Which schedule the solid bars show. A saved revision is read-only; switch back to Live to edit."
            className="h-7 rounded bg-transparent pr-1 text-[11px] font-medium text-foreground outline-none"
          >
            <option value="">View: Live (editable)</option>
            {referenceOptions.map((o) => (
              <option key={o.key} value={o.key}>
                View: {o.label}
              </option>
            ))}
          </select>
        </span>

        <span className="mx-1 h-4 w-px bg-border" />

        <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5">
          <span
            className="inline-block h-1.5 w-4 shrink-0 rounded-full border border-dashed border-slate-500 bg-slate-300"
            title="Compare A — slate ghost bar drawn above each live bar"
          />
          <select
            value={referenceKey}
            onChange={(e) => onReferenceChange(e.target.value)}
            title="Compare A — a saved schedule drawn as a slate ghost bar above each live bar"
            className="h-7 rounded bg-background pr-1 text-[11px] font-medium text-foreground outline-none"
          >
            <option value="">Compare A: none</option>
            {referenceOptions
              .filter((o) => o.key !== compareKey)
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
          </select>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border px-1.5">
          <span
            className="inline-block h-1.5 w-4 shrink-0 rounded-full border border-dashed border-blue-500 bg-blue-200"
            title="Compare B — blue ghost bar drawn below each live bar"
          />
          <select
            value={compareKey}
            onChange={(e) => onCompareChange(e.target.value)}
            title="Compare B — a second saved schedule drawn as a blue ghost bar below each live bar"
            className="h-7 rounded bg-background pr-1 text-[11px] font-medium text-foreground outline-none"
          >
            <option value="">Compare B: none</option>
            {referenceOptions
              .filter((o) => o.key !== referenceKey)
              .map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
          </select>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Dependency link display"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted data-[popup-open]:bg-muted"
          >
            {showDependencies ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
            Show Link
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuCheckboxItem checked={showDependencies} onCheckedChange={onDependenciesToggle}>
              Show dependency arrows
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showLinkLabels}
              onCheckedChange={onLinkLabelsToggle}
              disabled={!showDependencies}
            >
              Show FS/SS/FF/SF labels
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Critical path highlighting"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors data-[popup-open]:bg-muted",
              showCritical
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
            Critical
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuCheckboxItem checked={showCritical} onCheckedChange={onCriticalToggle}>
              Highlight critical path
            </DropdownMenuCheckboxItem>
            <div className="px-2 pb-1.5 pt-0.5 text-[11px] text-muted-foreground">
              Tasks with zero or negative total float — shown in red on the bars.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Float label and threshold settings"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors data-[popup-open]:bg-muted",
              showFloat
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <Gauge className="h-3.5 w-3.5 shrink-0" />
            Float
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuCheckboxItem checked={showFloat} onCheckedChange={onFloatToggle}>
              Show total-float label above bars
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenFloatSettings}>
              <Gauge className="size-3.5 text-muted-foreground" />
              <span className="whitespace-nowrap">Float Settings…</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
        <Toggle
          active={showProgressLine}
          onClick={onProgressLineToggle}
          title={
            showProgressLine
              ? "Hide the progress line (double-click the line to edit its style)"
              : "Show a progress line — an MS-Project-style zigzag through each task's actual % complete"
          }
        >
          <TrendingUp className="mr-1 inline h-3 w-3" />
          Progress Line
        </Toggle>

        {showTimelineToggle && (
          <Button
            size="sm"
            variant="ghost"
            className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 p-0 border border-border bg-card"
            onClick={onToggleTimeline}
            title={showTimeline ? "Hide the Gantt pane" : "Show the Gantt pane"}
            aria-label={showTimeline ? "Hide the Gantt pane" : "Show the Gantt pane"}
          >
            {showTimeline ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
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
